/**
 * The Lemon Squeezy webhook is what turns a stranger's POST into a paid subscription.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Audited 2026-09-09. Two faults in the same twelve lines:
 *
 *   1. `signature !== digest` — an ordinary string compare. It returns the moment two bytes
 *      differ, so it can be timed one character at a time. The admin passphrase in the same
 *      file was already compared correctly, with a comment explaining why; the payment path,
 *      which matters more, was not.
 *
 *   2. No check that the secret exists. An UNSET secret makes createHmac throw, which at
 *      least stops. An EMPTY one does not: createHmac('sha256', '') returns a perfectly good
 *      digest, and an empty secret is a secret everybody knows — so anyone who can guess the
 *      payload shape could sign their own webhook and grant themselves a paid plan.
 *      `LEMONSQUEEZY_WEBHOOK_SECRET=` with nothing after it is one keystroke away in a
 *      hosting dashboard, and the startup log prints `webhook: false` either way.
 *
 * These tests exercise the verification logic directly rather than booting the server, so
 * they stay fast and need no Firebase. The forgery test is the one that matters.
 */
import { describe, expect, it } from 'vitest';
import crypto from 'crypto';

/** The shared helper from server.ts, kept byte-identical here. */
function constantTimeEquals(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(String(given ?? '')).digest();
  const b = crypto.createHash('sha256').update(String(expected ?? '')).digest();
  return crypto.timingSafeEqual(a, b);
}

/** The webhook's gate, as server.ts now implements it. */
function accepts(secret: string | undefined, signature: string, payload: string): boolean {
  if (!secret || !secret.trim()) return false;          // fail closed
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return constantTimeEquals(signature, digest);
}

const PAYLOAD = JSON.stringify({
  meta: { event_name: 'subscription_created', custom_data: { user_id: 'victim-uid' } },
});
const REAL_SECRET = 'a-real-webhook-secret-from-lemon-squeezy';

function sign(secret: string, payload: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('a genuine webhook still works', () => {
  it('accepts a correctly signed payload', () => {
    expect(accepts(REAL_SECRET, sign(REAL_SECRET, PAYLOAD), PAYLOAD)).toBe(true);
  });
});

describe('forgery', () => {
  it('rejects a payload signed with the wrong secret', () => {
    expect(accepts(REAL_SECRET, sign('not-the-secret', PAYLOAD), PAYLOAD)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const sig = sign(REAL_SECRET, PAYLOAD);
    const tampered = PAYLOAD.replace('victim-uid', 'attacker-uid');
    expect(accepts(REAL_SECRET, sig, tampered)).toBe(false);
  });

  it('rejects an empty or missing signature', () => {
    expect(accepts(REAL_SECRET, '', PAYLOAD)).toBe(false);
  });

  it('THE ONE THAT MATTERED: an empty secret cannot be used to self-grant a plan', () => {
    // With the old code this passed verification, because the attacker can compute
    // HMAC('') exactly as well as the server can.
    const forged = sign('', PAYLOAD);
    expect(accepts('', forged, PAYLOAD)).toBe(false);
    expect(accepts('   ', forged, PAYLOAD)).toBe(false);
  });

  it('a missing secret refuses rather than throwing', () => {
    expect(accepts(undefined, 'anything', PAYLOAD)).toBe(false);
  });
});

describe('the comparison itself', () => {
  it('is constant time, not a short-circuiting string compare', () => {
    // Length differences must not throw — timingSafeEqual does on mismatched buffers, and
    // that exception would itself leak the length.
    expect(() => constantTimeEquals('a', 'a-much-longer-value')).not.toThrow();
    expect(constantTimeEquals('a', 'a-much-longer-value')).toBe(false);
  });

  it('still says yes to identical values', () => {
    expect(constantTimeEquals(REAL_SECRET, REAL_SECRET)).toBe(true);
  });

  it('handles null and undefined without throwing', () => {
    expect(constantTimeEquals(undefined as unknown as string, '')).toBe(true);
    expect(constantTimeEquals(null as unknown as string, 'x')).toBe(false);
  });
});

describe('server.ts really contains these guards', () => {
  it('does not compare the signature with !==', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('server.ts', 'utf8');
    expect(src).not.toContain('if (signature !== digest)');
    expect(src).toContain('constantTimeEquals(signature, digest)');
  });

  it('refuses when the secret is blank', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('server.ts', 'utf8');
    expect(src).toContain('!LEMONSQUEEZY_WEBHOOK_SECRET.trim()');
  });
});
