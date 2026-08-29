import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Swords, Trophy, Zap, Users } from 'lucide-react';
import {
  BOT_PROFILES, DUEL_MAX_HP, DUEL_ROUND_SECONDS,
  currentQuestion, resolveRound, startDuel, tally,
  type Answer, type DuelDifficulty, type DuelState,
} from '../lib/duel';
import type { QuizQuestion } from '../App';
import { playSfx } from '../lib/arcadeSound';
import { hoursFrom, logStudySession } from '../lib/studySession';
import DuelStage from './DuelStage';
import type { DuelArenaEvent } from './DuelArena3D';


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

export const DuelMode: React.FC<DuelModeProps> = ({
  questions, subject, youName, onBack, onAwardXP, canUse3D, sfxOn,
}) => {
  const [difficulty, setDifficulty] = useState<DuelDifficulty | null>(null);
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(DUEL_ROUND_SECONDS);
  const [event, setEvent] = useState<DuelArenaEvent>({ id: 0, winner: null, traded: false });
  const [awarded, setAwarded] = useState(false);

  /** When the current round's question appeared. The clock is measured, not counted. */
  const roundStart = useRef(0);
  /** When the duel began, so its logged duration is measured not guessed. */
  const duelStartedAt = useRef(Date.now());
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
    duelStartedAt.current = Date.now();
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

    /*
      A duel is seven real questions, so it counts as studying. Accuracy is the
      share actually answered correctly across the rounds played — not the
      health left, which is a game score and would flatter a fast player.
    */
    const rounds = duel.history.length;
    const right = duel.history.filter((h) => h.yours.correct).length;
    void logStudySession({
      duration: hoursFrom(duelStartedAt.current),
      score: rounds ? Math.round((right / rounds) * 100) : null,
      subject: subject || 'General',
      source: 'duel',
    });
    if (sfxOn) playSfx(duel.winner === 'you' ? 'victory' : 'defeat');
  }, [duel?.over, duel, awarded, onAwardXP, sfxOn]);

  const question = duel ? currentQuestion(duel) : null;
  const rounds = useMemo(() => (duel ? tally(duel) : null), [duel]);

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
  const last = duel.history[duel.history.length - 1];

  /*
    The layout is shared with the live duel against a friend — see DuelStage.
    Two components rendering "the same" screen is how two screens stop being the
    same: one gets a fix and the other keeps the bug.
  */
  return (
    <DuelStage
      youName={duel.you.name}
      foeName={duel.foe.name}
      youHp={duel.you.hp}
      foeHp={duel.foe.hp}
      round={duel.round}
      rounds={duel.rounds}
      secondsLeft={whole}
      subject={subject}
      question={question.question}
      options={question.options}
      picked={picked}
      correctAnswer={picked !== null ? question.correctAnswer : null}
      event={event}
      canUse3D={canUse3D}
      onChoose={choose}
      verdict={picked !== null && last ? (
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
                  : last.yours.correct ? '' : `${duel.foe.name} got it. `)
                : 'Neither of you got it. '}
          </span>
          {question.explanation}
        </div>
      ) : null}
    />
  );
};


export default DuelMode;
