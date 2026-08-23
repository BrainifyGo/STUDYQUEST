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

  /*
    ONE SIGNALLING OPERATION AT A TIME.

    `onnegotiationneeded` and `handleDescription` both call
    `setLocalDescription` on the same connection, and both are async. The
    `makingOffer` flag was supposed to keep them apart, but it is read BEFORE
    the first await and set INSIDE the other handler — so the two interleave and
    the flag is stale by the time it matters.

    Measured, not theorised. Two browsers joining within ~100ms of each other
    produced this tape on the polite side:

        t=436  in   call-offer      (remote offer arrives)
        t=439  out  call-offer      (negotiationneeded fires mid-await)
        t=443  out  call-answer

    An offer AND an answer for the same peer, from two setLocalDescription calls
    racing each other. SDP still settled to `stable` on both sides, so it looked
    fine — but that side then emitted **zero ICE candidates** for the rest of the
    call, received seven, and sat at `iceGatheringState: 'gathering'` forever.

    For a user that is a call which simply never connects, roughly one time in
    three, with nothing in the UI to explain it. Serialising every SDP operation
    through this chain makes the interleave impossible rather than unlikely.
  */
  private chain: Promise<unknown> = Promise.resolve();

  /*
    Has this pair ever completed a negotiation? Until it has, only ONE side is
    allowed to open one -- see the note on `onnegotiationneeded`.
  */
  private negotiated = false;

  /** Run `fn` after every previously queued operation, in order. */
  private queue<T>(fn: () => Promise<T>): Promise<T> {
    // `.then(run, run)` rather than `.then(run)`: a rejected earlier operation
    // must not stall every later one. A failed renegotiation is recoverable;
    // a permanently blocked queue is not.
    const run = () => fn();
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    return next;
  }

  constructor(
    peerId: string,
    selfId: string,
    cb: PeerCallbacks,
    /*
      Passed in rather than read from the module, because they are fetched at
      call time: TURN credentials expire, so they cannot be a constant. Defaults
      to the STUN-only list so every existing caller and test behaves as before.
    */
    iceServers: RTCIceServer[] = ICE_SERVERS,
  ) {
    this.peerId = peerId;
    // Exactly one side of the pair is polite. Comparing ids is enough, and
    // needs no agreement between the two ends.
    this.polite = selfId > peerId;
    this.cb = cb;
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.onnegotiationneeded = () => {
      void this.queue(async () => {
        try {
          /*
            ONLY ONE SIDE OPENS THE FIRST NEGOTIATION.

            Both peers add their local tracks at almost the same moment, so both
            fire `onnegotiationneeded` and both offer. Perfect negotiation is
            supposed to absorb that: the polite side rolls back and answers.

            It does resolve the SDP -- both ends reach `stable` with senders and
            receivers, which is why this looked fine. But measured in Chromium,
            **the side that rolls back then emits no ICE candidates at all**. It
            receives the other side's seven and sends none, and sits at
            `iceGatheringState: 'gathering'` forever. For a user that is a call
            that never connects, about one time in three, with nothing in the UI
            to explain it.

            Serialising the operations (the queue above) was not enough -- it
            only moved which side rolled back. So the collision is avoided
            instead of survived: before the first successful negotiation, the
            polite side creates its peer, adds its tracks and waits to be
            called. Exactly one offer is ever made, and neither side rolls back.

            AFTER that first negotiation, either side may renegotiate freely --
            turning a camera on has to work from both ends — and by then the
            queue plus perfect negotiation handle it, because an established
            connection keeps its ICE.
          */
          if (!this.negotiated && this.polite) return;

          this.makingOffer = true;
          // Re-check inside the queue: by the time this runs, a remote offer may
          // already have moved us out of `stable`, and creating an offer here
          // would be the collision this queue exists to prevent.
          if (this.pc.signalingState !== 'stable') return;
          await this.pc.setLocalDescription();
          if (this.pc.localDescription) this.cb.sendDescription(this.pc.localDescription);
        } catch {
          /* transient; renegotiation will retry */
        } finally {
          this.makingOffer = false;
        }
      });
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

  handleDescription(description: RTCSessionDescriptionInit): Promise<void> {
    // Through the queue, so this can never interleave with an offer being
    // created by `onnegotiationneeded`. See the note on `chain` above.
    return this.queue(() => this.applyDescription(description));
  }

  private async applyDescription(description: RTCSessionDescriptionInit): Promise<void> {
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
    // From here on both sides may renegotiate: the connection exists, so a
    // later offer (someone turning their camera on) cannot cost us the ICE
    // gathering the way a collision on the FIRST negotiation does.
    this.negotiated = true;

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
