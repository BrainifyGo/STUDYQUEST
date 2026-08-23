import { test, expect, type Browser } from '@playwright/test';
import { CallHarnessPage } from './pages/CallHarnessPage';
import { adminAvailable, cleanup, mintTokens } from './fixtures/testUsers';

/**
 * TWO REAL BROWSERS, ONE REAL CALL.
 *
 * This is the test StudyQuest did not have. The call feature was ported from
 * GhostChat, wired to the room's socket, shipped, and never once run between
 * two browsers — so "does a call actually connect" was an open question about
 * a feature people are being asked to pay for.
 *
 * WHAT WOULD MAKE THIS PASS FALSELY, and how each is closed:
 *
 *  - Two pages that never really negotiate. Closed by asserting the peer's own
 *    `RTCPeerConnection.connectionState`, taken from the live object rather
 *    than from anything the app decides to render.
 *  - A connection that carries nothing. Closed by `getStats()` — a peer can sit
 *    in `connected` with zero bytes crossing it, which is exactly what a broken
 *    media path looks like.
 *  - A mocked server. Closed by running the real `server.ts`, so the room
 *    membership check and the auth gate are the real ones.
 *
 * Proven to fail: dropping `call-offer` in the server's relay turns this red
 * with "alice never connected to <id>".
 *
 * EACH TEST OWNS ITS BROWSERS AND CLOSES THEM.
 * The first version kept every context open until the end of the file, and the
 * second test failed because the first test's two browsers were still holding
 * live peer connections and fake media devices. On a laptop that is enough to
 * stop the next negotiation completing — a failure that looks exactly like a
 * broken call and is entirely the test's fault.
 *
 * SERIAL, because both browsers share one signalling room on one server.
 *
 * ── KNOWN FLAKE, NOT YET ISOLATED ─────────────────────────────────────────
 * On this machine roughly one run in three fails with the peer's LIVE
 * `RTCPeerConnection.connectionState` stuck at 'new' — no candidate pair, SDP
 * already stable on both sides. It is worse under `--repeat-each`, where the
 * first repeat passes and later ones fail, which points at something degrading
 * inside the single reused Chromium process rather than at the test order.
 *
 * What has been RULED OUT: the auth gate (a separate PRO_REQUIRED race, fixed
 * in testUsers.ts), contexts leaking between tests (each test now closes its
 * own), and ICE candidate generation (fixed by
 * --force-webrtc-ip-handling-policy=default; candidates are now host + srflx).
 *
 * What has NOT been ruled out: a genuine race in `CallSession.join()` versus
 * the `call-join` handler, and plain resource exhaustion — this laptop runs
 * these with about 1.5 GB free.
 *
 * Retries are deliberately NOT enabled locally to paper over it. A flake you
 * cannot see is a flake nobody fixes.
 */
test.describe.configure({ mode: 'serial' });

/** A room and two signed-in browsers, torn down when the test ends. */
async function twoCallers(browser: Browser, tokens: string[], label: string) {
  const room = `e2e-${label}-${Date.now()}`;
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();

  const alice = new CallHarnessPage(await ctxA.newPage(), 'alice');
  const bob = new CallHarnessPage(await ctxB.newPage(), 'bob');

  // A harness that throws would otherwise surface as a silent 30s timeout.
  for (const p of [alice, bob]) {
    p.page.on('pageerror', (e) => console.error(`[${p.label}] ${e.message}`));
  }

  await alice.open({ room, name: 'Alice', token: tokens[0] });
  await bob.open({ room, name: 'Bob', token: tokens[1] });
  await alice.waitForRoom();
  await bob.waitForRoom();

  const close = async () => {
    await ctxA.close().catch(() => {});
    await ctxB.close().catch(() => {});
  };
  return { alice, bob, close };
}

test.describe('study room calls', () => {
  let tokens: string[] = [];

  test.skip(!adminAvailable(),
    'needs Firebase admin credentials in .env to mint test tokens');

  test.beforeAll(async () => { tokens = await mintTokens(); });
  test.afterAll(async () => { await cleanup(); });

  test('two browsers connect, and media actually flows between them', async ({ browser }) => {
    const { alice, bob, close } = await twoCallers(browser, tokens, 'call');
    try {
      const aliceId = await alice.socketId();
      const bobId = await bob.socketId();
      expect(aliceId).not.toBe(bobId);

      // Audio only. Video is its own test, so a failure says which one broke.
      await alice.joinCall(false);
      await bob.joinCall(false);

      await alice.waitForPeerConnected(bobId);
      await bob.waitForPeerConnected(aliceId);

      // And the UI agrees with reality — otherwise the call works while the
      // tile sits on "Connecting…" forever, which users report as broken.
      await alice.expectSnapshotAgrees(bobId);

      await alice.waitForMediaFrom(bobId);
      await bob.waitForMediaFrom(aliceId);

      // THE ASSERTION THAT MATTERS. `connected` only means the transport came
      // up. Bytes received is the difference between a call and a call-shaped
      // object.
      await expect
        .poll(() => alice.inboundBytes(), {
          message: 'alice received no audio bytes from bob', timeout: 20_000,
        })
        .toBeGreaterThan(0);

      await expect
        .poll(() => bob.inboundBytes(), {
          message: 'bob received no audio bytes from alice', timeout: 20_000,
        })
        .toBeGreaterThan(0);

      // No STUN/TURN warning on a local network. If this fires here the ICE
      // configuration is wrong, rather than the network being hostile.
      expect((await alice.state()).warning).toBeNull();
    } finally {
      await close();
    }
  });

  test('hanging up removes the peer from the other side', async ({ browser }) => {
    // Guards against a ghost participant: someone leaves and everyone else
    // keeps showing them for the rest of the session.
    const { alice, bob, close } = await twoCallers(browser, tokens, 'leave');
    try {
      const bobId = await bob.socketId();

      await alice.joinCall(false);
      await bob.joinCall(false);
      await alice.waitForPeerConnected(bobId);

      await bob.leaveCall();

      await expect
        .poll(async () => Object.keys((await alice.state()).peers), {
          message: 'bob stayed in the call after hanging up', timeout: 20_000,
        })
        .not.toContain(bobId);
    } finally {
      await close();
    }
  });

  test('a video call sends a video track as well as audio', async ({ browser }) => {
    const { alice, bob, close } = await twoCallers(browser, tokens, 'video');
    try {
      const bobId = await bob.socketId();

      await alice.joinCall(true);
      await bob.joinCall(true);

      await alice.waitForPeerConnected(bobId);
      await alice.waitForMediaFrom(bobId);

      // Two tracks, not one. Video calls silently degrading to audio is the
      // failure worth catching, and "media arrived" cannot tell them apart.
      await expect
        .poll(() => alice.trackKindsFrom(bobId), {
          message: 'alice never received a video track from bob', timeout: 30_000,
        })
        .toEqual(expect.arrayContaining(['audio', 'video']));
    } finally {
      await close();
    }
  });
});
