/**
 * A mesh call inside a study room.
 *
 * Ported from GhostChat's `CallSession`, with Supabase broadcast swapped for the
 * Socket.IO connection the room already holds. Everything else — the mesh, the
 * roster, perfect negotiation via `Peer` — is the same design, because it was
 * the right one and it had already been debugged against real calls.
 *
 * A MESH, NOT A SERVER MIX. Everyone connects directly to everyone else, so N
 * people means N-1 connections each. That is fine for a study room of three or
 * four and would be wrong for thirty: upload cost grows with every participant.
 * `MAX_CALL_PEERS` is where that line is drawn, and it is drawn low on purpose,
 * because the people on the far end are on school wifi and phone data.
 *
 * The server relays signalling and nothing else. Audio and video go straight
 * between browsers and never touch it — which is what makes calls free to run,
 * and also why they need a TURN server to survive a restrictive firewall. See
 * the note on ICE_SERVERS in peer.ts.
 */
import type { Socket } from 'socket.io-client';
import { ICE_SERVERS, Peer } from './peer';
import { fetchIceServers } from './ice';
import { createVad, getLocalMedia, stopStream } from './media';

/** Above this, a mesh stops being kind to the people in it. */
export const MAX_CALL_PEERS = 6;

export interface CallMediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface CallPeer {
  id: string;
  name: string;
  stream: MediaStream | null;
  speaking: boolean;
  connectionState: RTCPeerConnectionState;
}

export interface CallSnapshot {
  active: boolean;
  peers: CallPeer[];
  media: CallMediaState;
  localStream: MediaStream | null;
  /** Set when a peer link fails outright — usually a firewall with no TURN. */
  warning: string | null;
}

type Listener = (snap: CallSnapshot) => void;

export class CallSession {
  private socket: Socket;
  private selfName: string;
  private listener: Listener;

  private peers = new Map<string, Peer>();
  private roster = new Map<string, { name: string }>();
  private streams = new Map<string, MediaStream>();
  private speaking = new Map<string, boolean>();
  private states = new Map<string, RTCPeerConnectionState>();

  private localStream: MediaStream | null = null;
  private stopVad: (() => void) | null = null;
  private media: CallMediaState = { audioEnabled: true, videoEnabled: false };
  /*
    Resolved once when the call is joined, then reused for every peer in it.
    Fetching per peer would mean a round trip each time somebody new arrives,
    and hand different people in the same call different credentials.
  */
  private iceServers: RTCIceServer[] = ICE_SERVERS;
  private active = false;
  private warning: string | null = null;

  constructor(socket: Socket, selfName: string, listener: Listener) {
    this.socket = socket;
    this.selfName = selfName;
    this.listener = listener;
    this.bind();
  }

  private get selfId(): string {
    return this.socket.id || '';
  }

  private bind(): void {
    this.socket.on('call-join', ({ from, name }: { from: string; name: string }) => {
      if (from === this.selfId) return;
      this.roster.set(from, { name });
      // Only dial out if we are actually in the call. Otherwise we just note
      // that somebody is calling, so the UI can offer to join.
      if (this.active) this.ensurePeer(from);
      this.emit();
    });

    this.socket.on('call-leave', ({ from }: { from: string }) => {
      this.removePeer(from);
      this.emit();
    });

    this.socket.on('call-offer', async ({ from, name, sdp }: any) => {
      if (!this.active) return;
      this.roster.set(from, { name });
      await this.ensurePeer(from).handleDescription(sdp);
    });

    this.socket.on('call-answer', async ({ from, sdp }: any) => {
      await this.peers.get(from)?.handleDescription(sdp);
    });

    this.socket.on('call-ice', async ({ from, candidate }: any) => {
      try {
        await this.peers.get(from)?.handleIce(candidate);
      } catch {
        /* a stale candidate is normal and not worth surfacing */
      }
    });
  }

  /** Join the call, turning on the mic (and camera, if asked). */
  async join(withVideo: boolean): Promise<void> {
    if (this.active) return;

    // Before any peer exists, because a peer's ICE servers are fixed at
    // construction. Never throws: falls back to STUN and the call still works
    // everywhere it worked before.
    this.iceServers = await fetchIceServers();

    this.localStream = await getLocalMedia({ audio: true, video: withVideo });
    this.media = { audioEnabled: true, videoEnabled: withVideo };
    this.active = true;
    this.warning = null;

    this.stopVad = createVad(this.localStream, (isSpeaking) => {
      this.speaking.set(this.selfId, isSpeaking);
      this.emit();
    });

    // Anyone already in the call answers this by dialling us.
    this.socket.emit('call-join', { media: this.media });

    // And we dial anyone we already knew about, so the first two people in
    // connect without waiting for a third event.
    for (const id of this.roster.keys()) this.ensurePeer(id);

    this.emit();
  }

  leave(): void {
    if (!this.active) return;
    this.socket.emit('call-leave', {});

    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.streams.clear();
    this.states.clear();
    this.speaking.clear();

    this.stopVad?.();
    this.stopVad = null;
    // Without this the camera light stays on after the call, which people
    // reasonably read as still being watched.
    stopStream(this.localStream);
    this.localStream = null;

    this.active = false;
    this.warning = null;
    this.emit();
  }

  /** Mute or unmute. The track stays in place so no renegotiation is needed. */
  toggleAudio(): void {
    if (!this.localStream) return;
    const on = !this.media.audioEnabled;
    this.localStream.getAudioTracks().forEach((t) => { t.enabled = on; });
    this.media = { ...this.media, audioEnabled: on };
    this.emit();
  }

  /**
   * Camera on or off.
   *
   * Turning it ON when the call started audio-only means acquiring a track that
   * does not exist yet and pushing it into every existing connection —
   * `replaceTrack` rather than a new negotiation wherever possible.
   */
  async toggleVideo(): Promise<void> {
    if (!this.localStream) return;

    if (this.media.videoEnabled) {
      this.localStream.getVideoTracks().forEach((t) => {
        t.stop();
        this.localStream?.removeTrack(t);
      });
      for (const peer of this.peers.values()) await peer.replaceVideoTrack(null);
      this.media = { ...this.media, videoEnabled: false };
    } else {
      const cam = await getLocalMedia({ audio: false, video: true });
      const track = cam.getVideoTracks()[0];
      if (!track) return;
      this.localStream.addTrack(track);
      for (const peer of this.peers.values()) await peer.replaceVideoTrack(track);
      this.media = { ...this.media, videoEnabled: true };
    }
    this.emit();
  }

  destroy(): void {
    this.leave();
    for (const ev of ['call-join', 'call-leave', 'call-offer', 'call-answer', 'call-ice']) {
      this.socket.off(ev);
    }
  }

  private ensurePeer(peerId: string): Peer {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    if (this.peers.size >= MAX_CALL_PEERS) {
      this.warning = `Calls are limited to ${MAX_CALL_PEERS} people. Everyone connects directly to everyone else, and more than that drops the quality for the whole room.`;
      this.emit();
      return existing as unknown as Peer;
    }

    const peer = new Peer(peerId, this.selfId, {
      sendDescription: (sdp) => {
        this.socket.emit(sdp.type === 'offer' ? 'call-offer' : 'call-answer', {
          to: peerId,
          sdp,
        });
      },
      sendIce: (candidate) => this.socket.emit('call-ice', { to: peerId, candidate }),
      onRemoteStream: (stream) => {
        this.streams.set(peerId, stream);
        this.emit();
      },
      onStateChange: (state) => {
        this.states.set(peerId, state);
        /*
          "failed" here is nearly always the firewall case described in peer.ts:
          both sides are fine, no relay exists to get between them. Saying so is
          better than a tile that says Connecting forever.
        */
        if (state === 'failed') {
          this.warning =
            "Couldn't connect to someone in the call. This usually means a school or office network is blocking it — try again on home wifi or mobile data.";
        }
        this.emit();
      },
    }, this.iceServers);

    this.peers.set(peerId, peer);
    if (this.localStream) peer.setLocalStream(this.localStream);
    return peer;
  }

  private removePeer(peerId: string): void {
    this.peers.get(peerId)?.close();
    this.peers.delete(peerId);
    this.streams.delete(peerId);
    this.states.delete(peerId);
    this.speaking.delete(peerId);
    this.roster.delete(peerId);
  }

  private emit(): void {
    const peers: CallPeer[] = Array.from(this.peers.keys()).map((id) => ({
      id,
      name: this.roster.get(id)?.name || 'Student',
      stream: this.streams.get(id) || null,
      speaking: !!this.speaking.get(id),
      connectionState: this.states.get(id) || 'new',
    }));

    this.listener({
      active: this.active,
      peers,
      media: this.media,
      localStream: this.localStream,
      warning: this.warning,
    });
  }
}
