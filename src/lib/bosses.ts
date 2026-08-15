/**
 * THE BOSSES.
 *
 * Boss Battle shipped as a bar labelled "Boss". Mechanically it worked, but there
 * was nothing to beat — no name, no reaction, no reason to care whether the bar
 * emptied. A boss is a character you are trying to shut up.
 *
 * Everything here is data and pure functions so the fight can be tested without
 * rendering it, and so adding a boss is adding a row rather than editing a
 * component.
 */

export type BossEvent = 'intro' | 'hit' | 'playerHit' | 'enrage' | 'defeat' | 'victory';

export interface Boss {
  id: string;
  name: string;
  title: string;
  /** Subject this boss guards. Empty string means it will take anyone. */
  subject: string;
  maxHP: number;
  /** lucide-react icon name, resolved by the component. */
  icon: string;
  lines: Record<BossEvent, string[]>;
}

export const BOSSES: Boss[] = [
  {
    id: 'pythagorus-rex',
    name: 'Pythagorus Rex',
    title: 'Devourer of Decimals',
    subject: 'Maths',
    maxHP: 100,
    icon: 'Sigma',
    lines: {
      intro: ['You round to two decimal places. I round you DOWN.'],
      hit: ['Tolerable.', 'A lucky guess.', 'You show your working. How quaint.'],
      playerHit: ['Wrong. Predictably.', 'Off by an order of magnitude.', 'Check your units.'],
      enrage: ['Enough. No more calculators.'],
      defeat: ['Impossible... my proof was AIRTIGHT...'],
      victory: ['Your answer does not converge. Neither will you.'],
    },
  },
  {
    id: 'lord-mitochondria',
    name: 'Lord Mitochondria',
    title: 'The Actual Powerhouse',
    subject: 'Science',
    maxHP: 100,
    icon: 'Atom',
    lines: {
      intro: ['You have heard of me. You have never understood me.'],
      hit: ['Adequate respiration.', 'A correct hypothesis. Once.', 'Your method is sound.'],
      playerHit: ['That is not the null hypothesis.', 'You have not controlled your variables.', 'Wrong. And unrepeatable.'],
      enrage: ['I am releasing ALL the ATP.'],
      defeat: ['My energy... depleted...'],
      victory: ['Your experiment has failed. As designed.'],
    },
  },
  {
    id: 'the-bardolith',
    name: 'The Bardolith',
    title: 'Keeper of the Quotation',
    subject: 'English',
    maxHP: 100,
    icon: 'BookOpen',
    lines: {
      intro: ['Speak, then, and let us see if thou hast read the text.'],
      hit: ['A fair point, fairly made.', 'Thou hast quoted correctly.', 'Some evidence at last.'],
      playerHit: ['Thou hast not read it.', 'That is not the theme. That is a plot summary.', 'No quotation? No marks.'],
      enrage: ['Now I shall speak ONLY in unseen poetry.'],
      defeat: ['Alas... I am undone by a well-placed semicolon...'],
      victory: ['Thy essay lacks structure. And an argument.'],
    },
  },
  {
    id: 'the-examiner',
    name: 'The Examiner',
    title: 'Reader of Papers',
    subject: '',
    maxHP: 100,
    icon: 'Skull',
    lines: {
      intro: ['You may now turn over your paper.'],
      hit: ['One mark.', 'Method mark only.', 'Acceptable.'],
      playerHit: ['No marks awarded.', 'You have not answered the question asked.', 'See the mark scheme.'],
      enrage: ['Fifteen minutes remaining.'],
      defeat: ['Full marks. I did not think it possible.'],
      victory: ['Pens down. That is the end of the examination.'],
    },
  },
];

/** The boss that guards a subject, or the one that takes all comers. */
export function pickBoss(subject: string): Boss {
  const match = BOSSES.find((b) => b.subject && b.subject === subject);
  // The Examiner is the fallback deliberately: a mixed-subject round should not
  // be guarded by the maths boss just because it is first in the list.
  return match ?? BOSSES.find((b) => !b.subject) ?? BOSSES[0];
}

export function bossById(id: string): Boss | undefined {
  return BOSSES.find((b) => b.id === id);
}

/**
 * Phase 1 above two thirds, 2 above one third, 3 below it.
 *
 * A single health bar draining at a constant rate is the same fight for its whole
 * length. Phases give it a shape: the boss gets meaner exactly when you are
 * closest to winning.
 */
export function phaseFor(hp: number, maxHP: number): 1 | 2 | 3 {
  if (maxHP <= 0) return 1;
  const pct = (Math.max(0, hp) / maxHP) * 100;
  if (pct > 66) return 1;
  if (pct > 33) return 2;
  return 3;
}

/**
 * What a wrong answer costs you, given the phase.
 *
 * An enraged boss takes two health instead of one, so the last third is where
 * runs are actually lost — and where a combo is worth protecting.
 */
export function playerDamageFor(phase: 1 | 2 | 3): number {
  return phase === 3 ? 2 : 1;
}

/** Deterministic line choice, so the same moment does not re-roll on re-render. */
export function lineFor(boss: Boss, event: BossEvent, seed = 0): string {
  const pool = boss.lines[event];
  if (!pool?.length) return '';
  return pool[Math.abs(Math.floor(seed)) % pool.length];
}

/** True when this answer pushed the boss into a new, angrier phase. */
export function justEnraged(hpBefore: number, hpAfter: number, maxHP: number): boolean {
  return phaseFor(hpAfter, maxHP) > phaseFor(hpBefore, maxHP);
}
