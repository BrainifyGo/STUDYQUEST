/**
 * SPEED RUN and BOSS BATTLE — the rules, ported from ReviseGo.
 *
 * Pure logic, no React and no Firestore, so the rules can be tested on their own
 * and the component only has to worry about drawing them. ReviseGo mixed the two
 * and the rules were only checkable by playing the game.
 */

import type { QuizQuestion } from '../App';
import { type Boss, pickBoss, phaseFor, playerDamageFor, justEnraged } from './bosses';

export type ModeId = 'speed-run' | 'boss-battle';

export interface ModeRules {
  id: ModeId;
  name: string;
  blurb: string;
  /** Seconds on the clock. 0 means the mode is not timed. */
  duration: number;
  /** Seconds lost per wrong answer (timed modes). */
  wrongPenalty: number;
  /** Seconds gained per correct answer (timed modes). */
  rightBonus: number;
  /** Boss health. 0 means there is no boss. */
  bossHP: number;
  /** Lives (boss mode). */
  playerHP: number;
  scoreLabel: string;
}

export const MODES: Record<ModeId, ModeRules> = {
  'speed-run': {
    id: 'speed-run',
    name: 'Speed Run',
    blurb: '60 seconds. As many as you can.',
    duration: 60,
    // Wrong answers cost TIME rather than ending the run. Sudden death would make
    // the safe play "answer slowly", which is the opposite of a speed mode.
    wrongPenalty: 3,
    rightBonus: 1,
    bossHP: 0,
    playerHP: 0,
    scoreLabel: 'questions',
  },
  'boss-battle': {
    id: 'boss-battle',
    name: 'Boss Battle',
    blurb: 'Harder questions. Take the boss down before it takes you.',
    duration: 0,
    wrongPenalty: 0,
    rightBonus: 0,
    bossHP: 100,
    playerHP: 3,
    scoreLabel: 'damage',
  },
};

export interface ModeState {
  mode: ModeRules;
  questions: QuizQuestion[];
  index: number;
  score: number;
  correct: number;
  answered: number;
  combo: number;
  bestCombo: number;
  xp: number;
  timeLeft: number;
  bossHP: number;
  playerHP: number;
  over: boolean;
  outcome: string;
  /** Boss modes only. */
  boss: Boss | null;
  phase: 1 | 2 | 3;
  /** True for the single answer that tipped the boss into a new phase. */
  enragedThisTurn: boolean;
  /** Won the boss fight, as opposed to merely ending it. */
  won: boolean;
}

export function startState(
  mode: ModeRules,
  questions: QuizQuestion[],
  subject = ''
): ModeState {
  const boss = mode.bossHP ? pickBoss(subject) : null;
  return {
    mode,
    questions,
    index: 0,
    score: 0,
    correct: 0,
    answered: 0,
    combo: 0,
    bestCombo: 0,
    xp: 0,
    timeLeft: mode.duration,
    // The boss carries its own health, so a tougher boss is a data change.
    bossHP: boss ? boss.maxHP : mode.bossHP,
    playerHP: mode.playerHP,
    over: false,
    outcome: '',
    boss,
    phase: 1,
    enragedThisTurn: false,
    won: false,
  };
}

/** Damage dealt for a correct answer, given the combo it lands on. */
export function bossDamage(combo: number): number {
  // Combo raises the damage, so a run of right answers is visibly worth more than
  // the same answers spread out — but capped, or one lucky streak ends the fight.
  return 10 + Math.min(15, Math.max(0, combo) * 2);
}

/**
 * Apply one answer and return the next state. Never mutates the state passed in,
 * so React sees a genuinely new object and the UI cannot miss an update.
 */
export function applyAnswer(state: ModeState, correct: boolean): ModeState {
  if (state.over) return state;

  const next: ModeState = { ...state };
  next.answered += 1;
  next.enragedThisTurn = false;

  const maxHP = next.boss ? next.boss.maxHP : next.mode.bossHP;
  const hpBefore = next.bossHP;

  if (correct) {
    next.correct += 1;
    next.combo += 1;
    next.bestCombo = Math.max(next.bestCombo, next.combo);
    next.xp += 40 + Math.min(60, next.combo * 8);

    if (next.mode.duration) {
      next.score += 1;
      next.timeLeft += next.mode.rightBonus;
    }
    if (maxHP) {
      const dmg = bossDamage(next.combo);
      next.bossHP = Math.max(0, next.bossHP - dmg);
      next.score += dmg;
    }
  } else {
    next.combo = 0;
    if (next.mode.duration) next.timeLeft = Math.max(0, next.timeLeft - next.mode.wrongPenalty);
    if (maxHP) {
      // An enraged boss hits twice as hard, so the last third of the fight is
      // where runs are actually lost. The damage is read from the phase BEFORE
      // this answer — being punished by an enrage you triggered on the same
      // turn would feel arbitrary.
      next.playerHP = Math.max(0, next.playerHP - playerDamageFor(next.phase));
    }
  }

  if (maxHP) {
    next.enragedThisTurn = justEnraged(hpBefore, next.bossHP, maxHP);
    next.phase = phaseFor(next.bossHP, maxHP);
  }

  next.index += 1;

  if (maxHP) {
    if (next.bossHP <= 0) {
      next.over = true; next.won = true; next.outcome = 'Boss defeated';
    } else if (next.playerHP <= 0) {
      next.over = true; next.outcome = 'You were beaten';
    }
  }
  if (next.mode.duration && next.timeLeft <= 0) {
    next.over = true;
    next.outcome = 'Time!';
  }

  // Running out of questions ends the round rather than looping forever. The pool
  // is reshuffled by the caller when it can be; this is the backstop.
  if (!next.over && next.index >= next.questions.length) {
    next.over = true;
    next.outcome = next.mode.bossHP ? 'Out of questions' : 'Time!';
  }

  return next;
}

/** One second passing. Only meaningful in a timed mode. */
export function tickClock(state: ModeState): ModeState {
  if (state.over || !state.mode.duration) return state;
  const timeLeft = Math.max(0, state.timeLeft - 1);
  if (timeLeft <= 0) return { ...state, timeLeft, over: true, outcome: 'Time!' };
  return { ...state, timeLeft };
}

/** Bonus XP for how the run went, on top of the per-answer XP already banked. */
export function completionBonus(state: ModeState): number {
  // Reads `won` rather than re-deriving it: a fight that ended because the
  // questions ran out with the boss on 1 HP is not a victory.
  if (state.won) return 400;
  if (state.mode.duration) {
    if (state.score >= 15) return 250;
    if (state.score >= 8) return 100;
  }
  return 0;
}

export function accuracy(state: ModeState): number {
  return state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
}
