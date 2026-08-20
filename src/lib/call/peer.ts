/**
 * One peer link in the call mesh.
 *
 * Ported from GhostChat (`services/webrtc/PeerConnection.ts`) with the transport
 * left out on purpose: everything this class needs to say goes out through the
 * callbacks it is handed, so it does not know or care whether signalling rides
 * Supabase's broadcast channel (GhostChat) or a Socket.IO room (here). That is
 * the reason it ported cleanly rather than being rewritten.
 *
 * IT IMPLEMENTS "PERFECT NEGOTIATION", which is the part worth not reinventing.
 * When two people press Join at the same moment both sides fire an offer, and a
 * naive implementation deadlocks or drops the call — the classic "glare" bug.
 * Exactly one side of every pair is designated *polite* by comparing ids, and
 * the polite side backs down. Deterministic, no timers, no retry loop.
 */

/*
  STUN ONLY, AND THAT IS A REAL LIMITATION.

  STUN just tells each side what its own public address looks like; the media
  then flows directly between the two browsers, which is what makes this free to
  run. It works for most home and mobile networks.

  It does NOT work behind a symmetric NAT or a school firewall that blocks UDP,
  and a good number of schools do exactly that. Those calls need a TURN server,
  which relays the actual audio and video and therefore costs real money per
  gigabyte. There is no free TURN worth depending on.

  So: calls will work between two people at home and may well fail on a school
  network. That is a deliberate, documented trade rather than an oversight, and
  the UI says so when a connection fails instead of hanging on "Connecting…".
*/
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface PeerCallbacks {
  sendDescription: (sdp: RTCSessionDescriptionInit) => void;
  sendIce: (candidate: RTCIceCandidateInit) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onStateChange: (state: RTCPeerConnectionState) => void;
}

export class Peer {
  readonly peerId: string;
  readonly pc: RTCPeerConnection;
  private readonly polite: boolean;
  private readonly cb: PeerCallbacks;
  private readonly remoteStream = new MediaStream();

  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;
  private videoSender: RTCRtpSender | null = null;
  private audioSender: RTCRtpSender | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(peerId: string, selfId: string, cb: PeerCallbacks) {
    this.peerId = peerId;
    // Exactly one side of the pair is polite. Comparing ids is enough, and
    // needs no agreement between the two ends.
    this.polite = selfId > peerId;
    this.cb = cb;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) this.cb.sendDescription(this.pc.localDescription);
      } catch {
        /* transient; renegotiation will retry */
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.cb.sendIce(candidate.toJSON());
    };

    this.pc.ontrack = ({ track }) => {
      this.remoteStream.addTrack(track);
      this.cb.onRemoteStream(this.remoteStream);
      track.onended = () => {
        this.remoteStream.removeTrack(track);
        this.cb.onRemoteStream(this.remoteStream);
      };
    };

    this.pc.onconnectionstatechange = () => this.cb.onStateChange(this.pc.connectionState);
  }

  /** Add local tracks. Triggers negotiation by itself. */
  setLocalStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      const sender = this.pc.addTrack(track, stream);
      if (track.kind === 'video') this.videoSender = sender;
      if (track.kind === 'audio') this.audioSender = sender;
    }
  }

  /** Swap the outgoing video track (camera on/off) without renegotiating tracks. */
  async replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    if (this.videoSender) await this.videoSender.replaceTrack(track);
    else if (track) this.videoSender = this.pc.addTrack(track);
  }

  async replaceAudioTrack(track: MediaStreamTrack | null): Promise<void> {
    if (this.audioSender) await this.audioSender.replaceTrack(track);
    else if (track) this.audioSender = this.pc.addTrack(track);
  }

  async handleDescription(description: RTCSessionDescriptionInit): Promise<void> {
    const readyForOffer =
      !this.makingOffer &&
      (this.pc.signalingState === 'stable' || this.isSettingRemoteAnswerPending);
    const offerCollision = description.type === 'offer' && !readyForOffer;

    // The impolite side ignores a colliding offer; the polite side yields to it.
    // Between them exactly one offer survives.
    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return;

    this.isSettingRemoteAnswerPending = description.type === 'answer';
    await this.pc.setRemoteDescription(description);
    this.isSettingRemoteAnswerPending = false;

    // The remote description is set, so any candidates that arrived early can
    // be applied now.
    for (const c of this.pendingCandidates) {
      try {
        await this.pc.addIceCandidate(c);
      } catch {
        /* stale candidate */
      }
    }
    this.pendingCandidates = [];

    if (description.type === 'offer') {
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) this.cb.sendDescription(this.pc.localDescription);
    }
  }

  async handleIce(candidate: RTCIceCandidateInit): Promise<void> {
    // Candidates routinely arrive before the description they belong to.
    // Queueing them is the difference between a call that connects and one that
    // sometimes does.
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      if (!this.ignoreOffer) throw err;
    }
  }

  close(): void {
    this.pc.onnegotiationneeded = null;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.remoteStream.getTracks().forEach((t) => this.remoteStream.removeTrack(t));
    this.pc.close();
  }
}
