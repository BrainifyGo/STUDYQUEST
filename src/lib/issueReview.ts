import {
  CATEGORY_LABELS, type IssueCategory, type IssueReport, type Severity,
} from './issueReport';

/**
 * The two-month review.
 *
 * A report page without this is a suggestion box nobody empties. The whole
 * argument for asking students to write reports is that every two months
 * somebody reads them **in order of how often the same thing happened** and
 * fixes the top of the list.
 *
 * So this turns a pile of reports into the one page that decision needs. Pure
 * functions over an array — no dates fetched, no store, no side effects — so the
 * summary can be produced from a live query, a CSV, or a test.
 */

/** Two months, the cycle RED asked for. */
export const REVIEW_DAYS = 61;

export interface Cluster {
  fingerprint: string;
  /** The clearest title among the reports, used as the cluster's name. */
  title: string;
  category: IssueCategory;
  count: number;
  worstSeverity: Severity;
  /** Still open — a cluster where everything is fixed is history, not work. */
  open: number;
  ids: string[];
  firstSeen: string;
  lastSeen: string;
}

export interface ReviewSummary {
  from: string;
  to: string;
  total: number;
  /** Problems, grouped and ranked by how many students hit them. */
  problems: Cluster[];
  /** Ideas, kept apart: they are a different decision. */
  suggestions: Cluster[];
  byCategory: { category: IssueCategory; count: number }[];
  bySeverity: Record<Severity, number>;
  /** Reports nobody has touched. */
  untouched: number;
  headline: string | null;
}

const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

const worse = (a: Severity, b: Severity): Severity =>
  SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;

/** Reports created within `days` of `now`. */
export function withinWindow(
  reports: IssueReport[],
  now: Date = new Date(),
  days = REVIEW_DAYS,
): IssueReport[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return (reports ?? []).filter((r) => {
    const t = Date.parse(r?.created_at ?? '');
    return Number.isFinite(t) && t >= cutoff && t <= now.getTime();
  });
}

function cluster(reports: IssueReport[]): Cluster[] {
  const groups = new Map<string, IssueReport[]>();
  for (const r of reports) {
    const key = r.fingerprint || `${r.category}:unspecified`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  return [...groups.entries()].map(([fp, list]) => {
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return {
      fingerprint: fp,
      /*
        The longest title wins. Among a dozen reports of the same fault, the one
        that took the trouble to describe it is the most useful label — "quiz
        stuck on loading forever" beats "broken".
      */
      title: [...list].sort((a, b) => b.title.length - a.title.length)[0].title,
      category: list[0].category,
      count: list.length,
      worstSeverity: list.reduce<Severity>((s, r) => worse(s, r.severity), 'low'),
      open: list.filter((r) => !['fixed', 'verified', 'closed'].includes(r.status)).length,
      ids: list.map((r) => r.id),
      firstSeen: sorted[0].created_at,
      lastSeen: sorted[sorted.length - 1].created_at,
    };
  });
}

/**
 * Rank clusters for the review.
 *
 * Count leads, because the whole point is to fix what most students hit. But a
 * single `critical` outranks three cosmetic reports — somebody locked out of an
 * account they paid for is not a queue position.
 */
function rank(a: Cluster, b: Cluster): number {
  const weight = (c: Cluster) =>
    c.count + (c.worstSeverity === 'critical' ? 5 : c.worstSeverity === 'high' ? 2 : 0);
  return weight(b) - weight(a) || b.count - a.count || a.title.localeCompare(b.title);
}

export function reviewSummary(
  reports: IssueReport[],
  now: Date = new Date(),
  days = REVIEW_DAYS,
): ReviewSummary {
  const window = withinWindow(reports, now, days);

  const problems = cluster(window.filter((r) => r.category !== 'suggestion')).sort(rank);
  const suggestions = cluster(window.filter((r) => r.category === 'suggestion'))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));

  const counts = new Map<IssueCategory, number>();
  for (const r of window) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);

  const bySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of window) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;

  return {
    from: new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    total: window.length,
    problems,
    suggestions,
    byCategory: [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    bySeverity,
    untouched: window.filter((r) => r.status === 'new').length,
    headline: headlineFor(window.length, problems),
  };
}

/**
 * One sentence naming what to fix first, or null.
 *
 * Null when a single report is the top of the list — one student hitting
 * something is not a pattern, and dressing it up as "the top problem this cycle"
 * would make the review look like theatre.
 */
function headlineFor(total: number, problems: Cluster[]): string | null {
  if (!total || !problems.length) return null;
  const top = problems[0];
  if (top.count < 2) return null;

  const share = Math.round((top.count / total) * 100);
  return `${top.count} of ${total} reports were the same problem — ${top.title.toLowerCase()}`
    + `${share >= 20 ? `, ${share}% of everything sent this cycle` : ''}. Fix that first.`;
}

/** The review as plain text, for pasting into a doc or an email. */
export function formatReview(summary: ReviewSummary): string {
  const lines: string[] = [
    'STUDYQUEST — TWO MONTH REVIEW',
    `${summary.from} to ${summary.to}`,
    '',
    `Reports received: ${summary.total}`,
    `Still untouched:  ${summary.untouched}`,
    '',
  ];

  if (summary.headline) lines.push(summary.headline, '');

  if (summary.problems.length) {
    lines.push('Top problems:');
    summary.problems.slice(0, 10).forEach((c, i) => {
      const flag = c.worstSeverity === 'critical' ? '  [CRITICAL]'
        : c.worstSeverity === 'high' ? '  [high]' : '';
      lines.push(`${i + 1}. ${c.title} — ${c.count} report${c.count === 1 ? '' : 's'}${flag}`);
    });
    lines.push('');
  }

  if (summary.suggestions.length) {
    lines.push('Most asked for:');
    summary.suggestions.slice(0, 5)
      .forEach((c) => lines.push(`• ${c.title} — ${c.count}`));
    lines.push('');
  }

  if (summary.byCategory.length) {
    lines.push('By category:');
    summary.byCategory.forEach(({ category, count }) =>
      lines.push(`  ${String(count).padStart(4)}  ${CATEGORY_LABELS[category]}`));
  }

  return lines.join('\n');
}
