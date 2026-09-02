import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { KIND_LABELS, type Insight, type InsightKind } from '../lib/examinerReport';
import { listInsights } from '../lib/insightStore';
import { useUserStore } from '../store/useUserStore';
import { normaliseLevel } from '../lib/studyLevel';
import { isAdminUser } from '../lib/isAdmin';
import { InsightCard, KIND_ICONS } from './InsightCard';
import { MineReport } from './MineReport';

/**
 * What examiners actually say about the exam students are about to sit.
 *
 * The whole value of this screen is that it is NOT StudyQuest's opinion. Every
 * card carries the paper and session it came from and a link to the report
 * itself — see InsightCard, where that is deliberately not small print.
 */

const ORDER: InsightKind[] = ['mistake', 'misconception', 'command-word', 'technique', 'rewarded'];

interface Props {
  onBack: () => void;
}

export const ExaminerInsights: React.FC<Props> = ({ onBack }) => {
  const { userData } = useUserStore();
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [kind, setKind] = useState<InsightKind | ''>('');

  const load = useCallback(() => {
    listInsights().then(setInsights).catch(() => setInsights([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  /*
    Admin-only mining tool, shown on this screen rather than its own so there is
    one place where insights live. Cosmetic: firestore.rules is what actually
    refuses a publish from anyone else. See src/lib/isAdmin.ts.
  */
  const admin = isAdminUser(userData);

  /* The student's own subjects, so theirs come first. */
  const mySubjects = useMemo(() => {
    if (!userData?.studyLevel) return new Set<string>();
    return new Set(Object.keys(normaliseLevel(userData.studyLevel).sets));
  }, [userData?.studyLevel]);

  const shown = useMemo(() => {
    const list = (insights ?? []).filter((i) => !kind || i.kind === kind);
    return [...list].sort((a, b) => {
      const mine = (i: Insight) => (mySubjects.has(i.source.subject.toLowerCase()) ? 1 : 0);
      return mine(b) - mine(a)
        || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)
        || a.topic.localeCompare(b.topic);
    });
  }, [insights, kind, mySubjects]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-24">
      <button onClick={onBack} className="flex items-center gap-2 text-[13px] text-text-dim hover:text-text-main">
        <ArrowLeft size={16} /> Back
      </button>

      <div>
        <h2 className="text-2xl font-black tracking-tight">What examiners say</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-text-dim">
          Every year the exam boards publish a report on each paper saying where students
          lost marks. Almost nobody reads them &mdash; they are eleven pages of PDF written
          for teachers. These are the parts that are worth your time.
        </p>
      </div>

      {admin && (
        <div className="rounded-2xl border border-dashed border-border-main p-4">
          <MineReport onDone={load} />
        </div>
      )}

      {insights === null && <p className="text-[13px] text-text-dim">Loading&hellip;</p>}

      {insights?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border-main p-5 text-[13.5px] leading-relaxed text-text-dim">
          Nothing here yet. Examiner reports are being read and added subject by subject &mdash;
          in the meantime you can read them yourself from the exam board links on the
          Papers screen.
        </p>
      )}

      {insights && insights.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setKind('')}
              aria-pressed={kind === ''}
              className={`min-h-11 rounded-xl border px-3 text-[13px] font-bold transition-all ${
                kind === '' ? 'border-brand-purple bg-brand-purple/20 text-brand-purple'
                  : 'border-border-main bg-glass-bg text-text-dim hover:text-text-main'
              }`}
            >
              Everything
            </button>
            {ORDER.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`min-h-11 rounded-xl border px-3 text-[13px] font-bold transition-all ${
                  kind === k ? 'border-brand-purple bg-brand-purple/20 text-brand-purple'
                    : 'border-border-main bg-glass-bg text-text-dim hover:text-text-main'
                }`}
              >
                {KIND_ICONS[k]} {KIND_LABELS[k]}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {shown.map((i) => <InsightCard key={i.id} insight={i} />)}
          </div>
        </>
      )}
    </div>
  );
};

export default ExaminerInsights;
