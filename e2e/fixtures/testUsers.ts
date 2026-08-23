import { config } from 'dotenv';
import admin from 'firebase-admin';

config();

/**
 * Two throwaway Pro accounts, for tests that have to get past the real auth gate.
 *
 * WHY REAL ACCOUNTS AND NOT A STUB. `join-room` verifies a Firebase ID token
 * with the Admin SDK and reads the plan from Firestore, failing closed on any
 * error. Both checks exist because a study room is full of children and the
 * feature is paid. A test that stubbed either one would be testing the stub —
 * and the auth gate is exactly the sort of thing that breaks silently.
 *
 * These use FIXED uids prefixed `e2e-`, so a run reuses the same two accounts
 * rather than filling the project with new ones. `cleanup()` removes the
 * Firestore documents afterwards; the auth users are left, because deleting and
 * recreating them every run is slower and buys nothing.
 *
 * The suite SKIPS ITSELF cleanly when admin credentials are absent, so a fresh
 * clone can run `npm run test:e2e` without a service account and get an honest
 * "skipped", not a wall of failures.
 */

export const E2E_UIDS = ['e2e-caller-a', 'e2e-caller-b'] as const;

export function adminAvailable(): boolean {
  return !!(process.env.FIREBASE_CLIENT_EMAIL
    && process.env.FIREBASE_PRIVATE_KEY
    && process.env.VITE_FIREBASE_PROJECT_ID);
}

function app(): admin.app.App {
  if (admin.apps.length) return admin.apps[0]!;
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // The key is stored with escaped newlines in .env, as it must be.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  });
}

/**
 * A custom token per test user, with the Pro plan written to Firestore first.
 *
 * Order matters: `join-room` reads the plan the moment the socket connects, so
 * writing it after handing out the token would make the test flaky in a way
 * that looks like a call bug.
 */
export async function mintTokens(): Promise<string[]> {
  const a = app();
  const auth = a.auth();
  const db = a.firestore();

  const tokens: string[] = [];
  for (const uid of E2E_UIDS) {
    await db.collection('users').doc(uid).set({
      isPro: true,
      plan: 'pro',
      displayName: `E2E ${uid}`,
      e2e: true,           // so a human reading the console knows what this is
    }, { merge: true });
    tokens.push(await auth.createCustomToken(uid));
  }
  return tokens;
}

export async function cleanup(): Promise<void> {
  /*
    DELIBERATELY LEAVES THE TWO TEST USERS IN PLACE.

    The first version deleted their Firestore documents here, and it made the
    suite flaky in a way that pointed at the wrong thing: with `--repeat-each`,
    `afterAll` ran while later repeats were still going, so the Pro flag vanished
    underneath them. One browser was then refused with PRO_REQUIRED — and the
    OTHER browser, which had joined fine, simply reported "never connected to
    <peer>". Two failures, two very different-looking messages, one cause, and
    neither of them the call code.

    The accounts are two fixed uids prefixed `e2e-` and cost nothing to keep.
    Leaving them makes every run start from the same known state, which is worth
    more than a tidy user list.

    Only the suspension counter is cleared, because a test that reports a user
    would otherwise leave a real suspension behind.
  */
  try {
    const db = app().firestore();
    for (const uid of E2E_UIDS) {
      await db.collection('suspensions').doc(uid).delete().catch(() => {});
    }
  } catch {
    /* cleanup must never fail a run that otherwise passed */
  }
}
