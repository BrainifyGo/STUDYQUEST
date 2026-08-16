/**
 * Weekly / Monthly / All Time.
 *
 * The three buttons above the activity chart had no onClick and no second
 * dataset behind them, and the chart itself bucketed purely by `getDay()` with
 * no date window — so a session from three months ago was drawn on "this
 * Tuesday". These pin the bucketing that replaced it.
 */
import { describe, expect, it } from 'vitest';
import { bucketSessions, sessionsInPeriod, summarise, startOfWeek } from '../src/lib/studyPeriods';

// A fixed Thursday, so the tests do not depend on the day they run.
const NOW = new Date(2026, 7, 13, 15, 0, 0);   // Thu 13 Aug 2026
const daysAgo = (n: number) => {
  const d = new Date(NOW);
  d.setDate(NOW.getDate() - n);
  return d.toISOString();
};

describe('weekly', () => {

  it('draws exactly seven days, ending today', () => {
    const b = bucketSessions([], 'weekly', NOW);
    expect(b).toHaveLength(7);
    expect(b[6].day).toBe('Thu');   // NOW is a Thursday
  });

  it('keeps empty days instead of dropping them', () => {
    // Dropping the gaps would draw a flat, busy week that never happened.
    const b = bucketSessions([{ date: daysAgo(0), duration: 2 }], 'weekly', NOW);
    expect(b).toHaveLength(7);
    expect(b.filter((x) => x.sessions === 0)).toHaveLength(6);
  });

  it('does NOT fold an old session onto the same weekday', () => {
    // The original bug: bucketed by getDay() with no window, so a session from
    // 12 weeks ago landed on this week's Thursday.
    const b = bucketSessions([{ date: daysAgo(84), duration: 5 }], 'weekly', NOW);
    expect(b.reduce((n, x) => n + x.sessions, 0)).toBe(0);
  });

  it('puts a session on the right day', () => {
    const b = bucketSessions([{ date: daysAgo(2), duration: 1.5 }], 'weekly', NOW);
    const tuesday = b.find((x) => x.day === 'Tue')!;
    expect(tuesday.sessions).toBe(1);
    expect(tuesday.hours).toBe(1.5);
  });
});

describe('the periods differ', () => {

  const rows = [
    { date: daysAgo(0), duration: 1, score: 80 },
    { date: daysAgo(10), duration: 2, score: 60 },
    { date: daysAgo(200), duration: 3, score: 90 },
  ];

  it('gives each period its own shape', () => {
    expect(bucketSessions(rows, 'weekly', NOW)).toHaveLength(7);
    expect(bucketSessions(rows, 'monthly', NOW)).toHaveLength(4);
    expect(bucketSessions(rows, 'all', NOW)).toHaveLength(12);
  });

  it('counts a different number of sessions per period', () => {
    // If all three showed the same totals the buttons would be relabelled tabs.
    expect(sessionsInPeriod(rows, 'weekly', NOW)).toHaveLength(1);
    expect(sessionsInPeriod(rows, 'monthly', NOW)).toHaveLength(2);
    expect(sessionsInPeriod(rows, 'all', NOW)).toHaveLength(3);
  });
});

describe('the numbers', () => {

  it('averages scores rather than summing them', () => {
    // Summing percentages gives "240%" for a good week.
    const s = summarise([{ date: daysAgo(0), duration: 1, score: 80 },
                         { date: daysAgo(1), duration: 1, score: 40 }]);
    expect(s.avgScore).toBe(60);
  });

  it('reports 0, not NaN, when nothing has a score', () => {
    const s = summarise([{ date: daysAgo(0), duration: 1 }]);
    expect(s.avgScore).toBe(0);
    expect(Number.isFinite(s.totalHours)).toBe(true);
  });

  it('survives a row with a broken date', () => {
    const b = bucketSessions([{ date: 'not a date', duration: 3 }], 'weekly', NOW);
    expect(b.reduce((n, x) => n + x.sessions, 0)).toBe(0);
  });

  it('caps goal progress at 100', () => {
    expect(summarise([{ date: daysAgo(0), duration: 900 }]).goalProgress).toBe(100);
  });
});

describe('week boundaries', () => {

  it('starts the week on Monday, and puts Sunday at the END of its week', () => {
    const sunday = new Date(2026, 7, 16);           // Sun 16 Aug 2026
    expect(startOfWeek(sunday).getDay()).toBe(1);   // Monday
    expect(startOfWeek(sunday).getDate()).toBe(10); // Mon 10 Aug, not the 17th
  });

  it('leaves a Monday where it is', () => {
    const monday = new Date(2026, 7, 10);
    expect(startOfWeek(monday).getDate()).toBe(10);
  });
});
