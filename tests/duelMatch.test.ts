/**
 * The server side of a live duel.
 *
 * The tests that matter here are the ones about what a client is NOT allowed to
 * decide. Against a bot, cheating is pointless. Against a friend it is the whole
 * game, and the two facts worth protecting are whether an answer was right and
 * how long it took — one is a free win, the other is a free win disguised as
 * reflexes.
 */
import { describe, expect, it } from 'vitest';
import { DuelMatch, type MatchPlayer } from '../src/lib/duelMatch';
import { DUEL_ROUNDS, DUEL_ROUND_SECONDS } from '../src/lib/duel';
import type { QuizQuestion } from '../src/App';

const q = (n: number): QuizQuestion => ({
  question: `Question ${n}?`,
  options: [`right ${n}`, `wrong a ${n}`, `wrong b ${n}`, `wrong c ${n}`],
  correctAnswer: `right ${n}`,
  explanation: `Because ${n}.`,
});

const deck = (n = DUEL_ROUNDS) => Array.from({ length: n }, (_, i) => q(i + 1));

const alice: MatchPlayer = { socketId: 'sock-a', uid: 'uid-a', name: 'Alice' };
const bob: MatchPlayer = { socketId: 'sock-b', uid: 'uid-b', name: 'Bob' };

function started(t = 1_000_000) {
  const m = new DuelMatch('duel-1', deck(), alice);
  m.join(bob);
  const prompt = m.nextRound(t);
  return { m, prompt: prompt!, t };
}

describe('joining', () => {
  it('starts with only the host and will not run', () => {
    const m = new DuelMatch('d', deck(), alice);
    expect(m.full).toBe(false);
    expect(m.nextRound(0)).toBeNull();
  });

  it('runs once the second player arrives', () => {
    const m = new DuelMatch('d', deck(), alice);
    expect(m.join(bob)).toBe(true);
    expect(m.full).toBe(true);
    expect(m.nextRound(0)).not.toBeNull();
  });

  it('refuses a third player', () => {
    const m = new DuelMatch('d', deck(), alice);
    m.join(bob);
    expect(m.join({ socketId: 'sock-c', uid: 'uid-c', name: 'Carol' })).toBe(false);
  });

  it('refuses to add the same socket twice', () => {
    const m = new DuelMatch('d', deck(), alice);
    expect(m.join(alice)).toBe(false);
  });

  it('shortens the match rather than repeating a question', () => {
    // A repeated question is won by whoever remembered it, not by who knows it.
    const m = new DuelMatch('d', deck(3), alice);
    expect(m.rounds).toBe(3);
  });
});

describe('what the client is told', () => {
  it('never says WHICH option is correct', () => {
    /*
      THE CHEAT THIS CLOSES. If the answer ships with the prompt it is sitting
      in the network tab, and beating a friend is a matter of opening devtools.

      The correct option's TEXT is obviously present — it is one of the four you
      have to be able to pick. What must not be present is anything marking it:
      no `correctAnswer`, no `explanation` (which gives it away in prose), and
      no field beyond the known set, so a later addition cannot quietly leak it.
    */
    const { prompt } = started();
    expect(prompt.options).toHaveLength(4);
    expect(prompt.options).toContain('right 1');          // pickable...
    expect(prompt).not.toHaveProperty('correctAnswer');   // ...but unmarked
    expect(prompt).not.toHaveProperty('explanation');
    expect(Object.keys(prompt).sort()).toEqual(
      ['endsAt', 'options', 'question', 'round', 'rounds', 'seconds'],
    );
  });

  it('sends a deadline rather than a duration', () => {
    // Both clients then count down to the same instant however late the
    // message reached them.
    const { prompt, t } = started();
    expect(prompt.endsAt).toBe(t + DUEL_ROUND_SECONDS * 1000);
  });

  it('reveals the answer only when the round closes', () => {
    const { m } = started();
    const outcome = m.closeRound()!;
    expect(outcome.correctAnswer).toBe('right 1');
    expect(outcome.explanation).toBe('Because 1.');
  });
});

describe('the server decides correctness', () => {
  it('marks the right option correct and a wrong one incorrect', () => {
    const { m, t } = started();
    m.answer('sock-a', 1, 'right 1', t + 2000);
    m.answer('sock-b', 1, 'wrong a 1', t + 3000);
    const out = m.closeRound()!;
    expect(out.answers['sock-a'].correct).toBe(true);
    expect(out.answers['sock-b'].correct).toBe(false);
  });

  it('treats an option that is not on the list as simply wrong', () => {
    // The shape a tampered payload takes. It should lose the round, not crash
    // the match or throw for the honest player.
    const { m, t } = started();
    m.answer('sock-a', 1, 'right 1; DROP TABLE', t + 1000);
    m.answer('sock-b', 1, { evil: true }, t + 1000);
    const out = m.closeRound()!;
    expect(out.answers['sock-a'].correct).toBe(false);
    expect(out.answers['sock-a'].option).toBeNull();
    expect(out.answers['sock-b'].correct).toBe(false);
  });
});

describe('the server decides the timing', () => {
  it('measures from when it sent the question', () => {
    const { m, t } = started();
    m.answer('sock-a', 1, 'right 1', t + 2500);
    const out = m.closeRound()!;
    expect(out.answers['sock-a'].seconds).toBeCloseTo(2.5, 3);
  });

  it('a client cannot claim to have been faster than it was', () => {
    // Damage scales with speed. If timing came from the client, "0.0s every
    // round" would out-damage an honest player forever. The client only ever
    // sends WHICH option; it has no way to say when.
    const { m, t } = started();
    m.answer('sock-a', 1, 'right 1', t + 7000);
    const out = m.closeRound()!;
    expect(out.answers['sock-a'].seconds).toBeGreaterThan(6);
  });

  it('clamps a late arrival to the buzzer rather than beyond it', () => {
    const { m, t } = started();
    m.answer('sock-a', 1, 'right 1', t + 60_000);
    const out = m.closeRound()!;
    expect(out.answers['sock-a'].seconds).toBe(DUEL_ROUND_SECONDS);
  });

  it('never produces a negative time from clock skew', () => {
    const { m, t } = started();
    m.answer('sock-a', 1, 'right 1', t - 5000);
    const out = m.closeRound()!;
    expect(out.answers['sock-a'].seconds).toBe(0);
  });
});

describe('answers that must be ignored', () => {
  it('only the first answer counts', () => {
    // Otherwise you answer instantly, see your opponent's reaction, and change
    // your mind.
    const { m, t } = started();
    m.answer('sock-a', 1, 'wrong a 1', t + 1000);
    expect(m.answer('sock-a', 1, 'right 1', t + 2000)).toBe(false);
    const out = m.closeRound()!;
    expect(out.answers['sock-a'].correct).toBe(false);
  });

  it('an answer for the wrong round is refused', () => {
    const { m, t } = started();
    expect(m.answer('sock-a', 2, 'right 1', t + 500)).toBe(false);
  });

  it('a stranger cannot answer', () => {
    const { m, t } = started();
    expect(m.answer('sock-zzz', 1, 'right 1', t + 500)).toBe(false);
  });

  it('nothing is accepted once the round has closed', () => {
    const { m, t } = started();
    m.closeRound();
    expect(m.answer('sock-a', 1, 'right 1', t + 500)).toBe(false);
  });
});

describe('running out of time', () => {
  it('someone who never answered is recorded as timed out', () => {
    const { m, t } = started();
    m.answer('sock-a', 1, 'right 1', t + 1000);
    const out = m.closeRound()!;
    expect(out.answers['sock-b'].seconds).toBe(Infinity);
    expect(out.answers['sock-b'].correct).toBe(false);
    expect(out.answers['sock-b'].option).toBeNull();
  });

  it('the round expires a beat after the buzzer, not exactly on it', () => {
    // A grace period, so an answer sent at 9.98s is not thrown away by latency.
    const { m, t } = started();
    expect(m.expired(t + DUEL_ROUND_SECONDS * 1000)).toBe(false);
    expect(m.expired(t + (DUEL_ROUND_SECONDS + 2) * 1000)).toBe(true);
  });
});

describe('the match as a whole', () => {
  it('knows when everyone has answered', () => {
    const { m, t } = started();
    expect(m.everyoneAnswered).toBe(false);
    m.answer('sock-a', 1, 'right 1', t + 100);
    expect(m.everyoneAnswered).toBe(false);
    m.answer('sock-b', 1, 'right 1', t + 200);
    expect(m.everyoneAnswered).toBe(true);
  });

  it('runs exactly the number of rounds in the deck and then stops', () => {
    const m = new DuelMatch('d', deck(), alice);
    m.join(bob);
    let count = 0;
    let now = 0;
    while (m.nextRound(now)) { count += 1; m.closeRound(); now += 20_000; }
    expect(count).toBe(DUEL_ROUNDS);
    expect(m.finished).toBe(true);
  });

  it('a walkout ends the duel and names who left', () => {
    const { m } = started();
    m.forfeit('sock-b');
    expect(m.phase).toBe('over');
    expect(m.forfeitedBy).toBe('sock-b');
    expect(m.nextRound(0)).toBeNull();
  });

  it('finds the opponent from either side', () => {
    const { m } = started();
    expect(m.opponentOf('sock-a')?.name).toBe('Bob');
    expect(m.opponentOf('sock-b')?.name).toBe('Alice');
    expect(m.opponentOf('nobody')).toBeTruthy();   // returns *a* player, not a crash
  });
});
