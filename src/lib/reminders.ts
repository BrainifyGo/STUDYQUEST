/**
 * Study reminders — deciding WHO gets an email, and WHAT it says.
 *
 * Pure logic, no Firestore and no email, so the rules can be tested without
 * sending anything to anybody. That matters more here than anywhere else in the
 * app: every other bug shows up on a screen, and this one shows up in a
 * stranger's inbox.
 *
 * WHY THIS EXISTS. Settings has had a "study reminders" toggle and the planner
 * has been saving exams and tasks, and nothing has ever sent a thing —
 * `email.server.ts` says so in its own header: *"the study-planner reminders,
 * which have been saving reminders nobody ever receives."* A switch that
 * promises something and does nothing is worse than no switch.
 *
 * ONE DIGEST A DAY, NOT ONE EMAIL PER TASK. Six tasks is six emails under the
 * obvious design, which is how a helpful feature becomes the reason someone
 * marks you as spam — and it would burn the mail quota six times as fast.
 *
 * NOTHING TO SAY MEANS NOTHING IS SENT. A daily "you have 0 tasks" is the
 * clearest possible way to teach people to ignore your emails.
 */

export interface ReminderTask {
  title: string;
  subject: string;
  duration: number;
  /** ISO date, `YYYY-MM-DD` or a full timestamp. */
  date: string;
  completed: boolean;
}

export interface ReminderExam {
  subject: string;
  /** ISO date. */
  date: string;
  importance: 'low' | 'medium' | 'high';
  completed: boolean;
}

export interface ReminderInput {
  displayName: string;
  tasks: ReminderTask[];
  exams: ReminderExam[];
  /** `YYYY-MM-DD` in the user's day, supplied by the caller. */
  today: string;
}

export interface Reminder {
  subject: string;
  text: string;
  /** For logging and tests: why this was worth sending. */
  taskCount: number;
  nextExamDays: number | null;
}

/** How far ahead an exam still counts as worth mentioning. */
export const EXAM_HORIZON_DAYS = 7;

/** `YYYY-MM-DD` for a date in a given IANA timezone. */
export function dayKey(when: Date, timeZone = 'Europe/London'): string {
  // `en-CA` formats as YYYY-MM-DD, which sorts and compares as a string. Doing
  // this with getFullYear() would use the SERVER's timezone, and a reminder
  // that lands on the wrong day is worse than none.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(when);
}

/** The hour (0-23) in a given timezone. */
export function hourIn(when: Date, timeZone = 'Europe/London'): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', hour12: false,
  }).format(when));
}

/** Whole days from `today` to `date`. Negative once it has passed. */
export function daysUntil(date: string, today: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

function countdown(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * Build the reminder for one person, or null if there is nothing worth saying.
 *
 * Returning null rather than an empty email is the whole safety property here —
 * every caller sends whatever this returns, so "nothing to say" has to be
 * expressible.
 */
export function composeReminder(input: ReminderInput): Reminder | null {
  const { displayName, today } = input;

  const todaysTasks = (input.tasks || []).filter(
    (t) => t && !t.completed && String(t.date).slice(0, 10) === today,
  );

  const upcomingExams = (input.exams || [])
    .filter((e) => {
      if (!e || e.completed) return false;
      const d = daysUntil(e.date, today);
      // Not NaN, not in the past, and near enough to act on.
      return Number.isFinite(d) && d >= 0 && d <= EXAM_HORIZON_DAYS;
    })
    .sort((a, b) => daysUntil(a.date, today) - daysUntil(b.date, today));

  if (!todaysTasks.length && !upcomingExams.length) return null;

  const name = (displayName || '').trim().split(/\s+/)[0] || 'there';
  const lines: string[] = [`Morning ${name},`, ''];

  if (todaysTasks.length) {
    const minutes = todaysTasks.reduce((n, t) => n + (Number(t.duration) || 0), 0);
    lines.push(
      todaysTasks.length === 1
        ? 'You have one study session planned today:'
        : `You have ${todaysTasks.length} study sessions planned today:`,
    );
    for (const t of todaysTasks) {
      const mins = Number(t.duration) || 0;
      lines.push(`  • ${t.title}${t.subject ? ` (${t.subject})` : ''}${mins ? ` — ${mins} min` : ''}`);
    }
    if (minutes) lines.push('', `That is about ${minutes} minutes in total.`);
    lines.push('');
  }

  if (upcomingExams.length) {
    const next = upcomingExams[0];
    const days = daysUntil(next.date, today);
    lines.push(`${next.subject} is ${countdown(days)}.`);
    for (const e of upcomingExams.slice(1)) {
      lines.push(`${e.subject} is ${countdown(daysUntil(e.date, today))}.`);
    }
    lines.push('');
  }

  lines.push('Open StudyQuest when you are ready.', '',
    'You can turn these off in Settings.');

  const subject = todaysTasks.length
    ? `${todaysTasks.length} study session${todaysTasks.length === 1 ? '' : 's'} today`
    : `${upcomingExams[0].subject} ${countdown(daysUntil(upcomingExams[0].date, today))}`;

  return {
    subject,
    text: lines.join('\n'),
    taskCount: todaysTasks.length,
    nextExamDays: upcomingExams.length ? daysUntil(upcomingExams[0].date, today) : null,
  };
}

export interface SendGate {
  /** The user's preference. Undefined counts as ON, matching the Settings default. */
  studyReminders?: boolean;
  email?: string | null;
  /** `YYYY-MM-DD` of the last reminder actually sent to this person. */
  lastReminderDay?: string;
}

/**
 * Should this person be emailed today?
 *
 * `lastReminderDay` is the important one. Without it a server restart, a second
 * instance, or a scheduler that fires twice in the same hour all send the same
 * reminder again — and the person on the other end has no way to tell a bug
 * from nagging.
 */
export function shouldSend(gate: SendGate, today: string): boolean {
  if (gate.studyReminders === false) return false;
  if (!gate.email || !gate.email.includes('@')) return false;
  if (gate.lastReminderDay === today) return false;
  return true;
}
