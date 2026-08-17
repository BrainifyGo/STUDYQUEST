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

describe('the friends blocks', () => {
  const requests = block('friend_requests');
  const friendships = block('friendships');
  const profiles = block('public_profiles');

  it('only lets you send a request AS yourself', () => {
    // Without this, anyone could write a request claiming to be from someone
    // else — and the recipient would accept it believing it came from a friend.
    expect(requests).toMatch(/fromUid == request\.auth\.uid/);
  });

  it('pins the request id to the sender and recipient', () => {
    // Free-form ids would let one person write unlimited requests to another
    // under different ids. Pinned, a second attempt overwrites the first.
    expect(requests).toMatch(/reqId == request\.auth\.uid \+ '__' \+ request\.resource\.data\.toUid/);
  });

  it('never lets a request be edited', () => {
    expect(requests).toMatch(/allow update: if false/);
  });

  it('lets both sides delete a request — decline and withdraw', () => {
    expect(requests).toMatch(/allow delete[\s\S]*toUid == request\.auth\.uid/);
    expect(requests).toMatch(/allow delete[\s\S]*fromUid == request\.auth\.uid/);
  });

  it('requires a real request before a friendship can exist', () => {
    // THE RULE THE WHOLE FEATURE RESTS ON. Without the exists() check anyone
    // could write a friendship naming themselves and any uid they liked, and
    // appear in that person's friends list uninvited.
    expect(friendships).toMatch(/exists\(\/databases\/\$\(database\)\/documents\/friend_requests\//);
  });

  it('will not let an existing friendship be rewritten', () => {
    // In particular not `uids`, which would drag a third person in.
    expect(friendships).toMatch(/allow update: if false/);
  });

  it('only exposes a friendship to the two people in it', () => {
    expect(friendships).toMatch(/allow read: if isAuthenticated\(\) && request\.auth\.uid in resource\.data\.uids/);
  });

  it('keeps public profiles to the searchable fields only', () => {
    // hasOnly is the guard that stops a token count or a plan flag being
    // mirrored into the one collection every signed-in user can read.
    expect(profiles).toMatch(/hasOnly\(\['uid', 'username', 'displayName', 'displayLower', 'emailLower'\]\)/);
  });

  it('only lets you write your own public profile', () => {
    expect(profiles).toMatch(/allow create, update: if isAuthenticated\(\)\s*&& request\.auth\.uid == userId/);
  });

  it('does NOT open the users collection up for searching', () => {
    // The tempting shortcut was to relax /users so friend search could read it.
    // That would have exposed email, plan, token spend and progress to everyone.
    const users = block('users');
    expect(users).not.toMatch(/allow read: if isAuthenticated\(\);/);
  });
});

describe('an upgrade key can only be spent once', () => {
  const keys = block('upgrade_keys');
  const users = block('users');

  it('only lets a key go from unused to used', () => {
    // This is what stops TWO DIFFERENT ACCOUNTS using the same key: the second
    // one finds isUsed already true and the update is refused.
    expect(keys).toMatch(/resource\.data\.isUsed == false/);
    expect(keys).toMatch(/request\.resource\.data\.isUsed == true/);
  });

  it('stamps the key with the uid that claimed it', () => {
    expect(keys).toMatch(/request\.resource\.data\.usedBy == request\.auth\.uid/);
  });

  it('never lets a client create or delete a key', () => {
    // Otherwise a used key could simply be deleted and written again as unused.
    expect(keys).toMatch(/allow create, delete: if isAdmin\(\)/);
  });

  it('will not let the plan type be swapped during redemption', () => {
    // A monthly key must not be able to grant an annual subscription.
    expect(keys).toMatch(/request\.resource\.data\.type == resource\.data\.type/);
  });

  it('only grants Pro for a key stamped with YOUR uid', () => {
    expect(users || true).toBeTruthy();
    expect(rules).toMatch(/get\(path\)\.data\.usedBy == request\.auth\.uid/);
    expect(rules).toMatch(/get\(path\)\.data\.isUsed == true/);
  });

  it('pins redeemedKey on any write that is not itself a redemption', () => {
    /*
      THE HOLE THIS CLOSES, on the same account rather than a second one:

        1. redeem K            -> isPro true,  redeemedKey 'K'
        2. subscription lapses -> isPro false, redeemedKey 'K'
        3. write redeemedKey:'' — allowed, because paidFieldsUnchanged() only
           looks at isPro and subscriptionType, and neither moved
        4. re-redeem K — `k != resource.data.redeemedKey` now compares against
           '' and passes, so the same key grants Pro a second time.

      Step 3 is the bug. The field is pinned unless the write IS a redemption.
    */
    expect(rules).toMatch(/function redeemedKeyUnchanged\(\)/);
    expect(rules).toMatch(
      /paidFieldsUnchanged\(\) && redeemedKeyUnchanged\(\)\s*\)?\s*\|\|\s*redeemedWithMyKey\(\)/
    );
  });

  it('still refuses a key already recorded on this account', () => {
    // The original guard, kept — it is what stops an immediate double redeem
    // before anything has had a chance to clear the field.
    expect(rules).toMatch(/k != resource\.data\.get\('redeemedKey', ''\)/);
  });

  it('does not let anyone list the key collection', () => {
    // Fishing for an unused key would make single-use irrelevant.
    expect(keys).toMatch(/allow list: if isAdmin\(\)/);
  });
});
