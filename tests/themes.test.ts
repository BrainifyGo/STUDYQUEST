/**
 * Whole-app themes.
 *
 * Almost all of this file is one question asked eight ways: **can you still read
 * the app?** Moving only an accent was safe by construction; moving backgrounds
 * and text is not, and this codebase has already shipped an unreadable theme
 * once — `index.css` records that the light mode's secondary text sat at 2.47:1
 * because the dark mode's alpha values were copied across without measuring.
 *
 * These tests are the reason that cannot happen again. Add a theme whose colours
 * do not work and the suite fails with the theme named.
 */
import { describe, expect, it } from 'vitest';
import {
  CONTRAST, DEFAULT_THEME_ID, THEMES,
  alphaForContrast, applyTheme, clearTheme, composite, contrast, contrastOf,
  dayNumber, hexToRgb, resolveChoice, resolveTheme, themeById, themeForDay,
  type Theme,
} from '../src/lib/themes';

/** Read an rgba() string back out so its real contrast can be measured. */
function alphaOf(rgba: string): number {
  const m = rgba.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
  return m ? Number(m[1]) : 1;
}

describe('every theme is readable', () => {
  it.each(THEMES.map((t) => [t.name, t] as [string, Theme]))(
    '%s: body text clears the bar against its own background',
    (_name, theme) => {
      expect(contrast(hexToRgb(theme.textMain), hexToRgb(theme.bgMain)))
        .toBeGreaterThanOrEqual(CONTRAST[theme.mode].textMain);
    },
  );

  it.each(THEMES.map((t) => [t.name, t] as [string, Theme]))(
    '%s: dim and muted text are solved to clear theirs',
    (_name, theme) => {
      /*
        The one that matters. These are derived, not declared, so this checks the
        solver actually produced usable values for this theme's colours rather
        than trusting a number somebody typed.
      */
      const { vars } = resolveTheme(theme);
      const target = CONTRAST[theme.mode];
      expect(contrastOf(theme.textMain, alphaOf(vars['--text-dim']), theme.bgMain))
        .toBeGreaterThanOrEqual(target.textDim);
      expect(contrastOf(theme.textMain, alphaOf(vars['--text-muted']), theme.bgMain))
        .toBeGreaterThanOrEqual(target.textMuted);
    },
  );

  it.each(THEMES.map((t) => [t.name, t] as [string, Theme]))(
    '%s: the accent is visible against the page',
    (_name, theme) => {
      expect(contrast(hexToRgb(theme.accent), hexToRgb(theme.bgMain)))
        .toBeGreaterThanOrEqual(CONTRAST.accent);
    },
  );

  it.each(THEMES.map((t) => [t.name, t] as [string, Theme]))(
    '%s: cards are distinguishable from the page behind them',
    (_name, theme) => {
      // Not a contrast requirement — a card must simply not be the same colour
      // as the page, or the layout dissolves.
      expect(theme.bgSecondary.toLowerCase()).not.toBe(theme.bgMain.toLowerCase());
    },
  );

  it.each(THEMES.map((t) => [t.name, t] as [string, Theme]))(
    '%s: the pressed accent is darker than the resting one',
    (_name, theme) => {
      expect(contrast(hexToRgb(theme.accentDeep), hexToRgb('#ffffff')))
        .toBeGreaterThan(contrast(hexToRgb(theme.accent), hexToRgb('#ffffff')));
    },
  );

  it('declares a light mode when the background is light, and vice versa', () => {
    // Getting this backwards leaves class-scoped CSS fighting the variables.
    for (const t of THEMES) {
      const bright = contrast(hexToRgb(t.bgMain), hexToRgb('#000000')) > 10;
      expect(t.mode, t.name).toBe(bright ? 'light' : 'dark');
    }
  });
});

describe('solving for alpha rather than guessing it', () => {
  it('finds the lowest opacity that clears the target', () => {
    const a = alphaForContrast('#f0f0ff', '#0f0f1a', 3.5);
    expect(contrastOf('#f0f0ff', a, '#0f0f1a')).toBeGreaterThanOrEqual(3.5);
    // and one step lower would not have
    expect(contrastOf('#f0f0ff', a - 0.01, '#0f0f1a')).toBeLessThan(3.5);
  });

  it('gives light and dark themes DIFFERENT alphas for the same target', () => {
    /*
      THE BUG THIS FILE EXISTS FOR. Pale ink on a dark ground and dark ink on a
      pale ground do not behave alike, and the shipped light theme was built by
      copying the dark theme's numbers. They should not match.
    */
    const dark = alphaForContrast('#f0f0ff', '#0f0f1a', CONTRAST.dark.textDim);
    const light = alphaForContrast('#1a1a2e', '#f8f7ff', CONTRAST.light.textDim);
    expect(dark).not.toBe(light);
  });

  it('returns 1 rather than pretending, when the target is unreachable', () => {
    // Grey on grey cannot reach 7:1 at any opacity.
    expect(alphaForContrast('#808080', '#7a7a7a', 7)).toBe(1);
  });

  it('composites the way a browser does', () => {
    expect(composite('#ffffff', 1, '#000000')).toEqual([255, 255, 255]);
    expect(composite('#ffffff', 0, '#000000')).toEqual([0, 0, 0]);
    expect(composite('#ffffff', 0.5, '#000000')).toEqual([128, 128, 128]);
  });
});

describe('no theme is fainter than what already ships', () => {
  /*
    THE REGRESSION THIS CAUGHT. A single global contrast floor, taken from the
    dark theme, made every light theme fainter than the light mode already live
    — 3.56:1 against the 5.71:1 that ships. The solver takes the LOWEST alpha
    that clears the target, so the target is the entire answer, and it has to be
    per mode.
  */
  // The real measured values of the two modes that ship today. Not numbers
  // chosen to fit the implementation — that would make this test circular.
  const SHIPPED = {
    dark: { dim: 3.52, muted: 6.51 },
    light: { dim: 5.71, muted: 8.67 },
  };

  /*
    Compared at the precision the shipped values were measured to. The reference
    numbers are quoted to two decimals, so asserting against more than that fails
    on rounding rather than on readability — 3.5185 and 3.52 are the same colour.
  */
  const to2 = (n: number) => Math.round(n * 100) / 100;

  it.each(THEMES.map((t) => [t.name, t] as [string, Theme]))(
    '%s: dim text is at least as readable as the shipped mode',
    (_name, theme) => {
      const { vars } = resolveTheme(theme);
      expect(to2(contrastOf(theme.textMain, alphaOf(vars['--text-dim']), theme.bgMain)))
        .toBeGreaterThanOrEqual(SHIPPED[theme.mode].dim);
    },
  );

  it.each(THEMES.map((t) => [t.name, t] as [string, Theme]))(
    '%s: muted text is at least as readable as the shipped mode',
    (_name, theme) => {
      const { vars } = resolveTheme(theme);
      expect(to2(contrastOf(theme.textMain, alphaOf(vars['--text-muted']), theme.bgMain)))
        .toBeGreaterThanOrEqual(SHIPPED[theme.mode].muted);
    },
  );

  it('asks more of light themes than dark ones, because ink behaves differently', () => {
    expect(CONTRAST.light.textDim).toBeGreaterThan(CONTRAST.dark.textDim);
    expect(CONTRAST.light.textMuted).toBeGreaterThan(CONTRAST.dark.textMuted);
  });
});

describe('turning a theme into CSS variables', () => {
  it('produces every variable index.css defines', () => {
    // A missing one leaves the previous theme's value in place and mixes them.
    const { vars } = resolveTheme(THEMES[0]);
    expect(Object.keys(vars).sort()).toEqual([
      '--bg-main', '--bg-secondary', '--border-main', '--brand-purple',
      '--brand-purple-dark', '--glass-bg', '--panel-bg', '--text-dim',
      '--text-main', '--text-muted',
    ]);
  });

  it('writes them all onto the root and sets the matching class', () => {
    const props: Record<string, string> = {};
    const classes = new Set<string>(['dark']);
    const root = {
      style: {
        setProperty: (k: string, v: string) => { props[k] = v; },
        removeProperty: (k: string) => { delete props[k]; },
      },
      classList: {
        toggle: (c: string, on: boolean) => { on ? classes.add(c) : classes.delete(c); },
      },
    } as unknown as HTMLElement;

    applyTheme(THEMES.find((t) => t.id === 'daylight')!, root);
    expect(props['--bg-main']).toBe('#f8f7ff');
    expect(classes.has('light')).toBe(true);
    expect(classes.has('dark')).toBe(false);

    clearTheme(root);
    expect(Object.keys(props)).toHaveLength(0);
  });

  it('does nothing at all without a document', () => {
    expect(() => applyTheme(THEMES[0], null)).not.toThrow();
    expect(() => clearTheme(null)).not.toThrow();
  });
});

describe('picking one', () => {
  it('keeps the app\'s own themes so nobody is stranded on a new look', () => {
    expect(THEMES.some((t) => t.id === DEFAULT_THEME_ID)).toBe(true);
    expect(THEMES.some((t) => t.id === 'daylight')).toBe(true);
  });

  it('offers both a light and a dark option', () => {
    expect(THEMES.some((t) => t.mode === 'dark')).toBe(true);
    expect(THEMES.filter((t) => t.mode === 'light').length).toBeGreaterThanOrEqual(2);
  });

  it('has unique ids and names', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(THEMES.length);
  });

  it('falls back to the default rather than crashing on an unknown id', () => {
    // A theme id can outlive the theme, in an old document or a stale device.
    expect(themeById('a-theme-that-was-removed').id).toBe(DEFAULT_THEME_ID);
    expect(themeById(null).id).toBe(DEFAULT_THEME_ID);
  });

  it('honours a fixed choice and a daily one', () => {
    expect(resolveChoice({ kind: 'fixed', id: 'ember' }).id).toBe('ember');
    const day = new Date(2026, 8, 1);
    expect(resolveChoice({ kind: 'daily' }, { date: day })).toEqual(themeForDay(day));
    expect(resolveChoice(null).id).toBe(DEFAULT_THEME_ID);
  });
});

describe('a different one each day', () => {
  it('does not change between renders on the same day', () => {
    expect(themeForDay(new Date(2026, 8, 1, 7, 30)))
      .toEqual(themeForDay(new Date(2026, 8, 1, 23, 45)));
  });

  it('changes overnight, and cycles all of them before repeating', () => {
    expect(themeForDay(new Date(2026, 8, 1))).not.toEqual(themeForDay(new Date(2026, 8, 2)));
    const seen = new Set(
      Array.from({ length: THEMES.length }, (_, d) => themeForDay(new Date(2026, 8, 1 + d)).id),
    );
    expect(seen.size).toBe(THEMES.length);
  });

  it('turns over at the viewer\'s midnight, not UTC', () => {
    expect(dayNumber(new Date(2026, 8, 1, 23, 45)))
      .toBe(dayNumber(new Date(2026, 8, 1, 0, 15)));
  });

  it('gives different people different themes on the same day', () => {
    const day = new Date(2026, 8, 1);
    const ids = ['uid-a', 'uid-b', 'uid-c', 'uid-d'].map((s) => themeForDay(day, s).id);
    expect(new Set(ids).size).toBeGreaterThan(1);
  });
});
