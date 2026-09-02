/**
 * Student issue reports, and the two-month review that makes them worth asking for.
 *
 * The feature stands or falls on one thing: **grouping**. Two hundred
 * individually-written reports are noise nobody reads; "41 reports about the
 * quiz getting stuck" is a decision. So most of this file is about whether the
 * same complaint, written five different ways by five different teenagers, ends
 * up in one pile.
 *
 * The other half is restraint — what the app collects about somebody, and what
 * it claims from too little evidence.
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES, CATEGORY_LABELS, MAX_TITLE, MIN_DESCRIPTION, STATUS_LABELS,
  fingerprint, readContext, suggestSeverity, validateReport,
  type IssueCategory, type IssueReport, type Severity,
} from '../src/lib/issueReport';
import {
  REVIEW_DAYS, formatReview, reviewSummary, withinWindow,
} from '../src/lib/issueReview';

let seq = 0;
const report = (over: Partial<IssueReport> = {}): IssueReport => {
  const title = over.title ?? 'The quiz gets stuck loading';
  const category = over.category ?? 'bug';
  return {
    id: `r${++seq}`,
    user_id: 'u1',
    category,
    title,
    description: 'It span forever and never showed the questions.',
    context: {
      view: 'quiz', browser: 'Chrome 141 on Android', screen: 'phone (412px)',
      appVersion: '1.0.0', reportedAt: '2026-09-01T10:00:00.000Z',
    },
    status: 'new',
    severity: 'high',
    notes: '',
    fingerprint: fingerprint(category, title),
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    ...over,
  };
};

describe('checking a report before it is sent', () => {
  it('accepts a real one', () => {
    expect(validateReport({
      title: 'Quiz stuck loading',
      description: 'I opened a quiz on my phone and it span forever.',
      category: 'bug',
    }).ok).toBe(true);
  });

  it('refuses "it dosnt work", and says what would help', () => {
    /*
      THE RULE THAT EARNS ITS KEEP. The difference between that and one more
      sentence is the difference between a report that gets fixed and one that
      gets counted and forgotten — so the message asks for the sentence rather
      than just refusing.
    */
    const v = validateReport({ title: 'broken', description: 'it dosnt work', category: 'bug' });
    expect(v.ok).toBe(false);
    expect(v.errors.description).toMatch(/what you were doing/i);
  });

  it('needs a title and a real category', () => {
    expect(validateReport({ description: 'x'.repeat(40), category: 'bug' }).errors.title)
      .toBeTruthy();
    expect(validateReport({ title: 't', description: 'x'.repeat(40), category: 'nonsense' })
      .errors.category).toBeTruthy();
  });

  it('has a floor and a ceiling', () => {
    expect(validateReport({ title: 't', description: 'x'.repeat(MIN_DESCRIPTION - 1), category: 'bug' }).ok)
      .toBe(false);
    expect(validateReport({ title: 'x'.repeat(MAX_TITLE + 1), description: 'x'.repeat(40), category: 'bug' })
      .errors.title).toBeTruthy();
  });

  it('labels every category and status it offers', () => {
    for (const c of CATEGORIES) expect(CATEGORY_LABELS[c], c).toBeTruthy();
    expect(Object.keys(STATUS_LABELS).length).toBeGreaterThanOrEqual(7);
  });
});

describe('grouping the same complaint written five different ways', () => {
  it('puts word-order and punctuation variants together', () => {
    // THE PROPERTY THE WHOLE FEATURE RESTS ON.
    const a = fingerprint('bug', 'The quiz gets stuck loading');
    const b = fingerprint('bug', 'quiz stuck loading!!');
    const c = fingerprint('bug', 'Loading stuck on the quiz');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('ignores filler that carries no meaning', () => {
    expect(fingerprint('bug', 'the app is not loading'))
      .toBe(fingerprint('bug', 'not loading'));
  });

  it('keeps genuinely different problems apart', () => {
    expect(fingerprint('bug', 'quiz stuck loading'))
      .not.toBe(fingerprint('bug', 'flashcards show blank'));
  });

  it('separates the same words in different categories', () => {
    // "wrong answer" as a bug and as a content complaint are different jobs.
    expect(fingerprint('bug', 'wrong answer shown'))
      .not.toBe(fingerprint('wrong-content', 'wrong answer shown'));
  });

  it('never returns an empty key, however useless the title', () => {
    expect(fingerprint('bug', 'it is a the')).toContain('unspecified');
    expect(fingerprint('bug', '')).toContain('unspecified');
    expect(fingerprint('bug', null as unknown as string)).toBeTruthy();
  });
});

describe('what gets collected about somebody', () => {
  it('records the browser without recording the person', () => {
    /*
      A bug report is not a licence to fingerprint a teenager. The fields are
      named one at a time, and the full user-agent string is never stored.
    */
    const ctx = readContext('quiz', '1.2.3');
    expect(Object.keys(ctx).sort())
      .toEqual(['appVersion', 'browser', 'reportedAt', 'screen', 'view']);
    expect(ctx.browser).not.toMatch(/Mozilla\/5\.0/);
    expect(ctx.view).toBe('quiz');
    expect(ctx.appVersion).toBe('1.2.3');
  });

  it('survives having no browser at all', () => {
    expect(() => readContext('')).not.toThrow();
    expect(readContext('').view).toBe('unknown');
  });
});

describe('guessing how urgent it is', () => {
  it('treats money and lockouts as the most urgent', () => {
    expect(suggestSeverity('billing', 'I was charged twice')).toBe('critical');
    expect(suggestSeverity('bug', 'I cant log in at all since yesterday')).toBe('critical');
  });

  it('never calls an idea urgent, however strongly it is written', () => {
    expect(suggestSeverity('suggestion', 'you NEED to add this it is critical!!'))
      .toBe('low');
  });

  it('puts wrong content above cosmetics', () => {
    const order: Severity[] = ['low', 'medium', 'high', 'critical'];
    expect(order.indexOf(suggestSeverity('wrong-content', 'the answer given was wrong')))
      .toBeGreaterThan(order.indexOf(suggestSeverity('design', 'the button is a bit small')));
  });
});

describe('the two month review', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 86_400_000).toISOString();

  it('only counts the last two months', () => {
    const rs = [
      report({ created_at: daysAgo(5) }),
      report({ created_at: daysAgo(200) }),
    ];
    expect(withinWindow(rs, now)).toHaveLength(1);
    expect(REVIEW_DAYS).toBe(61);
  });

  it('ranks problems by how many students hit them', () => {
    const rs = [
      ...Array.from({ length: 5 }, () => report({ title: 'quiz stuck loading', created_at: daysAgo(3) })),
      ...Array.from({ length: 2 }, () => report({ title: 'flashcards blank', created_at: daysAgo(4) })),
    ];
    const s = reviewSummary(rs, now);
    expect(s.problems[0].count).toBe(5);
    expect(s.problems[0].title).toMatch(/quiz/i);
    expect(s.total).toBe(7);
  });

  it('lets one critical outrank a few cosmetic ones', () => {
    // Somebody locked out of an account they paid for is not a queue position.
    const rs = [
      report({ title: 'charged twice for pro', category: 'billing', severity: 'critical', created_at: daysAgo(1) }),
      ...Array.from({ length: 3 }, () => report({ title: 'button colour is odd', category: 'design', severity: 'low', created_at: daysAgo(2) })),
    ];
    expect(reviewSummary(rs, now).problems[0].category).toBe('billing');
  });

  it('keeps ideas apart from faults', () => {
    const rs = [
      report({ title: 'quiz stuck loading', created_at: daysAgo(2) }),
      report({ title: 'add a dark green theme', category: 'suggestion', created_at: daysAgo(2) }),
    ];
    const s = reviewSummary(rs, now);
    expect(s.problems.every((c) => c.category !== 'suggestion')).toBe(true);
    expect(s.suggestions).toHaveLength(1);
  });

  it('names the clearest title in a cluster, not the tersest', () => {
    /*
      Both of these reduce to the same three words — quiz, stuck, loading — so
      they are one cluster, and the fuller sentence is the better label for it.

      Note what does NOT cluster: adding a content word like "forever" makes a
      different fingerprint. That is the deliberate trade-off recorded in
      issueReport.ts — crude beats clever when two people have to predict it.
    */
    const rs = [
      report({ title: 'quiz stuck loading', created_at: daysAgo(1) }),
      report({ title: 'the quiz is stuck on loading!!!', created_at: daysAgo(1) }),
    ];
    const s = reviewSummary(rs, now);
    expect(s.problems).toHaveLength(1);
    expect(s.problems[0].count).toBe(2);
    expect(s.problems[0].title).toBe('the quiz is stuck on loading!!!');
  });

  it('counts what is still open, so finished work stops being a to-do', () => {
    const rs = [
      report({ title: 'quiz stuck loading', status: 'fixed', created_at: daysAgo(1) }),
      report({ title: 'quiz stuck loading', status: 'new', created_at: daysAgo(1) }),
    ];
    expect(reviewSummary(rs, now).problems[0]).toMatchObject({ count: 2, open: 1 });
  });

  it('says NOTHING when one report is the top of the list', () => {
    /*
      One student hitting something is not a pattern, and calling it "the top
      problem this cycle" would make the review look like theatre.
    */
    expect(reviewSummary([report({ created_at: daysAgo(1) })], now).headline).toBeNull();
    expect(reviewSummary([], now).headline).toBeNull();
  });

  it('speaks up once a pattern is real', () => {
    const rs = Array.from({ length: 6 }, () =>
      report({ title: 'quiz stuck loading', created_at: daysAgo(2) }));
    expect(reviewSummary(rs, now).headline).toMatch(/6 of 6/);
    expect(reviewSummary(rs, now).headline).toMatch(/fix that first/i);
  });

  it('writes a summary that can be pasted somewhere', () => {
    const rs = [
      ...Array.from({ length: 4 }, () => report({ title: 'quiz stuck loading', created_at: daysAgo(2) })),
      report({ title: 'add more themes', category: 'suggestion', created_at: daysAgo(3) }),
    ];
    const text = formatReview(reviewSummary(rs, now));
    expect(text).toMatch(/TWO MONTH REVIEW/);
    expect(text).toMatch(/Reports received: 5/);
    expect(text).toMatch(/Top problems:/);
    expect(text).toMatch(/Most asked for:/);
  });

  it('does not fall over on an empty cycle', () => {
    const s = reviewSummary([], now);
    expect(s.total).toBe(0);
    expect(s.problems).toEqual([]);
    expect(() => formatReview(s)).not.toThrow();
  });

  it('ignores reports with unreadable dates instead of crashing', () => {
    const rs = [report({ created_at: 'sometime last week' }), report({ created_at: daysAgo(1) })];
    expect(reviewSummary(rs, now).total).toBe(1);
  });
});
