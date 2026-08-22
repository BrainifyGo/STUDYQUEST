import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, X, Swords, Timer, Trophy, Zap, Users } from 'lucide-react';
import {
  BOT_PROFILES, DUEL_MAX_HP, DUEL_ROUND_SECONDS,
  currentQuestion, resolveRound, startDuel, tally,
  type Answer, type DuelDifficulty, type DuelState,
} from '../lib/duel';
import type { QuizQuestion } from '../App';
import { playSfx } from '../lib/arcadeSound';
import DuelArena2D from './DuelArena2D';
import type { DuelArenaEvent, DuelSide } from './DuelArena3D';

/*
  The 3D arena is Pro and lazy, so a free account never downloads a byte of it.
  Same arrangement as the boss arena.
*/
const DuelArena3D = React.lazy(() => import('./DuelArena3D'));

/**
 * DUEL — the screen.
 *
 * The rules are in `lib/duel.ts` and are tested on their own; this owns the
 * clock, the animation and the layout, and nothing else. Same split as the rest
 * of the Arcade.
 *
 * WHAT THE CLOCK IS FOR. Answering is not scored on right/wrong alone — how
 * fast you were sets the damage. So the round records the moment the question
 * appeared and measures against it, rather than counting ticks: a tab that gets
 * backgrounded, a slow frame or a paused timer would all quietly change the
 * damage if the number came from a counter.
 *
 * THE OPPONENT COMMITTED ITS ANSWER WHEN THE ROUND BEGAN. It cannot see yours.
 * That is enforced in the rules module, not here — see the note there.
 */

interface DuelModeProps {
  questions: QuizQuestion[];
  subject?: string;
  youName?: string;
  onBack: () => void;
  onAwardXP: (xp: number) => void;
  canUse3D: boolean;
  sfxOn: boolean;
}

/** How long the answer stays revealed before the next round. */
const REVEAL_MS = 1900;

const OPPONENTS: Array<{
  id: DuelDifficulty; name: string; blurb: string;
}> = [
  { id: 'rookie', name: 'Rookie', blurb: 'Gets about half of them. A fair first fight.' },
  { id: 'rival', name: 'Rival', blurb: 'Quick and usually right. The real test.' },
  { id: 'nemesis', name: 'Nemesis', blurb: 'Fast and rarely wrong. You have to be both.' },
];

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

export const DuelMode: React.FC<DuelModeProps> = ({
  questions, subject, youName, onBack, onAwardXP, canUse3D, sfxOn,
}) => {
  const [difficulty, setDifficulty] = useState<DuelDifficulty | null>(null);
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(DUEL_ROUND_SECONDS);
  const [event, setEvent] = useState<DuelArenaEvent>({ id: 0, winner: null, traded: false });
  const [awarded, setAwarded] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  // Stable identity. The arena guards itself against a changing callback now,
  // but handing a fresh function to a canvas component ten times a second was
  // the bug — not worth relying on the other side to keep absorbing it.
  const onUnsupported = useCallback(() => setWebglFailed(true), []);

  /** When the current round's question appeared. The clock is measured, not counted. */
  const roundStart = useRef(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTick = useRef(0);

  const begin = useCallback((id: DuelDifficulty) => {
    const opponent = OPPONENTS.find((o) => o.id === id)!;
    setDifficulty(id);
    setDuel(startDuel(questions.slice(0, 7), {
      youName: youName || 'You',
      foeName: opponent.name,
      difficulty: id,
      // A different duel every time, but still reproducible from the seed if we
      // ever want replays or a shared seed for two real players.
      seed: Math.floor(Math.random() * 0xffffffff) || 1,
    }));
    setPicked(null);
    setAwarded(false);
    setEvent({ id: 0, winner: null, traded: false });
    setSecondsLeft(DUEL_ROUND_SECONDS);
    roundStart.current = performance.now();
  }, [questions, youName]);

  /* ── The round clock ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!duel || duel.over || picked !== null) return;
    const tick = setInterval(() => {
      const elapsed = (performance.now() - roundStart.current) / 1000;
      const left = Math.max(0, DUEL_ROUND_SECONDS - elapsed);
      setSecondsLeft(left);
      const whole = Math.ceil(left);
      if (sfxOn && whole <= 3 && whole > 0 && whole !== lastTick.current) {
        lastTick.current = whole;
        playSfx('tick');
      }
    }, 100);
    return () => clearInterval(tick);
  }, [duel, duel?.round, duel?.over, picked, sfxOn]);

  const settle = useCallback((yours: Answer) => {
    setDuel((prev) => {
      if (!prev || prev.over) return prev;
      // A human opponent will supply this over the network instead; the engine
      // takes the same shape either way.
      const theirs: Answer = prev.pending ?? { correct: false, seconds: Infinity };
      const next = resolveRound(prev, yours, theirs);
      const last = next.history[next.history.length - 1];

      setEvent((e) => ({
        id: e.id + 1,
        winner: last?.winner ?? null,
        traded: !!last?.traded,
      }));

      if (sfxOn) {
        if (last?.winner === 'you') playSfx(last.traded ? 'combo' : 'hit');
        else if (last?.winner === 'foe') playSfx('miss');
      }
      return next;
    });
  }, [sfxOn]);

  /** Ran out of time: wrong, and as slow as it is possible to be. */
  useEffect(() => {
    if (!duel || duel.over || picked !== null) return;
    if (secondsLeft > 0) return;
    setPicked('');   // '' marks a timeout: reveals the answer, matches no option
    settle({ correct: false, seconds: Infinity });
  }, [secondsLeft, duel, picked, settle]);

  const choose = useCallback((option: string) => {
    if (!duel || duel.over || picked !== null) return;
    const question = currentQuestion(duel);
    if (!question) return;
    const seconds = Math.min(
      DUEL_ROUND_SECONDS, (performance.now() - roundStart.current) / 1000,
    );
    setPicked(option);
    settle({ correct: option === question.correctAnswer, seconds });
  }, [duel, picked, settle]);

  /* ── Move to the next round after the reveal ──────────────────────────── */
  useEffect(() => {
    if (!duel || duel.over || picked === null) return;
    advanceTimer.current = setTimeout(() => {
      setPicked(null);
      setSecondsLeft(DUEL_ROUND_SECONDS);
      lastTick.current = 0;
      roundStart.current = performance.now();
    }, REVEAL_MS);
    return () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); };
  }, [duel?.round, duel?.over, picked, duel]);

  /* ── XP, once ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!duel?.over || awarded) return;
    setAwarded(true);
    onAwardXP(duel.xp);
    if (sfxOn) playSfx(duel.winner === 'you' ? 'victory' : 'defeat');
  }, [duel?.over, duel, awarded, onAwardXP, sfxOn]);

  const question = duel ? currentQuestion(duel) : null;
  const rounds = useMemo(() => (duel ? tally(duel) : null), [duel]);
  const show3D = canUse3D && !webglFailed;

  /* ── Pick an opponent ─────────────────────────────────────────────────── */
  if (!duel || !difficulty) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <button onClick={onBack} className="flex items-center gap-2 text-text-dim hover:text-text-main mb-6 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to the Arcade
        </button>

        <div className="flex items-center gap-3 mb-2">
          <Swords className="w-7 h-7 text-brand-purple" />
          <h1 className="text-2xl font-bold text-text-main">Duel</h1>
        </div>
        <p className="text-sm text-text-dim mb-6">
          Seven rounds, {DUEL_MAX_HP} health each, {DUEL_ROUND_SECONDS} seconds a question.
          Right answers hit — the faster you are, the harder. Get it wrong and you take the hit.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {OPPONENTS.map((o) => (
            <button
              key={o.id}
              onClick={() => begin(o.id)}
              className="text-left rounded-2xl border border-border-main bg-glass-bg p-5 hover:border-brand-purple transition-colors"
            >
              <h2 className="text-base font-bold text-text-main mb-1">{o.name}</h2>
              <p className="text-xs text-text-dim mb-3">{o.blurb}</p>
              <p className="text-[11px] tabular-nums text-brand-purple/80">
                {Math.round(BOT_PROFILES[o.id].accuracy * 100)}% accurate
                {' · '}{BOT_PROFILES[o.id].fastest}–{BOT_PROFILES[o.id].slowest}s
              </p>
            </button>
          ))}
        </div>

        {/*
          Deliberately visible rather than hidden until it works. The duel was
          built so the opponent is just "the other fighter" — a real player drops
          into the same slot — and saying so is honest about what is coming.
        */}
        <div className="mt-4 rounded-2xl border border-dashed border-border-main p-4 flex items-center gap-3 text-text-dim">
          <Users className="w-5 h-5 shrink-0" />
          <p className="text-xs">
            Duelling a friend live is next. The arena and the rules are already built for it —
            only the matchmaking is missing.
          </p>
        </div>
      </div>
    );
  }

  /* ── Results ──────────────────────────────────────────────────────────── */
  if (duel.over) {
    const won = duel.winner === 'you';
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="rounded-2xl border border-border-main bg-glass-bg p-8 text-center">
          <h1 className={`text-3xl font-bold mb-1 ${won ? 'text-green-400' : duel.winner ? 'text-red-400' : 'text-text-main'}`}>
            {won ? 'You win' : duel.winner ? 'You lose' : 'Draw'}
          </h1>
          <p className="text-sm text-text-dim mb-6">{duel.outcome}</p>

          <div className="grid grid-cols-3 gap-3 mb-6">
            {([
              [<Swords key="a" className="w-5 h-5" />, `${rounds!.you}-${rounds!.foe}`, 'rounds'],
              [<Trophy key="b" className="w-5 h-5" />, `${duel.you.hp} HP`, 'left'],
              [<Zap key="c" className="w-5 h-5" />, duel.xp, 'XP earned'],
            ] as Array<[React.ReactNode, React.ReactNode, string]>).map(([icon, value, label]) => (
              <div key={label} className="rounded-xl border border-border-main bg-glass-bg p-3">
                <div className="flex justify-center mb-1 text-brand-purple">{icon}</div>
                <div className="text-xl font-bold tabular-nums text-text-main">{value}</div>
                <div className="text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => begin(difficulty)}
              className="px-5 py-2.5 rounded-xl bg-brand-purple text-white text-sm font-semibold"
            >
              Rematch
            </button>
            <button
              onClick={() => { setDuel(null); setDifficulty(null); }}
              className="px-5 py-2.5 rounded-xl border border-border-main text-text-muted text-sm"
            >
              Change opponent
            </button>
            <button onClick={onBack} className="px-5 py-2.5 rounded-xl border border-border-main text-text-muted text-sm">
              Arcade
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── The duel ─────────────────────────────────────────────────────────── */
  const whole = Math.ceil(secondsLeft);
  const urgent = whole <= 3 && picked === null;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-chrome">
      {/* Health, names, round and clock — all HTML, never drawn into the canvas,
          so a screen reader can read them and zoom does not blur them. */}
      <div className="flex items-start gap-3 mb-3">
        <HealthBar name={duel.you.name} hp={duel.you.hp} side="you"
                   leading={duel.you.hp > duel.foe.hp} />

        <div className="shrink-0 text-center px-2">
          <div className="text-[10px] uppercase tracking-widest text-text-dim">
            Round {duel.round}/{duel.rounds}
          </div>
          <div
            className={`text-3xl font-bold tabular-nums leading-none ${urgent ? 'text-red-400' : 'text-text-main'}`}
            role="timer"
            aria-live="off"
          >
            {whole}
          </div>
        </div>

        <HealthBar name={duel.foe.name} hp={duel.foe.hp} side="foe"
                   leading={duel.foe.hp > duel.you.hp} />
      </div>

      <div className="h-52 sm:h-64 mb-4 rounded-2xl overflow-hidden">
        {show3D ? (
          <React.Suspense fallback={<DuelArena2D youHpPct={duel.you.hp} foeHpPct={duel.foe.hp} event={event} loser={null} />}>
            <DuelArena3D
              youHpPct={duel.you.hp}
              foeHpPct={duel.foe.hp}
              event={event}
              loser={duel.you.hp <= 0 ? 'you' : duel.foe.hp <= 0 ? 'foe' : null}
              onUnsupported={onUnsupported}
            />
          </React.Suspense>
        ) : (
          <DuelArena2D
            youHpPct={duel.you.hp}
            foeHpPct={duel.foe.hp}
            event={event}
            loser={duel.you.hp <= 0 ? 'you' : duel.foe.hp <= 0 ? 'foe' : null}
          />
        )}
      </div>

      {question && (
        <>
          <div className="rounded-2xl border border-border-main bg-glass-bg p-5 mb-4 text-center">
            {subject && (
              <span className="inline-block mb-2 px-2 py-0.5 rounded-full bg-brand-purple/20 text-brand-purple text-[10px] font-bold uppercase tracking-widest">
                {subject}
              </span>
            )}
            <h2 className="text-base sm:text-lg font-medium text-text-main">{question.question}</h2>
          </div>

          <div className="grid gap-3 grid-cols-2">
            {question.options.map((opt, i) => {
              const isAnswer = opt === question.correctAnswer;
              const chosen = picked === opt;
              const reveal = picked !== null;
              return (
                <button
                  key={i}
                  onClick={() => choose(opt)}
                  disabled={reveal}
                  className={`p-4 rounded-xl text-sm text-center border font-semibold transition-all ${
                    reveal && isAnswer
                      ? 'bg-green-500/20 border-green-500/50 text-green-400'
                      : reveal && chosen
                        ? 'bg-red-500/20 border-red-500/50 text-red-400'
                        : 'bg-glass-bg border-border-main text-text-muted hover:text-text-main hover:border-brand-purple'
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
            {picked !== null && (() => {
              const last = duel.history[duel.history.length - 1];
              if (!last) return null;
              const yoursRight = last.yours.correct;
              return (
                <div className={`p-4 rounded-xl text-sm ${
                  last.winner === 'you' ? 'bg-green-500/10 text-green-400/90'
                    : last.winner === 'foe' ? 'bg-red-500/10 text-red-400/90'
                    : 'bg-white/5 text-text-muted'
                }`}>
                  <span className="font-bold">
                    {last.winner === 'you'
                      ? (last.traded
                        ? `Both right — you were faster. ${last.damage} damage. `
                        : `Hit! ${last.damage} damage. `)
                      : last.winner === 'foe'
                        ? (last.traded
                          ? `Both right, but ${duel.foe.name} was faster. `
                          : yoursRight ? '' : `${duel.foe.name} got it. `)
                        : 'Neither of you got it. '}
                  </span>
                  {question.explanation}
                </div>
              );
            })()}
          </div>

          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-text-dim">
            <Timer className="w-3 h-3" />
            Answer faster to hit harder
          </div>
        </>
      )}
    </div>
  );
};

export default DuelMode;
