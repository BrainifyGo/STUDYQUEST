import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, X, Flame, Timer, Target, Heart, Trophy, Zap, Ghost, Loader2,
} from 'lucide-react';
import {
  MODES, startState, applyAnswer, tickClock, completionBonus, accuracy,
  type ModeId, type ModeState,
} from '../lib/gameModes';
import { listMistakes, asQuiz, recordMistake, retireMistake } from '../lib/mistakes';
import type { QuizQuestion } from '../App';

/**
 * THE ARCADE — Speed Run and Boss Battle, ported from ReviseGo.
 *
 * The rules live in `lib/gameModes.ts`; this only draws them and owns the clock.
 *
 * QUESTIONS COME FROM YOUR SAVED MISTAKES. That is deliberate: it costs no AI
 * call, it works offline, and it points the fun part of the app at the questions
 * you actually got wrong. A mode that generated fresh questions would burn tokens
 * to quiz you on things you already know.
 */

interface GameModeProps {
  onBack: () => void;
  onAwardXP: (xp: number) => void;
}

const shuffle = <T,>(a: T[]): T[] => {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export const GameMode: React.FC<GameModeProps> = ({ onBack, onAwardXP }) => {
  const [pool, setPool] = useState<QuizQuestion[] | null>(null);
  const [state, setState] = useState<ModeState | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [awarded, setAwarded] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listMistakes().then((m) => setPool(asQuiz(m)));
  }, []);

  // The clock. Cleared on unmount and whenever the round ends, or it keeps
  // counting in the background and fires after the player has left.
  useEffect(() => {
    if (!state || state.over || !state.mode.duration) return;
    tickRef.current = setInterval(() => setState((s) => (s ? tickClock(s) : s)), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [state?.mode.id, state?.over]);

  // Bank the XP once, when the round ends. Without the guard a re-render after
  // the round is over would award it again.
  useEffect(() => {
    if (!state?.over || awarded) return;
    setAwarded(true);
    onAwardXP(state.xp + completionBonus(state));
  }, [state?.over, awarded, state, onAwardXP]);

  const begin = useCallback((id: ModeId) => {
    if (!pool?.length) return;
    // Enough to keep a 60-second run going without repeating immediately.
    const deck = shuffle(pool);
    const filled = deck.length >= 25 ? deck : Array.from(
      { length: 25 }, (_, i) => deck[i % deck.length]
    );
    setAwarded(false);
    setPicked(null);
    setState(startState(MODES[id], filled));
  }, [pool]);

  const current = state && !state.over ? state.questions[state.index] : null;

  const choose = (option: string) => {
    if (!state || picked !== null || !current) return;
    setPicked(option);
    const right = option === current.correctAnswer;

    // The arcade feeds the same review loop as everything else: a wrong answer
    // here still lands in My Mistakes, and a right one still retires it.
    (right ? retireMistake(current) : recordMistake(current, option, 'Arcade'))
      .catch(() => { /* logged in mistakes.ts; never block the game */ });

    setTimeout(() => {
      setState((s) => (s ? applyAnswer(s, right) : s));
      setPicked(null);
    }, right ? 650 : 1500);
  };

  const bossPercent = useMemo(
    () => (state?.mode.bossHP ? Math.round((state.bossHP / state.mode.bossHP) * 100) : 0),
    [state?.bossHP, state?.mode.bossHP]
  );

  /* ── loading ─────────────────────────────────────────── */
  if (pool === null) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
        <Loader2 className="w-8 h-8 animate-spin text-brand-purple" />
      </div>
    );
  }

  const back = (
    <button
      onClick={state ? () => setState(null) : onBack}
      className="inline-flex items-center gap-2 text-text-dim hover:text-text-main transition-colors mb-6 text-sm font-medium"
    >
      <ArrowLeft className="w-4 h-4" />
      {state ? 'Leave the round' : 'Back'}
    </button>
  );

  /* ── mode picker ─────────────────────────────────────── */
  if (!state) {
    const enough = pool.length >= 4;
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-8">
        {back}
        <p className="text-xs uppercase tracking-[0.18em] text-brand-purple font-bold mb-1">Arcade</p>
        <h1 className="text-3xl font-bold text-text-main mb-2">Drill your mistakes</h1>
        <p className="text-text-dim mb-8">
          {enough
            ? `Both modes quiz you on the ${pool.length} question${pool.length === 1 ? '' : 's'} you've got wrong. Get one right and it leaves your list.`
            : 'You need a few saved mistakes to play. Answer some quiz questions wrong first — that is the pool.'}
        </p>

        {!enough && (
          <div className="rounded-2xl border border-dashed border-border-main p-10 text-center text-text-dim">
            Nothing to drill yet. Generate a quiz and get something wrong.
          </div>
        )}

        {enough && (
          <div className="grid gap-4 sm:grid-cols-2">
            {(['speed-run', 'boss-battle'] as ModeId[]).map((id) => {
              const m = MODES[id];
              const Icon = id === 'speed-run' ? Zap : Ghost;
              return (
                <button
                  key={id}
                  onClick={() => begin(id)}
                  className="text-left rounded-2xl border border-border-main bg-glass-bg p-6 hover:border-brand-purple transition-colors"
                >
                  <Icon className="w-7 h-7 text-brand-purple mb-3" />
                  <h2 className="text-lg font-bold text-text-main mb-1">{m.name}</h2>
                  <p className="text-sm text-text-dim">{m.blurb}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ── results ─────────────────────────────────────────── */
  if (state.over) {
    const bonus = completionBonus(state);
    const stats: [React.ReactNode, string | number, string][] = [
      [<Target key="a" className="w-5 h-5" />, state.score, state.mode.scoreLabel],
      [<Trophy key="b" className="w-5 h-5" />, `${accuracy(state)}%`, 'accuracy'],
      [<Flame key="c" className="w-5 h-5" />, state.bestCombo, 'best combo'],
      [<Zap key="d" className="w-5 h-5" />, state.xp + bonus, 'XP earned'],
    ];
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-8 text-center">
        <h1 className="text-3xl font-bold text-text-main mb-2">{state.outcome}</h1>
        <p className="text-text-dim mb-8">
          {state.correct} of {state.answered} correct
          {bonus > 0 && <span className="text-brand-purple"> · +{bonus} bonus XP</span>}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {stats.map(([icon, value, label]) => (
            <div key={label} className="rounded-2xl border border-border-main bg-glass-bg p-5">
              <div className="flex justify-center text-brand-purple mb-2">{icon}</div>
              <div className="text-2xl font-bold text-text-main">{value}</div>
              <div className="text-xs text-text-dim">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={() => begin(state.mode.id)}
            className="px-6 py-3 rounded-xl bg-brand-purple text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Run it again
          </button>
          <button
            onClick={() => setState(null)}
            className="px-6 py-3 rounded-xl border border-border-main text-text-main font-semibold hover:bg-glass-bg transition-colors"
          >
            Back to the arcade
          </button>
        </div>
      </div>
    );
  }

  /* ── playing ─────────────────────────────────────────── */
  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-8">
      {back}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {state.mode.duration > 0 && (
          <Cell
            icon={<Timer className="w-4 h-4" />}
            value={state.timeLeft}
            label="seconds"
            urgent={state.timeLeft <= 10}
          />
        )}
        {state.mode.bossHP > 0 && (
          <Cell icon={<Heart className="w-4 h-4" />} value={state.playerHP} label="health"
                urgent={state.playerHP <= 1} />
        )}
        <Cell icon={<Target className="w-4 h-4" />} value={state.score} label={state.mode.scoreLabel} />
        <Cell icon={<Flame className="w-4 h-4" />} value={state.combo} label="combo"
              hot={state.combo >= 3} />
      </div>

      {state.mode.bossHP > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-text-dim mb-1">
            <span>Boss</span><span>{bossPercent}%</span>
          </div>
          <div className="h-3 rounded-full bg-black/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-300"
              style={{ width: `${bossPercent}%` }}
            />
          </div>
        </div>
      )}

      {current && (
        <>
          <div className="rounded-2xl border border-border-main bg-glass-bg p-6 mb-5">
            <h2 className="text-lg font-medium text-text-main">{current.question}</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {current.options.map((opt, i) => {
              const isAnswer = opt === current.correctAnswer;
              const chosen = picked === opt;
              const reveal = picked !== null;
              return (
                <button
                  key={i}
                  onClick={() => choose(opt)}
                  disabled={reveal}
                  className={`p-4 rounded-xl text-sm text-left border flex items-start gap-2 transition-all ${
                    reveal && isAnswer
                      ? 'bg-green-500/20 border-green-500/50 text-green-400'
                      : reveal && chosen
                        ? 'bg-red-500/20 border-red-500/50 text-red-400'
                        : 'bg-glass-bg border-border-main text-text-muted hover:text-text-main hover:border-brand-purple'
                  }`}
                >
                  {/* A tick or a cross, not colour alone — green and red are close to
                      indistinguishable for red-green colourblindness. */}
                  {reveal && (isAnswer
                    ? <Check className="w-4 h-4 shrink-0 mt-0.5" aria-label="Correct answer" />
                    : chosen
                      ? <X className="w-4 h-4 shrink-0 mt-0.5" aria-label="Your answer, incorrect" />
                      : <span className="w-4 shrink-0" aria-hidden="true" />)}
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 min-h-[3rem]" role="status" aria-live="polite">
            {picked !== null && (
              <div className={`p-4 rounded-xl text-sm ${
                picked === current.correctAnswer
                  ? 'bg-green-500/10 text-green-400/90'
                  : 'bg-red-500/10 text-red-400/90'
              }`}>
                <span className="font-bold">
                  {picked === current.correctAnswer ? 'Correct. ' : `-${state.mode.wrongPenalty || 1}. `}
                </span>
                {current.explanation}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const Cell: React.FC<{
  icon: React.ReactNode; value: React.ReactNode; label: string;
  urgent?: boolean; hot?: boolean;
}> = ({ icon, value, label, urgent, hot }) => (
  <div className={`rounded-xl border bg-glass-bg p-3 text-center ${
    urgent ? 'border-red-500/60' : hot ? 'border-orange-500/60' : 'border-border-main'
  }`}>
    <div className={`flex justify-center mb-1 ${
      urgent ? 'text-red-400' : hot ? 'text-orange-400' : 'text-brand-purple'
    }`}>{icon}</div>
    <div className={`text-xl font-bold tabular-nums ${
      urgent ? 'text-red-400' : 'text-text-main'
    }`}>{value}</div>
    <div className="text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
  </div>
);

export default GameMode;
