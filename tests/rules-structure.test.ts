/**
 * Static checks on firestore.rules — no emulator, no Java, runs anywhere in milliseconds.
 *
 * The behavioural tests in `rules.test.ts` are the real proof, but they need the Firestore
 * emulator (and therefore a JDK). These catch the specific *shapes* of mistake that caused the
 * 2026-08-11 bypasses, by reading the rules file as text — so there is at least one test that
 * runs on a fresh clone with nothing installed.
 *
 * Run:  npx vitest run tests/rules-structure.test.ts
 */
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const rules = readFileSync('firestore.rules', 'utf8');

/** The body of a `match /<collection>/{...}` block, up to the next match. */
function block(collection: string): string {
  const start = rules.indexOf(`match /${collection}/`);
  expect(start, `no match block for ${collection}`).toBeGreaterThan(-1);
  const rest = rules.slice(start + 1);
  const next = rest.indexOf('match /');
  return next === -1 ? rest : rest.slice(0, next);
}

describe('the users block', () => {
  const users = block('users');

  it('has exactly one create and one update rule', () => {
    // THE BUG THIS EXISTS FOR. A second `allow create` had been added without the role guard.
    // Firestore ORs allow statements, so the weaker rule silently defeated the stronger one and
    // a user could create their own document with role: 'admin'.
    expect(users.match(/allow create:/g) ?? [], 'duplicate allow create ORs with the strict one')
      .toHaveLength(1);
    expect(users.match(/allow update:/g) ?? []).toHaveLength(1);
  });

  it('pins every field that money depends on', () => {
    // Validating that isPro `is bool` is not the same as checking it hasn't changed — `true`
    // is a bool. Each of these must be compared against its existing value.
    //
    // `dailyGenerations` is deliberately NOT in this list. It reads like a quota but gates
    // nothing (App.tsx enforces `tokensUsedToday` instead), and the app writes it on every
    // generation — so pinning it rejected those writes along with the xp/level/badges/streak
    // fields sent in the same updateDoc. The token counters below are the real money.
    for (const field of [
      'isPro', 'subscriptionType',
      'tokensUsedToday', 'tokensUsedThisMonth', 'tokenResetDate', 'tokenDailyResetDate',
    ]) {
      expect(users + rules, `${field} is not pinned to its previous value`)
        .toMatch(new RegExp(`request\\.resource\\.data\\.get\\('${field}'`));
    }
  });

  it('does not pin the counter the app writes on every generation', () => {
    // The mirror of the test above, and the reason it exists: pinning this silently broke
    // saving progress for every user on the live app.
    expect(rules, 'dailyGenerations is pinned again — this breaks xp/level/badge writes')
      .not.toMatch(/request\.resource\.data\.get\('dailyGenerations'/);
  });

  it('stops a new account being created pre-upgraded', () => {
    expect(users).toMatch(/isPro'?,\s*false\)\s*==\s*false/);
  });

  it('only lets isPro change when a key stamped with this uid backs it', () => {
    // Without the usedBy check, recording any key id would be enough to grant yourself Pro.
    expect(rules).toMatch(/redeemedWithMyKey\(\)/);
    expect(rules).toMatch(/data\.usedBy\s*==\s*request\.auth\.uid/);
  });
});

describe('the upgrade_keys block', () => {
  const keys = block('upgrade_keys');

  it('cannot be enumerated', () => {
    // THE ORIGINAL EXPLOIT. `allow read: if isAuthenticated()` covers `list` as well as `get`,
    // so any signed-in user could pull the whole collection and redeem an unused key. A single
    // `get` by exact document id is fine — the id *is* the key, so you can only look up one you
    // already hold — but `list` must stay admin-only.
    expect(keys, 'a blanket read grants list, which makes every key readable')
      .not.toMatch(/allow read:\s*if\s+isAuthenticated\(\)\s*;/);
    expect(keys, 'list must be admin-only').toMatch(/allow list:\s*if\s+isAdmin\(\)\s*;/);
  });

  it('lets a key be spent but never un-spent or re-pointed', () => {
    // Redemption happens from the browser (Cloud Functions need the Blaze plan), so the rule
    // has to make claiming a key a one-way door on its own.
    expect(keys, 'a key must only go unused -> used')
      .toMatch(/resource\.data\.isUsed\s*==\s*false/);
    expect(keys, 'the claimer must be stamped on the key')
      .toMatch(/request\.resource\.data\.usedBy\s*==\s*request\.auth\.uid/);
    expect(keys, 'a spent monthly key must not be rewritten into a fresh annual one')
      .toMatch(/request\.resource\.data\.type\s*==\s*resource\.data\.type/);
  });

  it('still refuses client create and delete', () => {
    expect(keys).toMatch(/allow create, delete:\s*if\s+isAdmin\(\)\s*;/);
  });
});

describe('the study_mistakes block', () => {
  const m = block('study_mistakes');

  it('is owner-only', () => {
    expect(m).toMatch(/resource\.data\.user_id == request\.auth\.uid/);
  });

  it('allows delete', () => {
    // Retiring a mistake IS the reward loop. Without delete the list only ever
    // grows, which is the behaviour this feature exists to avoid.
    expect(m).toMatch(/allow delete:/);
  });

  it('stops a user writing a mistake onto someone else', () => {
    expect(m).toMatch(/request\.resource\.data\.user_id == request\.auth\.uid/);
    expect(m).toMatch(/request\.resource\.data\.user_id == resource\.data\.user_id/);
  });
});

describe('every collection', () => {
  it('requires authentication somewhere in each rule block', () => {
    const matches = rules.match(/match \/[a-z_]+\/\{[^}]+\}/g) ?? [];
    expect(matches.length).toBeGreaterThan(3);
    for (const m of matches) {
      const name = m.split('/')[1];
      const body = block(name);
      if (!body.includes('allow')) continue;
      expect(body, `${name} has a rule that never checks auth`)
        .toMatch(/isAuthenticated\(\)|isOwner\(|isAdmin\(|if false/);
    }
  });

  it('never contains a blanket allow-all', () => {
    expect(rules).not.toMatch(/allow read, write:\s*if true/);
    expect(rules).not.toMatch(/allow write:\s*if true/);
  });
});
