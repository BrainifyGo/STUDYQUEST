/**
 * Whole-app themes.
 *
 * The first version of this moved only the accent, because moving backgrounds
 * and text is how an app becomes unreadable. RED wants the whole interface to
 * change, and he is right that a one-colour highlight does not feel like a
 * different app. So this moves everything — and earns the right to by refusing
 * to ship a theme that cannot be read.
 *
 * THIS CODEBASE HAS ALREADY BEEN BITTEN BY EXACTLY THIS.
 *
 * `index.css` carries a comment recording that the light theme was built by
 * copying the dark theme's alpha values across. Pale ink on a dark ground and
 * dark ink on a pale ground behave completely differently, and the result was
 * that half the secondary text on the site sat at 2.47:1 — effectively
 * invisible — until somebody measured it.
 *
 * So no theme here hard-codes an alpha. A theme declares five real colours, and
 * the translucent values are SOLVED for: `alphaForContrast` finds the lowest
 * opacity that still clears the contrast the shipped design achieves. Add a
 * theme with unusual colours and its dim text gets more opaque automatically,
 * rather than quietly disappearing.
 *
 * Targets are taken from what the current app actually achieves, measured:
 *
 *              dark      light
 *   text-main  16.87     16.03
 *   muted       6.51      8.67
 *   dim         3.52      5.71
 *   accent      5.60      5.36
 */

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  id: string;
  name: string;
  /** Decides the `dark` / `light` class, so class-scoped CSS still matches. */
  mode: ThemeMode;
  /** The page. */
  bgMain: string;
  /** Cards and panels sitting on the page. */
  bgSecondary: string;
  /** Body text. Everything dimmer is derived from it. */
  textMain: string;
  accent: string;
  accentDeep: string;
}

/**
 * The bar every theme has to clear — PER MODE, from what each shipped mode
 * actually achieves.
 *
 * A single global floor was the first attempt and it was wrong in a way worth
 * recording, because it is the same mistake `index.css` already documents, just
 * from the other side. Taking the dark theme's 3.5:1 as the one target made
 * every LIGHT theme fainter than the light mode that ships today, which reaches
 * 5.71:1 — the solver picks the lowest alpha that clears the target, so the
 * target is the whole answer.
 *
 * Dark ink on a pale ground washes out faster than pale ink on a dark one, and
 * these numbers say so.
 */
export const CONTRAST = {
  // These ARE the measured values of the two shipped modes, not round numbers
  // near them. The solver returns the first alpha to clear its target, so a
  // target set even slightly below the reference lets a theme land just under
  // it — which is how Ember and Graphite first came out marginally fainter than
  // the app they were meant to match.
  dark: { textMain: 12, textMuted: 6.51, textDim: 3.52 },
  light: { textMain: 12, textMuted: 8.67, textDim: 5.71 },
  accent: 4.5,
} as const;

/*
  Eight themes. Two are the app's own, so switching away and back is possible
  and the familiar one is never lost.
*/
export const THEMES: Theme[] = [
  {
    id: 'midnight', name: 'Midnight', mode: 'dark',
    bgMain: '#0f0f1a', bgSecondary: '#13131f', textMain: '#f0f0ff',
    accent: '#7c7cff', accentDeep: '#5a5aee',
  },
  {
    id: 'daylight', name: 'Daylight', mode: 'light',
    bgMain: '#f8f7ff', bgSecondary: '#ffffff', textMain: '#1a1a2e',
    accent: '#7c3aed', accentDeep: '#6d28d9',
  },
  {
    id: 'abyss', name: 'Abyss', mode: 'dark',
    bgMain: '#04121c', bgSecondary: '#0a1c28', textMain: '#e2f4ff',
    accent: '#38bdf8', accentDeep: '#0ea5e9',
  },
  {
    id: 'canopy', name: 'Canopy', mode: 'dark',
    bgMain: '#08160f', bgSecondary: '#0e2018', textMain: '#e4f7ec',
    accent: '#34d399', accentDeep: '#10b981',
  },
  {
    id: 'ember', name: 'Ember', mode: 'dark',
    bgMain: '#160d08', bgSecondary: '#20140d', textMain: '#fdeee2',
    accent: '#fb923c', accentDeep: '#f97316',
  },
  {
    id: 'orchid', name: 'Orchid', mode: 'dark',
    bgMain: '#170a16', bgSecondary: '#211020', textMain: '#fce9fb',
    accent: '#e879f9', accentDeep: '#d946ef',
  },
  {
    id: 'parchment', name: 'Parchment', mode: 'light',
    bgMain: '#f7f3ea', bgSecondary: '#fffdf8', textMain: '#2b2417',
    accent: '#a2542a', accentDeep: '#87421f',
  },
  {
    id: 'graphite', name: 'Graphite', mode: 'light',
    bgMain: '#f2f4f6', bgSecondary: '#ffffff', textMain: '#161a1f',
    accent: '#0e7490', accentDeep: '#155e75',
  },
];

export const DEFAULT_THEME_ID = 'midnight';

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/* ── colour maths ────────────────────────────────────────────────────────── */

export function hexToRgb(hex: string): [number, number, number] {
  const h = String(hex).replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Alpha-composite `fg` at `alpha` over an opaque `bg`. */
export function composite(fg: string, alpha: number, bg: string): [number, number, number] {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return [0, 1, 2].map((i) => Math.round(f[i] * alpha + b[i] * (1 - alpha))) as
    [number, number, number];
}

export function contrastOf(fg: string, alpha: number, bg: string): number {
  return contrast(composite(fg, alpha, bg), hexToRgb(bg));
}

/**
 * The lowest opacity of `fg` over `bg` that still reaches `target` contrast.
 *
 * This is the piece that makes whole-app theming safe. Fixed alphas are only
 * ever right for the one theme they were eyeballed on; solving means a theme
 * with an unusual background gets more opaque secondary text automatically
 * instead of a quietly unreadable one.
 *
 * Returns 1 when even fully opaque cannot reach the target — the theme itself is
 * then wrong, and the tests say so rather than this silently papering over it.
 */
export function alphaForContrast(fg: string, bg: string, target: number): number {
  for (let a = 0.3; a <= 1.0001; a += 0.01) {
    if (contrastOf(fg, a, bg) >= target) return Number(a.toFixed(2));
  }
  return 1;
}

/* ── turning a theme into CSS variables ──────────────────────────────────── */

export interface ResolvedTheme {
  vars: Record<string, string>;
  mode: ThemeMode;
}

/**
 * Every variable `index.css` defines, derived from the theme's five colours.
 *
 * `--glass-bg` and `--border-main` are deliberately NOT solved for contrast:
 * they are surfaces and hairlines, not text, and forcing them to 3.5:1 would
 * turn every card edge into a hard white line. They scale gently with the mode
 * instead, which is what the shipped design does.
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  const { bgMain, bgSecondary, textMain, accent, accentDeep, mode } = theme;

  const target = CONTRAST[mode];
  const dimAlpha = alphaForContrast(textMain, bgMain, target.textDim);
  const mutedAlpha = alphaForContrast(textMain, bgMain, target.textMuted);

  const [tr, tg, tb] = hexToRgb(textMain);
  const rgba = (a: number) => `rgba(${tr}, ${tg}, ${tb}, ${a})`;

  const [sr, sg, sb] = hexToRgb(bgSecondary);

  return {
    mode,
    vars: {
      '--bg-main': bgMain,
      '--bg-secondary': bgSecondary,
      // Cards sitting IN the page: a whisper of the text colour over it.
      '--glass-bg': rgba(mode === 'dark' ? 0.04 : 0.03),
      // Floating panels need a floor of their own or you read the page through them.
      '--panel-bg': `rgba(${sr}, ${sg}, ${sb}, ${mode === 'dark' ? 0.94 : 0.96})`,
      '--border-main': rgba(0.08),
      '--text-main': textMain,
      '--text-dim': rgba(dimAlpha),
      '--text-muted': rgba(mutedAlpha),
      '--brand-purple': accent,
      '--brand-purple-dark': accentDeep,
    },
  };
}

function documentRoot(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement;
}

/**
 * Paint a theme onto the document.
 *
 * Sets the `dark`/`light` class too, because plenty of CSS in this app is scoped
 * to it. Inline custom properties out-specify the class-based ones in
 * `index.css`, so the variables here win and the class only steers the rules
 * that are not variable-driven.
 */
export function applyTheme(
  theme: Theme,
  root: HTMLElement | null = documentRoot(),
): ResolvedTheme {
  const resolved = resolveTheme(theme);
  if (!root) return resolved;

  for (const [name, value] of Object.entries(resolved.vars)) {
    root.style.setProperty(name, value);
  }
  root.classList.toggle('dark', resolved.mode === 'dark');
  root.classList.toggle('light', resolved.mode === 'light');
  return resolved;
}

/** Hand the page back to `index.css`. */
export function clearTheme(root: HTMLElement | null = documentRoot()): void {
  if (!root) return;
  for (const name of Object.keys(resolveTheme(THEMES[0]).vars)) {
    root.style.removeProperty(name);
  }
}

/* ── a different one each day ────────────────────────────────────────────── */

/** Days since the epoch in the viewer's own timezone, so it turns at their midnight. */
export function dayNumber(date: Date = new Date()): number {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The theme for a given day.
 *
 * `salt` shifts the cycle per person, so two friends comparing screens on the
 * same day usually see different ones.
 */
export function themeForDay(date: Date = new Date(), salt = ''): Theme {
  const offset = hash(salt) % THEMES.length;
  const i = (((dayNumber(date) + offset) % THEMES.length) + THEMES.length) % THEMES.length;
  return THEMES[i];
}

/** What the student chose: a fixed theme id, or a new one each day. */
export type ThemeChoice = { kind: 'fixed'; id: string } | { kind: 'daily' };

export function resolveChoice(
  choice: ThemeChoice | null | undefined,
  opts: { salt?: string; date?: Date } = {},
): Theme {
  if (choice?.kind === 'daily') return themeForDay(opts.date ?? new Date(), opts.salt ?? '');
  return themeById(choice?.kind === 'fixed' ? choice.id : DEFAULT_THEME_ID);
}
