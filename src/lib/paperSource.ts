/**
 * Fetching a past paper from an exam board's own website.
 *
 * WHY THE SERVER HAS TO DO THIS AT ALL. A browser cannot fetch a PDF from
 * aqa.org.uk: the board sends no CORS header, so the request is blocked before
 * it starts. That is the whole reason pasting a board link failed — not a bug in
 * the parsing, a rule of the web. So the server fetches it and hands the bytes
 * back for pdf.js to read in the browser as if the student had chosen the file.
 *
 * NOTHING IS EVER STORED. The bytes are streamed through and forgotten. GCSE
 * papers belong to AQA, Pearson, OCR and WJEC, and StudyQuest does not host them
 * — it reads one on behalf of the student who asked for it, exactly as it reads
 * one they uploaded themselves. There is no cache, no bucket, no copy on disk,
 * and adding one would be a copyright problem rather than a performance win.
 *
 * A ROUTE THAT FETCHES A URL FOR YOU IS AN SSRF HOLE UNLESS IT IS PINNED DOWN.
 * Left open, "fetch this URL" becomes a way to make StudyQuest's server read its
 * own metadata endpoint, its own database, or anything else on its network, and
 * hand the result to a stranger. The controls, in order of how much they matter:
 *
 *   1. An EXACT hostname allowlist — four boards, compared with `===`.
 *      Suffix matching would accept `www.aqa.org.uk.attacker.com`.
 *   2. https only, no embedded credentials, no odd ports.
 *   3. Redirects are followed BY HAND, and every hop is checked again. A board
 *      that redirected off-site would otherwise walk straight around rule 1.
 *   4. The response must actually be a PDF, and it is capped in size.
 *
 * Kept as pure functions with no I/O so the rules can be tested directly, which
 * matters more here than anywhere else in the app.
 */

/**
 * The four boards, by exact hostname.
 *
 * These are the hosts the links in `examBoards.ts` actually resolve to, checked
 * over the network rather than guessed. Adding one is a deliberate act.
 */
export const ALLOWED_HOSTS: readonly string[] = [
  'www.aqa.org.uk',
  'filestore.aqa.org.uk',
  'qualifications.pearson.com',
  'www.ocr.org.uk',
  'www.eduqas.co.uk',
  'www.wjec.co.uk',
];

export type UrlRefusal =
  | 'not-a-url'
  | 'not-https'
  | 'not-a-board'
  | 'has-credentials'
  | 'odd-port';

export const REFUSAL_MESSAGES: Record<UrlRefusal, string> = {
  'not-a-url': 'That does not look like a web address.',
  'not-https': 'That link is not secure (it must start with https).',
  'not-a-board':
    'That link is not on an exam board’s website. Papers can be opened from '
    + 'AQA, Pearson/Edexcel, OCR and WJEC/Eduqas — or upload the file yourself.',
  'has-credentials': 'That link has a username or password in it.',
  'odd-port': 'That link uses an unusual port.',
};

export interface UrlCheck {
  ok: boolean;
  /** Normalised, safe to fetch. Only set when ok. */
  url?: string;
  reason?: UrlRefusal;
}

/**
 * Is this a link we are willing to fetch on a student's behalf?
 *
 * Used on BOTH sides: the browser calls it to explain the problem before making
 * a request, and the server calls it again on every redirect hop. The browser
 * check is courtesy; the server check is the control.
 */
export function checkPaperUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    return { ok: false, reason: 'not-a-url' };
  }

  if (url.protocol !== 'https:') return { ok: false, reason: 'not-https' };
  if (url.username || url.password) return { ok: false, reason: 'has-credentials' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'odd-port' };

  // Exact match, lowercased. Never endsWith: "aqa.org.uk.attacker.com" ends with
  // nothing useful, but "www.aqa.org.uk" as a SUFFIX check would pass
  // "evil-www.aqa.org.uk" on a domain an attacker controls.
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.includes(host)) return { ok: false, reason: 'not-a-board' };

  // The hash is never sent anyway; dropping it keeps what we log tidy.
  url.hash = '';
  return { ok: true, url: url.toString() };
}

/** Which board a link belongs to, for showing the student where it came from. */
export function boardOf(rawUrl: string): string | null {
  const check = checkPaperUrl(rawUrl);
  if (!check.ok || !check.url) return null;
  const host = new URL(check.url).hostname.toLowerCase();
  if (host.endsWith('aqa.org.uk')) return 'AQA';
  if (host === 'qualifications.pearson.com') return 'Edexcel';
  if (host === 'www.ocr.org.uk') return 'OCR';
  if (host === 'www.eduqas.co.uk' || host === 'www.wjec.co.uk') return 'WJEC';
  return null;
}

/** A readable file name from the link, for showing what was opened. */
export function fileNameFor(rawUrl: string): string {
  try {
    const last = new URL(rawUrl).pathname.split('/').filter(Boolean).pop() ?? '';
    const name = decodeURIComponent(last).trim();
    return name || 'paper.pdf';
  } catch {
    return 'paper.pdf';
  }
}

/** Bigger than any real past paper, small enough not to be a way to burn memory. */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
/** Boards are slow, but not this slow. */
export const FETCH_TIMEOUT_MS = 20_000;
/** Enough for http→https and www→cdn; more than that is a loop. */
export const MAX_REDIRECTS = 4;
