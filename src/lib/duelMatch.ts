import type { QuizQuestion } from '../App';
import { DUEL_ROUNDS, DUEL_ROUND_SECONDS } from './duel';

/**
 * A live duel between two real people, as the SERVER sees it.
 *
 * Pure logic, no socket.io, so the rules can be tested without a network — the
 * same split as `duel.ts` (which holds the scoring) and `gameModes.ts`.
 *
 * WHY THE SERVER OWNS TWO FACTS AND ONLY TWO
 * ------------------------------------------
 * The scoring engine in `duel.ts` already resolves a round from two committed
 * answers, and it is deterministic: given identical inputs both browsers reach
 * an identical state. So the server does NOT re-implement scoring — that would
 * be a second copy of the rules to keep in step, and the first thing to drift.
 *
 * What the server does own is the two things a client must not be trusted with:
 *
 *   1. WHETHER AN ANSWER IS CORRECT. The client is never sent `correctAnswer`
 *      until the round is over. Otherwise it is sitting in the network tab, and
 *      "cheating" is reading it.
 *   2. HOW LONG IT TOOK. Damage scales with speed, so a client reporting its own
 *      timing could claim 0.0s every round and always out-damage an honest
 *      player. The server stamps the elapsed time from when IT sent the
 *      question.
 *
 * Everything downstream of those two facts is arithmetic both sides can do.
 *
 * ONE DECK, ONE ORDER. Both players get the same questions in the same order,
 * held here. A client that supplied its own could feed its opponent nonsense.
 */

export interface MatchPlayer {
  socketId: string;
  uid: string;
  name: string;
}

export interface MatchAnswer {
  /** The option text they chose, or null if they ran out of time. */
  option: string | null;
  correct: boolean;
  /** Seconds, measured by the server. `Infinity` when the clock ran out. */
  seconds: number;
}

/** What a player is told at the start of a round — note the absent answer. */
export interface RoundPrompt {
  round: number;
  rounds: number;
  question: string;
  options: string[];
  /** Server clock, so both clients count down to the same instant. */
  endsAt: number;
  seconds: number;
}

/** What both players are told once the round closes. */
export interface RoundOutcome {
  round: number;
  correctAnswer: string;
  explanation: string;
  /** Keyed by socket id, so each client can work out which half is theirs. */
  answers: Record<string, MatchAnswer>;
}

export type MatchPhase = 'waiting' | 'asking' | 'revealing' | 'over';

const TIMED_OUT: MatchAnswer = { option: null, correct: false, seconds: Infinity };

export class DuelMatch {
  readonly id: string;
  readonly players: MatchPlayer[] = [];
  readonly deck: QuizQuestion[];
  readonly rounds: number;

  phase: MatchPhase = 'waiting';
  round = 0;
  /** Server time the current question was sent. */
  private askedAt = 0;
  private answers = new Map<string, MatchAnswer>();
  /** Set when somebody leaves; the duel ends and the other player is told. */
  forfeitedBy: string | null = null;

  constructor(id: string, deck: QuizQuestion[], host: MatchPlayer) {
    this.id = id;
    this.deck = deck.slice(0, DUEL_ROUNDS);
    // A short deck shortens the match rather than repeating a question — the
    // second showing would be won by whoever remembered it, not by who knows
    // the material.
    this.rounds = Math.max(1, Math.min(DUEL_ROUNDS, this.deck.length));
    this.players.push(host);
  }

  get full(): boolean {
    return this.players.length >= 2;
  }

  has(socketId: string): boolean {
    return this.players.some((p) => p.socketId === socketId);
  }

  opponentOf(socketId: string): MatchPlayer | null {
    return this.players.find((p) => p.socketId !== socketId) ?? null;
  }

  /** Second player arrives. Returns false if the duel is already full. */
  join(player: MatchPlayer): boolean {
    if (this.full || this.phase !== 'waiting') return false;
    if (this.has(player.socketId)) return false;
    this.players.push(player);
    return true;
  }

  /** Begin the next round. Returns the prompt to send BOTH players. */
  nextRound(now: number): RoundPrompt | null {
    if (this.phase === 'over') return null;
    if (!this.full) return null;
    if (this.round >= this.rounds) {
      this.phase = 'over';
      return null;
    }

    this.round += 1;
    this.askedAt = now;
    this.answers.clear();
    this.phase = 'asking';

    const q = this.deck[this.round - 1];
    return {
      round: this.round,
      rounds: this.rounds,
      question: q.question,
      options: q.options,
      // A deadline rather than a duration: both clients then count down to the
      // same moment regardless of when the message reached them.
      endsAt: now + DUEL_ROUND_SECONDS * 1000,
      seconds: DUEL_ROUND_SECONDS,
    };
  }

  /**
   * Record an answer. The option is all the client gets to decide; correctness
   * and timing are worked out here.
   *
   * Late, duplicate and unknown answers are ignored rather than trusted.
   */
  answer(socketId: string, round: number, option: unknown, now: number): boolean {
    if (this.phase !== 'asking') return false;
    if (round !== this.round) return false;
    if (!this.has(socketId)) return false;
    if (this.answers.has(socketId)) return false;      // first answer counts

    const q = this.deck[this.round - 1];
    const chosen = typeof option === 'string' && q.options.includes(option) ? option : null;
    const elapsed = (now - this.askedAt) / 1000;

    this.answers.set(socketId, {
      option: chosen,
      // A choice that is not one of the options is simply wrong, not an error:
      // it is the shape a tampered payload takes, and it should lose the round
      // rather than crash the match.
      correct: chosen !== null && chosen === q.correctAnswer,
      // Clamped, so a message delayed past the buzzer cannot score as though it
      // arrived in time, and clock skew cannot produce a negative.
      seconds: Math.max(0, Math.min(elapsed, DUEL_ROUND_SECONDS)),
    });
    return true;
  }

  get everyoneAnswered(): boolean {
    return this.answers.size >= this.players.length;
  }

  expired(now: number): boolean {
    // A small grace period so an answer sent at 9.98s is not thrown away by
    // network latency — the elapsed time is clamped anyway.
    return this.phase === 'asking' && now - this.askedAt > (DUEL_ROUND_SECONDS + 1) * 1000;
  }

  /** Close the round. Anyone who did not answer is treated as out of time. */
  closeRound(): RoundOutcome | null {
    if (this.phase !== 'asking') return null;
    this.phase = 'revealing';

    const q = this.deck[this.round - 1];
    const answers: Record<string, MatchAnswer> = {};
    for (const p of this.players) {
      answers[p.socketId] = this.answers.get(p.socketId) ?? { ...TIMED_OUT };
    }

    return {
      round: this.round,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      answers,
    };
  }

  get finished(): boolean {
    return this.phase === 'over' || this.round >= this.rounds;
  }

  forfeit(socketId: string): void {
    if (this.phase === 'over') return;
    this.forfeitedBy = socketId;
    this.phase = 'over';
  }
}
