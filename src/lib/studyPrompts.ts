/**
 * STUDY KIT PROMPTS — one spec per mode, and options that actually do something.
 *
 * What was here before: a single prompt reading
 *
 *     "Generate a ${studyMode} from the following content. Format clearly using
 *      Markdown with sections and bullet points."
 *
 * followed by a fixed OUTPUT FORMAT block (Key Concepts / Summary / Quick Facts /
 * Exam Tips). Two things followed from that, and both were reported as bugs:
 *
 *  1. FLASHCARDS NEVER WORKED. The model was asked for Markdown, then the reply
 *     was fed to JSON.parse. It threw every time, so the flashcard tab stayed
 *     empty no matter what you pasted in.
 *
 *  2. "Make it shorter", "Exam focused" and "Bullet points" were passed to the
 *     model as the bare line `Options: Shorter: true, ...` with nothing
 *     anywhere explaining what to do about it — while the OUTPUT FORMAT block
 *     directly beneath insisted on the same four headings regardless. The
 *     format won, so every mode and every option produced the same summary.
 *
 * Each mode now states its own output contract, and the options rewrite the
 * instructions rather than being mentioned in passing. Kept as pure functions
 * with no React and no network so the wording can be tested.
 */
import type { StudyMode } from '../App';

export interface KitOptions {
  shorter: boolean;
  examFocused: boolean;
  bulletPoints: boolean;
}

/** Modes whose reply is parsed as JSON rather than rendered as Markdown. */
export const JSON_MODES: StudyMode[] = ['flashcards', 'quiz', 'mindmap'];

export function isJsonMode(mode: StudyMode): boolean {
  return JSON_MODES.includes(mode);
}

/** How many items a mode should produce, by plan. Pro pays for more. */
export function itemCount(mode: StudyMode, isPro: boolean): number {
  if (mode === 'quiz') return isPro ? 10 : 5;
  if (mode === 'flashcards') return isPro ? 20 : 10;
  return 0;
}

/**
 * WHAT "GCSE LEVEL" ACTUALLY MEANS, spelled out.
 *
 * The word "GCSE" alone does not calibrate anything — measured, the same prompt
 * produced "Calculate 45 + 55" for one topic and "what is the primary source of
 * electrons that reduce NADP+" for another. One is primary school, the other is
 * A-level. Neither is the exam these students are sitting.
 *
 * A floor and a ceiling with concrete examples fixes far more than an adjective
 * does, so both are stated, and both name the failure they are there to prevent.
 */
const GCSE_LEVEL = `
  - The FLOOR: never ask something answerable by arithmetic alone or by reading
    the question back. "Calculate 45 + 55" and "What does H2O stand for?" are
    not GCSE questions and must not appear.
  - The CEILING: nothing beyond the GCSE specification. No A-level content — no
    calculus, no NADP+ or the Calvin cycle by name, no university terminology.
    If a topic has an A-level treatment, ask the GCSE version of it.
  - The TARGET: what a grade 4-7 student meets in a real paper. Applying a method
    rather than reciting it, one or two steps of reasoning, the distinctions
    examiners actually test.
  - If the topic given is a whole SUBJECT rather than a topic ("maths",
    "biology"), choose specific GCSE topics within it and vary them across the
    questions. Do not retreat to the easiest thing in the subject.`;

/**
 * Plain notation, because LaTeX breaks the parse.
 *
 * A backslash is not a valid JSON escape unless what follows it happens to be
 * one, so a model that answers with \frac{1}{2} or \(x^2\) produces JSON that
 * `JSON.parse` rejects outright — and the student gets "could not build that"
 * with no idea why. Measured: this is exactly how a maths generation failed.
 *
 * `parseJsonReply` repairs stray escapes as well, because a model will do this
 * whatever it is told. Belt and braces, and the braces are cheap.
 */
const PLAIN_NOTATION = `
  - NOTATION: plain text only. Write x^2 for x squared, (a+b)/c for a fraction,
    sqrt(x) for a square root, and pi for pi. NEVER use LaTeX, and never use a
    backslash anywhere in your reply — a backslash is not valid JSON and it will
    make the whole answer unreadable.
  - QUOTES: straight quotes only ("), never curly ones. Curly quotes are not
    valid JSON and the whole reply is rejected because of them.
  - Use a plain hyphen for a minus sign, not a dash.`;

/**
 * The per-mode contract. This is the part that was missing.
 *
 * The JSON modes say "ONLY the array" in as many ways as it takes, because a
 * model that adds ```json fences breaks the parse and the tab renders empty —
 * which is exactly how flashcards failed.
 */
function modeSpec(mode: StudyMode, isPro: boolean): string {
  const n = itemCount(mode, isPro);

  switch (mode) {
    case 'flashcards':
      return `
TASK: Produce EXACTLY ${n} revision flashcards.

- One fact per card. A card testing two things is two cards.
- The question side must be answerable from memory, not a topic heading.
  Good: "What does the mitochondrion produce?"  Bad: "Mitochondria"
- The answer side is one or two sentences. No lists, no markdown, no headings.
- Cover the whole of the content, not just the opening paragraphs.

DIFFICULTY — this is a GCSE app, for 14 to 16 year olds sitting UK exams.
${GCSE_LEVEL}
${PLAIN_NOTATION}

OUTPUT: a JSON array and NOTHING else. No prose before it, no explanation after
it, no \`\`\`json fence around it. The very first character you output must be [
and the very last must be ].

[
  { "question": "...", "answer": "..." }
]`;

    case 'quiz':
      return `
TASK: Produce EXACTLY ${n} multiple-choice questions.

DIFFICULTY — this is a GCSE app, for 14 to 16 year olds sitting UK exams.
${GCSE_LEVEL}

- Four options each. The three wrong ones must be plausible — an obviously silly
  option makes the question free. The best wrong answers are the mistakes a
  student actually makes: a sign error, the reciprocal, the confused definition.
- "correctAnswer" must be the full text of the right option, copied exactly as it
  appears in "options", not a letter.
- The explanation says WHY, in one or two sentences. It is what the student reads
  after getting it wrong, so it has to teach something.
${PLAIN_NOTATION}

OUTPUT: a JSON array and NOTHING else. No prose before it, no explanation after
it, no \`\`\`json fence around it. The very first character you output must be [
and the very last must be ].

[
  { "question": "...", "options": ["...","...","...","..."],
    "correctAnswer": "...", "explanation": "..." }
]`;

    case 'mindmap':
      return `
TASK: Produce a mind map of the content.

- "nodes" are the concepts. "group" clusters related ones — same number, same
  branch of the map.
- "links" join them. "source" and "target" must both be ids that exist in nodes.
- Between 8 and 20 nodes. Fewer is not a map; more is not readable.

OUTPUT: a JSON object and NOTHING else. No prose, no \`\`\`json fence. The very
first character you output must be { and the very last must be }.

{ "nodes": [{ "id": "...", "group": 1 }],
  "links": [{ "source": "...", "target": "...", "value": 1 }] }`;

    case 'explain':
      return `
TASK: Explain this content to someone who has never met it before.

- Plain English. Every piece of jargon gets defined the first time it appears.
- Use a concrete comparison to something ordinary for each difficult idea.
- Build up: the simple version first, then the detail that the simple version
  left out.
- Do NOT open with "Key Concepts". Write it as an explanation, not as notes.`;

    case 'summary':
    default:
      return `
TASK: Summarise this content for revision.

Use these headings, in this order, and only these:

### Key Concepts
### Summary
### Quick Facts
### Exam Tips`;
  }
}

/**
 * The options, as instructions.
 *
 * They come last in the prompt and are written as overrides, because they are
 * modifying the mode spec above and a model follows the most recent instruction
 * when two conflict.
 */
function optionRules(opts: KitOptions, mode: StudyMode): string {
  const rules: string[] = [];

  if (opts.shorter) {
    rules.push(isJsonMode(mode)
      ? '- SHORTER: keep every field to a single sentence. Trim the wording, not the number of items.'
      : '- SHORTER: at most half the length you would normally write. Cut the examples and the restatements, keep the facts. No paragraph over three sentences.');
  }

  if (opts.examFocused) {
    rules.push(isJsonMode(mode)
      ? '- EXAM FOCUSED: only include what an exam could actually ask. Prefer definitions, named processes, dates, formulae and the distinctions examiners test. Drop background colour.'
      : '- EXAM FOCUSED: write it for the exam, not for interest. Mark what is commonly examined, name the command words that go with it ("describe", "evaluate"), flag the mistakes students usually make, and say what earns the marks.');
  }

  if (opts.bulletPoints && !isJsonMode(mode)) {
    rules.push('- BULLET POINTS: every line is a bullet. No prose paragraphs anywhere. A bullet may have sub-bullets, but it may not become a paragraph.');
  }

  if (!rules.length) return '';
  return `\nTHESE OVERRIDE ANYTHING ABOVE THEY CONFLICT WITH:\n${rules.join('\n')}`;
}

/**
 * A uniqueness seed, so asking twice does not return the same thing.
 *
 * Only for the modes where repetition is the actual complaint — the same quiz
 * twice is useless for revision, whereas a summary that changes wording every
 * time just looks unreliable.
 */
function seedLine(mode: StudyMode, seed?: number): string {
  if (mode !== 'quiz' && mode !== 'flashcards') return '';
  const s = seed ?? Math.floor(Math.random() * 1e9);
  return `\nUNIQUENESS SEED ${s}: cover different parts of the content than a previous attempt would. Do not repeat earlier questions.`;
}

/** The full prompt for one generation. */
export function buildStudyPrompt(args: {
  mode: StudyMode;
  content: string;
  options: KitOptions;
  isPro: boolean;
  /** Where the content came from, if it matters to how it reads. */
  source?: 'text' | 'youtube' | 'article' | 'pdf' | 'snap';
  seed?: number;
}): string {
  const { mode, content, options, isPro, source, seed } = args;

  const provenance =
    source === 'youtube'
      ? '\nThe content below is an auto-generated video transcript. It has no punctuation to speak of and will contain mis-transcribed words — work out what was meant.'
      : source === 'snap'
      ? '\nThe content below was read off a photo of handwritten or printed notes, so it may contain OCR errors.'
      : '';

  return `You are StudyQuest, a study assistant for GCSE students.
${modeSpec(mode, isPro)}
${optionRules(options, mode)}${seedLine(mode, seed)}${provenance}

CONTENT:
${content}`;
}

/**
 * Pull the data out of a model reply.
 *
 * Models fence JSON in ```json blocks however firmly you ask them not to, and a
 * single unhandled fence is the difference between a full set of flashcards and
 * an empty tab. So the fence is stripped rather than trusted, and only then is
 * the outermost array or object taken.
 */
export function parseJsonReply(raw: string): unknown {
  if (typeof raw !== 'string') throw new Error('Model returned no text');

  let text = raw.trim();

  // ```json ... ```  or  ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  try {
    return JSON.parse(text);
  } catch {
    // A stray backslash is the commonest reason a maths reply will not parse:
    // \frac, \( and \text are all invalid JSON escapes. Repair and retry
    // before falling back to the bracket scan below.
    try {
      return JSON.parse(repair(text));
    } catch { /* fall through */ }
  }

  {
    // Fall back to the outermost bracketed span, which survives a stray
    // "Here are your flashcards:" that the model added anyway.
    const start = text.search(/[[{]/);
    if (start === -1) throw new Error('Model reply contained no JSON');
    const opener = text[start];
    const closer = opener === '[' ? ']' : '}';
    const end = text.lastIndexOf(closer);
    if (end <= start) throw new Error('Model reply contained no JSON');
    return JSON.parse(repair(text.slice(start, end + 1)));
  }
}

/**
 * Strip backslash escapes that JSON does not recognise.
 *
 * `JSON.parse` rejects the WHOLE document for one bad escape, so a single
 * \\frac in one question throws away the other nine. The model is told to use
 * plain notation (see PLAIN_NOTATION) but will reach for LaTeX occasionally
 * anyway, and losing an entire generation to that is not a reasonable outcome
 * for the student.
 *
 * Only the escapes JSON actually defines are kept. Everything else loses its
 * backslash and keeps its text, so \\frac becomes frac — readable rather than
 * fatal.
 */
/** Both known model-side JSON faults, applied together. */
function repair(text: string): string {
  return straightenQuotes(repairEscapes(text));
}

export function repairEscapes(text: string): string {
  // Either a valid escape — \uXXXX, or \ followed by one of " \ / b f n r t —
  // which is kept as it is; or a backslash before anything else, which is
  // dropped while its text is kept.
  return text.replace(
    /\\(u[0-9a-fA-F]{4}|["\\/bfnrt])|\\(.)/g,
    (_m, valid, invalid) => (valid ? '\\' + valid : invalid)
  );
}

/**
 * Replace typographic double quotes with straight ones.
 *
 * Measured on a real maths generation:
 *
 *     "options": ["-9", “-1”, “7”, ...
 *
 * The model started the array with straight quotes and then drifted into curly
 * ones, which are not JSON string delimiters — so the whole reply was rejected
 * and the student got "could not build that".
 *
 * Only DOUBLE quotes are touched. A curly apostrophe inside a sentence
 * ("Newton's") is perfectly valid JSON and rewriting it would change what the
 * question says for no reason.
 */
export function straightenQuotes(text: string): string {
  return text.replace(/[“”„‟]/g, '"');
}

/**
 * Normalise flashcards.
 *
 * Models answer with {front, back} or {term, definition} about as often as with
 * {question, answer}, whatever the prompt says. Renaming a key is cheaper than
 * showing the student an empty deck, so all three are accepted. Anything that
 * still has no question and no answer is dropped rather than rendered blank.
 */
export function normaliseFlashcards(data: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(data)) throw new Error('Expected a list of flashcards');
  const cards = data.map((c: any) => ({
    question: String(c?.question ?? c?.front ?? c?.term ?? '').trim(),
    answer: String(c?.answer ?? c?.back ?? c?.definition ?? '').trim(),
  })).filter((c) => c.question && c.answer);
  if (!cards.length) throw new Error('No usable flashcards in the reply');
  return cards;
}

/**
 * Normalise quiz questions.
 *
 * The one that matters is `correctAnswer`: models return "B" or "B) Paris" as
 * readily as "Paris", and the marking compares it to the option text. A letter
 * would mark every answer wrong, so a lone letter is resolved back to the option
 * it points at.
 */
export function normaliseQuiz(data: unknown): {
  question: string; options: string[]; correctAnswer: string; explanation: string;
}[] {
  if (!Array.isArray(data)) throw new Error('Expected a list of questions');

  const out = data.map((q: any) => {
    const options = Array.isArray(q?.options) ? q.options.map((o: any) => String(o).trim()) : [];
    let correct = String(q?.correctAnswer ?? q?.answer ?? '').trim();

    // "B" or "B)" or "B. Paris" -> the option itself.
    const letter = correct.match(/^([A-D])\b[).:\s]*/i);
    if (letter) {
      const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
      const rest = correct.slice(letter[0].length).trim();
      if (rest && options.includes(rest)) correct = rest;
      else if (options[idx]) correct = options[idx];
    }

    return {
      question: String(q?.question ?? '').trim(),
      options,
      correctAnswer: correct,
      explanation: String(q?.explanation ?? '').trim(),
    };
  }).filter((q) => q.question && q.options.length >= 2 && q.options.includes(q.correctAnswer));

  if (!out.length) throw new Error('No usable questions in the reply');
  return out;
}
