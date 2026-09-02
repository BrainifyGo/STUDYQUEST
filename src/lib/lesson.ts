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

/**
 * How this student likes to be taught.
 *
 * RED's teacher was explicit that students are not interchangeable: some rise to
 * pressure, some to rewards, and some shut down under either. So this is the
 * student's own choice, not something inferred from their scores — guessing
 * would mean deciding a child needs pushing on the evidence of a bad morning.
 */
export type LearningStyle = 'gentle' | 'challenge' | 'rewards';

export const STYLE_LABELS: Record<LearningStyle, string> = {
  gentle: 'Take it steady',
  challenge: 'Push me',
  rewards: 'Cheer me on',
};

const STYLE_NOTES: Record<LearningStyle, string> = {
  gentle: 'This student likes a calm pace. Go gently, reassure often, and never '
        + 'rush them.',
  challenge: 'This student likes being pushed. Set a slightly harder question at '
        + 'the end of a step and say plainly when they have done something hard. '
        + 'Push the WORK, never the person.',
  rewards: 'This student likes being cheered on. Notice what they got right and '
         + 'say so warmly before moving on.',
};

/**
 * THE TONE RULES. These are safeguarding, not style.
 *
 * RED's teacher put it plainly: if the method is too aggressive it can condemn
 * the child, make them sad, and make them not want to study at all. The users of
 * this app are schoolchildren, so a discouraging sentence is a real harm and not
 * a matter of taste. These rules go into every prompt this file builds, and the
 * tests assert they are there.
 */
const TONE = `You are warm, friendly and patient, like the teacher a child is not
afraid to put their hand up in front of.

NEVER say or imply that the student is slow, stupid, careless, lazy or bad at
this. Never be sarcastic. Never compare them to anyone else. If they are wrong,
say what the right answer is and why, kindly, and treat the mistake as a normal
part of learning — because it is. A child who feels judged stops asking, and a
child who stops asking stops learning.

Be encouraging without being false: do not tell them a wrong answer was right.

Avoid the words "obviously", "simply", "just", "clearly", "easy" and "of course"
when describing the work. To a student who is stuck, every one of them means
"you should have understood this already", which is the opposite of what you are
trying to say.

If the student says something unkind about themselves — that they are bad at
this, or stupid, or cannot do it — do not let it pass and do not agree. Tell
them plainly that this topic is genuinely hard and that being stuck on it is
normal, then carry on teaching. Do not make a speech about it.`;

/** How much of the student's own material is worth sending. */
export const MAX_MATERIAL_CHARS = 14_000;

export function buildLessonPrompt(args: {
  topic: string;
  subject?: string | null;
  /** From studyLevel.promptFor — year group and set, so the pitch is right. */
  level?: string;
  style?: LearningStyle;
  steps?: number;
  /**
   * The student's OWN material — pasted class notes, or the text of a paper they
   * uploaded. When present, the lesson is taught from this rather than from
   * whatever the model happens to know about the topic.
   */
  material?: string | null;
}): string {
  const { topic, subject, level, style = 'gentle', steps = 6, material } = args;

  /*
    TEACHING FROM WHAT THEY ACTUALLY HAVE.

    A lesson built from a topic name is a lesson about that topic in general. A
    student sitting with their own class notes, or the paper their teacher set,
    needs the lesson to be about THAT — the same wording, the same notation, the
    same worked examples they will be marked against.

    So when material is supplied it becomes the source and the model is told to
    stay inside it. Wandering into a different syllabus is worse than useless
    here: it teaches something the student will not be asked.
  */
  const fromMaterial = material?.trim()
    ? `
THE STUDENT HAS GIVEN YOU THEIR OWN MATERIAL, BELOW. TEACH FROM IT.

Use their wording, their notation and their examples wherever you can, so what
they learn here matches what they will be marked on. Cover what is actually in
it, in the order it makes sense to learn, and do not wander into parts of the
subject it does not touch.

If it is thin on something they plainly need in order to follow the rest, you may
add that — keep it small, and never contradict what they have.

THEIR MATERIAL:
${material.trim().slice(0, MAX_MATERIAL_CHARS)}
`
    : '';

  return `You are a teacher taking one student through "${topic}"${
    subject ? ` in ${subject}` : ''}.
${level ? `
${level}
` : ''}
${TONE}
${fromMaterial}
${STYLE_NOTES[style]}

Teach it in ${steps} SMALL STEPS. This matters more than anything else below:
you are not writing notes, a summary or an essay. You are teaching bit by bit.

START AT THE VERY SIMPLEST IDEA AND GET HARDER ONE STEP AT A TIME.
Step 1 should be something almost anyone could follow. Each step after it leans
on the one before. The last step should be the real thing they came to learn.
Never put a hard idea before the easy one it depends on.

Every step must:
  - teach ONE small idea in ABOUT 4-5 short lines, never more than ${MAX_TEACH_LINES}
  - use the simplest words possible, as if explaining to a young child
  - keep it interesting: a picture in words, a everyday comparison, something
    they can see in their head
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
    "teach": "line one\nline two",
    "checks": [ { "question": "...", "answer": "...", "because": "..." } ],
    "game": { "kind": "order", "instruction": "...", "items": ["...", "..."] }
  }
]`;
}

/**
 * A student asking their own question, mid-lesson.
 *
 * "The student can be released to ask questions, and be welcomed." A lesson
 * where the only allowed questions are the app's own is a worksheet. This is the
 * hand going up, and the reply has to make them glad they raised it.
 */
export function buildAskPrompt(args: {
  topic: string;
  step: string;
  question: string;
  level?: string;
}): string {
  const { topic, step, question, level } = args;

  return `A student is part-way through learning "${topic}". You have just taught
them this:

${step}

They have asked: "${question}"

${TONE}

Welcome the question — a student who asks is doing the right thing, and should
be left wanting to ask the next one.

IF THEY PUT THEMSELVES DOWN — "I'm bad at this", "I'm stupid", "I never get it"
— your FIRST line answers that, before any of the subject. One short sentence:
this topic is genuinely hard, being stuck on it is normal, and asking was the
right move. Never let it stand unanswered, and never agree with it. Then teach.

Then answer the question itself in AT MOST 4 SHORT SENTENCES, EACH ON ITS OWN
LINE, in the simplest words. Stay on what they asked — no detours into other
topics. Short separate lines, not one long paragraph.

If the answer is something you have not taught them yet, say so kindly and give
them just enough to keep going.

${level ? `${level}
` : ''}Reply with plain sentences only. No JSON, no headings, no bullet points.`;
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

/* ── keeping a lesson to come back to ─────────────────────────────────────── */

/**
 * A lesson as it is stored, with how far the student got.
 *
 * The whole method is "bit by bit", and bit by bit happens over days. A lesson
 * that vanished when the tab closed asked the student to finish in one sitting,
 * which is the opposite of the point.
 */
export interface SavedLesson {
  id: string;
  topic: string;
  subject: string | null;
  steps: Step[];
  progress: LessonProgress;
  createdAt: string;
  updatedAt: string;
  /** True when it was taught from the student's own notes or paper. */
  fromMaterial?: boolean;
}

export function newLessonId(): string {
  return `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Flatten for Firestore.
 *
 * `progress.cleared` is keyed by step NUMBER, and Firestore has no numeric
 * object keys — it stores them as strings and hands them back as strings. In
 * JavaScript `obj[0]` and `obj["0"]` are the same lookup, so this survives the
 * round trip, but only by accident of the language. It is written down here, and
 * `fromStorage` puts the numbers back deliberately rather than relying on it.
 */
export function forStorage(lesson: SavedLesson): Record<string, unknown> {
  return {
    id: lesson.id,
    topic: lesson.topic,
    subject: lesson.subject ?? null,
    steps: lesson.steps.map((s) => ({
      teach: s.teach,
      checks: s.checks.map((c) => ({
        question: c.question, answer: c.answer, because: c.because ?? null,
      })),
      // Firestore rejects `undefined` outright, so absent means null here.
      game: s.game
        ? { ...s.game, answer: s.game.answer ?? null }
        : null,
    })),
    progress: {
      cursor: lesson.progress.cursor,
      cleared: Object.fromEntries(
        Object.entries(lesson.progress.cleared).map(([k, v]) => [String(k), v]),
      ),
    },
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
    fromMaterial: !!lesson.fromMaterial,
  };
}

/** Read one back, turning the string keys of `cleared` into numbers again. */
export function fromStorage(raw: unknown): SavedLesson | null {
  const d = (raw ?? {}) as Record<string, any>;
  if (!d.id || !Array.isArray(d.steps) || !d.steps.length) return null;

  const cleared: Record<number, number> = {};
  for (const [k, v] of Object.entries(d.progress?.cleared ?? {})) {
    const n = Number(k);
    if (Number.isFinite(n)) cleared[n] = Number(v) || 0;
  }

  return {
    id: String(d.id),
    topic: String(d.topic ?? ''),
    subject: d.subject ?? null,
    steps: d.steps.map((s: any) => ({
      teach: String(s?.teach ?? ''),
      checks: (Array.isArray(s?.checks) ? s.checks : []).map((c: any) => ({
        question: String(c?.question ?? ''),
        answer: String(c?.answer ?? ''),
        because: c?.because ?? undefined,
      })),
      game: s?.game ? { ...s.game, answer: s.game.answer ?? undefined } : undefined,
    })),
    progress: { cursor: Number(d.progress?.cursor) || 0, cleared },
    createdAt: String(d.createdAt ?? ''),
    updatedAt: String(d.updatedAt ?? ''),
    fromMaterial: !!d.fromMaterial,
  };
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
 * What to say when a child gets it wrong.
 *
 * THIS IS THE MOMENT THAT DECIDES WHETHER THEY CARRY ON. RED's teacher was
 * clear that a method which condemns a child makes them sad and makes them stop
 * wanting to study — and being told "Incorrect" over and over is exactly that,
 * delivered politely.
 *
 * So nothing here says wrong, incorrect, no, or failed. Every line treats the
 * attempt as a normal part of learning, because it is. It never pretends a wrong
 * answer was right either: the truth arrives, wrapped kindly.
 *
 * Deterministic on the step and question so a student does not see the same
 * phrase twice in a row, and so the wording can be tested.
 */
const KIND_OPENERS = [
  'Good try — the answer here is',
  'Close. It is',
  'Not quite, and that is fine. It is',
  'Nearly. The one we want is',
  'That is a fair guess. The answer is',
];

export function encourage(seed: number): string {
  const i = Math.abs(Math.trunc(seed)) % KIND_OPENERS.length;
  return KIND_OPENERS[i];
}

/** What to say when they get it right. Warm, and not the same word every time. */
const PRAISE = ['Yes — that is it.', 'Exactly right.', 'That is the one.', 'Spot on.'];

export function praise(seed: number): string {
  return PRAISE[Math.abs(Math.trunc(seed)) % PRAISE.length];
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
