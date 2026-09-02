import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Check, HelpCircle, Loader2, Sparkles,
} from 'lucide-react';
import {
  STYLE_LABELS, advance, buildAskPrompt, buildLessonPrompt, canAdvance,
  encourage, isCorrect, lessonProgress, parseLesson, praise, recordCheck,
  startLesson, stepDone,
  type Game, type LearningStyle, type Lesson, type LessonProgress,
} from '../lib/lesson';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useUserStore } from '../store/useUserStore';
import { normaliseLevel, promptFor, resolveSubject } from '../lib/studyLevel';

/**
 * Learning a topic the way a teacher teaches it: bit by bit.
 *
 * The shape is the method, not decoration. One step on screen at a time, a
 * short piece of teaching, then questions on exactly that, and the Next button
 * stays shut until they are answered. A student cannot scroll ahead, because
 * being able to scroll ahead is what makes a study kit a document rather than a
 * lesson.
 *
 * The games are built from the step's own content — order the lines of the
 * method, find the wrong line, pair the terms. StudyQuest already has XP, an
 * arcade and boss battles; those are points bolted onto anything. A game here
 * should be impossible to play without having read the step above it.
 */

interface Props {
  onBack: () => void;
}

/** Deterministic shuffle, so the pieces do not jump on every keystroke. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed + 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── the games ────────────────────────────────────────────────────────────── */

const GamePanel: React.FC<{ game: Game; seed: number; onWin: () => void }> = ({
  game, seed, onWin,
}) => {
  const [picked, setPicked] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);
  const [wrong, setWrong] = useState<number | null>(null);

  const pieces = useMemo(
    () => shuffled(game.items.map((text, i) => ({ text, i })), seed),
    [game.items, seed],
  );

  const win = () => { if (!done) { setDone(true); onWin(); } };

  const body = () => {
    switch (game.kind) {
      case 'order':
        return (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {picked.map((idx) => (
                <span key={idx} className="rounded-lg bg-brand-purple/20 px-2.5 py-1.5 text-[13px]">
                  {game.items[idx]}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {pieces.filter((p) => !picked.includes(p.i)).map((p) => (
                <button
                  key={p.i}
                  onClick={() => {
                    const next = [...picked, p.i];
                    setPicked(next);
                    // Correct when they have rebuilt the original order.
                    if (next.length === game.items.length) {
                      if (next.every((v, k) => v === k)) win();
                      else { toast.error('Not quite — try that order again.'); setPicked([]); }
                    }
                  }}
                  disabled={done}
                  className="min-h-11 rounded-lg border border-border-main bg-glass-bg px-3 text-[13px] hover:border-brand-purple"
                >
                  {p.text}
                </button>
              ))}
            </div>
          </>
        );

      case 'spot':
        return (
          <div className="space-y-2">
            {game.items.map((line, i) => (
              <button
                key={i}
                onClick={() => {
                  if (done) return;
                  if (i === game.answer) win();
                  else { setWrong(i); toast.error('That line is fine. Look again.'); }
                }}
                className={`block w-full rounded-lg border px-3 py-2.5 text-left font-mono text-[13px] ${
                  done && i === game.answer ? 'border-emerald-500 bg-emerald-500/10'
                    : wrong === i ? 'border-red-500/50'
                    : 'border-border-main bg-glass-bg hover:border-brand-purple'
                }`}
              >
                {line}
              </button>
            ))}
          </div>
        );

      case 'match': {
        const pairs = game.items.map((it) => {
          const [term, meaning] = it.split('::');
          return { term: (term ?? '').trim(), meaning: (meaning ?? '').trim() };
        });
        const meanings = shuffled(pairs.map((p, i) => ({ ...p, i })), seed + 7);
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              {pairs.map((p, i) => (
                <div key={i}
                     className={`rounded-lg border px-3 py-2 text-[13px] ${
                       picked.includes(i) ? 'border-emerald-500 bg-emerald-500/10'
                         : 'border-border-main bg-glass-bg'}`}>
                  {p.term}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {meanings.map((m) => (
                <button
                  key={m.i}
                  disabled={done || picked.includes(m.i)}
                  onClick={() => {
                    const next = [...picked, m.i];
                    setPicked(next);
                    if (next.length === pairs.length) win();
                  }}
                  className={`block w-full rounded-lg border px-3 py-2 text-left text-[13px] ${
                    picked.includes(m.i) ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-border-main bg-glass-bg hover:border-brand-purple'}`}
                >
                  {m.meaning}
                </button>
              ))}
            </div>
          </div>
        );
      }

      case 'fill':
        return (
          <div className="space-y-3">
            {game.items.map((line, i) => (
              <p key={i} className="font-mono text-[13.5px]">{line}</p>
            ))}
            <div className="flex flex-wrap gap-2">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={done}
                placeholder="what goes in the gap"
                className="min-h-11 flex-1 rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
              />
              <button
                onClick={() => {
                  if (isCorrect(typed, String(game.answer ?? ''))) win();
                  else toast.error('Not that one — have another go.');
                }}
                disabled={done}
                className="min-h-11 rounded-xl bg-brand-purple px-4 font-bold text-white disabled:opacity-60"
              >
                Check
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="rounded-2xl border border-brand-purple/30 bg-brand-purple/[0.05] p-4">
      <p className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-widest text-brand-purple">
        <Sparkles size={13} /> {done ? 'Got it' : game.instruction}
      </p>
      {body()}
    </div>
  );
};

/* ── the lesson ───────────────────────────────────────────────────────────── */

export const LessonPlayer: React.FC<Props> = ({ onBack }) => {
  const { userData, setUserData } = useUserStore();
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState<LessonProgress>(startLesson());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const style: LearningStyle = userData?.learningStyle ?? 'gentle';
  const [asking, setAsking] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [replies, setReplies] = useState<Record<number, { q: string; a: string }[]>>({});

  const teach = async () => {
    if (!topic.trim() || busy) return;
    setBusy(true);
    try {
      const level = userData?.studyLevel
        ? (() => {
            const lvl = normaliseLevel(userData.studyLevel);
            return promptFor(lvl, resolveSubject(lvl, topic) || 'this subject');
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
          feature: 'study-kit',
          prompt: buildLessonPrompt({ topic: topic.trim(), level, style }),
        }),
      });
      const { result, error } = await res.json();
      if (!res.ok) throw new Error(error ?? 'Could not build that lesson.');

      const { lesson: built, rejected } = parseLesson(result, topic.trim());
      setLesson(built);
      setProgress(startLesson());
      setAnswers({});
      setShown({});
      if (rejected.length) {
        // Worth knowing: it usually means the model wrote an essay and most of
        // it was thrown away for not being steps.
        console.warn('[lesson] dropped steps:', rejected);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build that lesson.');
    } finally {
      setBusy(false);
    }
  };

  const setStyle = async (next: LearningStyle) => {
    if (!userData || !auth.currentUser) return;
    // Same path Settings uses to save a preference, which is known to pass the
    // rules; a learning style is the student's own choice about their own account.
    setUserData({ ...userData, learningStyle: next });
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { learningStyle: next });
    } catch {
      toast.error('Could not save that, but it applies to this lesson.');
    }
  };

  /*
    The student's own question, mid-lesson.

    "The student can be released to ask questions, and be welcomed." A lesson
    where the only permitted questions are the app's own is a worksheet, and a
    child who cannot ask is a child quietly getting lost.
  */
  const askQuestion = async () => {
    const q = asking.trim();
    if (!q || askBusy || !lesson) return;
    setAskBusy(true);
    try {
      const level = userData?.studyLevel
        ? (() => {
            const lvl = normaliseLevel(userData.studyLevel);
            return promptFor(lvl, resolveSubject(lvl, lesson.topic) || 'this subject');
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
          feature: 'study-kit',
          prompt: buildAskPrompt({
            topic: lesson.topic,
            step: lesson.steps[progress.cursor].teach,
            question: q,
            level,
          }),
        }),
      });
      const { result, error } = await res.json();
      if (!res.ok) throw new Error(error ?? 'Could not answer that just now.');
      setReplies((prev) => ({
        ...prev,
        [progress.cursor]: [...(prev[progress.cursor] ?? []), { q, a: String(result).trim() }],
      }));
      setAsking('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not answer that just now.');
    } finally {
      setAskBusy(false);
    }
  };

  if (!lesson) {
    return (
      <div className="mx-auto max-w-xl space-y-5 p-4 pb-24">
        <button onClick={onBack} className="flex items-center gap-2 text-[13px] text-text-dim hover:text-text-main">
          <ArrowLeft size={16} /> Back
        </button>
        <div>
          <h2 className="text-2xl font-black tracking-tight">Teach me something</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-text-dim">
            One small piece at a time, with a question after each one &mdash; not a wall
            of notes. Name a topic and we start at the beginning.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void teach(); }}
            placeholder="Quadratic equations, oxbow lakes, the water cycle…"
            className="min-h-11 flex-1 rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
          />
          <button
            onClick={() => void teach()}
            disabled={busy || !topic.trim()}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-purple px-4 font-black text-white disabled:opacity-60"
          >
            {busy ? <><Loader2 size={15} className="animate-spin" /> Planning…</> : 'Start'}
          </button>
        </div>
        <div>
          <p className="mb-2 text-[11.5px] font-black uppercase tracking-widest text-text-dim">
            How do you like to be taught?
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STYLE_LABELS) as LearningStyle[]).map((k) => (
              <button
                key={k}
                onClick={() => void setStyle(k)}
                aria-pressed={style === k}
                className={`min-h-11 rounded-xl border px-3 text-[13px] font-bold transition-all ${
                  style === k ? 'border-brand-purple bg-brand-purple/20 text-brand-purple'
                    : 'border-border-main bg-glass-bg text-text-dim hover:text-text-main'
                }`}
              >
                {STYLE_LABELS[k]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-text-dim">
            You can change this whenever you like. Nobody else sees it.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {['Quadratic equations', 'Osmosis', 'Simultaneous equations', 'Photosynthesis']
            .map((t) => (
              <button key={t} onClick={() => setTopic(t)}
                      className="rounded-lg border border-border-main bg-glass-bg px-2.5 py-1.5 text-[12.5px] text-text-dim hover:text-text-main">
                {t}
              </button>
            ))}
        </div>
      </div>
    );
  }

  const index = progress.cursor;
  const step = lesson.steps[index];
  const p = lessonProgress(lesson, progress);
  const ready = canAdvance(lesson, progress);
  const last = index === lesson.steps.length - 1;

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => setLesson(null)} className="flex items-center gap-2 text-[13px] text-text-dim hover:text-text-main">
          <ArrowLeft size={16} /> New topic
        </button>
        <p className="text-[12.5px] text-text-dim">
          Step {p.step} of {p.total} &middot; {lesson.topic}
        </p>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-glass-bg">
        <div className="h-full rounded-full bg-brand-purple transition-all"
             style={{ width: `${p.percent}%` }} />
      </div>

      {/* the teaching — deliberately large and short */}
      <div className="glass rounded-2xl border border-border-main p-5">
        {step.teach.split('\n').filter(Boolean).map((line, i) => (
          <p key={i} className="mb-2 text-[15px] leading-relaxed last:mb-0">{line}</p>
        ))}
      </div>

      {/* questions on exactly that */}
      <div className="space-y-3">
        {step.checks.map((c, i) => {
          const key = `${index}-${i}`;
          const revealed = shown[key];
          const right = revealed && isCorrect(answers[key] ?? '', c.answer);
          return (
            <div key={key} className="rounded-2xl border border-border-main bg-glass-bg p-4">
              <p className="mb-2 text-[13.5px] font-bold">{c.question}</p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={answers[key] ?? ''}
                  onChange={(e) => setAnswers({ ...answers, [key]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || revealed) return;
                    setShown({ ...shown, [key]: true });
                    setProgress((prev) => recordCheck(prev, index));
                  }}
                  disabled={revealed}
                  placeholder="your answer"
                  className="min-h-11 flex-1 rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
                />
                {!revealed && (
                  <button
                    onClick={() => {
                      setShown({ ...shown, [key]: true });
                      // Counted whether right or wrong: the step is about having
                      // tried and then seeing the answer, not about scoring.
                      setProgress((prev) => recordCheck(prev, index));
                    }}
                    className="min-h-11 rounded-xl border border-border-main px-3 text-[13px] font-bold"
                  >
                    Check
                  </button>
                )}
              </div>
              {revealed && (
                <div className={`mt-3 rounded-xl border p-3 ${
                  right ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                        : 'border-amber-500/30 bg-amber-500/[0.06]'}`}>
                  <p className="text-[13px] font-bold">
                    {/* Never the word "wrong". See encourage() — this is the
                        moment that decides whether a child carries on. */}
                    {right ? praise(index + i) : `${encourage(index + i)} ${c.answer}`}
                  </p>
                  {c.because && (
                    <p className="mt-1 text-[13px] leading-relaxed text-text-dim">{c.because}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* the hand going up */}
      <div className="rounded-2xl border border-border-main bg-glass-bg p-4">
        <p className="mb-2 flex items-center gap-2 text-[12px] font-black uppercase tracking-widest text-text-dim">
          <HelpCircle size={13} /> Stuck on something? Just ask
        </p>
        {(replies[index] ?? []).map((r, i) => (
          <div key={i} className="mb-3">
            <p className="text-[13px] font-bold">{r.q}</p>
            <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-text-muted">
              {r.a}
            </p>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <input
            value={asking}
            onChange={(e) => setAsking(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void askQuestion(); }}
            disabled={askBusy}
            placeholder="Why does that work? What if it was negative?"
            className="min-h-11 flex-1 rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
          />
          <button
            onClick={() => void askQuestion()}
            disabled={askBusy || !asking.trim()}
            className="min-h-11 rounded-xl border border-border-main px-3 text-[13px] font-bold disabled:opacity-50"
          >
            {askBusy ? <Loader2 size={15} className="animate-spin" /> : 'Ask'}
          </button>
        </div>
        <p className="mt-2 text-[11.5px] text-text-dim">
          Asking is the right thing to do &mdash; it never counts against you.
        </p>
      </div>

      {step.game && (
        <GamePanel game={step.game} seed={index} onWin={() => toast.success('Nice.')} />
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-text-dim">
          {ready ? (last ? 'That is the last step.' : 'Ready for the next bit.')
                 : 'Answer the questions above to carry on.'}
        </p>
        {!last ? (
          <button
            onClick={() => setProgress((prev) => advance(lesson, prev))}
            disabled={!ready}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-purple px-4 font-black text-white disabled:opacity-40"
          >
            Next <ArrowRight size={16} />
          </button>
        ) : (
          stepDone(lesson, progress, index) && (
            <button
              onClick={() => setLesson(null)}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-purple px-4 font-black text-white"
            >
              <Check size={16} /> Done
            </button>
          )
        )}
      </div>
    </div>
  );
};

export default LessonPlayer;
