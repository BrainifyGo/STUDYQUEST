import React, { useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { listLessons } from '../lib/lessonStore';
import { listSessions } from '../lib/paperStore';
import { listAttempts } from '../lib/confidenceStore';
import { listMistakes } from '../lib/mistakes';
import { riskiestTopics } from '../lib/confidence';
import { progress as paperProgress } from '../lib/paperSession';
import { whatNext, type StudentState, type Suggestion } from '../lib/nextUp';

/**
 * The one thing to do next, at the top of the home screen.
 *
 * The dashboard has always shown what StudyQuest can DO — make a kit, open a
 * paper, play the arcade. That is a menu, and a menu is exactly what a student
 * with twenty minutes and no idea where to start does not need.
 *
 * Every reason on screen is a fact this app already knows: how far into a lesson
 * they stopped, how many questions they were sure about and still got wrong, how
 * many days until an exam they entered. Where there is nothing to go on it says
 * so — see nextUp.ts, where that rule is the point rather than a nicety.
 */

interface Props {
  onGo: (view: string, suggestion: Suggestion) => void;
}

const TONE: Record<string, string> = {
  'exam-soon': 'border-amber-500/40 bg-amber-500/[0.07]',
  'finish-lesson': 'border-brand-purple/40 bg-brand-purple/[0.07]',
  'blind-spot': 'border-red-500/35 bg-red-500/[0.06]',
  'finish-paper': 'border-brand-purple/30 bg-brand-purple/[0.05]',
  mistakes: 'border-border-main bg-glass-bg',
  'first-step': 'border-dashed border-border-main bg-glass-bg',
};

export const NextUp: React.FC<Props> = ({ onGo }) => {
  const [list, setList] = useState<Suggestion[] | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!auth.currentUser) { setList(null); return; }

      /*
        Everything at once, and every one allowed to fail on its own. A student
        with no exams saved should still be told about their unfinished lesson —
        one empty collection must not take the whole panel down.
      */
      const [lessons, papers, attempts, mistakes, exams] = await Promise.all([
        listLessons().catch(() => []),
        listSessions().catch(() => []),
        listAttempts().catch(() => []),
        listMistakes().catch(() => []),
        (async () => {
          try {
            const snap = await getDocs(query(
              collection(db, 'exams'),
              where('userId', '==', auth.currentUser!.uid),
            ));
            return snap.docs.map((d) => ({
              id: d.id,
              subject: String(d.data().subject ?? ''),
              date: String(d.data().date ?? ''),
            }));
          } catch { return []; }
        })(),
      ]);

      if (!alive) return;

      const state: StudentState = {
        lessons: lessons.map((l) => ({
          id: l.id,
          topic: l.topic,
          steps: l.steps.length,
          done: l.steps.filter(
            (_, i) => (l.progress.cleared[i] ?? 0) >= l.steps[i].checks.length,
          ).length,
        })),
        papers: papers.map((p) => {
          const prog = paperProgress(p);
          return {
            id: p.id, paperTitle: p.paperTitle,
            answered: prog.answered, total: prog.total,
          };
        }),
        blindSpots: riskiestTopics(attempts).map((t) => ({
          topic: t.topic, blindSpots: t.blindSpots,
        })),
        mistakes: mistakes.map((m) => ({ subject: m.subject })),
        exams,
      };

      setList(whatNext(state));
    })();

    return () => { alive = false; };
  }, []);

  if (!auth.currentUser) return null;

  if (list === null) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-2xl border border-border-main bg-glass-bg p-5 text-[13px] text-text-dim">
        <Loader2 size={15} className="animate-spin" /> Working out what to do next&hellip;
      </div>
    );
  }

  const [top, ...rest] = list;

  return (
    <section className="mb-6" aria-label="What to study next">
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-text-dim">
        Do this next
      </p>

      <button
        onClick={() => onGo(top.view, top)}
        className={`flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition-all hover:border-brand-purple ${
          TONE[top.kind] ?? TONE.mistakes
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-black leading-tight">{top.title}</span>
          {/* The fact that produced it, never a generality. */}
          <span className="mt-1 block text-[13.5px] leading-relaxed text-text-muted">
            {top.why}
          </span>
        </span>
        <ArrowRight size={20} className="shrink-0 opacity-60" />
      </button>

      {rest.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {rest.slice(0, 3).map((s) => (
            <button
              key={`${s.kind}-${s.id ?? s.title}`}
              onClick={() => onGo(s.view, s)}
              title={s.why}
              className="rounded-xl border border-border-main bg-glass-bg px-3 py-2 text-[12.5px] text-text-dim transition-all hover:text-text-main"
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default NextUp;
