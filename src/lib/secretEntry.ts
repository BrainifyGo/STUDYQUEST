/**
 * The unmarked door to the founders' dashboard.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT — because getting this backwards would be a
 * dangerous thing to believe about your own app.
 *
 * This is OBSCURITY, not security. Everything in this file ships to every
 * browser that loads StudyQuest, so anyone willing to read the JavaScript can
 * find the sequence. It is not possible to hide code from the machine that has
 * to run it, and any claim otherwise is false.
 *
 * What it genuinely buys is that the dashboard is not DISCOVERABLE. There is no
 * menu entry, nothing to click, and nothing on screen that hints the page
 * exists. That defeats the realistic threats: someone glancing at the screen,
 * a student poking around the menus, a screen share, a borrowed laptop.
 *
 * THE ACTUAL SECURITY IS ELSEWHERE, AND THERE ARE TWO LAYERS OF IT:
 *
 *   1. `role == 'admin'` on the account, checked on the server against a
 *      verified Firebase ID token, and enforced again in firestore.rules.
 *   2. A passphrase that exists ONLY in the server's environment. It is never
 *      compiled into this bundle — the typed word is sent to the server and
 *      compared there — so reading the client code does not reveal it.
 *
 * So finding this door gets an attacker a page that returns 403 and renders
 * nothing. That is the design: the lock is on the data, not on the door.
 */

/** How long a half-typed sequence survives before it is forgotten. */
export const RESET_AFTER_MS = 3000;

/*
  The word that opens the door, kept out of the bundle as readable text.

  Stored as character codes so that searching the shipped JavaScript for the word
  itself — the first thing anyone curious would try — turns up the app's own name
  in a hundred harmless places and nothing here.

  BE CLEAR ABOUT WHAT THIS IS WORTH. It is a speed bump, not a lock. Anyone who
  reads this file reverses it in seconds, and it must never be mistaken for the
  thing keeping the dashboard safe. That is the server's passphrase, which lives
  in its environment and is not in this bundle in any form, encoded or not.
*/
const TRIGGER_CODES = [83, 84, 85, 68, 89, 81, 85, 69, 83, 84];

export const SECRET_WORD: string = TRIGGER_CODES.map((c) => String.fromCharCode(c)).join('');

/**
 * Tracks progress through a typed sequence.
 *
 * Deliberately a plain object rather than a hook, so the matching rules can be
 * tested without a browser — including the one that matters most below.
 */
export interface KnockState {
  progress: string;
  lastKeyAt: number;
}

export const freshKnock = (): KnockState => ({ progress: '', lastKeyAt: 0 });

/**
 * Should this keystroke be ignored entirely?
 *
 * THE IMPORTANT ONE. Students paste revision notes, essay questions and whole
 * past papers into this app. If the sequence matched inside a text box, then
 * anybody typing the app's own name into their notes would trip the door open —
 * on a shared or borrowed laptop that is precisely the accident this is supposed
 * to prevent, and it would happen constantly.
 */
export function isTypingIntoSomething(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input'
      || tag === 'textarea'
      || tag === 'select'
      || el.isContentEditable === true;
}

/**
 * Feed one keystroke in. Returns the new state and whether the door opened.
 *
 * Matching is case-insensitive and forgiving of a wrong key: typing "studyq"
 * then a stray letter restarts from that letter rather than throwing away a
 * correct prefix, so "sstudyquest" still works.
 */
export function pressKey(
  state: KnockState, key: string, secret: string, now = Date.now(),
): { state: KnockState; opened: boolean } {
  // One character only: Shift, Tab, ArrowLeft and the rest are not typing.
  if (!key || key.length !== 1) return { state, opened: false };

  const stale = state.lastKeyAt !== 0 && now - state.lastKeyAt > RESET_AFTER_MS;
  const base = stale ? '' : state.progress;
  const target = secret.toLowerCase();

  let next = (base + key.toLowerCase()).slice(-target.length);

  // A mistyped character should not require starting the whole word again from
  // nothing; keep the longest suffix that is still a valid prefix of the secret.
  while (next && !target.startsWith(next)) next = next.slice(1);

  if (next === target) {
    return { state: freshKnock(), opened: true };
  }
  return { state: { progress: next, lastKeyAt: now }, opened: false };
}

/**
 * The passphrase, held for this tab only.
 *
 * sessionStorage rather than localStorage on purpose: it dies with the tab, so
 * a laptop left open in a common room does not keep the door unlocked for the
 * next person to sit down. The cost is retyping the word in a new tab, which is
 * the correct trade for something this sensitive.
 */
const KEY = 'sq.dash.pass';

export function rememberPass(pass: string): void {
  try { sessionStorage.setItem(KEY, pass); } catch { /* private mode */ }
}

export function recallPass(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function forgetPass(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to do */ }
}
