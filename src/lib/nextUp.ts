/**
 * "What should I study right now?"
 *
 * The home screen has always shown what StudyQuest can DO — make a kit, open a
 * paper, play the arcade — and never what this student should do next. That is a
 * menu, not a plan, and a menu is exactly what someone with twenty minutes and no
 * idea where to start does not need.
 *
 * So this ranks what the app already knows about one student and names the single
 * next thing, with the reason attached.
 *
 * TWO RULES, AND THE SECOND IS THE ONE THAT KEEPS IT HONEST.
 *
 * 1. FINISHING BEATS STARTING. A half-read lesson and a half-marked paper are
 *    worth more than a fresh one, and they are also what the teacher's method
 *    assumes: you drop a subject bit by bit, across days.
 *
 * 2. NEVER INVENT A REASON. Every suggestion carries the fact that produced it —
 *    "3 questions you were sure about and got wrong", "your Biology exam is in
 *    5 days". When there is no data, it says so and offers a plain first move
 *    labelled as a first move, rather than dressing a guess up as advice. A
 *    recommendation nobody can trace is one nobody should follow.
 */

export type NextKind =
  | 'exam-soon'     // a real deadline, and deadlines outrank preference
  | 'finish-lesson'
  | 'blind-spot'    // wrong AND sure — the only list that tells them something new
  | 'finish-paper'
  | 'mistakes'
  | 'first-step';   // nothing known yet, and said so

export interface Suggestion {
  kind: NextKind;
  /** What to do, as an instruction. */
  title: string;
  /** The fact that produced it. Never a generality. */
  why: string;
  /** Which view this opens. */
  view: string;
  /** Carried through so the screen can open the exact thing. */
  id?: string;
  subject?: string;
}

export interface StudentState {
  lessons?: { id: string; topic: string; steps: number; done: number }[];
  papers?: { id: string; paperTitle: string; answered: number; total: number }[];
  /** From confidence.riskiestTopics — wrong while sure. */
  blindSpots?: { topic: string; blindSpots: number }[];
  mistakes?: { subject: string }[];
  exams?: { id: string; subject: string; date: string }[];
}

/** Whole days from today to a YYYY-MM-DD date. Negative once it has passed. */
export function daysUntil(date: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? '').trim());
  if (!m) return null;
  /*
    Compared as calendar days, not timestamps. An exam at 09:00 tomorrow and one
    at 23:00 tomorrow are both "tomorrow" to a student, and subtracting
    milliseconds would call one of them today.
  */
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((then - today) / 86_400_000);
}

/** How many mistakes are worth a revision session rather than a shrug. */
export const MISTAKES_WORTH_REVISING = 5;
/** Inside this many days, an exam outranks everything else. */
export const EXAM_URGENT_DAYS = 14;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Everything worth doing, best first.
 *
 * Returns a list rather than one item so the screen can show a headline and a
 * couple of alternatives — a student who does not fancy the top suggestion should
 * get a second option, not a lecture.
 */
export function whatNext(state: StudentState, now: Date = new Date()): Suggestion[] {
  const out: Suggestion[] = [];

  /* 1. A real deadline. Nothing else competes with a date. */
  const soon = (state.exams ?? [])
    .map((e) => ({ ...e, days: daysUntil(e.date, now) }))
    .filter((e): e is typeof e & { days: number } =>
      e.days !== null && e.days >= 0 && e.days <= EXAM_URGENT_DAYS)
    .sort((a, b) => a.days - b.days);

  for (const e of soon.slice(0, 1)) {
    out.push({
      kind: 'exam-soon',
      title: `Revise ${e.subject}`,
      why: e.days === 0 ? `Your ${e.subject} exam is today.`
        : e.days === 1 ? `Your ${e.subject} exam is tomorrow.`
        : `Your ${e.subject} exam is in ${plural(e.days, 'day')}.`,
      view: 'learn',
      id: e.id,
      subject: e.subject,
    });
  }

  /* 2. Finishing beats starting. */
  const unfinished = (state.lessons ?? [])
    .filter((l) => l.steps > 0 && l.done < l.steps)
    .sort((a, b) => (b.done / b.steps) - (a.done / a.steps));

  for (const l of unfinished.slice(0, 1)) {
    out.push({
      kind: 'finish-lesson',
      title: `Finish ${l.topic}`,
      why: `You stopped after ${l.done} of ${l.steps} steps.`,
      view: 'learn',
      id: l.id,
    });
  }

  /* 3. The thing they do not know they need. */
  const risky = (state.blindSpots ?? []).filter((t) => t.blindSpots > 0);
  for (const t of risky.slice(0, 1)) {
    out.push({
      kind: 'blind-spot',
      title: `Go back over ${t.topic}`,
      why: `${plural(t.blindSpots, 'question')} you were sure about and still got wrong.`,
      view: 'learn',
      subject: t.topic,
    });
  }

  /* 4. A paper left part-way. */
  const openPapers = (state.papers ?? [])
    .filter((p) => p.total > 0 && p.answered < p.total)
    .sort((a, b) => (b.answered / b.total) - (a.answered / a.total));

  for (const p of openPapers.slice(0, 1)) {
    out.push({
      kind: 'finish-paper',
      title: `Carry on with ${p.paperTitle}`,
      why: `${p.answered} of ${p.total} questions answered.`,
      view: 'paper',
      id: p.id,
    });
  }

  /* 5. Enough mistakes to be worth a session. */
  const mistakes = state.mistakes ?? [];
  if (mistakes.length >= MISTAKES_WORTH_REVISING) {
    const bySubject = new Map<string, number>();
    for (const m of mistakes) {
      const s = (m.subject || '').trim();
      if (s) bySubject.set(s, (bySubject.get(s) ?? 0) + 1);
    }
    const worst = [...bySubject.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({
      kind: 'mistakes',
      title: 'Redo your mistakes',
      why: worst
        ? `${plural(mistakes.length, 'question')} saved, ${worst[1]} of them in ${worst[0]}.`
        : `${plural(mistakes.length, 'question')} you got wrong are waiting.`,
      view: 'mistakes',
      subject: worst?.[0],
    });
  }

  /*
    6. Nothing to go on, and it says so.

    The temptation is to fill the space with something that sounds personal.
    Anyone who has used the app twice can tell the difference, and once they spot
    it they stop believing the suggestions that ARE real.
  */
  if (!out.length) {
    out.push({
      kind: 'first-step',
      title: 'Pick something to learn',
      why: 'Nothing to go on yet — once you have studied a bit, this shows what to do next.',
      view: 'learn',
    });
  }

  return out;
}

/** The single thing to put at the top. Never null: `whatNext` always says something. */
export function topSuggestion(state: StudentState, now: Date = new Date()): Suggestion {
  return whatNext(state, now)[0];
}
