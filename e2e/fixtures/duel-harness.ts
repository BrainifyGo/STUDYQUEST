/**
 * TEST HARNESS — drives the real LiveDuel against the real socket server.
 *
 * Not shipped: `npm run build` bundles from index.html, so nothing under e2e/
 * reaches production.
 *
 * Same approach as the call harness, for the same reason: the thing worth
 * proving is that two browsers can complete a duel with the server refereeing,
 * not that a button is clickable. State goes on `window.__duel` so Playwright
 * asserts on facts.
 */
import { io, type Socket } from 'socket.io-client';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../src/lib/firebase';
import { LiveDuel, type LiveDuelSnapshot } from '../../src/lib/liveDuel';
import type { QuizQuestion } from '../../src/App';

interface DuelHarnessState {
  phase: string;
  joinDenied: string | null;
  error: string | null;
  socketId: string | null;
  snap: LiveDuelSnapshot | null;
  /** Duels offered to the room by somebody else. */
  offers: Array<{ duelId: string; from: string }>;
  /** Every option this browser chose, in order. */
  chose: string[];
}

declare global {
  interface Window {
    __duel: DuelHarnessState;
    __duelApi: {
      create: () => void;
      accept: (duelId: string) => void;
      /** Answer the current round: 'right' picks the correct one. */
      answer: (which: 'right' | 'wrong') => void;
      leave: () => void;
    };
  }
}

const state: DuelHarnessState = {
  phase: 'booting', joinDenied: null, error: null,
  socketId: null, snap: null, offers: [], chose: [],
};
window.__duel = state;

const el = document.getElementById('state')!;
const render = () => {
  el.textContent = JSON.stringify(
    { phase: state.phase, snap: state.snap, offers: state.offers }, null, 2,
  );
};
render();

const params = new URLSearchParams(location.search);
const roomId = params.get('room') || 'e2e-duel-room';
const userName = params.get('name') || 'Tester';
const token = params.get('token') || '';

/*
  The deck the host offers. Every correct answer is prefixed 'RIGHT ' so the
  harness can pick correctly or incorrectly on demand WITHOUT being told which
  option is right — the whole point is that the server never says.
*/
const DECK: QuizQuestion[] = Array.from({ length: 7 }, (_, i) => ({
  question: `Duel question ${i + 1}?`,
  options: [`RIGHT ${i + 1}`, `nope a ${i + 1}`, `nope b ${i + 1}`, `nope c ${i + 1}`],
  correctAnswer: `RIGHT ${i + 1}`,
  explanation: `The answer is RIGHT ${i + 1}.`,
}));

let duel: LiveDuel | null = null;
let socket: Socket | null = null;

async function boot() {
  try {
    if (!token) throw new Error('no token in query string');
    await signInWithCustomToken(auth, token);
    const idToken = await auth.currentUser!.getIdToken();

    socket = io({ reconnectionAttempts: 3, timeout: 10_000 });

    socket.on('connect', () => {
      state.socketId = socket!.id ?? null;
      socket!.emit('join-room', { roomId, userName, idToken, visibility: 'private' });
      render();
    });

    socket.on('join-denied', ({ reason }: { reason: string }) => {
      state.joinDenied = reason;
      state.phase = 'error';
      render();
    });

    socket.on('room-users', () => {
      if (state.phase === 'booting') { state.phase = 'in-room'; render(); }
    });

    socket.on('duel-offered', ({ duelId, from }: { duelId: string; from: string }) => {
      state.offers.push({ duelId, from });
      render();
    });

    duel = new LiveDuel(socket, userName, (snap) => {
      state.snap = snap;
      state.phase = snap.phase === 'idle' ? state.phase : snap.phase;
      render();
    });

    window.__duelApi = {
      create: () => duel!.create(DECK),
      accept: (duelId: string) => duel!.accept(duelId),
      answer: (which: 'right' | 'wrong') => {
        const opts = state.snap?.options || [];
        // Picked by PREFIX, not by asking the server which is right — that is
        // exactly the information a real client is never given.
        const pick = which === 'right'
          ? opts.find((o) => o.startsWith('RIGHT'))
          : opts.find((o) => !o.startsWith('RIGHT'));
        if (!pick) return;
        state.chose.push(pick);
        duel!.answer(pick);
      },
      leave: () => duel!.leave(),
    };
  } catch (err) {
    state.phase = 'error';
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

boot();
