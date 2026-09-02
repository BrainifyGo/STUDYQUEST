import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Wand2 } from 'lucide-react';
import {
  DEFAULT_QUESTIONS, MAX_QUESTIONS, MIN_QUESTIONS,
  buildPaperPrompt, paperTitle, parseGeneratedPaper, specId, totalMarks,
  type PaperSpec,
} from '../lib/generatePaper';
import { startSession, type PaperSession } from '../lib/paperSession';
import { auth } from '../lib/firebase';
import { useUserStore } from '../store/useUserStore';
import {
  normaliseLevel, promptFor, resolveSubject, tierFor,
} from '../lib/studyLevel';
import { ProGate } from './ProGate';
import type { Board } from '../lib/examPaper';

/**
 * Ask for a practice paper on a topic.
 *
 * This is the half of "past questions" StudyQuest is allowed to have. It does
 * not hold a library of real papers — those belong to the exam boards — it
 * writes new questions in the style of the specification, which is what every
 * revision guide has always done.
 *
 * The output is the same `ExamQuestion[]` an uploaded PDF produces, so it drops
 * straight into the practice flow: answer, mark, and the same post-mortem about
 * where the marks went.
 */

const SUBJECTS = [
  'Maths', 'Biology', 'Chemistry', 'Physics', 'Combined Science',
  'English Language', 'English Literature', 'History', 'Geography',
  'Computer Science', 'Business', 'French', 'Spanish',
];

const BOARDS: Board[] = ['AQA', 'Edexcel', 'OCR', 'WJEC'];

interface Props {
  onReady: (session: PaperSession) => void;
}

export const GeneratePaper: React.FC<Props> = ({ onReady }) => {
  const { userData } = useUserStore();
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [topic, setTopic] = useState('');
  const [board, setBoard] = useState<Board | ''>('');
  const [count, setCount] = useState(DEFAULT_QUESTIONS);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const level = userData?.studyLevel ? normaliseLevel(userData.studyLevel) : null;
      const key = level ? resolveSubject(level, subject) : subject;

      const spec: PaperSpec = {
        subject,
        topic: topic.trim() || undefined,
        board: board || null,
        count,
        // Pitched at their year and set, so a Year 8 and a Year 11 asking for
        // "electrolysis" do not get the same paper.
        level: level ? promptFor(level, key) : undefined,
        tier: level ? tierFor(level, key) : null,
      };

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth.currentUser
            ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }
            : {}),
        },
        body: JSON.stringify({
          feature: 'paper-marking',   // same entitlement: the examiner half
          prompt: buildPaperPrompt(spec),
        }),
      });

      if (res.status === 402) {
        toast.error('Practice papers are part of Pro.');
        return;
      }

      const { result } = await res.json();
      const { questions, rejected } = parseGeneratedPaper(result);

      // Say when some were dropped. Silently returning four questions for a
      // six-question request looks like the app miscounted.
      if (rejected.length) {
        toast.message(`${rejected.length} question${rejected.length === 1 ? '' : 's'} came back unusable and were left out.`);
      }

      onReady(startSession({
        id: specId(spec),
        paperTitle: paperTitle(spec),
        board: spec.board ?? null,
        subject: spec.subject,
        questions,
      }));
      toast.success(`${questions.length} questions · ${totalMarks(questions)} marks`);
    } catch (err) {
      // parseGeneratedPaper throws rather than showing an empty paper.
      console.error('[generate-paper]', err);
      toast.error(err instanceof Error ? err.message : 'Could not write that paper.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass space-y-4 rounded-2xl border border-border-main p-5">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-black tracking-tight">
          <Wand2 size={18} className="text-brand-purple" /> Write me a practice paper
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
          New exam-style questions on any topic, pitched at your year and set, marked the
          same way as a paper you upload.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-widest text-text-dim">
            Subject
          </span>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
          >
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-widest text-text-dim">
            Exam board
          </span>
          <select
            value={board}
            onChange={(e) => setBoard(e.target.value as Board | '')}
            className="min-h-11 w-full rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
          >
            <option value="">Any</option>
            {BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-black uppercase tracking-widest text-text-dim">
          Topic <span className="font-medium normal-case tracking-normal">(optional)</span>
        </span>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. electrolysis, trigonometry, the Cold War"
          className="min-h-11 w-full rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-text-dim">
          How many questions — {count}
        </span>
        <input
          type="range"
          min={MIN_QUESTIONS}
          max={MAX_QUESTIONS}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-full accent-brand-purple"
        />
      </label>

      <ProGate feature="paper-marking">
        <button
          onClick={generate}
          disabled={busy}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-purple px-4 py-3 font-black text-white transition-all disabled:opacity-60"
        >
          {busy
            ? <><Loader2 size={16} className="animate-spin" /> Writing your paper…</>
            : 'Write the paper'}
        </button>
      </ProGate>

      <p className="text-[11.5px] leading-relaxed text-text-dim">
        These are original questions written in the style of the specification — not copies
        of real exam papers, which belong to the boards.
      </p>
    </div>
  );
};

export default GeneratePaper;
