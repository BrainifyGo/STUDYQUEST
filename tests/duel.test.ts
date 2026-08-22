/**
 * Duel rules.
 *
 * The balance numbers are pinned here because they decide whether the mode is
 * fun. The property that matters most, though, is the one at the bottom: the
 * engine must not be able to tell a bot opponent from a human one. That is what
 * makes real opponents a new caller rather than a rewrite, and it is very easy
 * to lose by "just" reading the bot profile somewhere in the resolution code.
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_DAMAGE, BOT_PROFILES, DUEL_MAX_HP, DUEL_ROUNDS, DUEL_ROUND_SECONDS,
  SPEED_DAMAGE, TRADE_DAMAGE,
  botAnswer, damageFor, makeRng, resolveRound, startDuel, tally,
  type Answer, type DuelState,
} from '../src/lib/duel';
import type { QuizQuestion } from '../src/App';

const q: QuizQuestion = {
  question: 'Which authentication system uses a ticket-granting server?',
  options: ['Kerberos', 'RADIUS', 'SAML', 'TACACS+'],
  correctAnswer: 'Kerberos',
  explanation: 'Kerberos issues tickets via a TGS.',
};

const deck = (n: number) => Array.from({ length: n }, () => q);
const fresh = () => startDuel(deck(DUEL_ROUNDS));

const right = (seconds: number): Answer => ({ correct: true, seconds });
const wrong = (seconds: number): Answer => ({ correct: false, seconds });
const timeout = (): Answer => ({ correct: false, seconds: Infinity });

/** Play a whole duel with fixed answers each round. */
function playOut(yours: () => Answer, theirs: () => Answer, state = fresh()): DuelState {
  let s = state;
  for (let i = 0; i < DUEL_ROUNDS && !s.over; i++) s = resolveRound(s, yours(), theirs());
  return s;
}

describe('setup', () => {
  it('starts both fighters on full health', () => {
    const s = fresh();
    expect(s.you.hp).toBe(DUEL_MAX_HP);
    expect(s.foe.hp).toBe(DUEL_MAX_HP);
  });

  it('is seven rounds, and says so from round one', () => {
    const s = fresh();
    expect(s.round).toBe(1);
    expect(s.rounds).toBe(7);
  });

  it('never asks for more rounds than it has questions', () => {
    expect(startDuel(deck(3)).rounds).toBe(3);
  });

  it('commits the opponent answer before the player has seen anything', () => {
    // The anti-cheat property, and the thing that makes a socket opponent drop in.
    expect(fresh().pending).not.toBeNull();
  });
});

describe('damage', () => {
  it('an instant answer hits for the maximum', () => {
    expect(damageFor(0)).toBe(BASE_DAMAGE + SPEED_DAMAGE);
  });

  it('an answer on the buzzer still hits', () => {
    // Never zero. A correct answer worth nothing teaches guessing early over
    // thinking, which is the opposite of the point of the app.
    expect(damageFor(DUEL_ROUND_SECONDS)).toBe(BASE_DAMAGE);
    expect(damageFor(999)).toBe(BASE_DAMAGE);
  });

  it('falls off smoothly in between', () => {
    const half = damageFor(DUEL_ROUND_SECONDS / 2);
    expect(half).toBeGreaterThan(BASE_DAMAGE);
    expect(half).toBeLessThan(BASE_DAMAGE + SPEED_DAMAGE);
  });
});

describe('resolving a round', () => {
  it('a correct answer against a wrong one damages the opponent', () => {
    const s = resolveRound(fresh(), right(2), wrong(3));
    expect(s.foe.hp).toBeLessThan(DUEL_MAX_HP);
    expect(s.you.hp).toBe(DUEL_MAX_HP);
    expect(s.history[0].winner).toBe('you');
  });

  it('and the other way round', () => {
    const s = resolveRound(fresh(), wrong(2), right(3));
    expect(s.you.hp).toBeLessThan(DUEL_MAX_HP);
    expect(s.foe.hp).toBe(DUEL_MAX_HP);
  });

  it('both wrong is a dead round — nobody takes damage', () => {
    const s = resolveRound(fresh(), wrong(2), wrong(3));
    expect(s.you.hp).toBe(DUEL_MAX_HP);
    expect(s.foe.hp).toBe(DUEL_MAX_HP);
    expect(s.history[0].winner).toBeNull();
  });

  it('both right is a trade, won by the quicker one, and worth less', () => {
    const s = resolveRound(fresh(), right(2), right(6));
    expect(s.history[0].traded).toBe(true);
    expect(s.history[0].winner).toBe('you');
    expect(s.history[0].damage).toBe(TRADE_DAMAGE);
    // Beating someone who also knew it must be worth less than beating someone
    // who did not, or speed quietly replaces knowing the material.
    expect(TRADE_DAMAGE).toBeLessThan(BASE_DAMAGE);
  });

  it('an exact tie on a traded round hurts nobody', () => {
    const s = resolveRound(fresh(), right(4), right(4));
    expect(s.you.hp).toBe(DUEL_MAX_HP);
    expect(s.foe.hp).toBe(DUEL_MAX_HP);
  });

  it('running out of time is recorded as a timeout, and never beats answering', () => {
    const s = resolveRound(fresh(), right(9.9), timeout());
    expect(s.history[0].winner).toBe('you');
    expect(s.history[0].timedOut).toBe(true);
  });

  it('does not mutate the state it was given', () => {
    const before = fresh();
    const hpBefore = before.foe.hp;
    resolveRound(before, right(0), wrong(5));
    expect(before.foe.hp).toBe(hpBefore);
    expect(before.history).toHaveLength(0);
  });
});

describe('the balance the mode lives or dies on', () => {
  it('winning every round slowly is NOT a knockout, but still wins', () => {
    // This is the whole design. Speed decides how FAST you win; accuracy decides
    // WHETHER you do. If a slow correct player could be knocked out, the mode
    // would be a reflex test with quiz questions stuck on top.
    const s = playOut(() => right(DUEL_ROUND_SECONDS), () => wrong(5));
    expect(s.over).toBe(true);
    expect(s.you.hp).toBe(DUEL_MAX_HP);
    expect(s.foe.hp).toBeGreaterThan(0);      // survived...
    expect(s.winner).toBe('you');             // ...and still lost the duel
    expect(s.history).toHaveLength(DUEL_ROUNDS);
  });

  it('winning every round fast IS a knockout, and ends early', () => {
    const s = playOut(() => right(0), () => wrong(5));
    expect(s.over).toBe(true);
    expect(s.foe.hp).toBe(0);
    expect(s.winner).toBe('you');
    expect(s.history.length).toBeLessThan(DUEL_ROUNDS);
  });

  it('a duel of pure trades goes the distance', () => {
    // 5 damage a round cannot knock anyone out in 7 rounds, so an evenly matched
    // pair always reach the final round. Two well-matched players should.
    const s = playOut(() => right(2), () => right(6));
    expect(s.history).toHaveLength(DUEL_ROUNDS);
    expect(s.foe.hp).toBe(DUEL_MAX_HP - TRADE_DAMAGE * DUEL_ROUNDS);
    expect(s.foe.hp).toBeGreaterThan(0);
  });

  it('identical play is a dead heat, not a coin flip', () => {
    const s = playOut(() => right(4), () => right(4));
    expect(s.winner).toBeNull();
    expect(s.outcome).toMatch(/dead heat/i);
  });

  it('losing every round loses the duel', () => {
    const s = playOut(() => wrong(3), () => right(1));
    expect(s.winner).toBe('foe');
    expect(s.you.hp).toBe(0);
  });
});

describe('scoring', () => {
  it('pays for correct answers even in a loss', () => {
    // A close loss must be worth something, or the mode only rewards players who
    // already know the material — which is backwards for a revision app.
    const s = playOut(() => right(9), () => right(1));
    expect(s.winner).toBe('foe');
    expect(s.xp).toBeGreaterThan(0);
  });

  it('pays more for winning', () => {
    const won = playOut(() => right(1), () => wrong(5)).xp;
    const lost = playOut(() => wrong(5), () => right(1)).xp;
    expect(won).toBeGreaterThan(lost);
  });

  it('counts rounds won, lost and drawn', () => {
    let s = fresh();
    s = resolveRound(s, right(1), wrong(5));
    s = resolveRound(s, wrong(1), right(5));
    s = resolveRound(s, wrong(1), wrong(5));
    const t = tally(s);
    expect(t).toEqual({ you: 1, foe: 1, drawn: 1 });
  });
});

describe('the bot', () => {
  it('is deterministic for a given seed, so a duel can be replayed', () => {
    const a = startDuel(deck(7), { seed: 42 }).pending;
    const b = startDuel(deck(7), { seed: 42 }).pending;
    expect(a).toEqual(b);
  });

  it('different seeds give different duels', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      seen.add(JSON.stringify(startDuel(deck(7), { seed }).pending));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('answers within the round, never after the buzzer', () => {
    // A bot that "answers" at 14 seconds would win rounds the player had already
    // won on time, which reads as the game cheating.
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const a = botAnswer(BOT_PROFILES.nemesis, rng);
      expect(a.seconds).toBeGreaterThanOrEqual(0);
      expect(a.seconds).toBeLessThanOrEqual(DUEL_ROUND_SECONDS);
    }
  });

  it('gets harder across the three difficulties', () => {
    expect(BOT_PROFILES.rookie.accuracy).toBeLessThan(BOT_PROFILES.rival.accuracy);
    expect(BOT_PROFILES.rival.accuracy).toBeLessThan(BOT_PROFILES.nemesis.accuracy);
    // And faster, not just more accurate.
    expect(BOT_PROFILES.nemesis.slowest).toBeLessThan(BOT_PROFILES.rookie.slowest);
  });

  it('roughly hits its stated accuracy over many rounds', () => {
    const rng = makeRng(2026);
    let correct = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) if (botAnswer(BOT_PROFILES.rival, rng).correct) correct++;
    expect(correct / n).toBeGreaterThan(BOT_PROFILES.rival.accuracy - 0.08);
    expect(correct / n).toBeLessThan(BOT_PROFILES.rival.accuracy + 0.08);
  });

  it('even the nemesis loses to a perfect fast player', () => {
    const s = playOut(() => right(0), () => botAnswer(BOT_PROFILES.nemesis, makeRng(9)));
    expect(s.winner).toBe('you');
  });
});

describe('a human opponent drops into the bot slot unchanged', () => {
  it('resolves a round identically whoever supplied the answer', () => {
    // THE PROPERTY THAT PROTECTS THE DESIGN. resolveRound() takes two Answers and
    // must never look at `bot`. If someone later reads the bot profile during
    // resolution, these two stop matching and this test says so.
    const human = startDuel(deck(7), { foeName: 'ghost_fire71' });
    human.foe.bot = null;                       // a real person, no profile at all

    const versusBot = resolveRound(fresh(), right(2), wrong(6));
    const versusHuman = resolveRound(human, right(2), wrong(6));

    expect(versusHuman.foe.hp).toBe(versusBot.foe.hp);
    expect(versusHuman.you.hp).toBe(versusBot.you.hp);
    expect(versusHuman.history[0].damage).toBe(versusBot.history[0].damage);
    expect(versusHuman.history[0].winner).toBe(versusBot.history[0].winner);
  });

  it('a human opponent has nothing pending — the network supplies it', () => {
    let s = startDuel(deck(7));
    s.foe.bot = null;
    s = resolveRound(s, right(2), wrong(6));
    expect(s.pending).toBeNull();
    expect(s.over).toBe(false);
    expect(s.round).toBe(2);
  });
});
