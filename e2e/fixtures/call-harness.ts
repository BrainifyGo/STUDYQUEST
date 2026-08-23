/**
 * TEST HARNESS — drives the real CallSession against the real socket server.
 *
 * Not shipped: `npm run build` bundles from index.html, so nothing under e2e/
 * reaches production. Vite's dev server serves it because dev runs in
 * middleware mode from the project root.
 *
 * The page publishes its state on `window.__call` so Playwright can assert on
 * facts rather than on pixels — "the peer connection reached `connected`" and
 * "a remote track is delivering frames" are the things that matter, and neither
 * is visible in a screenshot.
 */
import { io, type Socket } from 'socket.io-client';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../src/lib/firebase';
import { CallSession, type CallSnapshot } from '../../src/lib/call/session';

interface HarnessState {
  phase: 'booting' | 'signed-in' | 'joined' | 'in-call' | 'error';
  error: string | null;
  socketId: string | null;
  /** Peer ids -> connection state, straight from the RTCPeerConnection. */
  peers: Record<string, string>;
  peerNames: Record<string, string>;
  /** Peers whose remote stream carries at least one live track. */
  peersWithMedia: string[];
  /** Peer id -> the kinds of live track arriving ('audio', 'video'). */
  trackKinds: Record<string, string[]>;
  /** Bytes actually received, read from getStats(). The real proof of flow. */
  inboundBytes: number;
  warning: string | null;
  joinDenied: string | null;
  /** Every call-* signalling message, in order, both directions. */
  events: Array<{ t: number; dir: 'in' | 'out'; name: string; peer?: string; kind?: string }>;
}

declare global {
  interface Window {
    __call: HarnessState;
    __harness: {
      join: (withVideo: boolean) => Promise<void>;
      leave: () => void;
      toggleAudio: () => void;
      pcStates: () => Record<string, unknown>;
      candidates: () => Record<string, string[]>;
      readStats: () => Promise<number>;
    };
  }
}

const state: HarnessState = {
  phase: 'booting',
  error: null,
  socketId: null,
  peers: {},
  peerNames: {},
  peersWithMedia: [],
  trackKinds: {},
  inboundBytes: 0,
  warning: null,
  joinDenied: null,
  events: [],
};
window.__call = state;

const el = document.getElementById('state')!;
const render = () => { el.textContent = JSON.stringify(state, null, 2); };
render();

const params = new URLSearchParams(location.search);
const roomId = params.get('room') || 'e2e-room';
const userName = params.get('name') || 'Tester';
const token = params.get('token') || '';

let session: CallSession | null = null;
let socket: Socket | null = null;

function onSnapshot(snap: CallSnapshot) {
  state.peers = {};
  state.peerNames = {};
  state.peersWithMedia = [];
  state.trackKinds = {};
  for (const p of snap.peers) {
    state.peers[p.id] = p.connectionState;
    state.peerNames[p.id] = p.name;
    // A stream with a live track is the difference between "negotiated" and
    // "actually sending me something".
    const liveTracks = (p.stream?.getTracks() || []).filter((t) => t.readyState === 'live');
    if (liveTracks.length) state.peersWithMedia.push(p.id);
    // Kinds, not just presence: a video call that quietly degrades to audio
    // still reports "media arrived", which is the failure worth catching.
    state.trackKinds[p.id] = [...new Set(liveTracks.map((t) => t.kind))].sort();
  }
  state.warning = snap.warning;
  if (snap.active) state.phase = 'in-call';
  render();
}

async function boot() {
  try {
    if (!token) throw new Error('no token in query string');
    await signInWithCustomToken(auth, token);
    const idToken = await auth.currentUser!.getIdToken();
    state.phase = 'signed-in';
    render();

    socket = io({ reconnectionAttempts: 3, timeout: 10_000 });

    socket.on('connect', () => {
      state.socketId = socket!.id ?? null;
      render();
      socket!.emit('join-room', { roomId, userName, idToken, visibility: 'private' });
    });

    // The server refuses a join for a real reason (not signed in, not Pro,
    // suspended). Surfacing it means a failing test says WHY rather than just
    // timing out on a peer that never appears.
    socket.on('join-denied', ({ reason }: { reason: string }) => {
      state.joinDenied = reason;
      state.phase = 'error';
      render();
    });

    socket.on('room-users', () => {
      if (state.phase === 'signed-in') { state.phase = 'joined'; render(); }
    });

    /*
      EVENT TAPE. Every call-* message in and out, with a timestamp.

      Diagnosing a stalled negotiation from the end state is guesswork: 'new'
      with stable signalling looks the same whether an offer was never made,
      never sent, never arrived, or arrived and was ignored. The order is the
      answer, so it is recorded.
    */
    const t0 = performance.now();
    const stamp = () => Math.round(performance.now() - t0);

    const realEmit = socket.emit.bind(socket);
    (socket as unknown as { emit: (...a: unknown[]) => unknown }).emit =
      (name: string, ...args: unknown[]) => {
        if (String(name).startsWith('call-')) {
          const p0 = args[0] as { to?: string; sdp?: { type?: string } } | undefined;
          state.events.push({
            t: stamp(), dir: 'out', name,
            peer: p0?.to, kind: p0?.sdp?.type,
          });
          render();
        }
        return realEmit(name as never, ...(args as never[]));
      };

    socket.onAny((name: string, payload: { from?: string; sdp?: { type?: string } }) => {
      if (String(name).startsWith('call-')) {
        state.events.push({
          t: stamp(), dir: 'in', name,
          peer: payload?.from, kind: payload?.sdp?.type,
        });
        render();
      }
    });

    session = new CallSession(socket, userName, onSnapshot);

    window.__harness = {
      join: async (withVideo: boolean) => { await session!.join(withVideo); },
      leave: () => session!.leave(),
      toggleAudio: () => session!.toggleAudio(),
      // The snapshot's connectionState defaults to 'new' when no state change
      // has fired yet, so it cannot distinguish "negotiation never started"
      // from "no event yet". This reads the live objects instead.
      // The candidate lines Chromium actually produced. `iceGathering: gathering`
      // with an empty list means none were generated at all, which is a very
      // different problem from "generated but never delivered".
      candidates: () => {
        const out: Record<string, string[]> = {};
        for (const [id, peer] of (session as unknown as {
          peers: Map<string, { pc: RTCPeerConnection }>;
        }).peers.entries()) {
          const sdp = peer.pc.localDescription?.sdp || '';
          out[id] = sdp.split(/\r?\n/).filter((l) => l.startsWith('a=candidate'));
        }
        return out;
      },
      pcStates: () => {
        const out: Record<string, unknown> = {};
        for (const [id, peer] of (session as unknown as {
          peers: Map<string, { pc: RTCPeerConnection }>;
        }).peers.entries()) {
          out[id] = {
            connection: peer.pc.connectionState,
            signaling: peer.pc.signalingState,
            ice: peer.pc.iceConnectionState,
            iceGathering: peer.pc.iceGatheringState,
            senders: peer.pc.getSenders().map((sn) => sn.track?.kind ?? 'none'),
            receivers: peer.pc.getReceivers().map((r) => r.track?.kind ?? 'none'),
          };
        }
        return out;
      },
      readStats: async () => {
        // getStats() is the only honest answer to "is media flowing". A peer
        // can sit in `connected` with nothing crossing it.
        let total = 0;
        for (const pc of (session as unknown as {
          peers: Map<string, { pc: RTCPeerConnection }>;
        }).peers.values()) {
          const reports = await pc.pc.getStats();
          reports.forEach((r) => {
            if (r.type === 'inbound-rtp' && typeof r.bytesReceived === 'number') {
              total += r.bytesReceived;
            }
          });
        }
        state.inboundBytes = total;
        render();
        return total;
      },
    };
  } catch (err) {
    state.phase = 'error';
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

boot();
