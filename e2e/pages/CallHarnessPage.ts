import { expect, type Page } from '@playwright/test';

/** What the harness page publishes about the call, read straight from the DOM's JS. */
export interface CallState {
  phase: 'booting' | 'signed-in' | 'joined' | 'in-call' | 'error';
  error: string | null;
  socketId: string | null;
  peers: Record<string, string>;
  peerNames: Record<string, string>;
  peersWithMedia: string[];
  trackKinds: Record<string, string[]>;
  inboundBytes: number;
  warning: string | null;
  joinDenied: string | null;
  events: Array<{ t: number; dir: 'in' | 'out'; name: string; peer?: string; kind?: string }>;
}

/**
 * One browser in a call.
 *
 * Every assertion here is on STATE the page publishes rather than on rendered
 * pixels, because the facts that matter in a call are invisible: whether the
 * RTCPeerConnection reached `connected`, and whether bytes are actually
 * crossing it. A screenshot cannot tell a live call from a frozen one.
 */
export class CallHarnessPage {
  constructor(readonly page: Page, readonly label: string) {}

  async open(opts: { room: string; name: string; token: string }) {
    const qs = new URLSearchParams({
      room: opts.room, name: opts.name, token: opts.token,
    });
    await this.page.goto(`/e2e/fixtures/call-harness.html?${qs}`);
  }

  state(): Promise<CallState> {
    return this.page.evaluate(() => window.__call as unknown as CallState);
  }

  /** Wait until the server has accepted the socket into the room. */
  async waitForRoom() {
    await expect
      .poll(async () => {
        const s = await this.state();
        // Surface a refusal immediately rather than timing out on it. "Not Pro"
        // and "the call is broken" are completely different problems.
        if (s.joinDenied) throw new Error(`${this.label}: join denied — ${s.joinDenied}`);
        if (s.error) throw new Error(`${this.label}: ${s.error}`);
        return s.phase;
      }, { message: `${this.label} never joined the room`, timeout: 30_000 })
      .toBe('joined');
  }

  async joinCall(withVideo = false) {
    await this.page.evaluate((v) => window.__harness.join(v), withVideo);
  }

  async leaveCall() {
    await this.page.evaluate(() => window.__harness.leave());
  }

  async socketId(): Promise<string> {
    const id = (await this.state()).socketId;
    expect(id, `${this.label} has no socket id`).toBeTruthy();
    return id!;
  }

  /**
   * Wait for a peer's connection to come up, read from the LIVE
   * RTCPeerConnection.
   *
   * NOT from the app's own snapshot, which was the first version and was wrong
   * for a subtle reason: `CallSession.emit()` reports
   * `this.states.get(id) || 'new'`, so 'new' means BOTH "the connection has not
   * started" and "no connectionstatechange event has been recorded yet". A test
   * asserting on that cannot tell a stalled call from a call whose state simply
   * has not been observed, and it produced a flake that looked like a broken
   * product every few runs.
   *
   * The live object is the ground truth. `expectSnapshotAgrees` below is the
   * separate check that the app's reported state eventually matches it — which
   * is a real user-facing concern (a tile stuck on "Connecting…"), but a
   * different one from whether the call connected.
   */
  async waitForPeerConnected(peerId: string) {
    await expect
      .poll(async () => {
        const live = await this.pcStates();
        const entry = live[peerId] as { connection?: string } | undefined;
        if (entry?.connection) return entry.connection;
        const s = await this.state();
        return `ABSENT (phase=${s.phase} peers=${JSON.stringify(s.peers)} `
          + `error=${s.error} denied=${s.joinDenied})`;
      }, {
        message: `${this.label} never connected to ${peerId}`,
        timeout: 45_000,
      })
      // 'completed' is a legitimate end state on some paths; both mean connected.
      .toMatch(/^(connected|completed)$/);
  }

  /** The app's own reported state for a peer should catch up with reality. */
  async expectSnapshotAgrees(peerId: string) {
    await expect
      .poll(async () => (await this.state()).peers[peerId], {
        message: `${this.label}'s UI never showed ${peerId} as connected — `
          + 'the call works but the tile would sit on "Connecting…"',
        timeout: 15_000,
      })
      .toMatch(/^(connected|completed)$/);
  }

  async waitForMediaFrom(peerId: string) {
    await expect
      .poll(async () => (await this.state()).peersWithMedia, {
        message: `${this.label} never received a live track from ${peerId}`,
        timeout: 45_000,
      })
      .toContain(peerId);
  }

  /** The live RTCPeerConnection state for every peer — the ground truth. */
  pcStates(): Promise<Record<string, unknown>> {
    return this.page.evaluate(() => window.__harness.pcStates());
  }

  /** Which kinds of live track are arriving from a peer, e.g. ['audio','video']. */
  async trackKindsFrom(peerId: string): Promise<string[]> {
    return (await this.state()).trackKinds[peerId] ?? [];
  }

  /** Bytes received across every peer connection, from getStats(). */
  async inboundBytes(): Promise<number> {
    return this.page.evaluate(() => window.__harness.readStats());
  }
}
