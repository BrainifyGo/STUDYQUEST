/**
 * A different accent colour each day, for students who stop opening the app
 * because it looks the same every time.
 *
 * The obvious version of this — a random hue per day — is the version that
 * ruins the app. Random hues land on yellows that vanish against the dark page
 * and on colours no white text is readable against, and a product whose
 * appearance is unpredictable reads as broken rather than fresh. So:
 *
 *   - The palettes are CURATED, not generated. Ten of them, each chosen against
 *     both the dark and the light page.
 *   - Every one is contrast-checked in the tests against the background it will
 *     actually sit on, so a day can never arrive where the buttons disappear.
 *   - The colour is DETERMINISTIC for a given day, so it is stable from morning
 *     to night and only changes overnight. A colour that changed on every render
 *     would be a bug, not a feature.
 *   - It is OFF by default and opt-in, because plenty of people want the app to
 *     look the same every day and would experience this as instability.
 *
 * Only the accent moves. Backgrounds, text and borders stay exactly where they
 * are, which is what keeps the app recognisably itself on every one of the ten.
 */

export interface Accent {
  /** --brand-purple */
  main: string;
  /** --brand-purple-dark: pressed states and gradient ends. */
  deep: string;
}

export interface Palette {
  name: string;
  /** Used on the dark page (#0f0f1a). Lighter, so it reads against it. */
  dark: Accent;
  /** Used on the light page (#f8f7ff). Deeper, for the same reason. */
  light: Accent;
}

/**
 * Ten palettes. The first is StudyQuest's own violet, so a student who turns
 * this on still meets the app they know roughly one day in ten.
 */
export const PALETTES: Palette[] = [
  { name: 'Violet',    dark: { main: '#7c7cff', deep: '#5a5aee' }, light: { main: '#7c3aed', deep: '#6d28d9' } },
  { name: 'Ocean',     dark: { main: '#38bdf8', deep: '#0ea5e9' }, light: { main: '#0369a1', deep: '#075985' } },
  { name: 'Mint',      dark: { main: '#34d399', deep: '#10b981' }, light: { main: '#047857', deep: '#065f46' } },
  { name: 'Coral',     dark: { main: '#fb7185', deep: '#f43f5e' }, light: { main: '#be123c', deep: '#9f1239' } },
  { name: 'Amber',     dark: { main: '#fbbf24', deep: '#f59e0b' }, light: { main: '#b45309', deep: '#92400e' } },
  { name: 'Cyan',      dark: { main: '#22d3ee', deep: '#06b6d4' }, light: { main: '#0e7490', deep: '#155e75' } },
  { name: 'Magenta',   dark: { main: '#e879f9', deep: '#d946ef' }, light: { main: '#a21caf', deep: '#86198f' } },
  { name: 'Lime',      dark: { main: '#a3e635', deep: '#84cc16' }, light: { main: '#4d7c0f', deep: '#3f6212' } },
  { name: 'Indigo',    dark: { main: '#818cf8', deep: '#6366f1' }, light: { main: '#4338ca', deep: '#3730a3' } },
  { name: 'Tangerine', dark: { main: '#fb923c', deep: '#f97316' }, light: { main: '#c2410c', deep: '#9a3412' } },
];

/** The page each accent has to be visible against. */
export const DARK_PAGE = '#0f0f1a';
export const LIGHT_PAGE = '#f8f7ff';

/** Days since the epoch, in the viewer's own timezone — so it turns over at their midnight. */
export function dayNumber(date: Date = new Date()): number {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

/**
 * The palette for a given day.
 *
 * `salt` shifts the cycle per person, so two friends comparing screens on the
 * same day usually see different colours — which is the bit that makes it feel
 * like the app noticed them rather than like a scheduled event.
 */
export function paletteForDay(date: Date = new Date(), salt = ''): Palette {
  const offset = hash(salt) % PALETTES.length;
  const index = (((dayNumber(date) + offset) % PALETTES.length) + PALETTES.length) % PALETTES.length;
  return PALETTES[index];
}

/** Stable small hash. Not security — just a spread. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ── contrast ────────────────────────────────────────────────────────────── */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ── applying it ─────────────────────────────────────────────────────────── */

/**
 * Write the accent onto the document.
 *
 * Only ever touches the two accent variables. Everything else in the theme is
 * left exactly as authored, which is why no palette can make the app unreadable
 * — the worst a bad accent could do is be dull, and the tests stop that too.
 */
export function applyAccent(accent: Accent, root: HTMLElement | null = documentRoot()): void {
  if (!root) return;
  root.style.setProperty('--brand-purple', accent.main);
  root.style.setProperty('--brand-purple-dark', accent.deep);
}

/** Put the authored colours back, for when someone turns the feature off. */
export function clearAccent(root: HTMLElement | null = documentRoot()): void {
  if (!root) return;
  root.style.removeProperty('--brand-purple');
  root.style.removeProperty('--brand-purple-dark');
}

function documentRoot(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement;
}

/**
 * The whole feature in one call: pick today's palette and apply the half that
 * suits the current mode. Returns the palette so the UI can name it.
 */
export function applyDailyTheme(opts: {
  enabled: boolean;
  mode: 'dark' | 'light';
  salt?: string;
  date?: Date;
  root?: HTMLElement | null;
}): Palette | null {
  const root = opts.root === undefined ? documentRoot() : opts.root;
  if (!opts.enabled) {
    clearAccent(root);
    return null;
  }
  const palette = paletteForDay(opts.date ?? new Date(), opts.salt ?? '');
  applyAccent(opts.mode === 'light' ? palette.light : palette.dark, root);
  return palette;
}
