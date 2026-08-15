/**
 * Firestore security rules — the tests that would have caught three live billing bypasses.
 *
 * On 2026-08-11 an audit found that any signed-in user could, from the browser console:
 *
 *   1. grant themselves Pro          updateDoc(doc(db,'users',myUid), { isPro: true })
 *   2. reset their own AI budget     { tokensUsedToday: 0 }           (costs real money/call)
 *   3. make themselves an admin      create their own doc with role: 'admin'
 *   4. read every upgrade key        the whole collection was readable
 *
 * None of it was exotic. `isValidUser()` checked that `isPro` was a *bool* — and `true` is a
 * bool — so it validated the SHAPE of the data and never asked whether this user was allowed
 * to change it. #3 was subtler still: a second `allow create` had been added without the role
 * guard, and Firestore ORs allow statements, so the weaker rule quietly defeated the stronger.
 *
 * These are the first tests in the project, and rules are the right place to start: the whole
 * business model rests on them, and unlike UI they can be proven true in milliseconds.
 *
 * Run:  npx firebase emulators:exec --only firestore "npx vitest run tests/rules.test.ts"
 */
import { readFileSync } from 'fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let env: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const KEY = 'SECRET-KEY-123';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'brainify-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  // Seed as admin (withSecurityRulesDisabled) so the starting state is what the app would
  // legitimately have, not something the rules had to permit.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ALICE), {
      uid: ALICE, email: 'alice@example.com', isPro: false,
      subscriptionType: 'none', dailyGenerations: 4, role: 'client',
      tokensUsedToday: 1500, tokensUsedThisMonth: 20000,
      tokenResetDate: '2026-08', tokenDailyResetDate: '2026-08-13',
    });
    // The document ID *is* the key. That is what lets redemption be a direct lookup instead
    // of a collection query, which is what made every key readable in the first place.
    await setDoc(doc(db, 'upgrade_keys', KEY), {
      key: KEY, type: 'annual', isUsed: false,
    });
  });
});

const alice = () => env.authenticatedContext(ALICE).firestore();
const bob = () => env.authenticatedContext(BOB).firestore();

describe('paid fields', () => {
  it('a user CANNOT make themselves Pro', async () => {
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), { isPro: true })
    );
  });

  it('a user CANNOT give themselves a subscription type', async () => {
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), { subscriptionType: 'annual' })
    );
  });

  it('a user CANNOT reset the token budget that costs real money', async () => {
    // The rollover used to run in the browser, so this was a supported operation.
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), { tokensUsedToday: 0 })
    );
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), { tokensUsedThisMonth: 0 })
    );
  });

  it('a user CANNOT fake a rollover date to win a fresh budget', async () => {
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), { tokenDailyResetDate: '1999-01-01' })
    );
  });

  it('a user CAN still record a generation', async () => {
    // dailyGenerations is deliberately NOT pinned: nothing gates on it, and the app writes it
    // on every generation alongside xp/level/badges. Pinning it rejected all of those.
    await assertSucceeds(
      updateDoc(doc(alice(), 'users', ALICE), {
        dailyGenerations: 5, xp: 120, level: 2, badges: ['Weekly Warrior'],
      })
    );
  });

  it('a user CANNOT sneak isPro through alongside a legitimate change', async () => {
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), { displayName: 'Alice', isPro: true })
    );
  });

  it('but CAN still edit their own ordinary profile fields', async () => {
    await assertSucceeds(
      updateDoc(doc(alice(), 'users', ALICE), { displayName: 'Alice', notifications: true })
    );
  });

  it('a new account cannot be created already upgraded', async () => {
    await assertFails(
      setDoc(doc(bob(), 'users', BOB), {
        uid: BOB, email: 'bob@example.com', isPro: true, subscriptionType: 'annual',
      })
    );
  });

  it('a normal new account is fine', async () => {
    await assertSucceeds(
      setDoc(doc(bob(), 'users', BOB), { uid: BOB, email: 'bob@example.com' })
    );
  });
});

describe('privilege escalation', () => {
  it('a user CANNOT create themselves as an admin', async () => {
    // The bug: a second `allow create` without the role guard was OR'd with the first, so this
    // was permitted — and isAdmin() then granted read access to every other user's data.
    await assertFails(
      setDoc(doc(bob(), 'users', BOB), { uid: BOB, email: 'bob@example.com', role: 'admin' })
    );
  });

  it('a user CANNOT promote themselves later', async () => {
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), { role: 'admin' })
    );
  });

  it("a user CANNOT read someone else's profile", async () => {
    await assertFails(getDoc(doc(bob(), 'users', ALICE)));
  });

  it('a user CAN read their own profile', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users', ALICE)));
  });
});

describe('upgrade keys are secret', () => {
  it('a user CANNOT list the keys', async () => {
    // This was the whole exploit: enumerate the collection, read an unused key, redeem it.
    await assertFails(getDocs(collection(bob(), 'upgrade_keys')));
  });

  it('a user CAN read a key whose exact string they were given', async () => {
    // Not a leak: the document id *is* the secret, so this returns nothing they didn't have.
    // It is only safe because `list` above is denied — otherwise ids are trivially discovered.
    await assertSucceeds(getDoc(doc(bob(), 'upgrade_keys', KEY)));
  });

  it('a user CANNOT guess a key they were never given', async () => {
    const snap = await getDoc(doc(bob(), 'upgrade_keys', 'SOME-OTHER-KEY'));
    expect(snap.exists()).toBe(false);
  });
});

describe('redeeming a key', () => {
  const claim = (db: ReturnType<typeof bob>, uid: string) =>
    updateDoc(doc(db, 'upgrade_keys', KEY), { isUsed: true, usedBy: uid });

  it('works end to end: claim the key, then the upgrade lands', async () => {
    await assertSucceeds(claim(alice(), ALICE));
    await assertSucceeds(
      updateDoc(doc(alice(), 'users', ALICE), {
        isPro: true, subscriptionType: 'annual', redeemedKey: KEY,
      })
    );
  });

  it('CANNOT grant Pro without claiming the key first', async () => {
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), {
        isPro: true, subscriptionType: 'annual', redeemedKey: KEY,
      })
    );
  });

  it('CANNOT ride on a key claimed by someone else', async () => {
    await assertSucceeds(claim(bob(), BOB));
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), {
        isPro: true, subscriptionType: 'annual', redeemedKey: KEY,
      })
    );
  });

  it('CANNOT claim a key that is already spent', async () => {
    await assertSucceeds(claim(bob(), BOB));
    await assertFails(claim(alice(), ALICE));
  });

  it('CANNOT un-spend a key to reuse it', async () => {
    await assertSucceeds(claim(bob(), BOB));
    await assertFails(
      updateDoc(doc(bob(), 'upgrade_keys', KEY), { isUsed: false })
    );
  });

  it('CANNOT upgrade a monthly key into an annual subscription', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'upgrade_keys', KEY), {
        key: KEY, type: 'monthly', isUsed: false,
      });
    });
    await assertSucceeds(claim(alice(), ALICE));
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), {
        isPro: true, subscriptionType: 'annual', redeemedKey: KEY,
      })
    );
  });

  it('CANNOT rewrite the type on the key itself while claiming it', async () => {
    await assertFails(
      updateDoc(doc(alice(), 'upgrade_keys', KEY), {
        isUsed: true, usedBy: ALICE, type: 'annual', key: 'SOMETHING-ELSE',
      })
    );
  });

  it('CANNOT point at a key that does not exist', async () => {
    await assertFails(
      updateDoc(doc(alice(), 'users', ALICE), {
        isPro: true, subscriptionType: 'annual', redeemedKey: 'MADE-UP-KEY',
      })
    );
  });

  it('CANNOT stamp someone else onto a key', async () => {
    await assertFails(claim(alice(), BOB));
  });
});

describe('user data stays private', () => {
  it("a user CANNOT read another user's exams", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'exams', 'e1'), {
        userId: ALICE, subject: 'Biology', date: '2026-09-01',
        importance: 'high', completed: false, createdAt: '2026-08-01',
      });
    });
    await assertFails(getDoc(doc(bob(), 'exams', 'e1')));
  });

  it('an unauthenticated visitor gets nothing', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'users', ALICE)));
  });
});
