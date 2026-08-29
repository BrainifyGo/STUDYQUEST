import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, X, Flame, Timer, Target, Heart, Trophy, Zap, Ghost, Loader2,
  Skull, Mountain, Sparkles, Swords, Volume2, VolumeX,
} from 'lucide-react';
import {
  MODES, MODE_ORDER, startState, applyAnswer, tickClock, completionBonus, accuracy,
  type ModeId, type ModeState,
} from '../lib/gameModes';
import { lineFor, pickBoss } from '../lib/bosses';
import { listMistakes, asQuiz, recordMistake, retireMistake, type Mistake } from '../lib/mistakes';
import type { QuizQuestion } from '../App';
import { toast } from 'sonner';
import { callAI } from '../lib/aiService';
import { buildStudyPrompt, parseJsonReply, normaliseQuiz } from '../lib/studyPrompts';
import { playSfx, loadSfxPreference, setSfxEnabled, sfxEnabled } from '../lib/arcadeSound';
import BossArena2D, { type ArenaEvent } from './BossArena2D';
import { can, planOf } from '../lib/entitlements';
import { useUserStore } from '../store/useUserStore';
import { hoursFrom, logStudySession } from '../lib/studySession';

/*
  The 3D arena is Pro, and it is lazy so free players never download it.

  It is raw WebGL rather than three.js — see the note in the file. A separate
  chunk means the cost lands only on the accounts that get the feature.
*/
const BossArena3D = React.lazy(() => import('./BossArena3D'));

/*
  DUEL runs on its own rules module, not on ModeState, so it is a screen rather
  than a branch inside this one. Lazy for the same reason as the arena: the duel
  drags in its own arena and nobody who never opens it should pay for that.
*/
const DuelMode = React.lazy(() => import('./DuelMode'));

/**
 * THE ARCADE — Speed Run and Boss Battle, ported from ReviseGo.
 *
 * The rules live in `lib/gameModes.ts`; this only draws them and owns the clock.
 *
 * QUESTIONS COME FROM YOUR SAVED MISTAKES, by preference: it costs no AI call, it
 * works offline, and it points the fun part of the app at the questions you
 * actually got wrong.
 *
 * But that was ALSO the reason the Arcade was empty. A new account has no
 * mistakes, and the only way to get one was to sit a quiz and fail a question —
 * so the games were locked behind the exact thing the games were meant to make
 * appealing. Quick Play breaks that circle: name a topic and it generates a round
 * on the spot. Your mistakes are still the default pool whenever you have one.
 */

export interface RoundSummary {
  modeName: string;
  score: number;
  accuracy: number;
  correct: number;
  answered: number;
}

interface GameModeProps {
  onBack: () => void;
  onAwardXP: (xp: number) => void;
  /**
   * Questions to play, instead of your saved mistakes.
   *
   * Used by study rooms, where everyone plays the same deck — the room's quiz.
   * Left out, the Arcade behaves exactly as before and drills your own mistakes.
   */
  questions?: QuizQuestion[];
  /** Subject for the injected deck, so the right boss turns up. */
  subject?: string;
  /** Called once when a round ends, for anything that wants the result. */
  onFinished?: (summary: RoundSummary) => void;
}

const shuffle = <T,>(a: T[]): T[] => {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export const GameMode: React.FC<GameModeProps> = ({ onBack, onAwardXP, questions, subject, onFinished }) => {
  const [mistakes, setMistakes] = useState<Mistake[] | null>(null);
  const [state, setState] = useState<ModeState | null>(null);
  /** When this round began, so the logged duration is measured rather than guessed. */
  const roundStartedAt = useRef(Date.now());
  const [picked, setPicked] = useState<string | null>(null);
  const [awarded, setAwarded] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listMistakes().then(setMistakes);
  }, []);

  /*
    An injected deck wins.

    A room round has to be the SAME questions for everyone, so when questions are
    passed in they replace the mistakes pool rather than being added to it —
    otherwise each player would be quizzed on their own mistakes and the scores
    would not compare.
  */
  const injected = questions && questions.length > 0 ? questions : null;
  const pool = useMemo(
    () => injected ?? (mistakes ? asQuiz(mistakes) : null),
    [injected, mistakes]
  );

  /**
   * Which subject you get quizzed on most — that decides which boss turns up.
   *
   * A pool spread across subjects gets The Examiner rather than whichever boss
   * happened to match first, so the mixed fight is a deliberate outcome and not
   * an accident of ordering.
   */
  const dominantSubject = useMemo(() => {
    if (!mistakes?.length) return '';
    const counts = new Map<string, number>();
    for (const m of mistakes) {
      const s = (m.subject || '').trim();
      if (s && s !== 'Arcade' && s !== 'Review') counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    if (!counts.size) return '';
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    // Only commit to a subject boss when it is over half the pool.
    return n * 2 > mistakes.length ? top : '';
  }, [mistakes]);

  // The clock. Cleared on unmount and whenever the round ends, or it keeps
  // counting in the background and fires after the player has left.
  useEffect(() => {
    if (!state || state.over || !state.mode.duration) return;
    tickRef.current = setInterval(() => setState((s) => {
      if (!s) return s;
      const next = tickClock(s);
      // The last ten seconds are audible. A clock you can hear running out is
      // most of what makes a timed mode tense.
      if (next.timeLeft > 0 && next.timeLeft <= 10) playSfx('tick');
      return next;
    }), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [state?.mode.id, state?.over]);

  // Bank the XP once, when the round ends. Without the guard a re-render after
  // the round is over would award it again.
  useEffect(() => {
    if (!state?.over || awarded) return;
    setAwarded(true);
    onAwardXP(state.xp + completionBonus(state));
    // Behind the same guard as the XP, so a re-render after the round cannot
    // announce the score to the room twice.
    /*
      A finished round is a study session, with the numbers that actually
      happened. Before this, playing the Arcade recorded nothing at all and
      Analytics showed 0 hours after twenty questions.
    */
    void logStudySession({
      duration: hoursFrom(roundStartedAt.current),
      score: accuracy(state),
      subject: (injected ? subject : dominantSubject) || 'General',
      source: 'arcade',
    });

    onFinished?.({
      modeName: state.mode.name,
      score: state.score,
      accuracy: accuracy(state),
      correct: state.correct,
      answered: state.answered,
    });
  }, [state?.over, awarded, state, onAwardXP, onFinished]);

  /*
    Duel is a different game with a different state shape, so it gets its own
    screen rather than a branch through ModeState. Holding the deck here means
    both ways in — your mistakes and Quick Play — reach it the same way.
  */
  const [duelDeck, setDuelDeck] = useState<{ questions: QuizQuestion[]; subject: string } | null>(null);

  /** Start a round from any deck. Shared by the mistakes pool and Quick Play. */
  const startRound = useCallback((id: ModeId, deck: QuizQuestion[], subject: string) => {
    if (!deck.length) return;
    const shuffled = shuffle(deck);

    if (id === 'duel') {
      // Seven DISTINCT questions where possible. Padding a duel by repeating a
      // question would hand the second showing to whoever remembered it, which
      // is a memory test rather than a duel. `startDuel` shortens the match
      // instead when the pool is small.
      setDuelDeck({ questions: shuffled.slice(0, 7), subject });
      return;
    }

    // Enough to keep a 60-second run going without repeating immediately.
    const filled = shuffled.length >= 25 ? shuffled : Array.from(
      { length: 25 }, (_, i) => shuffled[i % shuffled.length]
    );
    setAwarded(false);
    setPicked(null);
    roundStartedAt.current = Date.now();
    setState(startState(MODES[id], filled, subject));
  }, []);

  const begin = useCallback((id: ModeId) => {
    if (!pool?.length) return;
    startRound(id, pool, injected ? (subject || '') : dominantSubject);
  }, [pool, dominantSubject, startRound, injected, subject]);

  /*
    ONE EVENT DRIVES EVERY REACTION.

    The arena animates from a single bumped id rather than from the game state
    directly. Deriving animation from state means a re-render for any reason
    replays the hit; an explicit event fires exactly once, when something
    actually happened.
  */
  const [arenaEvent, setArenaEvent] = useState<ArenaEvent | null>(null);
  const eventSeq = useRef(0);
  const [sfxOn, setSfxOn] = useState(true);
  useEffect(() => { setSfxOn(loadSfxPreference()); }, []);

  const { userData } = useUserStore();
  const isPro = !!userData?.isPro
    || (typeof localStorage !== 'undefined' && localStorage.getItem('brainify_test_pro') === 'true');
  const [use3D, setUse3D] = useState(true);
  const canUse3D = can(planOf(isPro), '3d-arena') && use3D;

  /* ── Quick Play ───────────────────────────────────────
     Generated questions, for when there is nothing to drill yet. */
  const [topic, setTopic] = useState('');
  const [generated, setGenerated] = useState<QuizQuestion[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingMode, setPendingMode] = useState<ModeId | null>(null);

  const generateRound = useCallback(async (mode: ModeId) => {
    const subject = topic.trim();
    if (subject.length < 3) {
      toast.error('Type a topic first — "photosynthesis", "trig", "Macbeth".');
      return;
    }
    setIsGenerating(true);
    setPendingMode(mode);
    try {
      const prompt = buildStudyPrompt({
        mode: 'quiz',
        content: `Write GCSE-level questions about: ${subject}`,
        options: { shorter: false, examFocused: true, bulletPoints: false },
        // Pro-sized deck regardless of plan: a 5-question deck makes a 60-second
        // Speed Run repeat itself almost immediately.
        isPro: true,
        source: 'text',
      });
      const raw = await callAI(prompt);
      if (!raw) throw new Error('The AI returned nothing.');
      const questions = normaliseQuiz(parseJsonReply(raw));
      setGenerated(questions);
      startRound(mode, questions, subject);
    } catch (err: any) {
      console.error('[arcade generate]', err);
      toast.error(err?.message === 'TOKEN_LIMIT_EXCEEDED'
        ? 'You have hit your AI limit for now. Your saved mistakes still work.'
        : 'Could not make questions for that. Try a simpler topic.');
    } finally {
      setIsGenerating(false);
      setPendingMode(null);
    }
  }, [topic]);

  const current = state && !state.over ? state.questions[state.index] : null;

  const choose = (option: string) => {
    if (!state || picked !== null || !current) return;
    setPicked(option);
    const right = option === current.correctAnswer;

    // The arcade feeds the same review loop as everything else: a wrong answer
    // here still lands in My Mistakes, and a right one still retires it.
    (right ? retireMistake(current) : recordMistake(current, option, 'Arcade'))
      .catch(() => { /* logged in mistakes.ts; never block the game */ });

    /*
      SOUND FIRES IMMEDIATELY, THE STATE CHANGES AFTER A BEAT.

      The pause exists so the player can see which option was correct. The sound
      must not wait for it: a hit that arrives 650ms after the tap does not feel
      like a consequence of the tap.
    */
    playSfx(right ? 'hit' : 'miss', state.combo + 1);
    if (right && state.combo + 1 >= 3) playSfx('combo', state.combo + 1);

    setTimeout(() => {
      setState((s) => {
        if (!s) return s;
        const next = applyAnswer(s, right);

        // The arena reacts to what actually changed, which is only knowable by
        // comparing the two states — "did the boss lose health" and "did I" are
        // different animations and the component cannot work that out alone.
        const dealt = s.bossHP - next.bossHP;
        const taken = s.playerHP - next.playerHP;

        if (next.enragedThisTurn) playSfx('enrage');
        else if (next.over) playSfx(next.won ? 'victory' : 'defeat');

        setArenaEvent({
          id: ++eventSeq.current,
          kind: next.enragedThisTurn ? 'enrage'
              : next.over ? (next.won ? 'win' : 'lose')
              : taken > 0 ? 'hurt'
              : 'hit',
          amount: dealt > 0 ? dealt : taken > 0 ? taken : undefined,
        });

        return next;
      });
      setPicked(null);
    }, right ? 650 : 1500);
  };

  const bossPercent = useMemo(() => {
    if (!state?.boss) return 0;
    return Math.round((state.bossHP / state.boss.maxHP) * 100);
  }, [state?.bossHP, state?.boss]);

  /**
   * What the boss says right now.
   *
   * Seeded on the number answered so the same moment always produces the same
   * line — with Math.random() the taunt would change on every re-render, which
   * makes it read as noise rather than a reaction to what you just did.
   */
  const bossLine = useMemo(() => {
    if (!state?.boss) return '';
    if (state.over) return lineFor(state.boss, state.won ? 'defeat' : 'victory', state.answered);
    if (state.enragedThisTurn) return lineFor(state.boss, 'enrage', state.answered);
    if (picked === null) {
      return state.answered === 0
        ? lineFor(state.boss, 'intro', 0)
        : lineFor(state.boss, 'hit', state.answered);
    }
    const wasRight = picked === current?.correctAnswer;
    return lineFor(state.boss, wasRight ? 'hit' : 'playerHit', state.answered);
  }, [state?.boss, state?.over, state?.won, state?.enragedThisTurn, state?.answered, picked, current]);

  /* ── duel ────────────────────────────────────────────── */
  if (duelDeck) {
    return (
      <React.Suspense fallback={
        <div className="flex items-center justify-center py-24" role="status" aria-label="Loading the duel">
          <Loader2 className="w-8 h-8 animate-spin text-brand-purple" />
        </div>
      }>
        <DuelMode
          questions={duelDeck.questions}
          subject={duelDeck.subject}
          youName={userData?.displayName || 'You'}
          onBack={() => setDuelDeck(null)}
          onAwardXP={onAwardXP}
          canUse3D={canUse3D}
          sfxOn={sfxOn}
        />
      </React.Suspense>
    );
  }

  /* ── loading ─────────────────────────────────────────── */
  if (pool === null) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
        <Loader2 className="w-8 h-8 animate-spin text-brand-purple" />
      </div>
    );
  }

  /*
    A MUTE BUTTON, and the choice is remembered.

    Sound effects on by default is right — they are most of what makes this feel
    like a game — but someone revising in a library needs one tap to stop it, and
    needs it to stay stopped next time.
  */
  const soundToggle = (
    <button
      onClick={() => { const next = !sfxOn; setSfxEnabled(next); setSfxOn(next); if (next) playSfx('hit'); }}
      aria-label={sfxOn ? 'Turn sound off' : 'Turn sound on'}
      title={sfxOn ? 'Sound on' : 'Sound off'}
      className="p-2 rounded-lg text-text-dim hover:text-text-main hover:bg-glass-bg transition-all"
    >
      {sfxOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </button>
  );

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
    const ICONS: Record<ModeId, typeof Zap> = {
      duel: Swords,
      'speed-run': Zap, 'boss-battle': Ghost, 'sudden-death': Skull, marathon: Mountain,
    };

    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-8">
        {back}
        <p className="text-xs uppercase tracking-[0.18em] text-brand-purple font-bold mb-1">Arcade</p>
        <h1 className="text-3xl font-bold text-text-main mb-2">Four games. Same questions.</h1>
        <p className="text-text-dim mb-8">
          {injected
            ? `Everyone in the room plays the same ${pool.length} questions. Your score goes in the chat.`
            : enough
            ? `Every mode quizzes you on the ${pool.length} question${pool.length === 1 ? '' : 's'} you have got wrong. Get one right and it leaves your list.`
            : 'Nothing saved to drill yet — so pick a topic below and it will make you a round.'}
        </p>

        {/*
          QUICK PLAY.

          The Arcade used to be locked until you had four saved mistakes, which
          you could only earn by failing quiz questions. The games were gated
          behind the thing they existed to make appealing, so a new account saw
          an empty room. Name a topic and it builds a round on the spot.
        */}
        {!injected && (
        <div className="rounded-2xl border border-border-main bg-glass-bg p-6 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-brand-purple" />
            <h2 className="text-sm font-bold text-text-main uppercase tracking-widest">Quick Play</h2>
          </div>
          <p className="text-sm text-text-dim mb-4">
            {generated
              ? `${generated.length} questions ready on "${topic}". Pick a mode below.`
              : 'Type any topic and it will write you a round.'}
          </p>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. photosynthesis, quadratic equations, Macbeth"
            className="w-full px-4 py-3 rounded-xl bg-black/20 border border-border-main text-text-main placeholder:text-text-dim/50 focus:outline-none focus:border-brand-purple/60 transition-all"
          />
        </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {MODE_ORDER.map((id) => {
            const m = MODES[id];
            const Icon = ICONS[id];
            const busy = isGenerating && pendingMode === id;
            // Saved mistakes are the better pool, so they win when there are
            // enough of them. Otherwise the topic box drives the round.
            const useMistakes = !!injected || enough;
            const ready = useMistakes || topic.trim().length >= 3;

            return (
              <button
                key={id}
                disabled={!ready || isGenerating}
                onClick={() => {
                  if (useMistakes) begin(id);
                  else if (generated) startRound(id, generated, topic.trim());
                  else generateRound(id);
                }}
                className="text-left rounded-2xl border border-border-main bg-glass-bg p-6 hover:border-brand-purple transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-main"
              >
                <div className="flex items-center gap-2 mb-3">
                  {busy
                    ? <Loader2 className="w-7 h-7 text-brand-purple animate-spin" />
                    : <Icon className="w-7 h-7 text-brand-purple" />}
                </div>
                <h2 className="text-lg font-bold text-text-main mb-1">{m.name}</h2>
                <p className="text-sm text-text-dim">{m.blurb}</p>

                {/* Naming who you are about to face turns a mode into a fight. */}
                {id === 'boss-battle' && (
                  <p className="mt-3 pt-3 border-t border-border-main text-xs text-text-dim">
                    You face <span className="text-red-400 font-semibold">
                      {pickBoss(useMistakes ? dominantSubject : topic).name}
                    </span>, {pickBoss(useMistakes ? dominantSubject : topic).title}
                  </p>
                )}

                <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-brand-purple/70">
                  {busy ? 'Writing questions...'
                    : useMistakes ? 'From your mistakes'
                    : generated ? 'From your topic'
                    : ready ? 'Make a round' : 'Type a topic first'}
                </p>
              </button>
            );
          })}
        </div>
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
      <div className="flex items-center justify-between">
        {back}
        {soundToggle}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {state.mode.duration > 0 && (
          <Cell
            icon={<Timer className="w-4 h-4" />}
            value={state.timeLeft}
            label="seconds"
            urgent={state.timeLeft <= 10}
          />
        )}
        {/* Lives, in every mode that has them — was `bossHP > 0`, which hid the
            counter in Sudden Death and Marathon, the two modes where losing a
            life is the entire tension. */}
        {state.mode.playerHP > 0 && (
          <Cell icon={<Heart className="w-4 h-4" />} value={state.playerHP}
                label={state.mode.bossHP > 0 ? 'health' : state.playerHP === 1 ? 'life' : 'lives'}
                urgent={state.playerHP <= 1} />
        )}
        {/* Marathon is a fixed length, so how far through you are IS the progress. */}
        {state.mode.questionLimit ? (
          <Cell icon={<Mountain className="w-4 h-4" />}
                value={`${state.answered}/${state.mode.questionLimit}`} label="done" />
        ) : null}
        <Cell icon={<Target className="w-4 h-4" />} value={state.score} label={state.mode.scoreLabel} />
        <Cell icon={<Flame className="w-4 h-4" />} value={state.combo} label="combo"
              hot={state.combo >= 3} />
      </div>

      {state.boss && (
        <div className="mb-6">
          {/*
            3D FOR PRO, 2D FOR EVERYONE ELSE — and the fight is identical.

            The gate is on the spectacle, never on the mechanics. A free player
            gets the same boss, the same phases, the same damage and the same
            questions; Pro gets it rendered in a WebGL arena. Gating how a fight
            LOOKS is a fair upsell. Gating whether you can win it would not be.

            The 3D arena falls back to the 2D one if WebGL is unavailable, so an
            old phone shows the fight rather than a black rectangle.
          */}
          {canUse3D ? (
            <React.Suspense fallback={
              <BossArena2D
                boss={state.boss} hp={state.bossHP} maxHp={state.boss.maxHP}
                phase={state.phase} playerHp={state.playerHP}
                maxPlayerHp={state.mode.playerHP} event={arenaEvent} line={bossLine}
              />
            }>
              <BossArena3D
                boss={state.boss}
                hpPct={bossPercent}
                phase={state.phase}
                eventId={arenaEvent?.id ?? 0}
                eventKind={arenaEvent?.kind ?? null}
                onUnsupported={() => setUse3D(false)}
              />
              {/* The numbers stay in HTML even in 3D — a health bar drawn into a
                  canvas is invisible to a screen reader. */}
              <BossStats
                hp={state.bossHP} maxHp={state.boss.maxHP} phase={state.phase}
                playerHp={state.playerHP} maxPlayerHp={state.mode.playerHP} line={bossLine}
              />
            </React.Suspense>
          ) : (
            <BossArena2D
              boss={state.boss} hp={state.bossHP} maxHp={state.boss.maxHP}
              phase={state.phase} playerHp={state.playerHP}
              maxPlayerHp={state.mode.playerHP} event={arenaEvent} line={bossLine}
            />
          )}
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

/**
 * The boss itself. Drawn rather than imported: an image would be another asset to
 * ship and would not react. The eyes narrow and the colour deepens as it takes
 * damage, so the phase is readable without reading the percentage.
 */

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

/**
 * The readable half of the 3D arena.
 *
 * WebGL draws pixels, not text — anything rendered into the canvas is invisible
 * to a screen reader and blurry when the browser zooms. So the health, the
 * lives and the boss's line stay as HTML on top of it. The 2D arena draws its
 * own, which is why this is only used alongside the 3D one.
 */
const BossStats: React.FC<{
  hp: number; maxHp: number; phase: 1 | 2 | 3;
  playerHp: number; maxPlayerHp: number; line: string;
}> = ({ hp, maxHp, phase, playerHp, maxPlayerHp, line }) => {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const colour = phase === 3 ? '#ef4444' : phase === 2 ? '#f59e0b' : '#7c7cff';

  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5 text-[10px] font-black uppercase tracking-widest">
          <span className="text-text-dim">
            {phase === 3 ? 'Enraged' : phase === 2 ? 'Rattled' : 'Composed'}
          </span>
          <span style={{ color: colour }}>{Math.ceil(pct)}%</span>
        </div>
        <div className="relative h-4 rounded-full bg-black/40 border border-border-main overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
               style={{ width: `${pct}%`, background: colour }} />
          <div className="absolute inset-0 flex pointer-events-none" aria-hidden="true">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex-1 border-r border-black/30 last:border-r-0" />
            ))}
          </div>
        </div>
      </div>

      {maxPlayerHp > 0 && (
        <div className="flex items-center justify-center gap-1.5"
             aria-label={`${playerHp} of ${maxPlayerHp} lives left`}>
          {Array.from({ length: maxPlayerHp }).map((_, i) => (
            <Heart key={i} size={16} className={i < playerHp ? 'text-red-400' : 'text-text-dim/30'}
                   fill={i < playerHp ? 'currentColor' : 'none'} />
          ))}
        </div>
      )}

      {line && <p className="text-sm italic text-text-dim text-center">"{line}"</p>}
    </div>
  );
};
