/**
 * Sign-in error messages.
 *
 * Written after a live deployment where sign-in silently did nothing: the handler
 * was `catch (err) { console.error(...) }`, so the button appeared dead and the
 * real cause — the Render domain was never added to Firebase's authorised
 * domains — sat in a console nobody had open. It worked for the other founder
 * because he was testing on localhost, which IS authorised.
 */
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { describeAuthError } from '../src/lib/authErrors';

beforeAll(() => {
  // describeAuthError names the current host in the domain message.
  vi.stubGlobal('location', { hostname: 'studyquest-ruuq.onrender.com' });
});

const err = (code: string) => ({ code });

describe('configuration faults', () => {

  it('explains an unauthorised domain, and names the host', () => {
    const r = describeAuthError(err('auth/unauthorized-domain'));
    expect(r.isSetupProblem).toBe(true);
    expect(r.message).toContain('studyquest-ruuq.onrender.com');
    expect(r.message).toContain('Authorised domains');
  });

  it('explains a disabled sign-in method', () => {
    const r = describeAuthError(err('auth/operation-not-allowed'));
    expect(r.isSetupProblem).toBe(true);
    expect(r.message).toMatch(/Sign-in method/i);
  });

  it('marks user mistakes as NOT setup problems', () => {
    // The two are shown for different lengths of time, so the flag has to be right.
    for (const code of ['auth/wrong-password', 'auth/invalid-email', 'auth/popup-blocked']) {
      expect(describeAuthError(err(code)).isSetupProblem).toBe(false);
    }
  });
});

describe('user-facing messages', () => {

  it('does not leak which emails have accounts', () => {
    // Firebase returns one code for a wrong password AND an unknown account, on
    // purpose. Splitting them would turn the login form into an account checker.
    const wrong = describeAuthError(err('auth/wrong-password')).message;
    const missing = describeAuthError(err('auth/user-not-found')).message;
    const invalid = describeAuthError(err('auth/invalid-credential')).message;
    expect(wrong).toBe(missing);
    expect(invalid).toBe(missing);
  });

  it('tells someone what to do about a blocked popup', () => {
    expect(describeAuthError(err('auth/popup-blocked')).message).toMatch(/pop-?ups/i);
  });

  it('treats a cancelled popup as cancelled, not an error to panic about', () => {
    expect(describeAuthError(err('auth/popup-closed-by-user')).message).toMatch(/cancelled/i);
  });

  it('always returns something sayable, whatever it is handed', () => {
    // A thrown string, a null, a plain Error — none should produce "undefined".
    for (const junk of [null, undefined, 'boom', new Error('x'), {}, 42]) {
      const r = describeAuthError(junk);
      expect(r.message.length).toBeGreaterThan(0);
      expect(r.message).not.toMatch(/undefined|\[object/i);
    }
  });

  it('includes the code for anything unrecognised, so it can be looked up', () => {
    expect(describeAuthError(err('auth/some-new-thing')).message).toContain('some-new-thing');
  });
});
