/**
 * Teaching a topic the way a teacher actually teaches it.
 *
 * THE METHOD THIS IMPLEMENTS came from a practising teacher, relayed by RED, as
 * the fastest way students genuinely learn. It is a requirement, not a
 * preference, so the rules are enforced here rather than merely requested in a
 * prompt — a model asked politely for short steps will hand back an essay, and
 * an essay is the exact thing this is meant to replace.
 *
 *   1. YOU DO NOT DROP THE SUBJECT ON THE WHOLE. YOU DROP IT BIT BY BIT.
 *      A lesson is a sequence of small steps, and the student sees one at a
 *      time. Handing over all of it at once is the old study-kit behaviour.
 *
 *   2. ABOUT FIVE LINES, THEN QUESTIONS ON EXACTLY THAT.
 *      Every step teaches a little and then immediately checks it. A step with
 *      no questions is not a step, it is a paragraph, and `parseLesson` rejects
 *      it.
 *
 *   3. EXPLAIN LIKE A TEACHER EXPLAINING TO A BABY.
 *      Simplest possible language. Enforced in the prompt and, where it can be
 *      measured, in the parser: a step that runs long is not simple.
 *
 *   4. THE GAME MUST COME FROM THE LESSON.
 *      Not points bolted onto anything — StudyQuest already has XP, bosses and
 *      an arcade, and that is NOT what the teacher meant. Every game here is
 *      built out of the content of the step it belongs to: ordering the lines of
 *      a method, spotting the wrong line in a worked solution, matching a term
 *      to its meaning. A game you could play without having read the step is the
 *      wrong game.
 */

export type GameKind =
  | 'order'   // put the lines of a method into the right order
  | 'spot'    // find the wrong line in a worked solution
  | 'match'   // pair a term with its meaning
  | 'fill';   // complete the missing piece of a formula or sentence

export interface Check {
  /** A short question about the step just taught. */
  question: string;
  answer: string;
  /** Why that is the answer, in one line. Shown after they try. */
  because?: string;
}

export interface Game {
  kind: GameKind;
  /** What the student is being asked to do, in one line. */
  instruction: string;
  /**
   * The pieces. For 'order' these are the lines in the CORRECT order and the UI
   * shuffles them; for 'match' they are "term :: meaning"; for 'spot' they are
   * the lines of the working; for 'fill' the text with ___ where the gap is.
   */
  items: string[];
  /**
   * For 'spot', the index of the wrong line. For 'fill', the missing text.
   * Unused by 'order' (the given order is the answer) and 'match'.
   */
  answer?: string | number;
}

export interface Step {
  /** The teaching. Short — see MAX_TEACH_LINES. */
  teach: string;
  checks: Check[];
  game?: Game;
}

export interface Lesson {
  topic: string;
  subject: string | null;
  steps: Step[];
}

/**
 * The teacher said "about 5 lines". Six is the ceiling rather than five so that
 * a genuinely useful worked example is not chopped in half by an off-by-one,
 * but seven is an essay and gets rejected.
 *
 * The PROMPT asks for four or five, not for the ceiling. Tested against a real
 * model: asking for "at most 6" produced steps of exactly 6 every single time,
 * because a limit is read as a target. Naming the number you actually want and
 * keeping the ceiling as a backstop is what gets four- and five-line steps.
 */
export const MAX_TEACH_LINES = 6;
/** Below this it is a heading, not teaching. */
export const MIN_TEACH_CHARS = 40;
export const MIN_CHECKS = 1;
export const MAX_CHECKS = 3;

/** Lines that carry something, ignoring blank ones. */
export function teachLines(teach: string): string[] {
  return String(teach ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}

/* ── asking for a lesson ──────────────────────────────────────────────────── */

export function buildLessonPrompt(args: {
  topic: string;
  subject?: string | null;
  /** From studyLevel.promptFor — year group and set, so the pitch is right. */
  level?: string;
  steps?: number;
}): string {
  const { topic, subject, level, steps = 6 } = args;

  return `You are a teacher taking one student through "${topic}"${
    subject ? ` in ${subject}` : ''}.
${level ? `\n${level}\n` : ''}
Teach it in ${steps} SMALL STEPS. This matters more than anything else below:
you are not writing notes, a summary or an essay. You are teaching bit by bit.

Every step must:
  - teach ONE small idea in ABOUT 4-5 short lines, never more than ${MAX_TEACH_LINES}
  - use the simplest words possible, as if explaining to a young child
  - then ask ${MIN_CHECKS}-${MAX_CHECKS} short questions ON THAT STEP ONLY

Never ask about something you have not taught yet. Never put the whole topic in
one step. A student should be able to finish a step in under a minute.

Where it genuinely fits the content, add a small game built FROM THE STEP:
  order  the lines of a method, given in the correct order
  spot   a worked solution with exactly one wrong line
  match  terms and meanings, each item written "term :: meaning"
  fill   a line with ___ where the missing piece goes
A game must be impossible to play without having read the step. If nothing fits,
leave the game out — a bad game is worse than none.

Reply with ONLY a JSON array, no prose and no code fence:
[
  {
    "teach": "line one\\nline two",
    "checks": [ { "question": "...", "answer": "...", "because": "..." } ],
    "game": { "kind": "order", "instruction": "...", "items": ["...", "..."] }
  }
]`;
}

/* ── reading it back ──────────────────────────────────────────────────────── */

export interface ParsedLesson {
  lesson: Lesson;
  rejected: { index: number; reason: string }[];
}

const KINDS: GameKind[] = ['order', 'spot', 'match', 'fill'];

function cleanGame(raw: unknown): Game | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;
  const kind = String(g.kind ?? '') as GameKind;
  if (!KINDS.includes(kind)) return undefined;

  const items = Array.isArray(g.items)
    ? g.items.map((i) => String(i ?? '').trim()).filter(Boolean)
    : [];

  // A game needs something to play with. 'order' and 'match' need at least two
  // pieces or there is nothing to arrange.
  if (items.length < 2) return undefined;
  if (kind === 'match' && !items.every((i) => i.includes('::'))) return undefined;

  const instruction = String(g.instruction ?? '').trim();
  if (!instruction) return undefined;

  const answer = typeof g.answer === 'number' || typeof g.answer === 'string'
    ? g.answer as string | number : undefined;
  // 'spot' is meaningless without knowing which line is wrong.
  if (kind === 'spot' && typeof answer !== 'number') return undefined;
  if (kind === 'fill' && typeof answer !== 'string') return undefined;

  return { kind, instruction, items, answer };
}

/**
 * Turn the model's reply into a lesson, dropping every step that breaks the
 * method. Throws only when NOTHING survives — a lesson of two good steps is
 * worth showing; a lesson of zero is not.
 */
export function parseLesson(
  raw: string, topic: string, subject: string | null = null,
): ParsedLesson {
  let rows: unknown;
  try {
    const text = String(raw ?? '').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    rows = JSON.parse(text);
  } catch {
    throw new Error('The lesson came back in a form we could not read.');
  }
  if (!Array.isArray(rows)) throw new Error('The lesson came back in the wrong shape.');

  const steps: Step[] = [];
  const rejected: { index: number; reason: string }[] = [];

  rows.forEach((row, index) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const teach = String(r.teach ?? '').trim();

    if (teach.length < MIN_TEACH_CHARS) {
      rejected.push({ index, reason: 'nothing taught' });
      return;
    }
    if (teachLines(teach).length > MAX_TEACH_LINES) {
      // The whole point of the method. A long step is the essay we replaced.
      rejected.push({ index, reason: 'too long to be one step' });
      return;
    }

    const checks: Check[] = (Array.isArray(r.checks) ? r.checks : [])
      .map((c) => {
        const cc = (c ?? {}) as Record<string, unknown>;
        return {
          question: String(cc.question ?? '').trim(),
          answer: String(cc.answer ?? '').trim(),
          because: cc.because ? String(cc.because).trim() : undefined,
        };
      })
      .filter((c) => c.question && c.answer)
      .slice(0, MAX_CHECKS);

    if (checks.length < MIN_CHECKS) {
      // A step that teaches and never checks is a paragraph.
      rejected.push({ index, reason: 'taught but never checked' });
      return;
    }

    steps.push({ teach, checks, game: cleanGame(r.game) });
  });

  if (!steps.length) {
    throw new Error('That lesson came back as one block rather than steps. Try again.');
  }

  return { lesson: { topic, subject, steps }, rejected };
}

/* ── working through it ───────────────────────────────────────────────────── */

export interface LessonProgress {
  /** Which step the student is on. */
  cursor: number;
  /** Step index -> how many of its checks they have answered right. */
  cleared: Record<number, number>;
}

export const startLesson = (): LessonProgress => ({ cursor: 0, cleared: {} });

/** A step is done when every one of its checks has been answered. */
export function stepDone(lesson: Lesson, p: LessonProgress, index: number): boolean {
  const step = lesson.steps[index];
  if (!step) return false;
  return (p.cleared[index] ?? 0) >= step.checks.length;
}

/**
 * May the student move on?
 *
 * THE GATE IS THE METHOD. "You drop it bit by bit" only means anything if the
 * next bit waits for the last one. Without this the lesson is a scrollable
 * document again, which is what it exists to stop being.
 */
export function canAdvance(lesson: Lesson, p: LessonProgress): boolean {
  return stepDone(lesson, p, p.cursor);
}

export function recordCheck(p: LessonProgress, stepIndex: number): LessonProgress {
  return { ...p, cleared: { ...p.cleared, [stepIndex]: (p.cleared[stepIndex] ?? 0) + 1 } };
}

export function advance(lesson: Lesson, p: LessonProgress): LessonProgress {
  if (!canAdvance(lesson, p)) return p;
  return { ...p, cursor: Math.min(p.cursor + 1, lesson.steps.length - 1) };
}

export function lessonProgress(lesson: Lesson, p: LessonProgress): {
  step: number; total: number; percent: number; finished: boolean;
} {
  const total = lesson.steps.length;
  const done = lesson.steps.filter((_, i) => stepDone(lesson, p, i)).length;
  return {
    step: p.cursor + 1,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    finished: done >= total,
  };
}

/**
 * Is an answer right?
 *
 * Generous on purpose. A student who wrote the right thing with different
 * spacing, capitals or a trailing full stop has understood it, and telling them
 * otherwise teaches them nothing except that the app is fussy.
 */
export function isCorrect(given: string, expected: string): boolean {
  const tidy = (s: string) => String(s ?? '')
    .toLowerCase()
    .replace(/[.,;:!?'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const a = tidy(given);
  const b = tidy(expected);
  if (!a) return false;
  if (a === b) return true;

  // "24 cm" against "24cm", and "x = 5" against "x=5".
  const squash = (s: string) => s.replace(/\s/g, '');
  if (squash(a) === squash(b)) return true;

  // A short expected answer contained in a fuller sentence: "because it doubles"
  // for an expected "it doubles".
  return b.length >= 3 && a.includes(b);
}
