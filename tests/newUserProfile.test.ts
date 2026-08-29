/**
 * The users/{uid} document written for a new account.
 *
 * There is one thing here that is not a style preference. `firestore.rules`
 * accepts displayName only when it is a string:
 *
 *     (!('displayName' in data) || data.displayName is string && data.displayName.size() < 100)
 *
 * A fresh email/password account has displayName === null on the Firebase Auth
 * user, so writing it through means the key is present and is not a string —
 * isValidUser() is false and the create is refused. That is exactly what
 * AuthWrapper did, and it threw an uncaught "Missing or insufficient
 * permissions" on every new email signup in production.
 *
 * So these tests are written against the rule, not against the current output.
 */
import { describe, expect, it } from 'vitest';
import type { User } from 'firebase/auth';
import { displayNameFor, newUserProfile } from '../src/lib/newUserProfile';

type AuthUser = Pick<User, 'uid' | 'email' | 'displayName' | 'photoURL'>;

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  uid: 'abc123',
  email: 'ola@example.com',
  displayName: null,      // what email/password actually gives you
  photoURL: null,
  ...over,
});

describe('the rule that refused the write', () => {
  it('displayName is a string for a fresh email/password account', () => {
    // THE REGRESSION. displayName: null here is a permission-denied in prod.
    const p = newUserProfile(user());
    expect(typeof p.displayName).toBe('string');
    expect(p.displayName).not.toBeNull();
  });

  it('is a string no matter what the provider gives back', () => {
    const cases: Partial<AuthUser>[] = [
      { displayName: null, email: null },
      { displayName: null, email: '' },
      { displayName: '', email: '' },
      { displayName: '   ', email: '   ' },
      { displayName: undefined as unknown as null },
      { displayName: null, email: '@example.com' },
    ];
    for (const c of cases) {
      const name = newUserProfile(user(c)).displayName;
      expect(typeof name, JSON.stringify(c)).toBe('string');
      expect((name as string).length, JSON.stringify(c)).toBeGreaterThan(0);
    }
  });

  it('stays under the 100 character limit the rule sets', () => {
    const long = 'a'.repeat(400);
    expect(displayNameFor({ displayName: long, email: null }).length).toBeLessThan(100);
    expect(displayNameFor({ displayName: null, email: `${long}@example.com` }).length)
      .toBeLessThan(100);
  });

  it('never writes an empty string either', () => {
    // Passes the rule, but renders as a blank greeting.
    expect(displayNameFor({ displayName: '', email: '' })).toBe('Student');
  });
});

describe('which name it picks', () => {
  it('prefers the name the provider gave', () => {
    expect(displayNameFor({ displayName: 'Ola Arowolo', email: 'ola@example.com' }))
      .toBe('Ola Arowolo');
  });

  it('falls back to the email local part, like App.tsx already did', () => {
    expect(displayNameFor({ displayName: null, email: 'ola.arowolo@gmail.com' }))
      .toBe('ola.arowolo');
  });

  it('falls back to Student when there is nothing at all', () => {
    expect(displayNameFor({ displayName: null, email: null })).toBe('Student');
  });

  it('trims, so a space is not treated as a name', () => {
    expect(displayNameFor({ displayName: '  Ola  ', email: null })).toBe('Ola');
    expect(displayNameFor({ displayName: ' ', email: 'ola@example.com' })).toBe('ola');
  });
});

describe('the rest of the profile', () => {
  it('starts a new account at zero, free, and not Pro', () => {
    // The create rule also refuses a pre-upgraded or pre-spent account:
    //   isPro == false, subscriptionType == 'none',
    //   tokensUsedToday == 0, tokensUsedThisMonth == 0
    const p = newUserProfile(user());
    expect(p.isPro).toBe(false);
    expect(p.xp).toBe(0);
    expect(p.level).toBe(1);
    expect(p.streak).toBe(0);
    expect(p.tokensUsedToday).toBe(0);
    expect(p.tokensUsedThisMonth).toBe(0);
    expect(p.badges).toEqual([]);
    expect(p.studyDays).toEqual([]);
  });

  it("keeps the fields the handlers it replaced used to write", () => {
    // Header.tsx reads plan as a fallback for isPro. Dropping it would not have
    // failed a test, it would just have quietly stopped being written.
    expect(newUserProfile(user()).plan).toBe('free');
  });

  it('carries uid and email through unchanged, which the rule requires', () => {
    const p = newUserProfile(user({ uid: 'xyz', email: 'a@b.com' }));
    expect(p.uid).toBe('xyz');
    expect(p.email).toBe('a@b.com');
  });

  it('sets the token reset keys, so the first budget read is not undefined', () => {
    const p = newUserProfile(user());
    expect(p.tokenResetDate).toBeTruthy();
    expect(p.tokenDailyResetDate).toBeTruthy();
  });
});
