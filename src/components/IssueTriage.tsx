import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, RefreshCw } from 'lucide-react';
import {
  CATEGORY_LABELS, STATUS_LABELS,
  type IssueCategory, type IssueReport, type IssueStatus, type Severity,
} from '../lib/issueReport';
import { REVIEW_DAYS, formatReview, reviewSummary } from '../lib/issueReview';
import { allReports, updateReport } from '../lib/issueStore';

/**
 * What students told us is broken, and what to do about it first.
 *
 * THE SCREEN THAT MAKES THE REPORT BUTTON HONEST. StudyQuest has asked students
 * to write reports for weeks with nowhere for anybody to read them — which makes
 * "Report an issue" a suggestion box nobody empties, and that is worse than not
 * asking at all.
 *
 * The two-month review sits at the top because it is the decision: not "here are
 * 40 reports" but "eleven students hit the same thing, fix that first". The
 * individual reports are underneath for when you actually work on one.
 *
 * A report's own words are never edited here. Only status, severity and the
 * team's notes move — changing what a student wrote and then acting on it would
 * make the whole collection worthless as a record of what was said.
 */

const STATUSES: IssueStatus[] = [
  'new', 'investigating', 'planned', 'in-progress', 'fixed', 'verified', 'closed',
];
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];

const SEVERITY_TONE: Record<Severity, string> = {
  low: 'text-text-dim',
  medium: 'text-text-main',
  high: 'text-amber-400',
  critical: 'text-red-400',
};

const OPEN_STATUSES: IssueStatus[] = ['new', 'investigating', 'planned', 'in-progress'];

export const IssueTriage: React.FC = () => {
  const [reports, setReports] = useState<IssueReport[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [category, setCategory] = useState<IssueCategory | ''>('');
  const [saving, setSaving] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const all = await allReports();
      setReports(all);
      setNotes(Object.fromEntries(all.map((r) => [r.id, r.notes ?? ''])));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(
    () => reviewSummary(reports ?? [], new Date()),
    [reports],
  );

  const shown = useMemo(() => {
    let list = [...(reports ?? [])];
    if (!showAll) list = list.filter((r) => OPEN_STATUSES.includes(r.status));
    if (category) list = list.filter((r) => r.category === category);
    return list.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }, [reports, showAll, category]);

  const patch = async (
    r: IssueReport, changes: { status?: IssueStatus; severity?: Severity; notes?: string },
  ) => {
    setSaving(r.id);
    const ok = await updateReport(r.id, changes);
    setSaving(null);
    if (!ok) { toast.error('Could not save that.'); return; }
    setReports((prev) => (prev ?? []).map(
      (x) => (x.id === r.id ? { ...x, ...changes } as IssueReport : x),
    ));
  };

  const copyReview = async () => {
    try {
      await navigator.clipboard.writeText(formatReview(summary));
      toast.success('Review copied — paste it wherever you keep notes.');
    } catch {
      toast.error('Could not copy it.');
    }
  };

  if (reports === null) {
    return <p className="px-4 py-6 text-[13px] text-text-dim">Loading reports&hellip;</p>;
  }

  return (
    <div className="space-y-5">
      {/* ── the two-month review: the decision, not the pile ────────────── */}
      <section className="overflow-hidden rounded-2xl border border-border-main bg-glass-bg">
        <h3 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-main px-4 py-3">
          <span className="text-[12.5px] font-black uppercase tracking-[0.12em]">
            The last {REVIEW_DAYS} days
          </span>
          <span className="text-[11.5px] text-text-dim">
            {summary.from} to {summary.to}
          </span>
        </h3>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-4 text-[13px]">
            <span><strong className="font-black">{summary.total}</strong> reports</span>
            <span className={summary.untouched > 0 ? 'text-amber-400' : 'text-text-dim'}>
              <strong className="font-black">{summary.untouched}</strong> nobody has looked at
            </span>
            {summary.bySeverity.critical > 0 && (
              <span className="text-red-400">
                <strong className="font-black">{summary.bySeverity.critical}</strong> critical
              </span>
            )}
          </div>

          {summary.headline ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-[13.5px] leading-relaxed">
              {summary.headline}
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-text-dim">
              {/* Deliberately not dressed up: one student hitting something is not
                  a pattern, and calling it "the top problem" would be theatre. */}
              {summary.total === 0
                ? 'Nothing reported in this window.'
                : 'No single problem stands out yet — nothing has been reported twice.'}
            </p>
          )}

          {summary.problems.length > 0 && (
            <div>
              <p className="mb-2 text-[11.5px] font-black uppercase tracking-widest text-text-dim">
                Ranked by how many students hit it
              </p>
              <div className="space-y-1.5">
                {summary.problems.slice(0, 8).map((c, i) => (
                  <div key={c.fingerprint}
                       className="flex items-baseline gap-3 border-b border-border-main/40 pb-1.5 last:border-b-0">
                    <span className="w-4 shrink-0 text-[12px] tabular-nums text-text-dim">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-[13.5px]">{c.title}</span>
                    <span className={`shrink-0 text-[11.5px] ${SEVERITY_TONE[c.worstSeverity]}`}>
                      {c.worstSeverity === 'critical' ? 'CRITICAL'
                        : c.worstSeverity === 'high' ? 'high' : ''}
                    </span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums">
                      {c.count}
                    </span>
                    {c.open === 0 && (
                      <span className="shrink-0 text-[11px] text-emerald-400">done</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.suggestions.length > 0 && (
            <div>
              <p className="mb-2 text-[11.5px] font-black uppercase tracking-widest text-text-dim">
                Most asked for
              </p>
              {summary.suggestions.slice(0, 5).map((c) => (
                <div key={c.fingerprint} className="flex justify-between gap-3 py-1 text-[13px]">
                  <span className="min-w-0">{c.title}</span>
                  <span className="shrink-0 font-bold tabular-nums">{c.count}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void copyReview()}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border-main px-3 text-[13px] font-bold"
            >
              <Copy size={14} /> Copy the review
            </button>
            <button
              onClick={() => void load()}
              disabled={busy}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border-main px-3 text-[13px] font-bold disabled:opacity-60"
            >
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </section>

      {/* ── the reports themselves ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowAll(!showAll)}
          aria-pressed={showAll}
          className={`min-h-11 rounded-xl border px-3 text-[13px] font-bold ${
            showAll ? 'border-brand-purple bg-brand-purple/20 text-brand-purple'
              : 'border-border-main bg-glass-bg text-text-dim'
          }`}
        >
          {showAll ? 'Showing everything' : 'Open only'}
        </button>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as IssueCategory | '')}
          className="min-h-11 rounded-xl border border-border-main bg-glass-bg px-3 text-[13px]"
        >
          <option value="">Every category</option>
          {(Object.keys(CATEGORY_LABELS) as IssueCategory[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <span className="text-[12.5px] text-text-dim">{shown.length} shown</span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-main p-5 text-[13.5px] leading-relaxed text-text-dim">
          {reports.length === 0
            ? 'No reports yet. The button exists on every screen — when a student uses it, it lands here.'
            : 'Nothing open in that filter.'}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <article key={r.id} className="rounded-2xl border border-border-main bg-glass-bg p-4">
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={`text-[11px] font-black uppercase tracking-widest ${SEVERITY_TONE[r.severity]}`}>
                  {r.severity}
                </span>
                <span className="text-[11px] uppercase tracking-widest text-text-dim">
                  {CATEGORY_LABELS[r.category]}
                </span>
                <span className="ml-auto text-[11.5px] tabular-nums text-text-dim">
                  {(r.created_at ?? '').slice(0, 10)}
                </span>
              </div>

              <p className="text-[14px] font-bold">{r.title}</p>
              <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-text-muted">
                {r.description}
              </p>

              {r.context && (
                <p className="mt-2 text-[11.5px] text-text-dim">
                  {[r.context.view, r.context.browser, r.context.appVersion]
                    .filter(Boolean).join(' · ')}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={r.status}
                  onChange={(e) => void patch(r, { status: e.target.value as IssueStatus })}
                  className="min-h-11 rounded-xl border border-border-main bg-glass-bg px-2.5 text-[12.5px]"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <select
                  value={r.severity}
                  onChange={(e) => void patch(r, { severity: e.target.value as Severity })}
                  className="min-h-11 rounded-xl border border-border-main bg-glass-bg px-2.5 text-[12.5px]"
                >
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {saving === r.id && <Loader2 size={14} className="animate-spin text-text-dim" />}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  onBlur={() => {
                    if ((notes[r.id] ?? '') !== (r.notes ?? '')) {
                      void patch(r, { notes: notes[r.id] ?? '' });
                    }
                  }}
                  placeholder="Note for the team — what you found, what you decided"
                  className="min-h-11 flex-1 rounded-xl border border-border-main bg-glass-bg px-3 text-[13px]"
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default IssueTriage;
