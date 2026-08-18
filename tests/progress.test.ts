/**
 * The level curve, XP rewards and streaks.
 *
 * These numbers decide how the whole app feels, and they are the first thing
 * ported from ReviseGo — so they are pinned here before anything is built on top.
 * A curve that silently changes is a curve that resets everyone's level.
 */
import { describe, expect, it } from 'vitest';
import {
  levelFromXP, levelProgress, xpForLevel, xpToReachLevel,
  xpForCorrectAnswer, endOfQuizBonus, nextStreak, localDayKey,
  BASE_LEVEL_XP, XP_COMBO_CAP, MAX_LEVEL, LEVEL_COST_CAP,
} from '../src/lib/progress';
import {
  kitsPerDay, kitsLeftToday, TOKENS_PER_KIT,
  FREE_DAILY_LIMIT, getDailyLimit, getMonthlyLimit,
} from '../src/lib/tokenService';

describe('the level curve', () => {

  it('starts everyone at level 1', () => {
    expect(levelFromXP(0)).toBe(1);
    expect(levelFromXP(499)).toBe(1);
  });

  it('reaches level 2 at exactly 500 XP', () => {
    expect(levelFromXP(BASE_LEVEL_XP)).toBe(2);
  });

  it('gets harder each level, by 20%', () => {
    expect(xpForLevel(1)).toBe(500);
    expect(xpForLevel(2)).toBe(600);
    expect(xpForLevel(3)).toBe(720);
    expect(xpForLevel(4)).toBe(864);
  });

  it('matches ReviseGo exactly — level 4 begins at 1820 XP', () => {
    // 500 + 600 + 720. This is the number the two apps must agree on, or a player
    // levels up in one and not the other.
    expect(xpToReachLevel(4)).toBe(1820);
    expect(levelFromXP(1819)).toBe(3);
    expect(levelFromXP(1820)).toBe(4);
  });

  it('caps the cost of a single level, so the curve stays finite', () => {
    // Without this, 20% compounding for 1999 levels is `Infinity` in a double —
    // the level bar would render NaN%. Every level still costs more than the last
    // until the cap, which is the "harder each time" Daniel asked for.
    expect(xpForLevel(1000)).toBe(LEVEL_COST_CAP);
    expect(Number.isFinite(xpForLevel(MAX_LEVEL))).toBe(true);
    expect(Number.isFinite(xpToReachLevel(MAX_LEVEL))).toBe(true);
  });

  it('rises every level right up to the cap, then holds', () => {
    let prev = 0;
    let hitCap = 0;
    for (let l = 1; l <= 40; l++) {
      const cost = xpForLevel(l);
      if (cost === LEVEL_COST_CAP) { hitCap++; } else { expect(cost).toBeGreaterThan(prev); }
      prev = cost;
    }
    expect(hitCap).toBeGreaterThan(0);   // it does plateau
  });

  it('stops at level 2000 however much XP is thrown at it', () => {
    expect(MAX_LEVEL).toBe(2000);
    expect(levelFromXP(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
  });

  it('never reports a broken percentage, at any XP', () => {
    for (const xp of [0, 1, 499, 500, 12345, 5_000_000, 1e12, Number.MAX_SAFE_INTEGER]) {
      const p = levelProgress(xp);
      expect(Number.isFinite(p.percent)).toBe(true);
      expect(p.percent).toBeGreaterThanOrEqual(0);
      expect(p.percent).toBeLessThanOrEqual(100);
    }
  });

  it('is NOT the old flat 100-XP-per-level rule', () => {
    // Brainify used Math.floor(xp/100)+1, which made level 40 as easy as level 4.
    expect(levelFromXP(1000)).not.toBe(11);
    expect(levelFromXP(1000)).toBe(2);
  });

  it('survives junk without hanging', () => {
    for (const bad of [NaN, -50, Infinity, undefined as unknown as number]) {
      const lvl = levelFromXP(bad);
      expect(Number.isFinite(lvl)).toBe(true);
      expect(lvl).toBeGreaterThanOrEqual(1);
    }
  });

  it('reports progress through the current level', () => {
    const p = levelProgress(500);          // exactly level 2, nothing into it
    expect(p.level).toBe(2);
    expect(p.into).toBe(0);
    expect(p.needed).toBe(600);
    expect(p.percent).toBe(0);

    const half = levelProgress(500 + 300);  // 300 of the 600 needed
    expect(half.level).toBe(2);
    expect(half.percent).toBe(50);
  });
});

describe('XP for answers', () => {

  it('pays a base amount for a correct answer', () => {
    expect(xpForCorrectAnswer(0)).toBe(40);
  });

  it('pays more as the combo builds', () => {
    expect(xpForCorrectAnswer(3)).toBeGreaterThan(xpForCorrectAnswer(1));
  });

  it('CAPS the combo bonus', () => {
    // Uncapped, grinding one easy topic beats revising anything hard.
    const huge = xpForCorrectAnswer(1000);
    expect(huge).toBe(40 + XP_COMBO_CAP);
    expect(xpForCorrectAnswer(50)).toBe(huge);
  });
});

describe('end-of-quiz bonus', () => {

  it('rewards a perfect round most', () => {
    const perfect = endOfQuizBonus(10, 10, 10).total;
    const good = endOfQuizBonus(8, 10, 3).total;
    expect(perfect).toBeGreaterThan(good);
  });

  it('always pays something for finishing', () => {
    const { rows, total } = endOfQuizBonus(0, 10, 0);
    expect(total).toBeGreaterThan(0);
    expect(rows.some(r => /complete/i.test(r.label))).toBe(true);
  });

  it('adds up to what it says it adds up to', () => {
    // The breakdown is shown to the user; a total that disagrees with its own
    // rows is worse than showing no breakdown.
    const { rows, total } = endOfQuizBonus(10, 10, 12);
    expect(rows.reduce((n, r) => n + r.xp, 0)).toBe(total);
  });

  it('handles an empty quiz without inventing XP', () => {
    expect(endOfQuizBonus(0, 0, 0).total).toBe(0);
  });
});

describe('streaks', () => {
  const today = new Date('2026-08-15T10:00:00');

  it('starts at 1 for a first-ever session', () => {
    expect(nextStreak(0, null, today)).toBe(1);
  });

  it('does not increase twice in one day', () => {
    // Studying twice on Saturday is not a two-day streak.
    expect(nextStreak(5, localDayKey(today), today)).toBe(5);
  });

  it('increases after studying yesterday', () => {
    expect(nextStreak(5, '2026-08-14', today)).toBe(6);
  });

  it('resets after a missed day', () => {
    expect(nextStreak(5, '2026-08-13', today)).toBe(1);
  });

  it('uses the local date, not UTC', () => {
    // Late-evening study in the UK must not count as the next day.
    const lateEvening = new Date('2026-08-15T23:30:00');
    expect(localDayKey(lateEvening)).toBe('2026-08-15');
  });
});

describe('the token allowance, in study kits', () => {

  it('gives round numbers of kits', () => {
    // "10,968 tokens left today" is a number from our billing arithmetic.
    // "8 study kits" is something a student can plan around.
    expect(kitsPerDay(false)).toBe(8);
    expect(kitsPerDay(true)).toBe(40);
  });

  it('counts down as the allowance is used', () => {
    expect(kitsLeftToday(0, false)).toBe(8);
    expect(kitsLeftToday(TOKENS_PER_KIT * 3, false)).toBe(5);
    expect(kitsLeftToday(FREE_DAILY_LIMIT, false)).toBe(0);
  });

  it('never goes negative when the allowance is overspent', () => {
    // A single generation can overshoot the cap, so `used` can exceed the limit.
    // "-1 study kits left" would be a nonsense on screen.
    expect(kitsLeftToday(FREE_DAILY_LIMIT + 5000, false)).toBe(0);
  });

  it('leaves the monthly cap well clear of the daily one', () => {
    /*
      THE BUG THIS EXISTS FOR. Free was 12,000/day and 120,000/month — exactly
      ten full days — so a student revising properly hit an invisible monthly
      wall on the 10th, having been told all along about a daily limit that
      reset tomorrow. It did reset. It just did not help.
    */
    for (const isPro of [false, true]) {
      const days = getMonthlyLimit(isPro) / getDailyLimit(isPro);
      expect(days, isPro ? 'pro' : 'free').toBeGreaterThanOrEqual(20);
    }
  });
});
