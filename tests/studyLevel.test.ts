/**
 * Pitching work at the actual student.
 *
 * Two properties matter more than the rest, and both are in the first block.
 *
 * Sets are PER SUBJECT. Set 1 for Maths and set 4 for French is an ordinary
 * timetable, and a single school-wide set would pitch that student's French at
 * their Maths level — making the app useless in every subject but their best.
 *
 * And a set number means nothing without knowing how many sets the subject runs.
 * If set 3 of 4 and set 3 of 7 ever collapse to the same difficulty, the feature
 * is doing nothing useful for either child.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_SETS, MAX_YEAR, MIN_YEAR,
  describeLevel, difficultyFor, normaliseLevel, promptFor, setFor,
  setStanding, subjectKey, targetGradeBand, tierFor,
  type StudyLevel,
} from '../src/lib/studyLevel';

/** `at(10, { maths: [1, 4], french: [4, 4] })` — set 1 of 4, set 4 of 4. */
const at = (year: number, sets: Record<string, [number, number]> = {}): StudyLevel =>
  normaliseLevel({
    year,
    sets: Object.fromEntries(Object.entries(sets).map(([k, [set, of]]) => [k, { set, of }])),
  });

describe('a set belongs to a subject, not to a student', () => {
  it('top set in Maths and bottom set in French get different work', () => {
    // THE CORRECTION. One school-wide set would hand this student French
    // pitched at their Maths level, which is the opposite of helping.
    const student = at(10, { maths: [1, 4], french: [4, 4] });
    expect(difficultyFor(student, 'Maths')).toBeGreaterThan(difficultyFor(student, 'French'));
    expect(tierFor(student, 'Maths')).toBe('Higher');
    expect(tierFor(student, 'French')).toBe('Foundation');
  });

  it('a subject with no sets is a real answer, not missing data', () => {
    const student = at(10, { maths: [1, 4] });
    expect(setFor(student, 'Art')).toBeNull();
    expect(setStanding(student, 'Art')).toBe(0.5);        // no claim either way
    expect(tierFor(student, 'Art')).toBeNull();
    expect(describeLevel(student, 'Art')).toContain('not setted');
  });

  it('set 3 of 4 is near the bottom; set 3 of 7 is above the middle', () => {
    const student = at(9, { history: [3, 4], geography: [3, 7] });
    expect(setStanding(student, 'History')).toBeLessThan(0.5);
    expect(setStanding(student, 'Geography')).toBeGreaterThan(0.5);
    expect(difficultyFor(student, 'Geography'))
      .toBeGreaterThan(difficultyFor(student, 'History'));
  });

  it('set 1 is the top and the last set is the bottom, whatever the count', () => {
    const student = at(9, { a: [1, 4], b: [4, 4], c: [1, 7], d: [7, 7] });
    expect(setStanding(student, 'a')).toBe(1);
    expect(setStanding(student, 'b')).toBe(0);
    expect(setStanding(student, 'c')).toBe(1);
    expect(setStanding(student, 'd')).toBe(0);
  });

  it('matches a subject however it was capitalised', () => {
    const student = at(10, { maths: [1, 4] });
    expect(setFor(student, 'MATHS')).toEqual({ set: 1, of: 4 });
    expect(setFor(student, '  Maths  ')).toEqual({ set: 1, of: 4 });
    expect(subjectKey(' Biology ')).toBe('biology');
  });
});

describe('difficulty', () => {
  it('rises with year', () => {
    const years = [7, 8, 9, 10, 11, 12, 13].map((y) => difficultyFor(at(y), 'Maths'));
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(new Set(years).size).toBe(years.length);
  });

  it('rises with set within the same year and subject', () => {
    expect(difficultyFor(at(10, { maths: [1, 4] }), 'Maths'))
      .toBeGreaterThan(difficultyFor(at(10, { maths: [4, 4] }), 'Maths'));
  });

  it('year beats set, because content has to have been taught', () => {
    /*
      A quick Year 7 in set 1 has still not met most of the Year 11 syllabus.
      Letting set outrank year would hand them work they cannot start.
    */
    expect(difficultyFor(at(11, { maths: [4, 4] }), 'Maths'))
      .toBeGreaterThan(difficultyFor(at(7, { maths: [1, 4] }), 'Maths'));
  });

  it('stays inside 1 to 10 at both extremes', () => {
    expect(difficultyFor(at(MIN_YEAR, { x: [MAX_SETS, MAX_SETS] }), 'x')).toBeGreaterThanOrEqual(1);
    expect(difficultyFor(at(MAX_YEAR, { x: [1, MAX_SETS] }), 'x')).toBeLessThanOrEqual(10);
  });
});

describe('GCSE tier', () => {
  it('top sets sit Higher, bottom sets sit Foundation', () => {
    expect(tierFor(at(11, { maths: [1, 4] }), 'Maths')).toBe('Higher');
    expect(tierFor(at(11, { maths: [4, 4] }), 'Maths')).toBe('Foundation');
  });

  it('uses standing, so set 3 of 7 is still Higher', () => {
    expect(tierFor(at(11, { m: [3, 7] }), 'm')).toBe('Higher');
    expect(tierFor(at(11, { m: [3, 4] }), 'm')).toBe('Foundation');
  });

  it('says nothing for years that do not sit GCSEs', () => {
    // Guessing a tier for a Year 8 would be inventing information.
    expect(tierFor(at(8, { m: [1, 4] }), 'm')).toBeNull();
    expect(tierFor(at(13, { m: [1, 4] }), 'm')).toBeNull();
  });
});

describe('target grades', () => {
  it('never promises a Foundation student a grade Foundation cannot award', () => {
    // THE HONESTY ONE. Foundation tier caps at 5. Telling a student on it that
    // they are heading for a 7 is a lie the exam will expose in June.
    expect(targetGradeBand(at(11, { m: [4, 4] }), 'm')!.high).toBeLessThanOrEqual(5);
  });

  it('does not push a Higher student below the tier floor', () => {
    expect(targetGradeBand(at(10, { m: [1, 4] }), 'm')!.low).toBeGreaterThanOrEqual(4);
  });

  it('gives no 9-1 grade after Year 11, because A-levels are not graded that way', () => {
    // Caught by printing the table rather than by a test: Year 13 was being told
    // it was heading for "grade 9-9" on a scale it no longer sits.
    expect(targetGradeBand(at(12, { m: [1, 4] }), 'm')).toBeNull();
    expect(targetGradeBand(at(13, { m: [1, 4] }), 'm')).toBeNull();
  });

  it('gives no grade before Year 9, because there is not one yet', () => {
    expect(targetGradeBand(at(7, { m: [1, 4] }), 'm')).toBeNull();
    expect(targetGradeBand(at(8, { m: [1, 4] }), 'm')).toBeNull();
  });

  it('stays on the 9 to 1 scale', () => {
    for (const y of [9, 10, 11]) {
      for (const s of [1, 4, 7]) {
        const band = targetGradeBand(at(y, { m: [s, 7] }), 'm')!;
        expect(band.low).toBeGreaterThanOrEqual(1);
        expect(band.high).toBeLessThanOrEqual(9);
        expect(band.low).toBeLessThanOrEqual(band.high);
      }
    }
  });
});

describe('cleaning up whatever arrives', () => {
  it('clamps years to 7–13', () => {
    expect(at(2).year).toBe(MIN_YEAR);
    expect(at(99).year).toBe(MAX_YEAR);
  });

  it('clamps a set to the number of sets that subject has', () => {
    expect(setFor(at(9, { m: [9, 4] }), 'm')).toEqual({ set: 4, of: 4 });
  });

  it('assumes four sets rather than throwing away a set the student gave', () => {
    const level = normaliseLevel({ year: 10, sets: { maths: { set: 2 } as never } });
    expect(setFor(level, 'maths')).toEqual({ set: 2, of: 4 });
  });

  it('supports subjects that run more than four sets', () => {
    expect(setFor(at(9, { m: [6, 7] }), 'm')).toEqual({ set: 6, of: 7 });
  });

  it('drops a set it cannot read instead of inventing one', () => {
    const level = normaliseLevel({
      year: 10,
      sets: { a: { set: -3, of: 4 }, b: null as never, c: { set: 0, of: 4 } },
    });
    expect(level.sets).toEqual({});
  });

  it('treats missing and junk input as unsetted rather than crashing', () => {
    for (const bad of [null, undefined, {}, { year: 'ten' }, { year: 10, sets: null }]) {
      const level = normaliseLevel(bad as Partial<StudyLevel>);
      expect(level.year).toBeGreaterThanOrEqual(MIN_YEAR);
      expect(level.year).toBeLessThanOrEqual(MAX_YEAR);
      expect(level.sets).toEqual({});
    }
  });
});

describe('what the student and the model are told', () => {
  it('describes the level the way a student would say it', () => {
    expect(describeLevel(at(10, { maths: [2, 4] }), 'Maths'))
      .toBe('Year 10, set 2 of 4 for Maths');
    expect(describeLevel(at(10))).toBe('Year 10');
  });

  it('puts the level into the prompt, or none of this changes the questions', () => {
    // A stored year and set that never reach the model are just decoration.
    const prompt = promptFor(at(11, { maths: [1, 4] }), 'Maths');
    expect(prompt).toContain('Year 11');
    expect(prompt).toContain('set 1 of 4 for Maths');
    expect(prompt).toMatch(/difficulty/i);
    expect(prompt).toContain('Higher');
  });

  it('warns the model off GCSE content for Key Stage 3', () => {
    expect(promptFor(at(7, { m: [1, 4] }), 'm')).toMatch(/Key Stage 3/i);
    expect(promptFor(at(11, { m: [1, 4] }), 'm')).not.toMatch(/Key Stage 3/i);
  });

  it('asks for stretch at the top and for shorter steps at the bottom', () => {
    expect(promptFor(at(10, { m: [1, 4] }), 'm')).toMatch(/stretch/i);
    expect(promptFor(at(10, { m: [4, 4] }), 'm')).toMatch(/confidence|short steps/i);
  });
});
