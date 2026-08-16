/**
 * Friends: pair ids, request ids, and what a username is allowed to be.
 *
 * These are the pure parts — the Firestore calls need the emulator, but the id
 * derivation is what the whole security model rests on, so it is pinned here.
 */
import { describe, expect, it } from 'vitest';
import { pairId, requestId, usernameProblem, normaliseUsername } from '../src/lib/friends';

describe('pair ids', () => {

  it('is the same whichever way round you ask', () => {
    // The entire reason a friendship is ONE document. If this were order
    // dependent you would need two rows per friendship and every read would
    // have to check both.
    expect(pairId('abc', 'xyz')).toBe(pairId('xyz', 'abc'));
  });

  it('sorts, so the id is deducible without a lookup', () => {
    expect(pairId('xyz', 'abc')).toBe('abc__xyz');
  });

  it('is distinct for different pairs', () => {
    expect(pairId('a', 'b')).not.toBe(pairId('a', 'c'));
  });
});

describe('request ids', () => {

  it('is directional — A asking B is not B asking A', () => {
    // A request has a direction and a friendship does not. Making this
    // symmetrical would let someone "accept" a request they themselves sent.
    expect(requestId('a', 'b')).not.toBe(requestId('b', 'a'));
    expect(requestId('a', 'b')).toBe('a__b');
  });
});

describe('what a username may be', () => {

  const ok = (u: string) => expect(usernameProblem(u), `${u} should be allowed`).toBeNull();
  const bad = (u: string) => expect(usernameProblem(u), `${u} should be rejected`).not.toBeNull();

  it('accepts ordinary names', () => {
    ok('ola');
    ok('daniel_1');
    ok('a.b.c');
    ok('student2026');
  });

  it('rejects names that are too short or too long', () => {
    bad('ab');
    bad('a'.repeat(21));
    ok('a'.repeat(20));
  });

  it('rejects spaces and punctuation that could impersonate', () => {
    bad('ola bright');
    bad('ola@home');
    bad('ola-bright');   // hyphens read too much like a different account
  });

  it('rejects leading, trailing and doubled separators', () => {
    // `o...l...a` and `_ola` read as a different person at a glance, which is
    // impersonation by punctuation — a real problem on anything with a friends
    // list, and cheap to prevent here.
    bad('.ola');
    bad('ola.');
    bad('_ola');
    bad('ola__bright');
    bad('o..la');
  });

  it('is case-insensitive, so Ola and ola cannot both exist', () => {
    expect(normaliseUsername('  OLA  ')).toBe('ola');
    expect(usernameProblem('OLA')).toBeNull();
  });
});
