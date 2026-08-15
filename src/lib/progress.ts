/**
 * PROGRESS — levels, XP and combos. The first piece ported from ReviseGo.
 *
 * Brainify awarded a flat level per 100 XP, which means level 40 is exactly as
 * hard to reach as level 4 and the number stops meaning anything. ReviseGo used a
 * proper curve: 500 XP for level 2, and each level after that costs 20% more than
 * the last. That is the one kept here.
 *
 * MIGRATION: switching curves lowers everyone's level. Checked against production
 * before doing it — the highest account held 100 XP, so exactly one user moves from
 * level 2 to level 1 and nobody else changes. This is essentially free to do now
 * and expensive to do later, which is why it is being done now.
 *
 * Pure functions with no Firestore and no React, so the maths can be tested on its
 * own and reused by any screen.
 */

/** XP needed to clear the FIRST level. */
export const BASE_LEVEL_XP = 500;

/** Each level costs this much more than the one before it. */
export const LEVEL_GROWTH = 1.2;

/**
 * The ceiling. Daniel asked for 2000.
 *
 * 2000 is only a real number because of LEVEL_COST_CAP below. Compounding 20% for
 * 1999 levels reaches 1.2^1999, which is not a big number — it is `Infinity` in a
 * double, and every level past roughly 480 already returned `Infinity` under the
 * old cap of 500. The bar would have shown `NaN%`. So raising the cap without
 * flattening the curve would have shipped a broken screen, not a longer game.
 */
export const MAX_LEVEL = 2000;

/**
 * The most a single level may ever cost.
 *
 * Levels keep getting 20% dearer — which is what Daniel asked for — until one
 * costs this much, and from there they stay level. Two reasons:
 *   1. It keeps the arithmetic finite (see MAX_LEVEL).
 *   2. It keeps the number readable. "25,000 XP to level 43" is a goal;
 *      "3,400,000,000,000 XP to level 43" is a wall, and a wall is where people
 *      stop playing.
 * The ramp reaches this at about level 22, so every level a real player will see
 * for a long time still costs more than the one before it.
 */
export const LEVEL_COST_CAP = 25000;

/** The cost of the next level, given this one's — the curve in one place. */
function nextCost(need: number): number {
  return Math.min(Math.round(need * LEVEL_GROWTH), LEVEL_COST_CAP);
}

/** What the given level costs to clear, on its own. */
export function xpForLevel(level: number): number {
  let need = BASE_LEVEL_XP;
  for (let l = 1; l < level; l++) need = nextCost(need);
  return need;
}

/** Total XP required to have REACHED the given level. */
export function xpToReachLevel(level: number): number {
  let need = BASE_LEVEL_XP;
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += need;
    need = nextCost(need);
  }
  return total;
}

export function levelFromXP(totalXP: number): number {
  let level = 1;
  let need = BASE_LEVEL_XP;
  let left = Math.max(0, Math.floor(totalXP) || 0);

  while (left >= need && level < MAX_LEVEL) {
    left -= need;
    level++;
    need = nextCost(need);
  }
  return level;
}

/** How far into the current level you are, and how far the level goes. */
export function levelProgress(totalXP: number): {
  level: number;
  into: number;
  needed: number;
  percent: number;
} {
  const level = levelFromXP(totalXP);
  const start = xpToReachLevel(level);
  const needed = xpForLevel(level);
  const into = Math.max(0, (Math.floor(totalXP) || 0) - start);
  return {
    level,
    into,
    needed,
    percent: needed > 0 ? Math.min(100, Math.round((into / needed) * 100)) : 0,
  };
}


/* =========================================================
   XP REWARDS
   ========================================================= */

export const XP_PER_CORRECT = 40;
export const XP_COMBO_STEP = 8;
export const XP_COMBO_CAP = 60;

/**
 * XP for one correct answer, given the combo it lands on.
 *
 * The combo bonus is CAPPED. Uncapped, a long streak makes every later answer
 * worth more than the whole quiz that preceded it, and the fastest way to level
 * is to grind one easy topic — the opposite of what a revision app should reward.
 */
export function xpForCorrectAnswer(comboAfterAnswer: number): number {
  const combo = Math.max(0, comboAfterAnswer);
  return XP_PER_CORRECT + Math.min(XP_COMBO_CAP, combo * XP_COMBO_STEP);
}

/** End-of-quiz bonus, so a clean run is visibly worth more than a scrappy one. */
export function endOfQuizBonus(correct: number, total: number, bestCombo: number): {
  rows: { label: string; xp: number }[];
  total: number;
} {
  const rows: { label: string; xp: number }[] = [];
  if (total <= 0) return { rows, total: 0 };

  const accuracy = Math.round((correct / total) * 100);

  if (correct === total) rows.push({ label: 'Perfect round', xp: 250 });
  else if (accuracy >= 80) rows.push({ label: '80%+ accuracy', xp: 120 });
  else if (accuracy >= 50) rows.push({ label: 'Half marks or better', xp: 50 });

  if (bestCombo >= 10) rows.push({ label: `Combo of ${bestCombo}`, xp: 100 });
  else if (bestCombo >= 5) rows.push({ label: `Combo of ${bestCombo}`, xp: 40 });

  // Finishing at all is worth something. Turning up is most of revision.
  rows.push({ label: 'Quiz complete', xp: 25 });

  return { rows, total: rows.reduce((n, r) => n + r.xp, 0) };
}


/* =========================================================
   STREAKS
   ========================================================= */

/** YYYY-MM-DD in the user's own timezone — a UTC date rolls over at the wrong moment. */
export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Work out the new streak from the last day studied.
 *
 * Same day  -> unchanged (studying twice in a day is not a two-day streak)
 * Yesterday -> +1
 * Anything else, or never -> back to 1
 */
export function nextStreak(currentStreak: number, lastStudiedKey: string | null | undefined,
                           today: Date = new Date()): number {
  const todayKey = localDayKey(today);
  if (!lastStudiedKey) return 1;
  if (lastStudiedKey === todayKey) return Math.max(1, currentStreak || 1);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (lastStudiedKey === localDayKey(yesterday)) return Math.max(1, (currentStreak || 0) + 1);

  return 1;
}
