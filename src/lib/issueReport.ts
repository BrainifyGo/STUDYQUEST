/**
 * Students reporting what is broken.
 *
 * The point of this is not the form. It is that every two months RED and Daniel
 * can read what actually went wrong for real students, in order of how often it
 * happened, instead of guessing. So the shape here is built around **counting**:
 * a report that cannot be grouped with the twelve others saying the same thing
 * is a report nobody will act on.
 *
 * What it must not become is a channel for abuse or for leaking other people's
 * data. Reports are written by teenagers about a product they are frustrated
 * with, and read later by two people. Nothing here stores anything the student
 * did not type, beyond the technical context named in `TechnicalContext` — which
 * is listed explicitly rather than being "whatever the browser gives us".
 */

export type IssueCategory =
  | 'bug'
  | 'wrong-content'
  | 'question-problem'
  | 'broken-link'
  | 'billing'
  | 'design'
  | 'performance'
  | 'suggestion'
  | 'other';

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  bug: 'Something is broken',
  'wrong-content': 'A study kit was wrong',
  'question-problem': 'A question was wrong or unfair',
  'broken-link': 'A link did not work',
  billing: 'Payment or subscription',
  design: 'Something looks wrong',
  performance: 'Slow or stuck',
  suggestion: 'An idea',
  other: 'Something else',
};

/** Ordered as a student would scan them, commonest first. */
export const CATEGORIES: IssueCategory[] = [
  'bug', 'question-problem', 'wrong-content', 'performance',
  'design', 'broken-link', 'billing', 'suggestion', 'other',
];

export type IssueStatus =
  | 'new' | 'investigating' | 'planned' | 'in-progress' | 'fixed' | 'verified' | 'closed';

export const STATUS_LABELS: Record<IssueStatus, string> = {
  new: 'New',
  investigating: 'Investigating',
  planned: 'Planned',
  'in-progress': 'In progress',
  fixed: 'Fixed',
  verified: 'Verified',
  closed: 'Closed',
};

export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Context collected automatically.
 *
 * Named explicitly, one field at a time, rather than sweeping up whatever is on
 * `navigator`. A bug report is not a licence to fingerprint someone, and the
 * team only needs enough to reproduce the fault.
 */
export interface TechnicalContext {
  /** Which screen they were on. */
  view: string;
  /** "Chrome 141 on Android" — not the full UA string. */
  browser: string;
  /** Phone or desktop, from the viewport rather than the UA. */
  screen: string;
  appVersion: string;
  reportedAt: string;
}

export interface IssueReport {
  id: string;
  user_id: string;
  category: IssueCategory;
  title: string;
  description: string;
  context: TechnicalContext;
  status: IssueStatus;
  severity: Severity;
  /** Set by the team, never by the student. */
  notes: string;
  /** Groups duplicates: reports sharing this are the same underlying problem. */
  fingerprint: string;
  created_at: string;
  updated_at: string;
}

export const MAX_TITLE = 120;
export const MIN_DESCRIPTION = 15;
export const MAX_DESCRIPTION = 4000;

export interface ValidationResult {
  ok: boolean;
  errors: Partial<Record<'title' | 'description' | 'category', string>>;
}

/**
 * Check a report before it is sent.
 *
 * The description minimum is the one rule that earns its keep. "it dosnt work"
 * is not actionable, and the difference between that and one more sentence is
 * the difference between a report that gets fixed and one that gets counted and
 * forgotten. The message says so rather than just refusing.
 */
export function validateReport(input: {
  title?: string;
  description?: string;
  category?: string;
}): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  const title = (input.title ?? '').trim();
  if (!title) errors.title = 'Give it a short title so we can find it again.';
  else if (title.length > MAX_TITLE) errors.title = `Keep the title under ${MAX_TITLE} characters.`;

  const description = (input.description ?? '').trim();
  if (description.length < MIN_DESCRIPTION) {
    errors.description = 'Tell us what you were doing and what happened — a sentence is enough.';
  } else if (description.length > MAX_DESCRIPTION) {
    errors.description = 'That is longer than we can store. Trim it to the important part.';
  }

  if (!CATEGORIES.includes(input.category as IssueCategory)) {
    errors.category = 'Pick the closest category.';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * A key that groups reports about the same thing.
 *
 * THE FEATURE LIVES OR DIES ON THIS. Two hundred individually-written reports
 * are noise; "41 reports about question loading" is a decision. So the title is
 * reduced to its meaningful words — lowercased, stripped of punctuation, numbers
 * and filler — and paired with the category.
 *
 * Deliberately crude. It over-groups occasionally, which costs a moment's
 * reading, and under-groups occasionally, which costs a duplicate row. Both are
 * better than a clustering scheme nobody can predict or explain.
 */
const FILLER = new Set([
  'the', 'a', 'an', 'is', 'it', 'in', 'on', 'and', 'or', 'to', 'of', 'my', 'i',
  'for', 'this', 'that', 'with', 'when', 'was', 'not', 'but', 'get', 'gets',
  'got', 'am', 'are', 'be', 'been', 'its', 'app', 'studyquest', 'please', 'cant',
]);

export function fingerprint(category: string, title: string): string {
  const words = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !FILLER.has(w))
    .sort();

  const key = [...new Set(words)].slice(0, 5).join('-');
  return `${category}:${key || 'unspecified'}`;
}

/** Read the browser without fingerprinting the person. */
export function readContext(view: string, appVersion = 'unknown'): TechnicalContext {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;

  const browser = (() => {
    const name = /Edg\//.test(ua) ? 'Edge'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /Firefox\//.test(ua) ? 'Firefox'
      : /Safari\//.test(ua) ? 'Safari'
      : 'Unknown browser';
    const version = ua.match(/(?:Edg|Chrome|Firefox|Version)\/(\d+)/)?.[1] ?? '';
    const os = /Android/.test(ua) ? 'Android'
      : /iPhone|iPad/.test(ua) ? 'iOS'
      : /Windows/.test(ua) ? 'Windows'
      : /Mac OS/.test(ua) ? 'macOS'
      : /Linux/.test(ua) ? 'Linux'
      : 'unknown OS';
    return `${name}${version ? ` ${version}` : ''} on ${os}`;
  })();

  const width = typeof window === 'undefined' ? 0 : window.innerWidth;
  const screen = width === 0 ? 'unknown'
    : width < 768 ? `phone (${width}px)`
    : width < 1024 ? `tablet (${width}px)`
    : `desktop (${width}px)`;

  return {
    view: view || 'unknown',
    browser,
    screen,
    appVersion,
    reportedAt: new Date().toISOString(),
  };
}

/**
 * How urgent a report is, before a human has looked.
 *
 * A first guess only — the team can change it. Billing and "I cannot get in" sit
 * above cosmetics because somebody is losing money or access, and a suggestion
 * is never urgent however strongly it is worded.
 */
export function suggestSeverity(category: IssueCategory, description: string): Severity {
  const text = String(description ?? '').toLowerCase();

  const blocked = /can.?t (log ?in|sign ?in|get in|access)|locked out|lost (all|my) |deleted my|charged twice|took my money|nothing loads|completely broken|crash/i
    .test(text);

  if (category === 'billing') return blocked ? 'critical' : 'high';
  if (blocked) return 'critical';
  if (category === 'bug' || category === 'question-problem' || category === 'wrong-content') {
    return 'high';
  }
  if (category === 'performance' || category === 'broken-link') return 'medium';
  return 'low';
}
