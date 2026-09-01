/**
 * A different accent each day.
 *
 * The contrast block is the one that matters. This feature ships ten colours and
 * hands one to the student without anyone looking at it first, so "does every
 * palette stay visible against the page it lands on" cannot be a thing somebody
 * eyeballs once — it has to be checked on every run, or a day eventually arrives
 * where the buttons have vanished.
 */
import { describe, expect, it } from 'vitest';
import {
  DARK_PAGE, LIGHT_PAGE, PALETTES,
  applyDailyTheme, clearAccent, contrastRatio, dayNumber, luminance,
  paletteForDay,
} from '../src/lib/dailyTheme';

/** Enough to be clearly a different colour from the page, not a smudge on it. */
const MIN_ACCENT_CONTRAST = 3;

describe('every palette stays usable', () => {
  it('reads against the dark page', () => {
    for (const p of PALETTES) {
      const ratio = contrastRatio(p.dark.main, DARK_PAGE);
      expect(ratio, `${p.name} on the dark page`).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
    }
  });

  it('reads against the light page', () => {
    for (const p of PALETTES) {
      const ratio = contrastRatio(p.light.main, LIGHT_PAGE);
      expect(ratio, `${p.name} on the light page`).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
    }
  });

  it('keeps white button text legible on the light-mode accent', () => {
    // Light-mode accents are used as solid button backgrounds with white text.
    for (const p of PALETTES) {
      expect(contrastRatio(p.light.main, '#ffffff'), `${p.name} button`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it('has a deeper pressed state that is actually deeper', () => {
    for (const p of PALETTES) {
      expect(luminance(p.dark.deep), `${p.name} dark`).toBeLessThan(luminance(p.dark.main));
      expect(luminance(p.light.deep), `${p.name} light`).toBeLessThan(luminance(p.light.main));
    }
  });

  it('offers ten genuinely different colours', () => {
    const mains = PALETTES.map((p) => p.dark.main.toLowerCase());
    expect(new Set(mains).size).toBe(PALETTES.length);
    expect(PALETTES.length).toBeGreaterThanOrEqual(7);   // a week without a repeat
  });

  it('still includes StudyQuest\'s own violet', () => {
    // Turning this on should not mean never seeing the app you recognise.
    expect(PALETTES[0].dark.main.toLowerCase()).toBe('#7c7cff');
  });

  it('is written in valid six-digit hex throughout', () => {
    for (const p of PALETTES) {
      for (const hex of [p.dark.main, p.dark.deep, p.light.main, p.light.deep]) {
        expect(hex, `${p.name}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe('the same colour all day, a different one tomorrow', () => {
  it('does not change between renders on the same day', () => {
    // A colour that moved on every render would be a bug wearing a feature's hat.
    const morning = new Date(2026, 8, 1, 7, 30);
    const night = new Date(2026, 8, 1, 23, 45);
    expect(paletteForDay(morning)).toEqual(paletteForDay(night));
  });

  it('changes overnight', () => {
    expect(paletteForDay(new Date(2026, 8, 1)))
      .not.toEqual(paletteForDay(new Date(2026, 8, 2)));
  });

  it('gets through a whole cycle before repeating', () => {
    const seen = new Set<string>();
    for (let d = 0; d < PALETTES.length; d++) {
      seen.add(paletteForDay(new Date(2026, 8, 1 + d)).name);
    }
    expect(seen.size).toBe(PALETTES.length);
  });

  it('turns over at the viewer\'s midnight, not at UTC', () => {
    // 23:45 local on the 1st is already the 2nd in UTC. Using UTC would flip the
    // colour mid-evening for anyone west of it.
    expect(dayNumber(new Date(2026, 8, 1, 23, 45)))
      .toBe(dayNumber(new Date(2026, 8, 1, 0, 15)));
  });

  it('gives different people different colours on the same day', () => {
    const day = new Date(2026, 8, 1);
    const names = ['uid-a', 'uid-b', 'uid-c', 'uid-d'].map((s) => paletteForDay(day, s).name);
    expect(new Set(names).size).toBeGreaterThan(1);
  });

  it('is stable for one person across days and never out of range', () => {
    for (let d = 0; d < 40; d++) {
      const p = paletteForDay(new Date(2026, 0, 1 + d), 'a-real-uid');
      expect(PALETTES).toContain(p);
    }
  });
});

describe('applying it', () => {
  const fakeRoot = () => {
    const props: Record<string, string> = {};
    return {
      props,
      el: {
        style: {
          setProperty: (k: string, v: string) => { props[k] = v; },
          removeProperty: (k: string) => { delete props[k]; },
        },
      } as unknown as HTMLElement,
    };
  };

  it('only ever touches the two accent variables', () => {
    /*
      THE SAFETY PROPERTY. Backgrounds, text and borders are never written, so
      no palette — not even a badly chosen one added later — can make the app
      unreadable. The worst it could do is be dull.
    */
    const { props, el } = fakeRoot();
    applyDailyTheme({ enabled: true, mode: 'dark', root: el, date: new Date(2026, 8, 1) });
    expect(Object.keys(props).sort()).toEqual(['--brand-purple', '--brand-purple-dark']);
  });

  it('uses the light accent in light mode', () => {
    const day = new Date(2026, 8, 3);
    const palette = paletteForDay(day);
    const { props, el } = fakeRoot();
    applyDailyTheme({ enabled: true, mode: 'light', root: el, date: day });
    expect(props['--brand-purple']).toBe(palette.light.main);
  });

  it('puts the authored colours back when switched off', () => {
    const { props, el } = fakeRoot();
    applyDailyTheme({ enabled: true, mode: 'dark', root: el });
    expect(Object.keys(props)).toHaveLength(2);

    const cleared = applyDailyTheme({ enabled: false, mode: 'dark', root: el });
    expect(cleared).toBeNull();
    expect(Object.keys(props)).toHaveLength(0);
  });

  it('does nothing at all when there is no document', () => {
    // Server-side rendering and tests both hit this path.
    expect(() => applyDailyTheme({ enabled: true, mode: 'dark', root: null })).not.toThrow();
    expect(() => clearAccent(null)).not.toThrow();
  });
});
