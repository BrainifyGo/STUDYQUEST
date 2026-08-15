/**
 * The boss fight.
 *
 * Boss Battle originally had no boss — a bar labelled "Boss" that drained at a
 * constant rate, which is the same fight for its whole length. These pin the
 * things that give it a shape: who you face, when it turns nasty, and what that
 * costs you.
 */
import { describe, expect, it } from 'vitest';
import {
  BOSSES, pickBoss, phaseFor, playerDamageFor, lineFor, justEnraged,
} from '../src/lib/bosses';
import { MODES, startState, applyAnswer, completionBonus } from '../src/lib/gameModes';
import type { QuizQuestion } from '../src/App';

const q: QuizQuestion = {
  question: 'What is 7 + 5?', options: ['10', '11', '12', '13'],
  correctAnswer: '12', explanation: '7 + 5 = 12.',
};
const deck = (n: number) => Array.from({ length: n }, () => q);
const fight = (subject = 'Maths', n = 200) =>
  startState(MODES['boss-battle'], deck(n), subject);

describe('choosing a boss', () => {

  it('gives each subject its own', () => {
    expect(pickBoss('Maths').id).toBe('pythagorus-rex');
    expect(pickBoss('Science').id).toBe('lord-mitochondria');
    expect(pickBoss('English').id).toBe('the-bardolith');
  });

  it('falls back to The Examiner for a mixed round, not the first in the list', () => {
    // A mixed-subject fight guarded by the maths boss just because it is first
    // would be a bug that looks like a feature.
    expect(pickBoss('').id).toBe('the-examiner');
    expect(pickBoss('Geography').id).toBe('the-examiner');
  });

  it('gives every boss a full set of lines', () => {
    for (const b of BOSSES) {
      for (const ev of ['intro', 'hit', 'playerHit', 'enrage', 'defeat', 'victory'] as const) {
        expect(b.lines[ev]?.length, `${b.id} is missing ${ev}`).toBeGreaterThan(0);
      }
    }
  });

  it('picks a line deterministically, so it does not re-roll on re-render', () => {
    const b = pickBoss('Maths');
    expect(lineFor(b, 'hit', 3)).toBe(lineFor(b, 'hit', 3));
  });

  it('never returns an empty line, whatever the seed', () => {
    const b = pickBoss('Maths');
    for (const seed of [0, 1, 99, -7, 1e6]) {
      expect(lineFor(b, 'hit', seed).length).toBeGreaterThan(0);
    }
  });
});

describe('phases', () => {

  it('turns angrier as the boss weakens', () => {
    expect(phaseFor(100, 100)).toBe(1);
    expect(phaseFor(67, 100)).toBe(1);
    expect(phaseFor(66, 100)).toBe(2);
    expect(phaseFor(34, 100)).toBe(2);
    expect(phaseFor(33, 100)).toBe(3);
    expect(phaseFor(1, 100)).toBe(3);
  });

  it('doubles the damage you take once enraged', () => {
    expect(playerDamageFor(1)).toBe(1);
    expect(playerDamageFor(2)).toBe(1);
    expect(playerDamageFor(3)).toBe(2);
  });

  it('detects the moment a phase is crossed', () => {
    expect(justEnraged(70, 60, 100)).toBe(true);   // 1 -> 2
    expect(justEnraged(60, 55, 100)).toBe(false);  // still 2
    expect(justEnraged(40, 20, 100)).toBe(true);   // 2 -> 3
  });

  it('survives a zero-health boss without dividing by zero', () => {
    expect(phaseFor(0, 0)).toBe(1);
  });
});

describe('the fight', () => {

  it('starts against the right boss, at its own health', () => {
    const s = fight('Science');
    expect(s.boss?.id).toBe('lord-mitochondria');
    expect(s.bossHP).toBe(s.boss!.maxHP);
    expect(s.phase).toBe(1);
  });

  it('flags the single turn that triggers an enrage', () => {
    let s = fight();
    let sawEnrage = false;
    while (!s.over) {
      s = applyAnswer(s, true);
      if (s.enragedThisTurn) sawEnrage = true;
    }
    expect(sawEnrage).toBe(true);
  });

  it('does not punish you with an enrage you caused on the same turn', () => {
    // Damage is read from the phase BEFORE the answer. Being hit twice for the
    // answer that pushed the boss over the line would feel arbitrary.
    let s = fight();
    s = { ...s, bossHP: 34, phase: 2, playerHP: 3 };
    const after = applyAnswer(s, false);   // wrong answer while still phase 2
    expect(after.playerHP).toBe(2);        // 1 damage, not 2
  });

  it('takes two health per mistake once enraged', () => {
    let s = fight();
    s = { ...s, bossHP: 20, phase: 3, playerHP: 3 };
    expect(applyAnswer(s, false).playerHP).toBe(1);
  });

  it('is won by emptying the bar', () => {
    let s = fight();
    while (!s.over) s = applyAnswer(s, true);
    expect(s.won).toBe(true);
    expect(s.outcome).toBe('Boss defeated');
    expect(completionBonus(s)).toBe(400);
  });

  it('is lost by running out of health', () => {
    let s = fight();
    while (!s.over) s = applyAnswer(s, false);
    expect(s.won).toBe(false);
    expect(s.outcome).toBe('You were beaten');
    expect(completionBonus(s)).toBe(0);
  });

  it('pays NO victory bonus when the questions simply ran out', () => {
    // A fight that ended with the boss on 1 HP is not a win, and paying 400 for
    // it would make running out of questions the cheapest way to farm XP.
    let s = startState(MODES['boss-battle'], deck(2), 'Maths');
    s = applyAnswer(s, true);
    s = applyAnswer(s, true);
    expect(s.over).toBe(true);
    expect(s.won).toBe(false);
    expect(completionBonus(s)).toBe(0);
  });

  it('still never mutates the state it is given', () => {
    const before = fight();
    const snapshot = JSON.stringify(before);
    applyAnswer(before, true);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
