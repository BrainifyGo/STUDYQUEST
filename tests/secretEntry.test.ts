/**
 * The unmarked door to the founders' dashboard.
 *
 * These tests guard obscurity, not security — the real gates are the admin role
 * and a passphrase that lives only in the server's environment. What they
 * protect is that the door does not fall open by accident, which on a shared
 * laptop is the whole point of hiding it.
 */
import { describe, expect, it } from 'vitest';
import {
  RESET_AFTER_MS, SECRET_WORD, freshKnock, isTypingIntoSomething, pressKey,
} from '../src/lib/secretEntry';

/*
  Taken from the module rather than typed out again.

  Two reasons. A hardcoded copy drifts the moment the trigger changes, and the
  test would then pass while guarding nothing. And the word stays out of the
  repository as plain text — it lives as character codes in one place only.
  That is hygiene, not protection: the real secret is the server's
  ADMIN_PASSPHRASE, which is in no file here.
*/
const SECRET = SECRET_WORD;
const lower = SECRET.toLowerCase();

/** Type a whole string in, one key at a time. */
function type(text: string, opts: { secret?: string; gapMs?: number } = {}) {
  const secret = opts.secret ?? SECRET;
  let state = freshKnock();
  let opened = false;
  let clock = 1_000_000;
  for (const ch of text) {
    clock += opts.gapMs ?? 100;
    const r = pressKey(state, ch, secret, clock);
    state = r.state;
    if (r.opened) opened = true;
  }
  return { state, opened };
}

describe('opening the door', () => {
  it('opens on the passphrase', () => {
    expect(type(SECRET).opened).toBe(true);
  });

  it('does not care about case', () => {
    expect(type(lower).opened).toBe(true);
    const mixed = [...lower].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('');
    expect(type(mixed).opened).toBe(true);
  });

  it('stays shut for anything else', () => {
    expect(type(lower.slice(0, -1)).opened).toBe(false);
    expect(type(`${lower.slice(0, -1)}x`).opened).toBe(false);
    expect(type(lower.slice(-5)).opened).toBe(false);
    expect(type('').opened).toBe(false);
  });

  it('survives a stray keystroke before the word', () => {
    // Restarting from nothing on every wrong key would make this near-impossible
    // to trigger in practice.
    expect(type(lower[0] + lower).opened).toBe(true);
    expect(type(`xyz${lower}`).opened).toBe(true);
  });

  it('ignores keys that are not typing', () => {
    let state = freshKnock();
    for (const k of ['Shift', 'Tab', 'ArrowLeft', 'Enter', 'Control']) {
      state = pressKey(state, k, SECRET, 1000).state;
    }
    expect(state.progress).toBe('');
    // and those keys in the middle do not break a real attempt
    let s = freshKnock();
    let opened = false;
    let t = 1000;
    const withModifier = [...lower.slice(0, 3), 'Shift', ...lower.slice(3)];
    for (const ch of withModifier) {
      t += 50;
      const r = pressKey(s, ch, SECRET, t);
      s = r.state;
      if (r.opened) opened = true;
    }
    expect(opened).toBe(true);
  });

  it('forgets a half-typed word after a pause', () => {
    // Otherwise the first letter typed at breakfast and the rest at lunch would open it.
    const slow = type(SECRET, { gapMs: RESET_AFTER_MS + 500 });
    expect(slow.opened).toBe(false);
  });
});

describe('never while someone is typing', () => {
  /*
    THE ACCIDENT THIS PREVENTS.

    Students paste revision notes, essay questions and whole past papers into
    StudyQuest. Without this guard, anyone typing the app's own name into their
    own notes would swing the hidden door open — and on a borrowed or shared
    laptop that is exactly the situation hiding it was meant to protect against.
  */
  const el = (tag: string, editable = false) => {
    const node = { tagName: tag.toUpperCase(), isContentEditable: editable };
    return node as unknown as EventTarget;
  };

  it('ignores text boxes', () => {
    expect(isTypingIntoSomething(el('input'))).toBe(true);
    expect(isTypingIntoSomething(el('textarea'))).toBe(true);
    expect(isTypingIntoSomething(el('select'))).toBe(true);
    expect(isTypingIntoSomething(el('div', true))).toBe(true);
  });

  it('still listens on the page itself', () => {
    expect(isTypingIntoSomething(el('div'))).toBe(false);
    expect(isTypingIntoSomething(el('body'))).toBe(false);
    expect(isTypingIntoSomething(el('button'))).toBe(false);
    expect(isTypingIntoSomething(null)).toBe(false);
  });
});
