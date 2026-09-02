import React from 'react';
import { ExternalLink } from 'lucide-react';
import { KIND_LABELS, citation, type Insight, type InsightKind } from '../lib/examinerReport';

/**
 * One examiner insight, with where it came from attached.
 *
 * In its own file because both screens that show insights need it — the browse
 * list and the admin mining tool — and the mining tool is rendered BY the browse
 * list. Left where it was, that made an import cycle.
 *
 * The citation is part of the card rather than small print at the bottom of the
 * page, and it links out. "Examiners say students confuse osmosis with
 * diffusion" is only worth reading if the student can go and check that a real
 * examiner really said it.
 */

export const KIND_ICONS: Record<InsightKind, string> = {
  mistake: '⚠',
  misconception: '🧠',
  rewarded: '⭐',
  'command-word': '📝',
  technique: '📈',
};

const KIND_TONE: Record<InsightKind, string> = {
  mistake: 'border-red-500/30 bg-red-500/[0.05]',
  misconception: 'border-amber-500/30 bg-amber-500/[0.05]',
  rewarded: 'border-emerald-500/30 bg-emerald-500/[0.05]',
  'command-word': 'border-brand-purple/30 bg-brand-purple/[0.05]',
  technique: 'border-white/15 bg-white/[0.03]',
};

export const InsightCard: React.FC<{ insight: Insight; compact?: boolean }> = ({
  insight, compact = false,
}) => (
  <article className={`rounded-2xl border p-4 ${KIND_TONE[insight.kind]}`}>
    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-[11px] font-black uppercase tracking-widest">
        <span aria-hidden>{KIND_ICONS[insight.kind]}</span> {KIND_LABELS[insight.kind]}
      </span>
      <span className="text-[13px] font-bold">{insight.topic}</span>
    </div>

    <p className="text-[13.5px] leading-relaxed">{insight.issue}</p>

    {!compact && (
      <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
        <strong className="font-bold">What to do:</strong> {insight.practise}
      </p>
    )}

    <a
      href={insight.source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-text-dim underline decoration-dotted hover:text-text-main"
    >
      {citation(insight.source)}
      <ExternalLink size={12} aria-hidden />
      <span className="sr-only">(opens the examiner report on the exam board website)</span>
    </a>
  </article>
);

export default InsightCard;
