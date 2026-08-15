/**
 * A stable id for a question, derived from its text.
 *
 * Kept in its own module with NO imports, because `mistakes.ts` pulls in Firebase,
 * and importing Firebase initialises it — which means the test for a pure hash
 * function was failing on `auth/invalid-api-key` in any checkout without a .env.
 * Logic that needs no I/O should not drag I/O behind it.
 *
 * FNV-1a. Deterministic across devices and sessions, which a random id would not
 * be — and retiring a mistake depends on the id matching one written earlier,
 * possibly on another device, from a separate generation that happened to produce
 * the same question.
 */
export function questionId(question: string): string {
  let h = 0x811c9dc5;
  const s = (question || '').trim().toLowerCase().replace(/\s+/g, ' ');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'q' + h.toString(36);
}
