/**
 * The guard on "fetch this URL for me".
 *
 * A route that fetches a URL on request is an SSRF hole unless it is pinned
 * down: left open it becomes a way to make StudyQuest's own server read its
 * metadata endpoint, its database, or anything else on its network, and hand the
 * result to a stranger.
 *
 * These are the tightest tests in the app for that reason. The allowlist is the
 * primary control and everything else is defence in depth.
 */
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_HOSTS, MAX_PDF_BYTES, REFUSAL_MESSAGES, boardOf, checkPaperUrl,
  fileNameFor,
} from '../src/lib/paperSource';

const AQA = 'https://www.aqa.org.uk/files/AQA-84611H-QP-JUN23.PDF';

describe('links we will fetch', () => {
  it('accepts a real paper link from each board', () => {
    for (const host of ALLOWED_HOSTS) {
      const check = checkPaperUrl(`https://${host}/files/paper.pdf`);
      expect(check.ok, host).toBe(true);
      expect(check.url, host).toContain(host);
    }
  });

  it('accepts the exact link a student pasted', () => {
    // The one RED reported failing.
    expect(checkPaperUrl(AQA).ok).toBe(true);
  });
});

describe('links we refuse, and why it matters', () => {
  const refused = (url: string) => checkPaperUrl(url);

  it('REFUSES a lookalike domain an attacker could own', () => {
    /*
      THE ONE THAT MATTERS MOST. A suffix check — endsWith('aqa.org.uk') — reads
      as obviously correct and accepts every one of these, all of which can be
      registered by anyone.
    */
    expect(refused('https://www.aqa.org.uk.attacker.com/x.pdf').reason).toBe('not-a-board');
    expect(refused('https://evil-www.aqa.org.uk.co/x.pdf').reason).toBe('not-a-board');
    expect(refused('https://aqa.org.uk.evil.io/files/paper.pdf').reason).toBe('not-a-board');
    expect(refused('https://notaqa.org.uk/x.pdf').reason).toBe('not-a-board');
  });

  it('REFUSES the server’s own network', () => {
    // What SSRF is actually for: reading things only the server can reach.
    for (const url of [
      'https://127.0.0.1/admin',
      'https://localhost/x.pdf',
      'https://169.254.169.254/latest/meta-data/',   // cloud metadata
      'https://10.0.0.5/internal',
      'https://192.168.1.1/router',
      'https://[::1]/x.pdf',
    ]) {
      expect(refused(url).reason, url).toBe('not-a-board');
    }
  });

  it('refuses other schemes entirely', () => {
    expect(refused('http://www.aqa.org.uk/x.pdf').reason).toBe('not-https');
    expect(refused('file:///etc/passwd').reason).toBe('not-https');
    expect(refused('ftp://www.aqa.org.uk/x.pdf').reason).toBe('not-https');
    // A data: URL parses fine as a URL, so it has to be caught by scheme.
    expect(refused('data:application/pdf;base64,AAAA').reason).toBe('not-https');
  });

  it('refuses credentials smuggled into the authority', () => {
    /*
      "https://www.aqa.org.uk@attacker.com/x.pdf" has hostname attacker.com —
      the part before @ is a username. A human reading the string sees AQA.
    */
    const sneaky = checkPaperUrl('https://www.aqa.org.uk@attacker.com/x.pdf');
    expect(sneaky.ok).toBe(false);
    // Refused as credentials rather than as a bad host, because that is exactly
    // what it is: "www.aqa.org.uk" is the USERNAME here. Either check would stop
    // it; this one names it correctly.
    expect(sneaky.reason).toBe('has-credentials');

    expect(refused('https://user:pw@www.aqa.org.uk/x.pdf').reason).toBe('has-credentials');
  });

  it('refuses an unusual port', () => {
    expect(refused('https://www.aqa.org.uk:8080/x.pdf').reason).toBe('odd-port');
    // The default port written out explicitly is still the default.
    expect(checkPaperUrl('https://www.aqa.org.uk:443/x.pdf').ok).toBe(true);
  });

  it('refuses nonsense without throwing', () => {
    expect(refused('').reason).toBe('not-a-url');
    expect(refused('not a url').reason).toBe('not-a-url');
    expect(refused('   ').reason).toBe('not-a-url');
    // Deliberately wrong types, because a real caller eventually will.
    expect(refused(null as unknown as string).reason).toBe('not-a-url');
    expect(refused(undefined as unknown as string).reason).toBe('not-a-url');
  });

  it('is case-insensitive about the host, as DNS is', () => {
    expect(checkPaperUrl('https://WWW.AQA.ORG.UK/files/x.pdf').ok).toBe(true);
  });

  it('explains every refusal in words a student can act on', () => {
    for (const reason of Object.keys(REFUSAL_MESSAGES) as (keyof typeof REFUSAL_MESSAGES)[]) {
      expect(REFUSAL_MESSAGES[reason].length).toBeGreaterThan(15);
    }
    expect(REFUSAL_MESSAGES['not-a-board']).toMatch(/upload the file yourself/i);
  });
});

describe('telling the student what they opened', () => {
  it('names the board', () => {
    expect(boardOf(AQA)).toBe('AQA');
    expect(boardOf('https://filestore.aqa.org.uk/x.pdf')).toBe('AQA');
    expect(boardOf('https://qualifications.pearson.com/x.pdf')).toBe('Edexcel');
    expect(boardOf('https://www.ocr.org.uk/x.pdf')).toBe('OCR');
    expect(boardOf('https://www.eduqas.co.uk/x.pdf')).toBe('WJEC');
    expect(boardOf('https://attacker.com/x.pdf')).toBeNull();
  });

  it('reads a file name out of the link', () => {
    expect(fileNameFor(AQA)).toBe('AQA-84611H-QP-JUN23.PDF');
    expect(fileNameFor('https://www.aqa.org.uk/files/')).toBe('files');
    expect(fileNameFor('nonsense')).toBe('paper.pdf');
  });
});

describe('the limits', () => {
  it('caps a paper well above any real one and well below silly', () => {
    expect(MAX_PDF_BYTES).toBeGreaterThan(5 * 1024 * 1024);
    expect(MAX_PDF_BYTES).toBeLessThanOrEqual(25 * 1024 * 1024);
  });
});
