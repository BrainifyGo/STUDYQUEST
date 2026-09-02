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
  MAX_MATERIAL_CHARS, MAX_TEACH_LINES, STYLE_LABELS, advance, buildAskPrompt,
  buildLessonPrompt, canAdvance, encourage, forStorage, fromStorage, isCorrect,
  lessonProgress, newLessonId, parseLesson, praise, recordCheck, startLesson,
  stepDone,
  type Lesson, type LearningStyle, type SavedLesson,
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

describe('never making a child feel small', () => {
  /*
    SAFEGUARDING, NOT STYLE.

    RED relayed the teacher's warning directly: if the method is too aggressive
    it can condemn the child, make them sad, and make them not want to study at
    all. The users of this app are schoolchildren, so a discouraging sentence is
    a real harm rather than a matter of taste — which is why it is tested.
  */
  const p = buildLessonPrompt({ topic: 'Fractions' });

  it('forbids the model from putting the student down', () => {
    expect(p).toMatch(/never say or imply that the student is slow, stupid/i);
    expect(p).toMatch(/never be sarcastic/i);
    expect(p).toMatch(/never compare them to anyone else/i);
  });

  it('says why it matters, so the rule is not trimmed later as padding', () => {
    expect(p).toMatch(/a child who feels judged stops asking/i);
  });

  it('bans the words that mean "you should already know this"', () => {
    /*
      Found by reading what a real model actually wrote. "It just follows from
      the product rule" is friendly-sounding and still tells a stuck child that
      the thing defeating them is trivial. Same for obviously, simply, clearly,
      easy, of course.
    */
    expect(p).toMatch(/avoid the words "obviously", "simply", "just"/i);
    expect(p).toMatch(/you should have understood this already/i);
  });

  it('does not let a child call themselves stupid', () => {
    // A child who says "I am bad at maths" and is not contradicted has just had
    // it confirmed by their teacher.
    expect(p).toMatch(/do not let it pass and do not agree/i);
    expect(p).toMatch(/genuinely hard and that being stuck on it is\s+normal/i);
  });

  it('is warm without being dishonest', () => {
    // Telling a child a wrong answer was right is its own kind of harm.
    expect(p).toMatch(/do not tell them a wrong answer was right/i);
    expect(p).toMatch(/warm, friendly and patient/i);
  });

  it('never says "wrong" to the student, in any of its wordings', () => {
    for (let seed = 0; seed < 40; seed++) {
      const said = encourage(seed).toLowerCase();
      expect(said).not.toMatch(/wrong|incorrect|fail/);
      expect(said.length).toBeGreaterThan(5);
    }
  });

  it('varies what it says, so it does not sound like a machine', () => {
    const seen = new Set(Array.from({ length: 10 }, (_, i) => encourage(i)));
    expect(seen.size).toBeGreaterThan(1);
    const praised = new Set(Array.from({ length: 10 }, (_, i) => praise(i)));
    expect(praised.size).toBeGreaterThan(1);
  });
});

describe('simplest first, then harder', () => {
  const p = buildLessonPrompt({ topic: 'Fractions' });

  it('asks for the easiest idea first and the real thing last', () => {
    expect(p).toMatch(/start at the very simplest idea/i);
    expect(p).toMatch(/step 1 should be something almost anyone could follow/i);
    expect(p).toMatch(/never put a hard idea before the easy one it depends on/i);
  });

  it('asks for it to be interesting, not just correct', () => {
    expect(p).toMatch(/keep it interesting/i);
    expect(p).toMatch(/everyday comparison|see in their head/i);
  });
});

describe('teaching this student rather than a student', () => {
  it('has a wording for every learning style', () => {
    const styles: LearningStyle[] = ['gentle', 'challenge', 'rewards'];
    for (const style of styles) {
      expect(STYLE_LABELS[style]).toBeTruthy();
      expect(buildLessonPrompt({ topic: 'Fractions', style }).length).toBeGreaterThan(100);
    }
  });

  it('pushes the work, never the person, even when asked to push', () => {
    /*
      The teacher said some students learn under pressure. That licenses a harder
      question — it does not license being hard ON THEM, and the difference is
      the whole safeguarding point.
    */
    const pushed = buildLessonPrompt({ topic: 'Fractions', style: 'challenge' });
    expect(pushed).toMatch(/push the WORK, never the person/i);
    expect(pushed).toMatch(/never say or imply that the student is slow/i);
  });

  it('cheers on the student who likes being cheered on', () => {
    expect(buildLessonPrompt({ topic: 'Fractions', style: 'rewards' }))
      .toMatch(/notice what they got right/i);
  });
});

describe('when the student puts their hand up', () => {
  const ask = buildAskPrompt({
    topic: 'Fractions',
    step: 'A fraction is a part of a whole.',
    question: 'why is the bottom number bigger sometimes?',
  });

  it('welcomes the question rather than tolerating it', () => {
    // A lesson where the only allowed questions are the app's own is a worksheet.
    expect(ask).toMatch(/welcome the question/i);
    expect(ask).toMatch(/left wanting to ask the next one/i);
  });

  it('answers what was actually asked, briefly', () => {
    // Every gap is \s+: the prompt is a template literal and the wrap point
    // moves whenever the wording above it changes.
    expect(ask).toMatch(/at\s+most\s+4\s+short\s+sentences,\s+each\s+on\s+its\s+own\s+line/i);
    expect(ask).toMatch(/stay on what they asked/i);
    expect(ask).toContain('why is the bottom number bigger sometimes?');
    expect(ask).toContain('A fraction is a part of a whole.');
  });

  it('carries the same tone rules as the lesson', () => {
    expect(ask).toMatch(/never be sarcastic/i);
    expect(ask).toMatch(/warm, friendly and patient/i);
  });

  it('answers a child who calls themselves stupid BEFORE the maths', () => {
    /*
      A REAL MISS, FOUND BY ASKING A REAL MODEL.

      The tone rules already said not to let self-criticism stand, but the ask
      prompt then said to answer "about what they asked and nothing else" — and
      the model obeyed the narrower instruction. A child who wrote "i dont get it
      at all, im really bad at maths" got back four clean lines of integration by
      parts and no acknowledgement at all.

      The two instructions contradicted each other, so one had to go.
    */
    expect(ask).toMatch(/if they put themselves down/i);
    expect(ask).toMatch(/your FIRST line answers that, before any of the subject/i);
    expect(ask).toMatch(/never let it stand unanswered, and never agree with it/i);
  });

  it('is honest when the answer is ahead of them', () => {
    expect(ask).toMatch(/have not taught them yet, say so kindly/i);
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

describe('coming back to it tomorrow', () => {
  /*
    THE METHOD NEEDS THIS. "Bit by bit" happens across days, and a lesson that
    vanished with the tab quietly demanded the opposite: finish in one sitting or
    lose it. For a student with twenty minutes before dinner that is the
    difference between a tool and a demo.
  */
  const saved = (): SavedLesson => ({
    id: newLessonId(),
    topic: 'Fractions',
    subject: 'Mathematics',
    steps: [
      { teach: 'one', checks: [check, check] },
      {
        teach: 'two',
        checks: [check],
        game: { kind: 'order', instruction: 'Order it.', items: ['a', 'b'] },
      },
    ],
    progress: { cursor: 1, cleared: { 0: 2, 1: 1 } },
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T11:00:00.000Z',
  });

  it('survives the round trip with progress intact', () => {
    const back = fromStorage(forStorage(saved()));
    expect(back).not.toBeNull();
    expect(back!.progress.cursor).toBe(1);
    expect(back!.steps).toHaveLength(2);
    expect(back!.topic).toBe('Fractions');
  });

  it('puts the numeric step keys back', () => {
    /*
      Firestore has no numeric object keys — it stores them as strings and hands
      them back as strings. JavaScript looks up obj[0] and obj["0"] identically,
      so this survives by accident of the language rather than by design. The
      round trip is asserted so a future rewrite cannot quietly break resuming.
    */
    const stored = forStorage(saved()) as any;
    expect(Object.keys(stored.progress.cleared)).toEqual(['0', '1']);

    const back = fromStorage(stored)!;
    expect(back.progress.cleared[0]).toBe(2);
    expect(back.progress.cleared[1]).toBe(1);
    // and the resumed lesson still knows step 0 was finished
    expect(stepDone({ topic: 'x', subject: null, steps: back.steps }, back.progress, 0))
      .toBe(true);
  });

  it('never writes undefined, which Firestore rejects outright', () => {
    const withGaps: SavedLesson = {
      ...saved(),
      steps: [{ teach: 'one', checks: [{ question: 'q', answer: 'a' }] }],
    };
    const json = JSON.stringify(forStorage(withGaps));
    expect(json).not.toContain('undefined');
    // `because` and `game` are absent above, so both must be null, not missing.
    const stored = forStorage(withGaps) as any;
    expect(stored.steps[0].game).toBeNull();
    expect(stored.steps[0].checks[0].because).toBeNull();
  });

  it('refuses a document that is not a lesson', () => {
    expect(fromStorage(null)).toBeNull();
    expect(fromStorage({})).toBeNull();
    expect(fromStorage({ id: 'x', steps: [] })).toBeNull();
  });

  it('gives every lesson its own id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newLessonId()));
    expect(ids.size).toBe(50);
  });
});

describe('teaching from the student\'s own notes', () => {
  const notes = 'Osmosis is the movement of water across a partially permeable membrane.';

  it('teaches from their material when they give it', () => {
    /*
      A lesson from a topic name is about the topic in general. A student with
      their own class notes needs the lesson to match the wording and notation
      they will actually be marked on.
    */
    const p = buildLessonPrompt({ topic: 'Osmosis', material: notes });
    expect(p).toMatch(/THE STUDENT HAS GIVEN YOU THEIR OWN MATERIAL/);
    expect(p).toMatch(/use their wording, their notation and their examples/i);
    expect(p).toContain(notes);
  });

  it('tells it not to wander off their syllabus', () => {
    // Teaching something they will not be asked is worse than useless.
    const p = buildLessonPrompt({ topic: 'Osmosis', material: notes });
    expect(p).toMatch(/do not wander into parts of the\s+subject it does not touch/i);
    expect(p).toMatch(/never contradict what they have/i);
  });

  it('says nothing about material when there is none', () => {
    const p = buildLessonPrompt({ topic: 'Osmosis' });
    expect(p).not.toMatch(/THEIR MATERIAL/);
    expect(p).not.toMatch(/OWN MATERIAL/);
  });

  it('caps how much of a long paper it sends', () => {
    const huge = 'x'.repeat(MAX_MATERIAL_CHARS * 3);
    const p = buildLessonPrompt({ topic: 'Osmosis', material: huge });
    expect(p.length).toBeLessThan(MAX_MATERIAL_CHARS + 4000);
  });

  it('ignores material that is only whitespace', () => {
    expect(buildLessonPrompt({ topic: 'Osmosis', material: '   \n  ' }))
      .not.toMatch(/THEIR MATERIAL/);
  });
});
