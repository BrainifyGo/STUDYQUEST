/**
 * PERIODS — bucketing study sessions into Weekly / Monthly / All Time.
 *
 * The three buttons above the activity chart were plain `<button>` elements with
 * no onClick, no state and no second dataset behind them. The chart was hardwired
 * to seven day-of-week buckets, so "Monthly" and "All Time" could not have shown
 * anything different even if the clicks had been wired up.
 *
 * Worse, the weekly bucketing was by `date.getDay()` alone, with no date range:
 * a session from three months ago landed on "Tuesday" alongside this Tuesday, so
 * the "last 7 days" chart was really "every session I have ever done, stacked by
 * weekday". This does the bucketing properly.
 *
 * Pure functions — no React, no Firestore — so the maths is testable on its own.
 */

export type Period = 'weekly' | 'monthly' | 'all';

export interface SessionRow {
  /** Anything `new Date()` accepts: an ISO string, or a Firestore-ish value. */
  date: string | number | Date;
  /** Hours studied. */
  duration?: number;
  /** Percentage score, if the session had one. */
  score?: number;
  subject?: string;
}

export interface Bucket {
  /** X-axis label. */
  day: string;
  hours: number;
  sessions: number;
  /** Mean score across the sessions in this bucket, 0 when there are none. */
  score: number;
}

export const PERIODS: { id: Period; label: string }[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'all', label: 'All Time' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Midnight local time — the day boundary a student actually experiences. */
function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function toDate(value: SessionRow['date']): Date | null {
  const d = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Bucket sessions for one period.
 *
 * Empty buckets are kept. A week with one study day should show one bar and six
 * gaps — dropping the gaps would draw a flat busy week that never happened.
 *
 * @param now  Injectable so the tests do not depend on the day they run.
 */
export function bucketSessions(
  sessions: SessionRow[],
  period: Period,
  now: Date = new Date()
): Bucket[] {
  const today = startOfDay(now);

  // Build the empty buckets first, so the shape of the chart is decided by the
  // period rather than by whatever data happens to exist.
  let buckets: { key: string; label: string }[];
  let keyOf: (d: Date) => string | null;

  if (period === 'weekly') {
    buckets = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      buckets.push({ key: d.toDateString(), label: DAY_NAMES[d.getDay()] });
    }
    keyOf = (d) => startOfDay(d).toDateString();

  } else if (period === 'monthly') {
    // Four calendar weeks back, labelled by the week's Monday.
    buckets = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i * 7);
      const monday = startOfWeek(d);
      buckets.push({ key: monday.toDateString(), label: `${monday.getDate()} ${MONTH_NAMES[monday.getMonth()]}` });
    }
    keyOf = (d) => startOfWeek(d).toDateString();

  } else {
    // All time: the last twelve months, so the axis stays readable however long
    // the account has existed.
    buckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_NAMES[d.getMonth()] });
    }
    keyOf = (d) => `${d.getFullYear()}-${d.getMonth()}`;
  }

  const totals = new Map<string, { hours: number; sessions: number; scoreSum: number; scored: number }>();
  for (const b of buckets) totals.set(b.key, { hours: 0, sessions: 0, scoreSum: 0, scored: 0 });

  for (const s of sessions) {
    const d = toDate(s.date);
    if (!d) continue;
    const key = keyOf(d);
    const slot = key === null ? undefined : totals.get(key);
    if (!slot) continue;             // outside the window — correctly ignored
    slot.hours += Number(s.duration) || 0;
    slot.sessions += 1;
    if (typeof s.score === 'number' && Number.isFinite(s.score)) {
      slot.scoreSum += s.score;
      slot.scored += 1;
    }
  }

  return buckets.map((b) => {
    const t = totals.get(b.key)!;
    return {
      day: b.label,
      hours: Math.round(t.hours * 10) / 10,
      sessions: t.sessions,
      // The mean, not the sum. Summing percentages gives "480%" for a good week.
      score: t.scored > 0 ? Math.round(t.scoreSum / t.scored) : 0,
    };
  });
}

/** The Monday on or before this date. */
export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  // getDay() is 0 for Sunday, which belongs to the week that began six days ago.
  const shift = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - shift);
  return out;
}

/** Only the sessions inside the period's window — for the headline totals. */
export function sessionsInPeriod(
  sessions: SessionRow[],
  period: Period,
  now: Date = new Date()
): SessionRow[] {
  if (period === 'all') return sessions.slice();

  const today = startOfDay(now);
  const from = new Date(today);
  if (period === 'weekly') from.setDate(today.getDate() - 6);
  else from.setDate(today.getDate() - 27);

  return sessions.filter((s) => {
    const d = toDate(s.date);
    return !!d && startOfDay(d) >= from;
  });
}

/** Headline numbers for the cards above the chart. */
export function summarise(sessions: SessionRow[]): {
  totalHours: number; avgScore: number; totalSessions: number; goalProgress: number;
} {
  let hours = 0, scoreSum = 0, scored = 0;
  for (const s of sessions) {
    hours += Number(s.duration) || 0;
    if (typeof s.score === 'number' && Number.isFinite(s.score)) { scoreSum += s.score; scored += 1; }
  }
  return {
    totalHours: Math.round(hours * 10) / 10,
    avgScore: scored > 0 ? Math.round(scoreSum / scored) : 0,
    totalSessions: sessions.length,
    goalProgress: Math.min(Math.round((hours / 40) * 100), 100),
  };
}
