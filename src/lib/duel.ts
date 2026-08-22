/**
 * DUEL — two fighters, seven rounds, one question at a time.
 *
 * Pure rules, no React and no network, like `gameModes.ts` next door. The arena
 * only draws what this returns.
 *
 * THE ONE DESIGN DECISION THAT MATTERS
 * ------------------------------------
 * A round is resolved from TWO COMMITTED ANSWERS. Neither fighter's answer is
 * allowed to depend on the other's:
 *
 *     resolveRound(state, yours, theirs) -> next state
 *
 * Today `theirs` comes from a bot whose answer is decided the moment the round
 * STARTS, before you have touched anything. Tomorrow it arrives over a socket
 * from a friend. The engine cannot tell the difference, and that is the whole
 * point — RED asked for the boss now and real opponents later, and this is the
 * seam that makes "later" a new caller rather than a rewrite.
 *
 * It also rules out the obvious cheat by construction. A bot that picked its
 * answer *after* seeing yours could be made to always win by a round, and no
 * amount of care in the UI would fix that; committing up front means it cannot
 * happen even by accident.
 *
 * WHY THE NUMBERS ARE WHAT THEY ARE
 * ---------------------------------
 * 100 HP, 7 rounds, 10 seconds a round. A clean hit is 12 damage plus up to 12
 * more for speed, so:
 *
 *   - Winning all 7 rounds at a crawl deals 7 x 12 = 84. NOT a knockout. You
 *     still win, on health, at the end of round 7.
 *   - Winning all 7 rounds fast deals up to 168, so a knockout lands around
 *     round 5.
 *
 * That gap is deliberate: it makes the clock worth playing to without letting a
 * slow, correct player lose. Speed decides how fast you win, accuracy decides
 * whether you do.
 */

import type { QuizQuestion } from '../App';

export const DUEL_ROUNDS = 7;
export const DUEL_MAX_HP = 100;
export const DUEL_ROUND_SECONDS = 10;

/** Damage for winning a round outright (the other fighter got it wrong). */
export const BASE_DAMAGE = 12;
/** Extra damage for answering instantly, tapering to 0 at the buzzer. */
export const SPEED_DAMAGE = 12;
/**
 * Damage when BOTH fighters are correct and you were quicker. Small on purpose:
 * beating someone who also knew the answer is worth less than beating someone
 * who did not, and if it were worth the same, knowing the material would stop
 * mattering next to tapping fast.
 */
export const TRADE_DAMAGE = 5;

export interface BotProfile {
  /** 0..1. How often it gets the question right. */
  accuracy: number;
  /** Seconds it takes to answer, sampled between these. */
  fastest: number;
  slowest: number;
}

/** How hard the opponent is. Named rather than numeric so the UI can show it. */
export type DuelDifficulty = 'rookie' | 'rival' | 'nemesis';

export const BOT_PROFILES: Record<DuelDifficulty, BotProfile> = {
  // Beatable while you are still learning the format. It gets a third wrong.
  rookie: { accuracy: 0.55, fastest: 4.5, slowest: 9 },
  // The default. Roughly as good as a decent player having a decent go.
  rival: { accuracy: 0.72, fastest: 3, slowest: 7.5 },
  // Fast and rarely wrong. You have to be quick AND right.
  nemesis: { accuracy: 0.88, fastest: 1.8, slowest: 5 },
};

export interface Fighter {
  /** 'you' for the local player; a uid once opponents are real. */
  id: string;
  name: string;
  hp: number;
  /** null for a human. */
  bot: BotProfile | null;
}

export interface Answer {
  correct: boolean;
  /**
   * Seconds taken. `Infinity` means the clock ran out — treated as wrong AND
   * slowest, so timing out is never accidentally better than answering.
   */
  seconds: number;
}

/** What happened in one round, for the arena to animate and the log to show. */
export interface RoundResult {
  round: number;
  yours: Answer;
  theirs: Answer;
  /** Who landed the hit, or null for a dead round. */
  winner: 'you' | 'foe' | null;
  damage: number;
  /** Both correct — the hit was a trade, not a clean win. */
  traded: boolean;
  /** True when the loser simply ran out of time. */
  timedOut: boolean;
}

export interface DuelState {
  /** 1-based, and the number shown as "ROUND n/7". */
  round: number;
  rounds: number;
  you: Fighter;
  foe: Fighter;
  questions: QuizQuestion[];
  /** The opponent's answer for the CURRENT round, committed when it began. */
  pending: Answer | null;
  history: RoundResult[];
  over: boolean;
  /** 'you' | 'foe' | null (a draw). Only meaningful once `over`. */
  winner: 'you' | 'foe' | null;
  outcome: string;
  xp: number;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Deterministic randomness                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * A seeded generator, so a duel can be replayed exactly.
 *
 * `Math.random` would make the bot untestable — you could never assert "this
 * profile loses to a perfect player" without the test being flaky. It also
 * leaves the door open to replays and to a shared seed when both sides are real
 * players and must see the same thing.
 */
export function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    // xorshift32: tiny, fast, and good enough for picking answers.
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

/** The bot's answer for a round, decided BEFORE the player sees the question. */
export function botAnswer(profile: BotProfile, rng: () => number): Answer {
  const correct = rng() < profile.accuracy;
  const span = Math.max(0, profile.slowest - profile.fastest);
  const seconds = profile.fastest + rng() * span;
  return { correct, seconds: Math.min(seconds, DUEL_ROUND_SECONDS) };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Rules                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Damage for a clean hit, scaled by how much of the clock was left.
 *
 * Answering on the buzzer still hurts — it is BASE_DAMAGE, never zero. A correct
 * answer that does nothing would teach players to guess early instead of think,
 * which is the opposite of what a revision app wants.
 */
export function damageFor(seconds: number): number {
  const used = Math.max(0, Math.min(seconds, DUEL_ROUND_SECONDS));
  const leftFraction = 1 - used / DUEL_ROUND_SECONDS;
  return BASE_DAMAGE + Math.round(SPEED_DAMAGE * leftFraction);
}

export function startDuel(
  questions: QuizQuestion[],
  opts: {
    youName?: string;
    foeName?: string;
    difficulty?: DuelDifficulty;
    seed?: number;
  } = {}
): DuelState {
  const difficulty = opts.difficulty ?? 'rival';
  const profile = BOT_PROFILES[difficulty];
  const rng = makeRng(opts.seed ?? 1);

  return {
    round: 1,
    rounds: Math.min(DUEL_ROUNDS, Math.max(1, questions.length)) || DUEL_ROUNDS,
    you: { id: 'you', name: opts.youName || 'You', hp: DUEL_MAX_HP, bot: null },
    foe: {
      id: `bot:${difficulty}`,
      name: opts.foeName || 'Rival',
      hp: DUEL_MAX_HP,
      bot: profile,
    },
    questions,
    pending: botAnswer(profile, rng),
    history: [],
    over: false,
    winner: null,
    outcome: '',
    xp: 0,
  };
}

/** The question for the current round, or null when the duel is finished. */
export function currentQuestion(state: DuelState): QuizQuestion | null {
  return state.questions[state.round - 1] ?? null;
}

/**
 * Resolve one round from both committed answers.
 *
 * Never mutates the state passed in, so React always sees a new object — the
 * same rule the rest of the arcade follows.
 */
export function resolveRound(state: DuelState, yours: Answer, theirs: Answer): DuelState {
  if (state.over) return state;

  const next: DuelState = {
    ...state,
    you: { ...state.you },
    foe: { ...state.foe },
    history: [...state.history],
  };

  let winner: 'you' | 'foe' | null = null;
  let damage = 0;
  let traded = false;

  if (yours.correct && theirs.correct) {
    // Both knew it. The quicker one lands a smaller hit; an exact tie is a
    // genuine draw and neither side is punished for it.
    traded = true;
    if (yours.seconds < theirs.seconds) { winner = 'you'; damage = TRADE_DAMAGE; }
    else if (theirs.seconds < yours.seconds) { winner = 'foe'; damage = TRADE_DAMAGE; }
  } else if (yours.correct) {
    winner = 'you';
    damage = damageFor(yours.seconds);
  } else if (theirs.correct) {
    winner = 'foe';
    damage = damageFor(theirs.seconds);
  }
  // Both wrong: nobody scores. The round is burnt and the clock of rounds moves
  // on, which is punishment enough without inventing chip damage neither player
  // can attribute to anything they did.

  if (winner === 'you') next.foe.hp = Math.max(0, next.foe.hp - damage);
  if (winner === 'foe') next.you.hp = Math.max(0, next.you.hp - damage);

  const timedOut =
    (winner === 'you' && !Number.isFinite(theirs.seconds)) ||
    (winner === 'foe' && !Number.isFinite(yours.seconds));

  next.history.push({
    round: state.round,
    yours, theirs, winner, damage, traded, timedOut,
  });

  // XP is for playing well, not for winning. A close loss is worth more than a
  // walkover, or the mode only rewards people who already know the material.
  if (yours.correct) next.xp += 45;
  if (winner === 'you') next.xp += 25;

  const knockout = next.you.hp <= 0 || next.foe.hp <= 0;
  const lastRound = state.round >= next.rounds;

  if (knockout || lastRound) {
    next.over = true;
    next.pending = null;
    if (next.you.hp === next.foe.hp) {
      next.winner = null;
      next.outcome = 'Dead heat.';
    } else if (next.you.hp > next.foe.hp) {
      next.winner = 'you';
      next.outcome = knockout
        ? `Knockout — ${next.foe.name} is down.`
        : `You win on health, ${next.you.hp} to ${next.foe.hp}.`;
      // A win bonus that a draw and a loss do not get.
      next.xp += knockout ? 150 : 100;
    } else {
      next.winner = 'foe';
      next.outcome = knockout
        ? `You are down. ${next.foe.name} takes it.`
        : `${next.foe.name} wins on health, ${next.foe.hp} to ${next.you.hp}.`;
    }
    return next;
  }

  next.round = state.round + 1;
  // Commit the opponent's NEXT answer now, before the player sees the question.
  next.pending = next.foe.bot
    ? botAnswer(next.foe.bot, makeRng((state.round + 1) * 2654435761))
    : null;
  return next;
}

/** Rounds won, for the end screen. */
export function tally(state: DuelState): { you: number; foe: number; drawn: number } {
  let you = 0, foe = 0, drawn = 0;
  for (const r of state.history) {
    if (r.winner === 'you') you += 1;
    else if (r.winner === 'foe') foe += 1;
    else drawn += 1;
  }
  return { you, foe, drawn };
}
