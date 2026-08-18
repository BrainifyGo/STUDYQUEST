/**
 * The study-kit prompts.
 *
 * Two reported bugs live here: flashcards never generated, and "Make it
 * shorter" / "Exam focused" / "Bullet points" all produced the same summary.
 * Both were prompt bugs, so these pin the prompt.
 */
import { describe, expect, it } from 'vitest';
import {
  buildStudyPrompt, isJsonMode, itemCount, parseJsonReply,
  normaliseFlashcards, normaliseQuiz,
} from '../src/lib/studyPrompts';

const none = { shorter: false, examFocused: false, bulletPoints: false };
const build = (mode: any, options = none, isPro = false) =>
  buildStudyPrompt({ mode, content: 'Photosynthesis happens in the chloroplast.', options, isPro, seed: 7 });

describe('one prompt per mode', () => {

  it('asks flashcards for JSON, not for markdown', () => {
    // The whole flashcard bug: the old prompt demanded "Markdown with sections
    // and bullet points", then the reply was fed to JSON.parse.
    const p = build('flashcards');
    expect(p).toMatch(/JSON array/);
    expect(p).toMatch(/"question"/);
    expect(p).not.toMatch(/### Key Concepts/);
  });

  it('gives each mode a different instruction', () => {
    const modes = ['summary', 'flashcards', 'quiz', 'explain', 'mindmap'] as const;
    const prompts = modes.map((m) => build(m));
    expect(new Set(prompts).size).toBe(modes.length);
  });

  it('only asks for headings in summary mode', () => {
    expect(build('summary')).toMatch(/### Quick Facts/);
    expect(build('explain')).not.toMatch(/### Quick Facts/);
    expect(build('quiz')).not.toMatch(/### Quick Facts/);
  });

  it('gives Pro more items', () => {
    expect(itemCount('quiz', false)).toBe(5);
    expect(itemCount('quiz', true)).toBe(10);
    expect(itemCount('flashcards', false)).toBe(10);
    expect(itemCount('flashcards', true)).toBe(20);
    expect(build('quiz', none, true)).toMatch(/EXACTLY 10/);
  });

  it('knows which modes are parsed as JSON', () => {
    expect(isJsonMode('flashcards')).toBe(true);
    expect(isJsonMode('quiz')).toBe(true);
    expect(isJsonMode('mindmap')).toBe(true);
    expect(isJsonMode('summary')).toBe(false);
    expect(isJsonMode('explain')).toBe(false);
  });
});

describe('the smart options actually change the prompt', () => {

  it('changes the prompt for each option, and for combinations', () => {
    const base = build('summary');
    const shorter = build('summary', { ...none, shorter: true });
    const exam = build('summary', { ...none, examFocused: true });
    const bullets = build('summary', { ...none, bulletPoints: true });
    const all = build('summary', { shorter: true, examFocused: true, bulletPoints: true });

    for (const p of [shorter, exam, bullets, all]) expect(p).not.toBe(base);
    expect(new Set([shorter, exam, bullets, all]).size).toBe(4);
  });

  it('states the options as overriding instructions, not as trivia', () => {
    // The old prompt passed `Options: Shorter: true` and nothing else, while the
    // fixed OUTPUT FORMAT below it insisted on the same four headings anyway.
    const p = build('summary', { ...none, shorter: true });
    expect(p).toMatch(/OVERRIDE/);
    expect(p).not.toMatch(/Shorter: true/);
  });

  it('does not ask a JSON mode for bullet points', () => {
    // "Every line is a bullet" inside a JSON array is a broken parse.
    const p = build('flashcards', { ...none, bulletPoints: true });
    expect(p).not.toMatch(/BULLET POINTS/);
  });
});

describe('reading the model back', () => {

  it('survives a ```json fence', () => {
    const raw = '```json\n[{"question":"Q","answer":"A"}]\n```';
    expect(parseJsonReply(raw)).toEqual([{ question: 'Q', answer: 'A' }]);
  });

  it('survives a chatty preamble', () => {
    const raw = 'Sure! Here are your flashcards:\n[{"question":"Q","answer":"A"}]\nHope that helps!';
    expect(parseJsonReply(raw)).toEqual([{ question: 'Q', answer: 'A' }]);
  });

  it('handles an object reply as well as an array', () => {
    expect(parseJsonReply('{"nodes":[],"links":[]}')).toEqual({ nodes: [], links: [] });
  });

  it('throws rather than returning nothing when there is no JSON at all', () => {
    expect(() => parseJsonReply('I could not do that.')).toThrow();
  });
});

describe('normalising flashcards', () => {

  it('accepts front/back and term/definition, not just question/answer', () => {
    expect(normaliseFlashcards([{ front: 'F', back: 'B' }])).toEqual([{ question: 'F', answer: 'B' }]);
    expect(normaliseFlashcards([{ term: 'T', definition: 'D' }])).toEqual([{ question: 'T', answer: 'D' }]);
  });

  it('drops half-empty cards instead of rendering a blank one', () => {
    const cards = normaliseFlashcards([
      { question: 'Q', answer: 'A' }, { question: '', answer: 'A' }, { question: 'Q2', answer: '' },
    ]);
    expect(cards).toHaveLength(1);
  });

  it('throws when nothing usable came back', () => {
    expect(() => normaliseFlashcards([])).toThrow();
    expect(() => normaliseFlashcards([{ question: '', answer: '' }])).toThrow();
    expect(() => normaliseFlashcards({ nope: true })).toThrow();
  });
});

describe('normalising quiz questions', () => {

  const q = (correct: string) => ([{
    question: 'Capital of France?',
    options: ['London', 'Paris', 'Rome', 'Madrid'],
    correctAnswer: correct,
    explanation: 'Paris is the capital.',
  }]);

  it('resolves a bare letter back to the option it points at', () => {
    // A letter left as-is marks every answer wrong, because marking compares
    // the answer to the option TEXT.
    expect(normaliseQuiz(q('B'))[0].correctAnswer).toBe('Paris');
    expect(normaliseQuiz(q('B)'))[0].correctAnswer).toBe('Paris');
    expect(normaliseQuiz(q('B. Paris'))[0].correctAnswer).toBe('Paris');
  });

  it('leaves a correct plain answer alone', () => {
    expect(normaliseQuiz(q('Paris'))[0].correctAnswer).toBe('Paris');
  });

  it('drops a question whose answer is not one of its options', () => {
    expect(() => normaliseQuiz(q('Berlin'))).toThrow();
  });

  it('drops a question with too few options', () => {
    expect(() => normaliseQuiz([{ question: 'Q', options: ['only one'], correctAnswer: 'only one' }])).toThrow();
  });
});

describe('repairing broken escapes', () => {

  it('rescues a reply containing LaTeX', () => {
    /*
      LaTeX in a JSON string fails in TWO ways, and the loud one is the lucky one.

      `\(x^2\)` is not a valid escape, so JSON.parse rejects the WHOLE document —
      one bad question throws away the other nine. That is the failure a real
      maths generation hit.

      (The quiet one: `\frac` begins with `\f`, which IS a valid escape, so it
      parses happily into a formfeed followed by "rac". No error, just corrupted
      text on screen. Nothing can reliably tell that from an intended formfeed
      after the fact, which is why the prompt bans backslashes at source.)
    */
    const raw = String.raw`[{"question":"Solve \(x^2 - 4 = 0\)","options":["2 and -2","4","0","1"],"correctAnswer":"2 and -2","explanation":"Factorise as (x-2)(x+2)."}]`;
    expect(() => JSON.parse(raw)).toThrow();           // the bug
    const parsed = parseJsonReply(raw) as any[];        // the fix
    expect(parsed).toHaveLength(1);
    expect(parsed[0].question).toContain('x^2');        // readable, not fatal
    expect(parsed[0].correctAnswer).toBe('2 and -2');   // and still markable
  });

  it('leaves valid escapes alone', () => {
    const raw = String.raw`[{"question":"He said \"hello\"","answer":"a\b","note":"line\nbreak"}]`;
    const parsed = parseJsonReply(raw) as any[];
    expect(parsed[0].question).toBe('He said "hello"');
    expect(parsed[0].answer).toBe('a\b');
    expect(parsed[0].note).toBe('line\nbreak');
  });

  it('keeps unicode escapes working', () => {
    const parsed = parseJsonReply(String.raw`[{"question":"café"}]`) as any[];
    expect(parsed[0].question).toBe('café');
  });
});

describe('difficulty is actually specified', () => {

  it('names both a floor and a ceiling', () => {
    // "GCSE" on its own calibrates nothing — measured, the same prompt produced
    // "Calculate 45 + 55" for one topic and NADP+ for another.
    const p = build('quiz');
    expect(p).toMatch(/FLOOR/);
    expect(p).toMatch(/CEILING/);
    expect(p).toMatch(/Calculate 45 \+ 55/);   // the actual bad question, named
    expect(p).toMatch(/A-level/);
  });

  it('tells the model what to do with a whole subject rather than a topic', () => {
    expect(build('quiz')).toMatch(/whole SUBJECT/);
  });

  it('bans LaTeX in every JSON mode', () => {
    // A backslash is not valid JSON, so LaTeX costs the entire generation.
    for (const mode of ['quiz', 'flashcards'] as const) {
      expect(build(mode), mode).toMatch(/NEVER use LaTeX/);
    }
  });

  it('does not lecture the prose modes about JSON notation', () => {
    expect(build('summary')).not.toMatch(/NEVER use LaTeX/);
  });
});

describe('curly quotes', () => {

  it('rescues a reply that drifted into typographic quotes', () => {
    // Measured on a real maths generation: the model opened the array with
    // straight quotes and then drifted into curly ones, which are not JSON
    // delimiters, so the entire reply was rejected.
    const raw = '[{"question":"Solve x^2 = 81","options":["9 and -9", “-1”, “7”, "3"],"correctAnswer":"9 and -9","explanation":"Both roots."}]';
    expect(() => JSON.parse(raw)).toThrow();
    const parsed = parseJsonReply(raw) as any[];
    expect(parsed[0].options).toHaveLength(4);
    expect(parsed[0].options).toContain('-1');
  });

  it('leaves a curly APOSTROPHE alone', () => {
    // "Newton’s" is valid JSON and means something; rewriting it would change
    // what the question says for no reason.
    const raw = '[{"question":"State Newton’s third law","answer":"Equal and opposite."}]';
    const parsed = parseJsonReply(raw) as any[];
    expect(parsed[0].question).toContain('’');
  });

  it('warns the model about both faults up front', () => {
    const p = build('quiz');
    expect(p).toMatch(/straight quotes only/);
    expect(p).toMatch(/never use a\s+backslash/);
  });
});
