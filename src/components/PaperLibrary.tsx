import React, { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Trash2 } from 'lucide-react';
import { progress, type PaperSession } from '../lib/paperSession';
import { deleteSession, listSessions } from '../lib/paperStore';
import { resumeAt } from './PaperPractice';
import { GeneratePaper } from './GeneratePaper';
import { ExamResources } from './ExamResources';

/**
 * Papers on the go, and a way to start a new one.
 *
 * This is the screen "come back later" actually lands on. A session that saved
 * perfectly and cannot be found again has not been saved in any sense that
 * matters to the student, so the library is part of the feature rather than a
 * nicety on top of it.
 *
 * Resuming goes to the first UNANSWERED question, not to question one and not to
 * wherever the cursor happened to stop. Someone returning after a day wants the
 * next thing to do.
 */

interface Props {
  onOpen: (session: PaperSession) => void;
  onBack: () => void;
}

export const PaperLibrary: React.FC<Props> = ({ onOpen, onBack }) => {
  const [sessions, setSessions] = useState<PaperSession[] | null>(null);

  const refresh = () => {
    listSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  };
  useEffect(refresh, []);

  const remove = async (id: string) => {
    setSessions((prev) => (prev ?? []).filter((s) => s.id !== id));
    await deleteSession(id);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-[13px] text-text-dim hover:text-text-main">
          <ArrowLeft size={16} /> Home
        </button>
      </div>

      <div>
        <h2 className="text-2xl font-black tracking-tight">Past papers</h2>
        <p className="text-[13px] text-text-dim">
          Upload one you already have from the dashboard, or have one written for you.
        </p>
      </div>

      <GeneratePaper onReady={(s) => onOpen(s)} />

      {/*
        The boards' own material, beside the practice tools rather than on a page
        of its own. A student looking for a past paper is in exactly one frame of
        mind, and splitting "papers we generate" from "papers the board
        publishes" across two screens serves the org chart, not them.
      */}
      <div className="glass rounded-2xl border border-border-main p-5">
        <ExamResources />
      </div>

      <div>
        <h3 className="mb-3 text-[11px] font-black uppercase tracking-widest text-text-dim">
          Papers you have started
        </h3>

        {sessions === null && <p className="text-[13px] text-text-dim">Loading&hellip;</p>}

        {sessions?.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border-main p-5 text-[13px] text-text-dim">
            Nothing yet. Anything you start is saved here automatically, so you can stop
            halfway through a paper and pick it up tomorrow.
          </p>
        )}

        <div className="space-y-2">
          {(sessions ?? []).map((s) => {
            const p = progress(s);
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-2xl border border-border-main bg-glass-bg p-4"
              >
                <FileText size={18} className="shrink-0 text-brand-purple" />
                <button
                  onClick={() => onOpen(resumeAt(s))}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-bold">{s.paperTitle}</span>
                  <span className="mt-0.5 block text-[12px] text-text-dim">
                    {p.answered}/{p.total} answered
                    {p.marked > 0 && ` · ${p.awarded}/${p.outOf} marks`}
                    {p.complete && ' · finished'}
                  </span>
                </button>
                <button
                  onClick={() => remove(s.id)}
                  aria-label={`Delete ${s.paperTitle}`}
                  className="shrink-0 rounded-lg p-2 text-text-dim transition-colors hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PaperLibrary;
