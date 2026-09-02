import type { ExamQuestion } from './examPaper';

/**
 * Working through a past paper, one question at a time, over more than one
 * sitting.
 *
 * RED's ask was specific: answer the questions, see the answer beside them, save
 * it, and come back later to carry on. The "come back later" is the part that
 * shapes everything here — a session is a **plain serialisable object** with no
 * functions, no undefined and no class instances, because it has to survive a
 * round trip through Firestore and a browser that was closed in between.
 *
 * Everything is pure. Marking talks to a model and storage talks to Firestore;
 * both live elsewhere, so the rules about what a session IS can be reasoned
 * about and tested without either.
 */

/** Why a mark was lost. The taxonomy is the product — see the note below. */
export type LossReason =
  | 'correct'
  | 'knowledge-gap'
  | 'command-word'
  | 'incomplete-chain'
  | 'unshown-working'
  | 'misread'
  | 'unanswered';

/*
  A student who has done ten papers does not need another percentage. They need
  to be told "you lose more marks to command words than to not knowing things",
  because those two have completely different fixes — one is revision, the other
  is five minutes of reading the question properly. Recording only right/wrong
  throws that distinction away, which is why every mark carries a reason.
*/
export const LOSS_LABELS: Record<LossReason, string> = {
  correct: 'Full marks',
  'knowledge-gap': "Didn't know it",
  'command-word': 'Answered the wrong instruction',
  'incomplete-chain': 'Stopped short',
  'unshown-working': 'Working not shown',
  misread: 'Misread the question',
  unanswered: 'Left blank',
};

export const LOSS_ADVICE: Record<LossReason, string> = {
  correct: 'Nothing to fix here.',
  'knowledge-gap': 'This one is revision — you cannot reason your way to a fact you do not have.',
  'command-word': 'You knew this. Read what the question asked you to DO before answering.',
  'incomplete-chain': 'You had the right idea and stopped before the marks did. Carry it to the end.',
  'unshown-working': 'The answer was fine. Method marks only exist if the method is on the page.',
  misread: 'You answered a different question. Slow down on the first read.',
  unanswered: 'Blank scores nothing. A partial answer often scores something.',
};

export interface Attempt {
  /** Matches ExamQuestion.number — "1", "4(b)". */
  number: string;
  answer: string;
  /** Marks awarded, once marked. Null while unmarked. */
  awarded: number | null;
  /** Out of. Copied from the question so a session can be read on its own. */
  available: number | null;
  reason: LossReason | null;
  /** What the marker said. */
  feedback: string;
  /** What a full-mark answer looks like. */
  modelAnswer: string;
  markedAt: string | null;
}

export interface PaperSession {
  id: string;
  paperTitle: string;
  board: string | null;
  subject: string | null;
  questions: ExamQuestion[];
  attempts: Attempt[];
  /** Index into `questions` of where the student is. */
  cursor: number;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

const now = () => new Date().toISOString();

export function startSession(args: {
  id: string;
  paperTitle: string;
  board?: string | null;
  subject?: string | null;
  questions: ExamQuestion[];
}): PaperSession {
  const questions = (args.questions ?? []).filter((q) => q && q.number);
  return {
    id: args.id,
    paperTitle: args.paperTitle || 'Past paper',
    board: args.board ?? null,
    subject: args.subject ?? null,
    questions,
    attempts: questions.map((q) => ({
      number: q.number,
      answer: '',
      awarded: null,
      available: q.marks,
      reason: null,
      feedback: '',
      modelAnswer: '',
      markedAt: null,
    })),
    cursor: 0,
    startedAt: now(),
    updatedAt: now(),
    finishedAt: null,
  };
}

const withAttempt = (
  session: PaperSession,
  number: string,
  change: (a: Attempt) => Attempt,
): PaperSession => ({
  ...session,
  attempts: session.attempts.map((a) => (a.number === number ? change(a) : a)),
  updatedAt: now(),
});

/**
 * Record what the student wrote.
 *
 * Writing a new answer clears the previous marking, because a mark that no
 * longer belongs to the answer beside it is worse than no mark at all — the
 * student would be reading feedback about something they have since changed.
 */
export function answerQuestion(
  session: PaperSession,
  number: string,
  answer: string,
): PaperSession {
  return withAttempt(session, number, (a) => ({
    ...a,
    answer,
    ...(answer !== a.answer
      ? { awarded: null, reason: null, feedback: '', modelAnswer: '', markedAt: null }
      : {}),
  }));
}

export function markQuestion(
  session: PaperSession,
  number: string,
  result: {
    awarded: number;
    reason: LossReason;
    feedback?: string;
    modelAnswer?: string;
  },
): PaperSession {
  return withAttempt(session, number, (a) => {
    // Never award more than the question is worth, whatever the marker says.
    const cap = a.available ?? result.awarded;
    return {
      ...a,
      awarded: Math.max(0, Math.min(result.awarded, cap)),
      reason: result.reason,
      feedback: result.feedback ?? '',
      modelAnswer: result.modelAnswer ?? '',
      markedAt: now(),
    };
  });
}

export function goTo(session: PaperSession, index: number): PaperSession {
  const cursor = Math.max(0, Math.min(index, Math.max(0, session.questions.length - 1)));
  return { ...session, cursor, updatedAt: now() };
}

/** The next question with nothing written in it — where "resume" should land. */
export function nextUnanswered(session: PaperSession): number {
  const i = session.attempts.findIndex((a) => !a.answer.trim());
  return i === -1 ? Math.max(0, session.questions.length - 1) : i;
}

export function attemptFor(session: PaperSession, number: string): Attempt | null {
  return session.attempts.find((a) => a.number === number) ?? null;
}

export interface Progress {
  answered: number;
  marked: number;
  total: number;
  /** Marks earned so far, out of the marks available on MARKED questions. */
  awarded: number;
  outOf: number;
  /** Marks on the whole paper, where stated. */
  paperTotal: number;
  percent: number | null;
  complete: boolean;
}

export function progress(session: PaperSession): Progress {
  const total = session.attempts.length;
  const answered = session.attempts.filter((a) => a.answer.trim()).length;
  const marked = session.attempts.filter((a) => a.awarded !== null).length;

  let awarded = 0;
  let outOf = 0;
  for (const a of session.attempts) {
    if (a.awarded === null || a.available === null) continue;
    awarded += a.awarded;
    outOf += a.available;
  }
  const paperTotal = session.attempts.reduce((n, a) => n + (a.available ?? 0), 0);

  return {
    answered,
    marked,
    total,
    awarded,
    outOf,
    paperTotal,
    // Out of what has been MARKED, not the whole paper — otherwise a student who
    // has done three questions well is shown a failing grade.
    percent: outOf > 0 ? Math.round((awarded / outOf) * 100) : null,
    complete: total > 0 && marked === total,
  };
}

/**
 * Where the marks are going, worst first.
 *
 * This is the post-mortem: not "you got 68%", but "you lose more to command
 * words than to not knowing things". `correct` is excluded because it is not a
 * problem to fix.
 */
export function lossBreakdown(session: PaperSession): { reason: LossReason; lost: number }[] {
  const lost = new Map<LossReason, number>();
  for (const a of session.attempts) {
    if (a.awarded === null || a.available === null || !a.reason) continue;
    if (a.reason === 'correct') continue;
    const gap = a.available - a.awarded;
    if (gap <= 0) continue;
    lost.set(a.reason, (lost.get(a.reason) ?? 0) + gap);
  }
  return [...lost.entries()]
    .map(([reason, n]) => ({ reason, lost: n }))
    .sort((a, b) => b.lost - a.lost);
}

/** One sentence, or null when there is not enough marked to mean anything. */
export const MIN_MARKED_FOR_VERDICT = 4;

export function verdict(session: PaperSession): string | null {
  const p = progress(session);
  if (p.marked < MIN_MARKED_FOR_VERDICT) return null;

  const breakdown = lossBreakdown(session);
  if (!breakdown.length) return 'Full marks on everything marked so far.';

  const top = breakdown[0];
  const totalLost = breakdown.reduce((n, b) => n + b.lost, 0);
  const share = Math.round((top.lost / totalLost) * 100);

  if (top.reason === 'knowledge-gap' && share >= 60) {
    return `Most of what you lost was material you had not learnt yet. That is a revision `
      + `problem, and the most honest kind — nothing here is being thrown away by carelessness.`;
  }
  return `${share}% of the marks you lost went to one thing: ${LOSS_LABELS[top.reason].toLowerCase()}. `
    + LOSS_ADVICE[top.reason];
}

/** Trim to what Firestore should hold. Long answers are capped, not silently lost. */
export const MAX_ANSWER_CHARS = 4000;

export function forStorage(session: PaperSession): PaperSession {
  return {
    ...session,
    attempts: session.attempts.map((a) => ({
      ...a,
      answer: a.answer.slice(0, MAX_ANSWER_CHARS),
      feedback: a.feedback.slice(0, 1500),
      modelAnswer: a.modelAnswer.slice(0, 2000),
    })),
    questions: session.questions.map((q) => ({
      ...q,
      text: q.text.slice(0, 3000),
    })),
  };
}
