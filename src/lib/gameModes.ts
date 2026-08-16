/**
 * SPEED RUN and BOSS BATTLE — the rules, ported from ReviseGo.
 *
 * Pure logic, no React and no Firestore, so the rules can be tested on their own
 * and the component only has to worry about drawing them. ReviseGo mixed the two
 * and the rules were only checkable by playing the game.
 */

import type { QuizQuestion } from '../App';
import { type Boss, pickBoss, phaseFor, playerDamageFor, justEnraged } from './bosses';

export type ModeId = 'speed-run' | 'boss-battle' | 'sudden-death' | 'marathon';

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
  /** Lives. 0 means mistakes do not end the round. */
  playerHP: number;
  scoreLabel: string;
  /** Stop after this many questions. 0 means play until some other rule ends it. */
  questionLimit?: number;
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

  /*
    Two more games, because "the Arcade" was two modes.

    Both reuse the same engine rather than introducing a second one — a mode is a
    row of rules here, so adding one is data, not a new component to keep in step.
  */
  'sudden-death': {
    id: 'sudden-death',
    name: 'Sudden Death',
    blurb: 'One life. One wrong answer ends it. How far can you get?',
    duration: 0,
    wrongPenalty: 0,
    rightBonus: 0,
    bossHP: 0,
    // A single life is the entire mode. Everything else is the standard engine.
    playerHP: 1,
    scoreLabel: 'streak',
  },
  marathon: {
    id: 'marathon',
    name: 'Marathon',
    blurb: '20 questions. No clock, no lives — accuracy is the whole score.',
    duration: 0,
    wrongPenalty: 0,
    rightBonus: 0,
    bossHP: 0,
    /*
      NO LIVES, deliberately.

      This started with three, and a test caught that it made the payout tiers
      unreachable: three lives over twenty questions means you are ejected on the
      third mistake, so the worst accuracy you can FINISH with is 18/20 = 90% —
      and every completed marathon paid the top rate. Marathon is the mode where
      you go the distance and are judged on how well; being thrown out for three
      mistakes is Sudden Death's job.
    */
    playerHP: 0,
    scoreLabel: 'correct',
    questionLimit: 20,
  },
};

/** The modes, in the order the Arcade lists them. */
export const MODE_ORDER: ModeId[] = ['speed-run', 'boss-battle', 'sudden-death', 'marathon'];

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
    } else if (!maxHP) {
      // Untimed, bossless modes score on answers: the streak in Sudden Death,
      // the tally in Marathon.
      next.score += 1;
    }
    if (maxHP) {
      const dmg = bossDamage(next.combo);
      next.bossHP = Math.max(0, next.bossHP - dmg);
      next.score += dmg;
    }
  } else {
    next.combo = 0;
    if (next.mode.duration) next.timeLeft = Math.max(0, next.timeLeft - next.mode.wrongPenalty);
    // Lives outside a boss fight — Sudden Death has one, Marathon has three.
    // Boss modes keep their own rule below, where the phase decides the damage.
    if (!maxHP && next.mode.playerHP > 0) {
      next.playerHP = Math.max(0, next.playerHP - 1);
    }
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

  // Out of lives, in a mode that has them but no boss.
  if (!next.over && !maxHP && next.mode.playerHP > 0 && next.playerHP <= 0) {
    next.over = true;
    next.outcome = next.mode.id === 'sudden-death' ? 'Sudden death' : 'Out of lives';
  }

  // Marathon is a fixed length; finishing it is the win condition.
  if (!next.over && next.mode.questionLimit && next.answered >= next.mode.questionLimit) {
    next.over = true;
    next.won = true;
    next.outcome = 'Marathon complete';
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
  if (state.mode.id === 'marathon') {
    // Paid on accuracy, not on turning up: a completed marathon at 30% should
    // not pay the same as a clean one.
    if (!state.won) return 0;
    const acc = accuracy(state);
    if (acc >= 90) return 500;
    if (acc >= 70) return 300;
    return 120;
  }
  if (state.won) return 400;
  if (state.mode.duration) {
    if (state.score >= 15) return 250;
    if (state.score >= 8) return 100;
  }
  if (state.mode.id === 'sudden-death') {
    if (state.score >= 15) return 400;
    if (state.score >= 8) return 180;
    if (state.score >= 4) return 60;
  }
  return 0;
}

export function accuracy(state: ModeState): number {
  return state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
}
