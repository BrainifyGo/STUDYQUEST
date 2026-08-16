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
