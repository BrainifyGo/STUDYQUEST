import React from 'react';
import { Check, Timer, Trophy, X } from 'lucide-react';
import DuelArena2D from './DuelArena2D';
import type { DuelArenaEvent, DuelSide } from './DuelArena3D';

/*
  The 3D arena is Pro and lazy, so a free account never downloads a byte of it.
*/
const DuelArena3D = React.lazy(() => import('./DuelArena3D'));

/**
 * THE DUEL SCREEN, with no idea who it is fighting.
 *
 * Extracted so the bot duel and the live duel against a friend look and behave
 * identically. They were going to be two components rendering "the same" thing,
 * which is how two things stop being the same — one gets a fix, the other keeps
 * the bug, and the difference shows up as "it looks different online".
 *
 * It owns no state and no rules. Health, the clock, whose turn it is to be
 * surprised: all passed in. That is what lets a bot duel drive it from
 * `duel.ts` and a live duel drive it from a socket.
 */

export interface DuelStageProps {
  youName: string;
  foeName: string;
  youHp: number;
  foeHp: number;
  round: number;
  rounds: number;
  /** Whole seconds left on the clock. */
  secondsLeft: number;
  subject?: string;
  question: string;
  options: string[];
  /** The option this player chose, '' for a timeout, null while still open. */
  picked: string | null;
  /** Revealed only once the round has closed. */
  correctAnswer: string | null;
  /** The line under the answers. Whatever the caller wants to say happened. */
  verdict: React.ReactNode;
  event: DuelArenaEvent;
  canUse3D: boolean;
  onChoose: (option: string) => void;
  /** Shown while waiting for the other person — live duels only. */
  opponentAnswered?: boolean;
}

const HealthBar: React.FC<{
  name: string; hp: number; side: DuelSide; leading: boolean;
}> = ({ name, hp, side, leading }) => {
  const isYou = side === 'you';
  const pct = Math.max(0, Math.min(100, hp));
  return (
    <div className={`flex-1 min-w-0 ${isYou ? '' : 'text-right'}`}>
      <div className={`flex items-center gap-2 mb-1 ${isYou ? '' : 'flex-row-reverse'}`}>
        <span
          className="w-6 h-6 rounded-full shrink-0"
          style={{ background: isYou ? '#3db4fa' : '#b85afa' }}
          aria-hidden="true"
        />
        <span className="text-xs font-bold truncate text-text-main">{name}</span>
        {leading && <Trophy className="w-3 h-3 text-yellow-400 shrink-0" aria-label="Leading" />}
      </div>
      <div className={`h-2 rounded-full bg-white/10 overflow-hidden ${isYou ? '' : 'flex justify-end'}`}>
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            // Turns amber then red as it drops, so the state of the duel is
            // readable from colour before the number is read.
            background: pct > 55 ? (isYou ? '#3db4fa' : '#b85afa')
              : pct > 25 ? '#f59e0b' : '#ef4444',
          }}
        />
      </div>
      <div className="text-[10px] mt-0.5 tabular-nums text-text-dim">{pct} HP</div>
    </div>
  );
};

export const DuelStage: React.FC<DuelStageProps> = ({
  youName, foeName, youHp, foeHp, round, rounds, secondsLeft, subject,
  question, options, picked, correctAnswer, verdict, event, canUse3D,
  onChoose, opponentAnswered,
}) => {
  const [webglFailed, setWebglFailed] = React.useState(false);
  // Stable identity: handing a canvas component a fresh callback on every
  // render tore down and rebuilt the WebGL context ten times a second. See the
  // note in DuelArena3D.
  const onUnsupported = React.useCallback(() => setWebglFailed(true), []);
  const show3D = canUse3D && !webglFailed;

  const urgent = secondsLeft <= 3 && picked === null;
  const loser = youHp <= 0 ? 'you' : foeHp <= 0 ? 'foe' : null;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-chrome">
      {/* Health, names, round and clock stay in HTML rather than being drawn
          into the canvas: a screen reader can read them and zoom does not blur
          them. */}
      <div className="flex items-start gap-3 mb-3">
        <HealthBar name={youName} hp={youHp} side="you" leading={youHp > foeHp} />

        <div className="shrink-0 text-center px-2">
          <div className="text-[10px] uppercase tracking-widest text-text-dim">
            Round {round}/{rounds}
          </div>
          <div
            className={`text-3xl font-bold tabular-nums leading-none ${urgent ? 'text-red-400' : 'text-text-main'}`}
            role="timer"
            aria-live="off"
          >
            {secondsLeft}
          </div>
        </div>

        <HealthBar name={foeName} hp={foeHp} side="foe" leading={foeHp > youHp} />
      </div>

      <div className="h-52 sm:h-64 mb-4 rounded-2xl overflow-hidden">
        {show3D ? (
          <React.Suspense fallback={
            <DuelArena2D youHpPct={youHp} foeHpPct={foeHp} event={event} loser={loser} />
          }>
            <DuelArena3D
              youHpPct={youHp} foeHpPct={foeHp} event={event}
              loser={loser} onUnsupported={onUnsupported}
            />
          </React.Suspense>
        ) : (
          <DuelArena2D youHpPct={youHp} foeHpPct={foeHp} event={event} loser={loser} />
        )}
      </div>

      <div className="rounded-2xl border border-border-main bg-glass-bg p-5 mb-4 text-center">
        {subject && (
          <span className="inline-block mb-2 px-2 py-0.5 rounded-full bg-brand-purple/20 text-brand-purple text-[10px] font-bold uppercase tracking-widest">
            {subject}
          </span>
        )}
        <h2 className="text-base sm:text-lg font-medium text-text-main">{question}</h2>
      </div>

      <div className="grid gap-3 grid-cols-2">
        {options.map((opt, i) => {
          const reveal = correctAnswer !== null;
          const isAnswer = opt === correctAnswer;
          const chosen = picked === opt;
          return (
            <button
              key={i}
              onClick={() => onChoose(opt)}
              disabled={picked !== null}
              className={`p-4 rounded-xl text-sm text-center border font-semibold transition-all ${
                reveal && isAnswer
                  ? 'bg-green-500/20 border-green-500/50 text-green-400'
                  : reveal && chosen
                    ? 'bg-red-500/20 border-red-500/50 text-red-400'
                    : chosen
                      ? 'bg-brand-purple/20 border-brand-purple text-text-main'
                      : 'bg-glass-bg border-border-main text-text-muted hover:text-text-main hover:border-brand-purple disabled:opacity-50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                {/* A tick or a cross as well as the colour — green and red are
                    close to indistinguishable for red-green colourblindness. */}
                {reveal && (isAnswer
                  ? <Check className="w-4 h-4 shrink-0" aria-label="Correct answer" />
                  : chosen
                    ? <X className="w-4 h-4 shrink-0" aria-label="Your answer, incorrect" />
                    : null)}
                {opt}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 min-h-[3.5rem]" role="status" aria-live="polite">
        {verdict}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-text-dim">
        <Timer className="w-3 h-3" />
        {/*
          In a live duel the wait after answering is the tense bit, so say what
          is being waited for rather than leaving the screen looking frozen.
        */}
        {picked !== null && opponentAnswered === false
          ? `Waiting for ${foeName}…`
          : 'Answer faster to hit harder'}
      </div>
    </div>
  );
};

export default DuelStage;
