/**
 * "What should I study right now?"
 *
 * Two rules do the work here:
 *
 * FINISHING BEATS STARTING — a half-read lesson is worth more than a fresh one,
 * and it is what the teacher's method assumes.
 *
 * NEVER INVENT A REASON — every suggestion carries the fact that produced it, and
 * when there is no data it says so rather than dressing a guess up as advice. A
 * student who catches the app inventing one recommendation stops believing the
 * real ones.
 */
import { describe, expect, it } from 'vitest';
import {
  EXAM_URGENT_DAYS, MISTAKES_WORTH_REVISING, daysUntil, topSuggestion, whatNext,
} from '../src/lib/nextUp';

const NOW = new Date('2026-09-03T09:00:00Z');
const inDays = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('counting days to an exam', () => {
  it('counts calendar days, not hours', () => {
    /*
      An exam at 09:00 tomorrow and one at 23:00 tomorrow are both "tomorrow" to a
      student. Subtracting milliseconds would call one of them today.
    */
    expect(daysUntil(inDays(0), NOW)).toBe(0);
    expect(daysUntil(inDays(1), NOW)).toBe(1);
    expect(daysUntil(inDays(14), NOW)).toBe(14);
  });

  it('goes negative once it has passed', () => {
    expect(daysUntil(inDays(-1), NOW)).toBe(-1);
  });

  it('says null rather than guessing at rubbish', () => {
    expect(daysUntil('', NOW)).toBeNull();
    expect(daysUntil('next tuesday', NOW)).toBeNull();
    expect(daysUntil('03/09/2026', NOW)).toBeNull();
  });
});

describe('what comes first', () => {
  it('puts an exam above everything else', () => {
    // A date is a fact about the world. Preference does not outrank it.
    const s = topSuggestion({
      exams: [{ id: 'e1', subject: 'Biology', date: inDays(5) }],
      lessons: [{ id: 'l1', topic: 'Osmosis', steps: 6, done: 3 }],
      blindSpots: [{ topic: 'Electrolysis', blindSpots: 4 }],
    }, NOW);
    expect(s.kind).toBe('exam-soon');
    expect(s.why).toBe('Your Biology exam is in 5 days.');
  });

  it('ignores an exam that is far away or already gone', () => {
    const far = whatNext({
      exams: [{ id: 'e1', subject: 'Biology', date: inDays(EXAM_URGENT_DAYS + 1) }],
      lessons: [{ id: 'l1', topic: 'Osmosis', steps: 6, done: 3 }],
    }, NOW);
    expect(far[0].kind).toBe('finish-lesson');

    const past = whatNext({
      exams: [{ id: 'e1', subject: 'Biology', date: inDays(-2) }],
      lessons: [{ id: 'l1', topic: 'Osmosis', steps: 6, done: 3 }],
    }, NOW);
    expect(past.some((x) => x.kind === 'exam-soon')).toBe(false);
  });

  it('reads today and tomorrow as words, not as numbers', () => {
    expect(topSuggestion({ exams: [{ id: 'e', subject: 'Maths', date: inDays(0) }] }, NOW).why)
      .toBe('Your Maths exam is today.');
    expect(topSuggestion({ exams: [{ id: 'e', subject: 'Maths', date: inDays(1) }] }, NOW).why)
      .toBe('Your Maths exam is tomorrow.');
  });

  it('finishes what was started before starting something new', () => {
    const s = topSuggestion({
      lessons: [{ id: 'l1', topic: 'Osmosis', steps: 6, done: 4 }],
      blindSpots: [{ topic: 'Electrolysis', blindSpots: 3 }],
    }, NOW);
    expect(s.kind).toBe('finish-lesson');
    expect(s.title).toBe('Finish Osmosis');
    expect(s.why).toBe('You stopped after 4 of 6 steps.');
  });

  it('prefers the lesson closest to being done', () => {
    const s = topSuggestion({
      lessons: [
        { id: 'a', topic: 'Barely started', steps: 6, done: 1 },
        { id: 'b', topic: 'Nearly there', steps: 6, done: 5 },
      ],
    }, NOW);
    expect(s.title).toBe('Finish Nearly there');
  });

  it('never suggests a lesson that is already finished', () => {
    const s = whatNext({ lessons: [{ id: 'l1', topic: 'Done', steps: 6, done: 6 }] }, NOW);
    expect(s.some((x) => x.kind === 'finish-lesson')).toBe(false);
  });

  it('raises a blind spot above an unfinished paper', () => {
    /*
      A blind spot is the only list that tells a student something they do not
      already know: wrong AND sure. An unfinished paper they can see for
      themselves.
    */
    const s = topSuggestion({
      blindSpots: [{ topic: 'Electrolysis', blindSpots: 3 }],
      papers: [{ id: 'p1', paperTitle: 'AQA Biology', answered: 4, total: 9 }],
    }, NOW);
    expect(s.kind).toBe('blind-spot');
    expect(s.why).toBe('3 questions you were sure about and still got wrong.');
  });
});

describe('mistakes, once there are enough of them', () => {
  const some = (n: number, subject = 'Maths') =>
    Array.from({ length: n }, () => ({ subject }));

  it('stays quiet about one or two', () => {
    // Two wrong answers is a Tuesday, not a revision session.
    const s = whatNext({ mistakes: some(MISTAKES_WORTH_REVISING - 1) }, NOW);
    expect(s.some((x) => x.kind === 'mistakes')).toBe(false);
  });

  it('speaks up once there are enough, and names the worst subject', () => {
    const s = whatNext({
      mistakes: [...some(6, 'Maths'), ...some(2, 'French')],
    }, NOW);
    const m = s.find((x) => x.kind === 'mistakes');
    expect(m).toBeTruthy();
    expect(m!.why).toBe('8 questions saved, 6 of them in Maths.');
  });
});

describe('saying nothing rather than inventing something', () => {
  it('admits it has nothing to go on', () => {
    /*
      THE RULE THAT KEEPS THE REST BELIEVABLE. Filling this space with something
      that sounds personal is easy, and anyone who has used the app twice can tell
      — and once they spot one invented suggestion they stop trusting the real ones.
    */
    const s = topSuggestion({}, NOW);
    expect(s.kind).toBe('first-step');
    expect(s.why).toMatch(/nothing to go on yet/i);
    expect(s.why).not.toMatch(/recommend|perfect for you|based on your/i);
  });

  it('says nothing to go on for empty lists too, not just missing ones', () => {
    expect(topSuggestion({ lessons: [], papers: [], mistakes: [], exams: [], blindSpots: [] }, NOW).kind)
      .toBe('first-step');
  });

  it('always returns something to do, whatever the state', () => {
    for (const state of [{}, { lessons: [] }, { exams: [{ id:'e', subject:'X', date:'rubbish' }] }]) {
      const s = whatNext(state, NOW);
      expect(s.length).toBeGreaterThan(0);
      expect(s[0].title.length).toBeGreaterThan(4);
      expect(s[0].why.length).toBeGreaterThan(10);
      expect(s[0].view).toBeTruthy();
    }
  });
});

describe('every suggestion carries its evidence', () => {
  it('gives a traceable reason for each one, with a real number in it', () => {
    const all = whatNext({
      exams: [{ id: 'e1', subject: 'Biology', date: inDays(3) }],
      lessons: [{ id: 'l1', topic: 'Osmosis', steps: 6, done: 2 }],
      blindSpots: [{ topic: 'Electrolysis', blindSpots: 3 }],
      papers: [{ id: 'p1', paperTitle: 'AQA Biology', answered: 4, total: 9 }],
      mistakes: Array.from({ length: 7 }, () => ({ subject: 'Maths' })),
    }, NOW);

    expect(all).toHaveLength(5);
    for (const s of all) {
      expect(s.why, s.kind).toMatch(/\d/);      // a fact, not a feeling
      expect(s.view, s.kind).toBeTruthy();
    }
    // and they arrive in the order that matters
    expect(all.map((s) => s.kind)).toEqual([
      'exam-soon', 'finish-lesson', 'blind-spot', 'finish-paper', 'mistakes',
    ]);
  });
});
