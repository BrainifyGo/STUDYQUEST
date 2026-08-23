import type { Socket } from 'socket.io-client';
import {
  DUEL_ROUNDS, resolveRound, startDuel,
  type Answer, type DuelState,
} from './duel';
import type { QuizQuestion } from '../App';

/**
 * A duel against a real person, as the BROWSER sees it.
 *
 * The scoring is the same `duel.ts` the bot duel uses — unchanged, and already
 * tested. That was the point of building it to resolve a round from two
 * committed answers: the opponent's half now arrives over a socket instead of
 * from `botAnswer()`, and nothing downstream can tell the difference.
 *
 * WHAT THIS FILE ACTUALLY DOES is translate. The server is the referee for the
 * two facts a client must not decide — whether an answer was right, and how
 * long it took — and sends both back when the round closes. This turns that
 * message into the pair of `Answer`s the scoring engine expects, and hands it
 * over. It computes no scores of its own.
 *
 * BOTH BROWSERS COMPUTE THE SAME THING. `resolveRound` is deterministic, so
 * given identical inputs each side reaches an identical state. That is why the
 * server does not need to send scores at all, and why there is no second copy
 * of the rules to drift.
 */

export interface LiveDuelSnapshot {
  phase: 'idle' | 'waiting' | 'asking' | 'revealing' | 'over';
  duelId: string | null;
  round: number;
  rounds: number;
  /** The current question, or null between rounds. */
  question: string | null;
  options: string[];
  /** Server clock. Both players count down to the same instant. */
  endsAt: number;
  /** True once you have locked an answer in for this round. */
  answered: boolean;
  /** True once THEY have, without saying what they chose. */
  opponentAnswered: boolean;
  /** The scoring state, from `duel.ts`. Null until the duel starts. */
  state: DuelState | null;
  /** Set on the reveal, cleared when the next question arrives. */
  reveal: { correctAnswer: string; explanation: string; yourOption: string | null } | null;
  /** Somebody walked out. Their socket id. */
  forfeitedBy: string | null;
  error: string | null;
}

type Listener = (snap: LiveDuelSnapshot) => void;

/*
  The scoring engine needs a deck to know how many rounds there are, but in a
  live duel the questions arrive one at a time from the server and the client
  never holds the deck — that is what stops it reading ahead. So it is given a
  deck of the right LENGTH with no content, and the text on screen always comes
  from the server's prompt. `currentQuestion()` is simply never used here.
*/
const blankDeck = (n: number): QuizQuestion[] =>
  Array.from({ length: n }, () => ({
    question: '', options: [], correctAnswer: '', explanation: '',
  }));

export class LiveDuel {
  private socket: Socket;
  private listener: Listener;
  private snap: LiveDuelSnapshot = {
    phase: 'idle', duelId: null, round: 0, rounds: DUEL_ROUNDS,
    question: null, options: [], endsAt: 0,
    answered: false, opponentAnswered: false,
    state: null, reveal: null, forfeitedBy: null, error: null,
  };

  private selfName: string;
  private opponentName = 'Opponent';

  constructor(socket: Socket, selfName: string, listener: Listener) {
    this.socket = socket;
    this.selfName = selfName;
    this.listener = listener;
    this.bind();
  }

  private emit() { this.listener({ ...this.snap }); }

  private get selfId(): string { return this.socket.id || ''; }

  private bind(): void {
    this.socket.on('duel-created', ({ duelId, rounds }: { duelId: string; rounds: number }) => {
      this.snap.duelId = duelId;
      this.snap.rounds = rounds;
      this.snap.phase = 'waiting';
      this.emit();
    });

    this.socket.on('duel-start', ({ duelId, rounds, players }: {
      duelId: string; rounds: number;
      players: Array<{ id: string; name: string }>;
    }) => {
      const them = players.find((p) => p.id !== this.selfId);
      this.opponentName = them?.name || 'Opponent';
      this.snap.duelId = duelId;
      this.snap.rounds = rounds;
      this.snap.forfeitedBy = null;

      const state = startDuel(blankDeck(rounds), {
        youName: this.selfName,
        foeName: this.opponentName,
      });
      // A human opponent has no bot profile, and nothing pending: their answer
      // comes over the socket. This is the seam the whole design was built for.
      state.foe.bot = null;
      state.pending = null;
      this.snap.state = state;
      this.snap.phase = 'waiting';
      this.emit();
    });

    this.socket.on('duel-round', (p: {
      round: number; rounds: number; question: string;
      options: string[]; endsAt: number;
    }) => {
      this.snap.phase = 'asking';
      this.snap.round = p.round;
      this.snap.rounds = p.rounds;
      this.snap.question = p.question;
      this.snap.options = p.options;
      this.snap.endsAt = p.endsAt;
      this.snap.answered = false;
      this.snap.opponentAnswered = false;
      this.snap.reveal = null;
      this.emit();
    });

    this.socket.on('duel-opponent-answered', () => {
      this.snap.opponentAnswered = true;
      this.emit();
    });

    this.socket.on('duel-result', (out: {
      round: number; correctAnswer: string; explanation: string;
      answers: Record<string, { option: string | null; correct: boolean; seconds: number }>;
    }) => {
      const mine = out.answers[this.selfId];
      const theirEntry = Object.entries(out.answers).find(([id]) => id !== this.selfId);
      const theirs = theirEntry?.[1];
      if (!mine || !theirs || !this.snap.state) return;

      const toAnswer = (a: { correct: boolean; seconds: number }): Answer => ({
        correct: a.correct,
        // The server sends Infinity for a timeout, which does not survive JSON
        // and arrives as null. Restoring it matters: the scoring engine treats
        // Infinity as "as slow as it is possible to be".
        seconds: Number.isFinite(a.seconds) ? a.seconds : Infinity,
      });

      this.snap.state = resolveRound(this.snap.state, toAnswer(mine), toAnswer(theirs));
      this.snap.phase = this.snap.state.over ? 'over' : 'revealing';
      this.snap.reveal = {
        correctAnswer: out.correctAnswer,
        explanation: out.explanation,
        yourOption: mine.option,
      };
      this.emit();
    });

    this.socket.on('duel-over', ({ forfeitedBy }: { forfeitedBy: string | null }) => {
      this.snap.forfeitedBy = forfeitedBy;
      this.snap.phase = 'over';
      this.emit();
    });

    this.socket.on('duel-error', ({ reason }: { reason: string }) => {
      this.snap.error = reason;
      this.emit();
    });
  }

  /** Offer a duel to the room, using this deck. */
  create(deck: QuizQuestion[]): void {
    this.snap.error = null;
    this.socket.emit('duel-create', { deck: deck.slice(0, DUEL_ROUNDS) });
  }

  accept(duelId: string): void {
    this.snap.error = null;
    this.socket.emit('duel-accept', { duelId });
  }

  answer(option: string): void {
    if (this.snap.phase !== 'asking' || this.snap.answered) return;
    // Optimistic only in the UI sense: it greys the buttons out. Whether this
    // was right, and how fast, is entirely the server's answer.
    this.snap.answered = true;
    this.emit();
    this.socket.emit('duel-answer', {
      duelId: this.snap.duelId, round: this.snap.round, option,
    });
  }

  leave(): void {
    if (this.snap.duelId) this.socket.emit('duel-leave', {});
    this.snap.phase = 'idle';
    this.snap.duelId = null;
    this.snap.state = null;
    this.emit();
  }

  destroy(): void {
    for (const e of [
      'duel-created', 'duel-start', 'duel-round', 'duel-opponent-answered',
      'duel-result', 'duel-over', 'duel-error',
    ]) this.socket.off(e);
  }
}
