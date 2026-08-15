/**
 * Speed Run and Boss Battle rules.
 *
 * These are the numbers that decide whether either mode is fun or pointless, so
 * they are pinned here. In ReviseGo the rules lived inside the component and the
 * only way to check them was to play the game.
 */
import { describe, expect, it } from 'vitest';
import {
  MODES, startState, applyAnswer, tickClock, bossDamage,
  completionBonus, accuracy, type ModeState,
} from '../src/lib/gameModes';
import type { QuizQuestion } from '../src/App';

const q: QuizQuestion = {
  question: 'What is 7 + 5?',
  options: ['10', '11', '12', '13'],
  correctAnswer: '12',
  explanation: '7 + 5 = 12.',
};

const deck = (n: number) => Array.from({ length: n }, () => q);

const speed = () => startState(MODES['speed-run'], deck(50));
const boss = () => startState(MODES['boss-battle'], deck(50));

const answerMany = (s: ModeState, results: boolean[]) =>
  results.reduce((acc, r) => applyAnswer(acc, r), s);

describe('Speed Run', () => {

  it('starts with 60 seconds on the clock', () => {
    expect(speed().timeLeft).toBe(60);
  });

  it('adds a second for a correct answer', () => {
    expect(applyAnswer(speed(), true).timeLeft).toBe(61);
  });

  it('takes three seconds for a wrong one', () => {
    expect(applyAnswer(speed(), false).timeLeft).toBe(57);
  });

  it('does NOT end the run on a wrong answer', () => {
    // Sudden death would make the safe play "answer slowly", which is the
    // opposite of the point of the mode.
    expect(applyAnswer(speed(), false).over).toBe(false);
  });

  it('ends when the clock runs out', () => {
    let s = speed();
    for (let i = 0; i < 60; i++) s = tickClock(s);
    expect(s.over).toBe(true);
    expect(s.outcome).toBe('Time!');
  });

  it('cannot go past zero on the clock', () => {
    let s = { ...speed(), timeLeft: 2 };
    s = applyAnswer(s, false);            // -3 from 2
    expect(s.timeLeft).toBe(0);
    expect(s.over).toBe(true);
  });

  it('scores one per correct answer', () => {
    const s = answerMany(speed(), [true, true, false, true]);
    expect(s.score).toBe(3);
    expect(s.correct).toBe(3);
    expect(s.answered).toBe(4);
  });
});

describe('Boss Battle', () => {

  it('starts with a full boss and three lives', () => {
    const s = boss();
    expect(s.bossHP).toBe(100);
    expect(s.playerHP).toBe(3);
  });

  it('damages the boss on a correct answer', () => {
    expect(applyAnswer(boss(), true).bossHP).toBeLessThan(100);
  });

  it('hits harder as the combo builds', () => {
    expect(bossDamage(5)).toBeGreaterThan(bossDamage(1));
  });

  it('CAPS the combo damage', () => {
    // Uncapped, one lucky streak ends the fight in three questions.
    expect(bossDamage(1000)).toBe(bossDamage(8));
  });

  it('costs you a life when you get one wrong', () => {
    expect(applyAnswer(boss(), false).playerHP).toBe(2);
  });

  it('ends when the boss dies', () => {
    let s = boss();
    while (!s.over) s = applyAnswer(s, true);
    expect(s.bossHP).toBe(0);
    expect(s.outcome).toBe('Boss defeated');
  });

  it('ends when you run out of lives', () => {
    const s = answerMany(boss(), [false, false, false]);
    expect(s.over).toBe(true);
    expect(s.outcome).toBe('You were beaten');
    expect(s.playerHP).toBe(0);
  });

  it('is untimed', () => {
    const s = tickClock(boss());
    expect(s.timeLeft).toBe(0);
    expect(s.over).toBe(false);
  });
});

describe('both modes', () => {

  it('never mutate the state handed to them', () => {
    // React only re-renders on a new object; mutating in place is how a HUD
    // silently stops updating.
    const before = speed();
    const snapshot = JSON.stringify(before);
    applyAnswer(before, true);
    tickClock(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('ignore answers once the round is over', () => {
    const done = { ...speed(), over: true };
    expect(applyAnswer(done, true)).toBe(done);
  });

  it('track the best combo, not just the current one', () => {
    const s = answerMany(speed(), [true, true, true, false, true]);
    expect(s.combo).toBe(1);
    expect(s.bestCombo).toBe(3);
  });

  it('end rather than loop when the questions run out', () => {
    let s = startState(MODES['speed-run'], deck(3));
    for (let i = 0; i < 3; i++) s = applyAnswer(s, true);
    expect(s.over).toBe(true);
  });

  it('report accuracy honestly, including before anything is answered', () => {
    expect(accuracy(speed())).toBe(0);
    expect(accuracy(answerMany(speed(), [true, false]))).toBe(50);
  });

  it('pay a completion bonus only when it is earned', () => {
    expect(completionBonus(speed())).toBe(0);
    expect(completionBonus({ ...speed(), score: 16 })).toBe(250);
    let killed = boss();
    while (!killed.over) killed = applyAnswer(killed, true);
    expect(completionBonus(killed)).toBe(400);
  });
});
