/**
 * Teaching bit by bit.
 *
 * The method here came from a practising teacher, so these tests guard the
 * method itself rather than the plumbing. Two rules do most of the work:
 *
 * A STEP IS SMALL AND IT CHECKS ITSELF. About five lines, then questions on
 * exactly that. A long step is the essay this replaces; an unchecked step is a
 * paragraph.
 *
 * THE NEXT BIT WAITS FOR THE LAST ONE. "You drop it bit by bit" means nothing
 * if the student can scroll past. The gate IS the method.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_TEACH_LINES, advance, buildLessonPrompt, canAdvance, isCorrect,
  lessonProgress, parseLesson, recordCheck, startLesson, stepDone,
  type Lesson,
} from '../src/lib/lesson';

const check = { question: 'What is 2 + 2?', answer: '4', because: 'Two twos.' };

const step = (over: Record<string, unknown> = {}) => ({
  teach: 'A fraction is a part of a whole.\nThe bottom number says how many equal parts there are.',
  checks: [check],
  ...over,
});

const rows = (...items: unknown[]) => JSON.stringify(items);

describe('what the teacher is asked for', () => {
  const p = buildLessonPrompt({ topic: 'Fractions', subject: 'Mathematics' });

  it('asks for small steps, not notes', () => {
    expect(p).toMatch(/small steps/i);
    expect(p).toMatch(/not writing notes, a summary or an essay/i);
    expect(p).toMatch(/about 4-5 short lines/i);
    expect(p).toMatch(new RegExp(`never more than ${MAX_TEACH_LINES}`, 'i'));
  });

  it('asks for the simplest possible words', () => {
    expect(p).toMatch(/simplest words/i);
    expect(p).toMatch(/young child/i);
  });

  it('forbids asking about what has not been taught', () => {
    expect(p).toMatch(/never ask about something you have not taught yet/i);
    // \s+ rather than a space: the prompt is a template literal and wraps
    // mid-phrase. Where the line breaks is formatting, not meaning.
    expect(p).toMatch(/never\s+put\s+the\s+whole\s+topic\s+in\s+one\s+step/i);
  });

  it('demands the game come out of the lesson', () => {
    // The teacher's point: a game about the subject, not points bolted on.
    expect(p).toMatch(/impossible to play without having read the step/i);
    expect(p).toMatch(/a bad game is worse than none/i);
  });

  it('carries the student\'s year and set through', () => {
    const pitched = buildLessonPrompt({
      topic: 'Fractions', subject: 'Mathematics',
      level: 'The student is in Year 10 set 1 Mathematics.',
    });
    expect(pitched).toContain('Year 10 set 1');
  });
});

describe('refusing what is not teaching', () => {
  it('throws away a step longer than the method allows', () => {
    /*
      THE RULE THE WHOLE FEATURE RESTS ON. Ask a model for five lines and it
      will hand back twelve. If that is accepted, the lesson is a document
      again and nothing has changed.
    */
    const long = Array.from({ length: MAX_TEACH_LINES + 3 }, (_, i) => `Line ${i}.`).join('\n');
    const { lesson, rejected } = parseLesson(rows(step(), step({ teach: long })), 'Fractions');
    expect(lesson.steps).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/too long/i);
  });

  it('throws away a step that never checks itself', () => {
    const { lesson, rejected } = parseLesson(rows(step(), step({ checks: [] })), 'Fractions');
    expect(lesson.steps).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/never checked/i);
  });

  it('throws away a heading pretending to be a step', () => {
    const { rejected } = parseLesson(rows(step(), step({ teach: 'Fractions' })), 'Fractions');
    expect(rejected[0].reason).toMatch(/nothing taught/i);
  });

  it('keeps at most three checks, because a few means a few', () => {
    const many = [check, check, check, check, check];
    const { lesson } = parseLesson(rows(step({ checks: many })), 'Fractions');
    expect(lesson.steps[0].checks).toHaveLength(3);
  });

  it('refuses outright when the whole thing came back as one block', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Line ${i}.`).join('\n');
    expect(() => parseLesson(rows(step({ teach: long })), 'Fractions'))
      .toThrow(/one block rather than steps/i);
    expect(() => parseLesson('not json at all', 'Fractions')).toThrow(/could not read/i);
  });

  it('copes with a code fence around the reply', () => {
    const fenced = '```json\n' + rows(step()) + '\n```';
    expect(parseLesson(fenced, 'Fractions').lesson.steps).toHaveLength(1);
  });
});

describe('games that come out of the lesson', () => {
  const withGame = (game: unknown) =>
    parseLesson(rows(step({ game })), 'Fractions').lesson.steps[0].game;

  it('keeps an ordering game', () => {
    expect(withGame({
      kind: 'order', instruction: 'Put the method in order.',
      items: ['Find a common denominator.', 'Add the tops.', 'Simplify.'],
    })?.kind).toBe('order');
  });

  it('drops a spot-the-mistake game that never says which line is wrong', () => {
    // Unanswerable, and it would mark a correct student wrong.
    expect(withGame({
      kind: 'spot', instruction: 'Find the error.', items: ['2 + 2 = 4', '4 x 2 = 9'],
    })).toBeUndefined();
    expect(withGame({
      kind: 'spot', instruction: 'Find the error.',
      items: ['2 + 2 = 4', '4 x 2 = 9'], answer: 1,
    })?.answer).toBe(1);
  });

  it('drops a matching game whose items are not pairs', () => {
    expect(withGame({
      kind: 'match', instruction: 'Pair them.', items: ['numerator', 'denominator'],
    })).toBeUndefined();
    expect(withGame({
      kind: 'match', instruction: 'Pair them.',
      items: ['numerator :: the top number', 'denominator :: the bottom number'],
    })?.kind).toBe('match');
  });

  it('drops a game with nothing to play with, and an unknown kind', () => {
    expect(withGame({ kind: 'order', instruction: 'Go', items: ['only one'] })).toBeUndefined();
    expect(withGame({ kind: 'quiz-blast', instruction: 'Go', items: ['a', 'b'] })).toBeUndefined();
    expect(withGame(null)).toBeUndefined();
  });
});

describe('the next bit waits for the last one', () => {
  const lesson: Lesson = {
    topic: 'Fractions', subject: 'Mathematics',
    steps: [
      { teach: 'one', checks: [check, check] },
      { teach: 'two', checks: [check] },
      { teach: 'three', checks: [check] },
    ],
  };

  it('will not advance from an unfinished step', () => {
    /*
      THE GATE IS THE METHOD. Without it the lesson is a scrollable document
      again, which is exactly what teaching bit by bit exists to stop.
    */
    let p = startLesson();
    expect(canAdvance(lesson, p)).toBe(false);
    expect(advance(lesson, p).cursor).toBe(0);

    p = recordCheck(p, 0);                 // one of two checks
    expect(canAdvance(lesson, p)).toBe(false);

    p = recordCheck(p, 0);                 // both now
    expect(canAdvance(lesson, p)).toBe(true);
    expect(advance(lesson, p).cursor).toBe(1);
  });

  it('never runs off the end', () => {
    let p = startLesson();
    for (let i = 0; i < 10; i++) {
      p = recordCheck(p, p.cursor);
      p = recordCheck(p, p.cursor);
      p = advance(lesson, p);
    }
    expect(p.cursor).toBe(lesson.steps.length - 1);
  });

  it('reports progress by steps finished, not by how far they scrolled', () => {
    let p = startLesson();
    expect(lessonProgress(lesson, p)).toMatchObject({ step: 1, total: 3, percent: 0, finished: false });

    p = recordCheck(recordCheck(p, 0), 0);
    expect(lessonProgress(lesson, p).percent).toBe(33);
    expect(stepDone(lesson, p, 0)).toBe(true);

    p = recordCheck(advance(lesson, p), 1);
    p = recordCheck(advance(lesson, p), 2);
    expect(lessonProgress(lesson, p).finished).toBe(true);
  });
});

describe('marking a young student fairly', () => {
  it('forgives spacing, capitals and punctuation', () => {
    // Being fussy here teaches nothing except that the app is fussy.
    expect(isCorrect('4', '4')).toBe(true);
    expect(isCorrect('  Four.  ', 'four')).toBe(true);
    expect(isCorrect('X=5', 'x = 5')).toBe(true);
    expect(isCorrect('24cm', '24 cm')).toBe(true);
  });

  it('accepts the right answer inside a fuller sentence', () => {
    expect(isCorrect('because it doubles', 'it doubles')).toBe(true);
  });

  it('still says no when it is wrong or empty', () => {
    expect(isCorrect('5', '4')).toBe(false);
    expect(isCorrect('', '4')).toBe(false);
    expect(isCorrect('   ', '4')).toBe(false);
  });
});
