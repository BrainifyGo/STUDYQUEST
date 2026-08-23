import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Swords, Trophy, X, Zap } from 'lucide-react';
import { LiveDuel, type LiveDuelSnapshot } from '../lib/liveDuel';
import { tally } from '../lib/duel';
import { playSfx } from '../lib/arcadeSound';
import DuelStage from './DuelStage';
import type { DuelArenaEvent } from './DuelArena3D';
import type { QuizQuestion } from '../App';

/**
 * DUEL A FRIEND, live, from inside a study room.
 *
 * The screen is `DuelStage`, exactly the one the bot duel uses — same arena,
 * same health bars, same answer grid. The only difference is where the
 * opponent's answer comes from.
 *
 * The clock counts down to the SERVER's deadline rather than from a local
 * start, so two people on different connections see the same number. Counting
 * locally would give whoever received the question first a real advantage, and
 * damage scales with speed.
 */

interface LiveDuelPanelProps {
  socket: Socket;
  userName: string;
  /** The room's shared quiz, used as the duel deck. */
  deck: QuizQuestion[];
  subject?: string;
  canUse3D: boolean;
  onClose: () => void;
}

export const LiveDuelPanel: React.FC<LiveDuelPanelProps> = ({
  socket, userName, deck, subject, canUse3D, onClose,
}) => {
  const [snap, setSnap] = useState<LiveDuelSnapshot | null>(null);
  const [offers, setOffers] = useState<Array<{ duelId: string; from: string }>>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [event, setEvent] = useState<DuelArenaEvent>({ id: 0, winner: null, traded: false });
  const duelRef = useRef<LiveDuel | null>(null);
  const lastRound = useRef(0);

  useEffect(() => {
    const d = new LiveDuel(socket, userName, setSnap);
    duelRef.current = d;

    const onOffer = (o: { duelId: string; from: string }) =>
      setOffers((prev) => (prev.some((p) => p.duelId === o.duelId) ? prev : [...prev, o]));
    socket.on('duel-offered', onOffer);

    return () => {
      socket.off('duel-offered', onOffer);
      d.leave();
      d.destroy();
    };
  }, [socket, userName]);

  /* ── The clock ────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!snap || snap.phase !== 'asking') { setSecondsLeft(0); return; }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((snap.endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [snap]);

  /* ── One arena event per resolved round ───────────────────────────────── */
  useEffect(() => {
    const state = snap?.state;
    if (!state || !state.history.length) return;
    const last = state.history[state.history.length - 1];
    if (last.round === lastRound.current) return;
    lastRound.current = last.round;

    setEvent((e) => ({ id: e.id + 1, winner: last.winner, traded: last.traded }));
    if (last.winner === 'you') playSfx(last.traded ? 'combo' : 'hit');
    else if (last.winner === 'foe') playSfx('miss');
  }, [snap]);

  const rounds = useMemo(() => (snap?.state ? tally(snap.state) : null), [snap]);

  const choose = useCallback((option: string) => {
    duelRef.current?.answer(option);
  }, []);

  const offer = useCallback(() => {
    if (!deck.length) return;
    duelRef.current?.create(deck);
  }, [deck]);

  /* ── Lobby ────────────────────────────────────────────────────────────── */
  if (!snap || snap.phase === 'idle' || snap.phase === 'waiting') {
    return (
      <div className="rounded-2xl border border-border-main bg-glass-bg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text-main">
            <Swords className="w-4 h-4 text-brand-purple" /> Duel
          </h3>
          <button onClick={onClose} aria-label="Close duel panel"
                  className="text-text-dim hover:text-text-main">
            <X className="w-4 h-4" />
          </button>
        </div>

        {snap?.error && (
          <p className="mb-3 text-xs text-red-400">
            {snap.error === 'NO_QUESTIONS'
              ? 'Make a quiz for the room first — a duel needs questions.'
              : snap.error === 'FULL' ? 'Someone else took that duel.'
              : snap.error === 'GONE' ? 'That duel is no longer available.'
              : 'That did not work. Try again.'}
          </p>
        )}

        {snap?.phase === 'waiting' && snap.duelId ? (
          <p className="text-sm text-text-dim">
            Waiting for someone in the room to accept…
          </p>
        ) : (
          <>
            <p className="text-xs text-text-dim mb-3">
              Seven rounds, head to head, on the room&apos;s quiz. Answer faster to hit harder.
            </p>
            <button
              onClick={offer}
              disabled={!deck.length}
              className="w-full px-4 py-2.5 rounded-xl bg-brand-purple text-white text-sm font-semibold disabled:opacity-40"
            >
              {deck.length ? 'Challenge the room' : 'Make a room quiz first'}
            </button>
          </>
        )}

        {offers.length > 0 && (
          <div className="mt-4 space-y-2">
            {offers.map((o) => (
              <button
                key={o.duelId}
                onClick={() => { setOffers([]); duelRef.current?.accept(o.duelId); }}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-brand-purple/60 text-sm text-text-main"
              >
                <span><b>{o.from}</b> wants to duel</span>
                <span className="text-brand-purple font-semibold">Accept</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Result ───────────────────────────────────────────────────────────── */
  if (snap.phase === 'over' && snap.state) {
    const s = snap.state;
    const won = s.winner === 'you';
    return (
      <div className="rounded-2xl border border-border-main bg-glass-bg p-6 text-center">
        <h3 className={`text-2xl font-bold mb-1 ${
          won ? 'text-green-400' : s.winner ? 'text-red-400' : 'text-text-main'
        }`}>
          {snap.forfeitedBy && !s.over ? 'They left' : won ? 'You win' : s.winner ? 'You lose' : 'Draw'}
        </h3>
        <p className="text-sm text-text-dim mb-5">
          {snap.forfeitedBy && !s.over
            ? `${s.foe.name} walked out of the duel.`
            : s.outcome}
        </p>

        <div className="grid grid-cols-3 gap-3 mb-5">
          {([
            [<Swords key="a" className="w-4 h-4" />, `${rounds!.you}-${rounds!.foe}`, 'rounds'],
            [<Trophy key="b" className="w-4 h-4" />, `${s.you.hp} HP`, 'left'],
            [<Zap key="c" className="w-4 h-4" />, s.xp, 'XP'],
          ] as Array<[React.ReactNode, React.ReactNode, string]>).map(([icon, value, label]) => (
            <div key={label} className="rounded-xl border border-border-main p-3">
              <div className="flex justify-center mb-1 text-brand-purple">{icon}</div>
              <div className="text-lg font-bold tabular-nums text-text-main">{value}</div>
              <div className="text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
            </div>
          ))}
        </div>

        <button onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-border-main text-text-muted text-sm">
          Back to the room
        </button>
      </div>
    );
  }

  /* ── The duel ─────────────────────────────────────────────────────────── */
  if (!snap.state) return null;
  const s = snap.state;
  const last = s.history[s.history.length - 1];
  const revealing = snap.phase === 'revealing' && snap.reveal;

  return (
    <DuelStage
      youName={s.you.name}
      foeName={s.foe.name}
      youHp={s.you.hp}
      foeHp={s.foe.hp}
      round={snap.round}
      rounds={snap.rounds}
      secondsLeft={secondsLeft}
      subject={subject}
      question={snap.question || ''}
      options={snap.options}
      picked={snap.answered ? (snap.reveal?.yourOption ?? '') : null}
      correctAnswer={revealing ? snap.reveal!.correctAnswer : null}
      opponentAnswered={snap.opponentAnswered}
      event={event}
      canUse3D={canUse3D}
      onChoose={choose}
      verdict={revealing && last ? (
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
                  ? `Both right, but ${s.foe.name} was faster. `
                  : last.yours.correct ? '' : `${s.foe.name} got it. `)
                : 'Neither of you got it. '}
          </span>
          {snap.reveal!.explanation}
        </div>
      ) : null}
    />
  );
};

export default LiveDuelPanel;
