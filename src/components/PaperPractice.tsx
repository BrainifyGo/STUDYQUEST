import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import {
  LOSS_ADVICE, LOSS_LABELS,
  answerQuestion, attemptFor, goTo, lossBreakdown, markQuestion,
  nextUnanswered, progress, verdict,
  type PaperSession,
} from '../lib/paperSession';
import { blankResult, buildMarkingPrompt, isBlank, parseMarkingReply } from '../lib/markAnswer';
import { commandHint } from '../lib/commandWords';
import { saveSession } from '../lib/paperStore';
import { auth } from '../lib/firebase';
import { useUserStore } from '../store/useUserStore';
import { normaliseLevel, promptFor, resolveSubject } from '../lib/studyLevel';
import { ProGate } from './ProGate';

/**
 * Working through a past paper the student uploaded, one question at a time.
 *
 * The shape follows what RED asked for: the question, room to answer it, the
 * answer beside it once marked, and it is all still there tomorrow.
 *
 * Two things are deliberate.
 *
 * The answer is NOT shown before the student writes something. A model answer
 * visible next to a blank box is a reading exercise; the entire value of a past
 * paper is the attempt made before you see it.
 *
 * Marking is behind Pro, but READING the paper is not. A free account can upload
 * a paper, see every question, write answers and keep them. What Pro buys is the
 * examiner — which is the part that costs money per question and is genuinely
 * the hard thing to get elsewhere.
 */

interface Props {
  session: PaperSession;
  onChange: (next: PaperSession) => void;
  onExit: () => void;
}

export const PaperPractice: React.FC<Props> = ({ session, onChange, onExit }) => {
  const { userData } = useUserStore();
  const [marking, setMarking] = useState(false);
  const [draft, setDraft] = useState('');

  const question = session.questions[session.cursor];
  const attempt = question ? attemptFor(session, question.number) : null;
  const p = progress(session);

  // Load the saved answer whenever the question changes.
  useEffect(() => {
    setDraft(attempt?.answer ?? '');
  }, [session.cursor, attempt?.number]);   // eslint-disable-line react-hooks/exhaustive-deps

  /*
    Save on a pause rather than on every keystroke. A write per character would
    be both expensive and pointless; a write only on "next" loses the answer of
    anyone who closes the tab mid-question, which is exactly the person this
    feature is for.
  */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = (next: PaperSession) => {
    onChange(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveSession(next); }, 1200);
  };
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  if (!question || !attempt) {
    return (
      <div className="p-6 text-center text-text-dim">
        This paper has no questions in it.
        <button onClick={onExit} className="ml-2 underline">Go back</button>
      </div>
    );
  }

  const commit = (text: string) => persist(answerQuestion(session, question.number, text));

  const move = (delta: number) => {
    commit(draft);
    persist(goTo(answerQuestion(session, question.number, draft), session.cursor + delta));
  };

  const markThis = async () => {
    if (marking) return;
    const withAnswer = answerQuestion(session, question.number, draft);

    // Nothing written is not worth a model call, or a slice of the daily budget.
    if (isBlank(draft)) {
      persist(markQuestion(withAnswer, question.number, blankResult(question.marks ?? 1)));
      return;
    }

    setMarking(true);
    try {
      const level = userData?.studyLevel
        ? (() => {
            const lvl = normaliseLevel(userData.studyLevel);
            return promptFor(lvl, resolveSubject(lvl, session.subject) || 'this subject');
          })()
        : undefined;

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth.currentUser
            ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }
            : {}),
        },
        body: JSON.stringify({
          // The server enforces the gate against the verified token; the
          // ProGate below is only what the student sees.
          feature: 'paper-marking',
          prompt: buildMarkingPrompt({
            question,
            answer: draft,
            level,
            subject: session.subject,
            board: session.board,
          }),
        }),
      });

      if (res.status === 402) {
        toast.error('Marking is part of Pro.');
        return;
      }
      const { result } = await res.json();
      const marked = parseMarkingReply(result, question.marks ?? 1);
      persist(markQuestion(withAnswer, question.number, marked));
    } catch (err) {
      // parseMarkingReply throws rather than inventing a mark, and this is why:
      // a number nobody can trace is worse than being told it did not work.
      console.error('[marking]', err);
      toast.error('Could not mark that one. Try again in a moment.');
    } finally {
      setMarking(false);
    }
  };

  const hint = commandHint(question.text);
  const marked = attempt.awarded !== null;
  const line = verdict(session);
  const breakdown = lossBreakdown(session);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-24">
      {/* ── header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onExit} className="flex items-center gap-2 text-[13px] text-text-dim hover:text-text-main">
          <ArrowLeft size={16} /> Papers
        </button>
        <div className="text-right">
          <p className="text-[13px] font-bold">{session.paperTitle}</p>
          <p className="text-[11.5px] text-text-dim">
            {p.answered}/{p.total} answered
            {p.marked > 0 && ` · ${p.awarded}/${p.outOf} marks`}
            {p.percent !== null && ` · ${p.percent}%`}
          </p>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-glass-bg">
        <div
          className="h-full rounded-full bg-brand-purple transition-all"
          style={{ width: `${p.total ? (p.answered / p.total) * 100 : 0}%` }}
        />
      </div>

      {/* ── the question ───────────────────────────────────────── */}
      <div className="glass rounded-2xl border border-border-main p-5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-black uppercase tracking-widest text-brand-purple">
            Question {question.number}
          </span>
          {question.marks !== null && (
            <span className="text-[12px] text-text-dim">
              {question.marks} mark{question.marks === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{question.text}</p>
        {hint && <p className="mt-3 text-[12.5px] leading-relaxed text-text-dim">{hint}</p>}
      </div>

      {/* ── the answer ─────────────────────────────────────────── */}
      <div>
        <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-text-dim">
          Your answer
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          rows={6}
          placeholder="Write it as you would in the exam — including the working."
          className="w-full resize-y rounded-2xl border border-border-main bg-glass-bg p-4 text-[15px] leading-relaxed outline-none focus:border-brand-purple/50"
        />
      </div>

      {/* ── marking ────────────────────────────────────────────── */}
      {!marked ? (
        <ProGate feature="paper-marking">
          <button
            onClick={markThis}
            disabled={marking}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-purple px-4 py-3 font-black text-white transition-all disabled:opacity-60"
          >
            {marking ? <><Loader2 size={16} className="animate-spin" /> Marking…</> : 'Mark this answer'}
          </button>
        </ProGate>
      ) : (
        <div className="glass space-y-3 rounded-2xl border border-border-main p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-2xl font-black tabular-nums">
              {attempt.awarded}<span className="text-text-dim">/{attempt.available}</span>
            </span>
            <span className="rounded-lg bg-glass-bg px-2.5 py-1 text-[11px] font-black uppercase tracking-widest">
              {LOSS_LABELS[attempt.reason ?? 'correct']}
            </span>
          </div>

          {attempt.feedback && (
            <p className="text-[13.5px] leading-relaxed text-text-muted">{attempt.feedback}</p>
          )}
          {attempt.reason && attempt.reason !== 'correct' && (
            <p className="text-[12.5px] leading-relaxed text-text-dim">
              {LOSS_ADVICE[attempt.reason]}
            </p>
          )}

          {/* Only after they have answered — this is the point of a past paper. */}
          {attempt.modelAnswer && (
            <div className="rounded-xl border border-border-main bg-glass-bg p-3">
              <p className="mb-1 text-[11px] font-black uppercase tracking-widest text-text-dim">
                What earns the marks
              </p>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{attempt.modelAnswer}</p>
            </div>
          )}
        </div>
      )}

      {/* ── moving through ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => move(-1)}
          disabled={session.cursor === 0}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border-main px-4 text-sm font-bold text-text-dim disabled:opacity-40"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <span className="text-[12px] text-text-dim">
          {session.cursor + 1} of {session.questions.length}
        </span>
        <button
          onClick={() => move(1)}
          disabled={session.cursor >= session.questions.length - 1}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border-main px-4 text-sm font-bold disabled:opacity-40"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>

      {/* ── the post-mortem ────────────────────────────────────── */}
      {line && (
        <div className="glass space-y-3 rounded-2xl border border-border-main p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-text-dim">
            Where your marks are going
          </p>
          <p className="text-[13.5px] leading-relaxed">{line}</p>
          {breakdown.length > 0 && (
            <div className="space-y-1.5">
              {breakdown.map((b) => (
                <div key={b.reason} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span>{LOSS_LABELS[b.reason]}</span>
                  <span className="tabular-nums text-text-dim">−{b.lost} marks</span>
                </div>
              ))}
            </div>
          )}
          {p.complete && (
            <p className="flex items-center gap-2 text-[13px] font-bold text-emerald-400">
              <Check size={16} /> Paper finished — {p.awarded}/{p.paperTotal}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/** Where "resume" should drop the student back in. */
export const resumeAt = (session: PaperSession): PaperSession =>
  goTo(session, nextUnanswered(session));

export default PaperPractice;
