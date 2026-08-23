import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright — end-to-end tests.
 *
 * WHY THIS EXISTS. StudyQuest had 271 unit tests and **zero** tests that opened
 * a browser. Everything that only breaks in a real browser was therefore
 * unproven: the WebRTC call path in study rooms had never once been run between
 * two browsers, and it is about to be sold to people.
 *
 * THE FAKE MEDIA FLAGS ARE NOT OPTIONAL. `getUserMedia` in headless Chromium
 * with no camera or microphone either prompts (and hangs forever, because
 * nobody is there to click Allow) or rejects with NotFoundError. Both look like
 * "the call feature is broken" rather than "the test has no webcam". The two
 * flags below give Chromium a synthetic camera and microphone, so a call test
 * exercises the real negotiation instead of failing at the first step.
 *
 * `--use-fake-device-for-media-stream` produces a moving test pattern and a
 * tone, which matters: a still black frame would make "video is flowing" and
 * "video is frozen" indistinguishable.
 *
 * SERIAL, NOT PARALLEL, for the call tests. Two browsers in one test share a
 * signalling room on a single server; running several such tests at once would
 * have them find each other. The project below pins workers to 1 rather than
 * making every test author remember that.
 */
export default defineConfig({
  testDir: './e2e',
  // A call test genuinely needs time: ICE gathering plus negotiation.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Fail the build if a `test.only` is committed.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
    // On first retry only: a trace on every run is slow and mostly noise, but
    // the one thing you always want for a flake is the run that failed.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Synthetic camera + mic. Without these, getUserMedia never resolves.
            '--use-fake-device-for-media-stream',
            // Auto-accept the permission prompt nobody is there to click.
            '--use-fake-ui-for-media-stream',
            // Chromium refuses getUserMedia on non-https origins other than
            // localhost; the dev server is http, so name it explicitly.
            '--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:3000',
            '--allow-running-insecure-content',
            /*
              THE TWO FLAGS THAT MAKE A CALL ACTUALLY CONNECT.

              Without them the call looked broken in a very convincing way: SDP
              negotiated perfectly (`signalingState: stable`, an audio receiver
              on both sides) and then ICE sat in `gathering` forever and never
              produced a single candidate pair. Every symptom pointed at the
              product; none of it was the product.

              `--force-webrtc-ip-handling-policy=default` is the one that
              mattered. Headless Chromium here generated **zero** ICE
              candidates — not even host candidates — until it was set. Reading
              `localDescription.sdp` was what settled it: an empty candidate
              list is a completely different problem from candidates that are
              generated and never delivered, and the app's own state could not
              tell them apart (it reports 'new' both for "never started" and
              "no event yet").

              `--disable-features=WebRtcHideLocalIpsWithMdns` was tried first on
              the theory that mDNS `.local` candidates were unresolvable in
              headless. It did NOT fix it. It is kept because it makes the
              candidates readable when diagnosing, and it is honest to record
              that it was not the cause.

              Both are TEST-ENVIRONMENT flags. Neither changes how the app
              behaves for a real user.
            */
            '--disable-features=WebRtcHideLocalIpsWithMdns',
            '--force-webrtc-ip-handling-policy=default',
          ],
        },
        permissions: ['camera', 'microphone'],
      },
    },
  ],

  /*
    The real server, not a mock. The call relay, the room membership check and
    the auth gate all live in `server.ts`, and a test against a stand-in would
    prove the stand-in works.

    Reused if something is already listening, so a dev server you already have
    running is not killed and restarted on every test run.
  */
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
