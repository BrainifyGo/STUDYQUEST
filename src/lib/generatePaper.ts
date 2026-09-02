import type { Board, ExamQuestion } from './examPaper';
import type { Tier } from './studyLevel';
import { COMMAND_WORDS } from './commandWords';

/**
 * Writing a practice paper, rather than reproducing one.
 *
 * THIS IS THE LEGAL HALF OF THE PAST-QUESTIONS IDEA, AND THE DISTINCTION IS THE
 * WHOLE POINT.
 *
 * Real past papers and mark schemes belong to AQA, Pearson, OCR and WJEC.
 * StudyQuest cannot host them. What it can do is what every revision guide and
 * every teacher does: write NEW questions in the style of the specification.
 * Topics, formats and command words are not copyrightable; the boards' actual
 * papers are.
 *
 * So the prompt below insists on original questions and forbids reproducing a
 * real one from memory — which a model asked for "a past paper question" will
 * otherwise cheerfully try to do. That instruction is not decoration; it is the
 * reason this feature can exist at all.
 *
 * The generated questions come out as `ExamQuestion[]`, the same shape
 * `examPaper.ts` produces from an uploaded PDF, so everything downstream —
 * sessions, marking, the post-mortem — works on both without knowing which is
 * which.
 */

export interface PaperSpec {
  subject: string;
  /** Narrow it down, e.g. "electrolysis". Optional. */
  topic?: string;
  board?: Board | null;
  tier?: Tier | null;
  /** How many questions to write. */
  count: number;
  /** From studyLevel.promptFor(), so it lands at the student's year and set. */
  level?: string;
}

export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 12;
export const DEFAULT_QUESTIONS = 6;

export function clampCount(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_QUESTIONS;
  return Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, v));
}

/** The command words worth teaching, for the prompt to draw from. */
const TEACHABLE = COMMAND_WORDS
  .filter((c) => ['state', 'describe', 'explain', 'calculate', 'suggest', 'evaluate', 'compare']
    .includes(c.word))
  .map((c) => c.word);

export function buildPaperPrompt(spec: PaperSpec): string {
  const count = clampCount(spec.count);
  const where = [spec.board, spec.subject].filter(Boolean).join(' ');

  return `Write ${count} ORIGINAL GCSE exam-style questions on ${spec.topic || spec.subject}${
    where ? ` for ${where}` : ''
  }.

${spec.level ? `${spec.level}\n` : ''}${spec.tier ? `They sit the ${spec.tier} tier paper.\n` : ''}
THESE MUST BE YOUR OWN QUESTIONS.
Do not reproduce, quote or lightly reword a real exam question you have seen.
Write new ones that test the same specification content in the same style. If you
find yourself recalling a specific past paper question, write a different one.

Make it read like a real paper:
- Open each question with a command word — ${TEACHABLE.join(', ')} — and make the
  mark allocation match it. "State" is worth 1; "Explain" is worth 2 to 4;
  "Evaluate" is worth 6 or more.
- Vary the marks. A paper that is all 3-mark questions is not a paper.
- Where a calculation is involved, give real numbers that work out cleanly.
- No multiple choice. These are written answers.
- No diagrams, and nothing that depends on a figure the student cannot see.

Reply with ONLY a JSON array, no prose and no code fence:
[
  { "number": "1", "text": "<the question, exactly as it would be printed>", "marks": <integer> },
  { "number": "2", "text": "...", "marks": <integer> }
]`;
}

/** A generated question that failed validation, and why. */
export interface RejectedQuestion {
  index: number;
  reason: string;
}

export interface GeneratedPaper {
  questions: ExamQuestion[];
  rejected: RejectedQuestion[];
}

/** Marks a single GCSE question can plausibly be worth. */
const MIN_MARKS = 1;
const MAX_MARKS = 20;
/** Shorter than this is not a question, it is a fragment. */
const MIN_TEXT = 15;

/**
 * Read a generated paper, and throw away anything that is not usable.
 *
 * Validation is not pedantry here. A question with no marks cannot be marked, a
 * one-word question cannot be answered, and a 40-mark question is a misread of
 * the format — and every one of those would reach the student as a real question
 * that then behaves strangely. Better to drop it and say how many were dropped.
 *
 * Throws only when NOTHING survives, because that is the case the caller has to
 * handle differently: showing an empty paper is worse than an error.
 */
export function parseGeneratedPaper(raw: string): GeneratedPaper {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('The generator returned nothing.');
  }

  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('The generator did not return a paper.');

  let rows: unknown;
  try {
    rows = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('The generator returned something unreadable.');
  }
  if (!Array.isArray(rows)) throw new Error('The generator did not return a list of questions.');

  const questions: ExamQuestion[] = [];
  const rejected: RejectedQuestion[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const r = row as Record<string, unknown>;
    const body = String(r?.text ?? '').trim();
    const marks = Math.round(Number(r?.marks));

    if (body.length < MIN_TEXT) return void rejected.push({ index: i, reason: 'too short to answer' });
    if (!Number.isFinite(marks)) return void rejected.push({ index: i, reason: 'no marks given' });
    if (marks < MIN_MARKS || marks > MAX_MARKS) {
      return void rejected.push({ index: i, reason: `${marks} marks is not a GCSE question` });
    }
    // Models repeat themselves, and two identical questions in a six-question
    // paper is very noticeable.
    const key = body.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return void rejected.push({ index: i, reason: 'duplicate' });
    seen.add(key);

    questions.push({
      // Renumbered in sequence: a model that skips from 3 to 5 would otherwise
      // leave a paper that looks like it lost a page.
      number: String(questions.length + 1),
      text: body,
      marks,
    });
  });

  if (!questions.length) throw new Error('None of the generated questions were usable.');
  return { questions, rejected };
}

/** Total marks on a generated paper. */
export function totalMarks(questions: ExamQuestion[]): number {
  return questions.reduce((n, q) => n + (q.marks ?? 0), 0);
}

/**
 * A title for the paper, from what was asked for.
 * "Practice paper" alone is useless once a student has three of them saved.
 */
export function paperTitle(spec: PaperSpec): string {
  const bits = [spec.board, spec.topic || spec.subject].filter(Boolean);
  return `${bits.join(' · ')} practice`;
}

/**
 * A stable id for a spec, so asking for the same thing twice resumes rather
 * than piling up near-identical papers in the library.
 *
 * The date is part of it deliberately: a student who wants a fresh set of
 * questions tomorrow should get one, and a student who reloads the page today
 * should get back the paper they were halfway through.
 */
export function specId(spec: PaperSpec, today = new Date()): string {
  const day = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${
    String(today.getDate()).padStart(2, '0')}`;
  return `gen-${[spec.board, spec.subject, spec.topic, spec.count, day]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')}`;
}
