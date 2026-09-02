/**
 * The founders' dashboard numbers.
 *
 * These are the figures RED and Daniel will make decisions on, so the arithmetic
 * is tested rather than eyeballed. Two rules run through the whole file:
 *
 * NEVER INVENT A NUMBER. Where the data cannot answer, the answer is null and
 * the dashboard shows "—". A zero and an unknown are different facts.
 *
 * TEST ACCOUNTS ARE NOT USERS. This project's own debugging created fourteen of
 * nineteen accounts. Counting them would be wrong by a factor of three about the
 * only number that matters early on.
 */
import { describe, expect, it } from 'vitest';
import {
  count, headline, isTestAccount, money, percent, revenueMetrics, signupSeries,
  userMetrics, type RawOrder, type RawSubscription, type RawUser,
} from '../src/lib/adminMetrics';

const NOW = Date.parse('2026-09-02T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const user = (over: Partial<RawUser> = {}): RawUser => ({
  uid: `u${Math.random()}`,
  email: 'real@person.com',
  isPro: false,
  createdAt: daysAgo(3),
  lastSeenAt: daysAgo(1),
  ...over,
});

describe('keeping test accounts out of the real numbers', () => {
  it('recognises the accounts debugging created', () => {
    expect(isTestAccount('debug.ui.1788356978900@example.com')).toBe(true);
    expect(isTestAccount('debug.insight.123@example.com')).toBe(true);
    expect(isTestAccount('e2e-caller-a@studyquest.test')).toBe(true);
    expect(isTestAccount('anything@example.com')).toBe(true);
  });

  it('does not mistake a real student for one', () => {
    // Deliberately not the founders' real addresses: the test needs *a* normal
    // gmail account, and putting real people into git history buys nothing.
    expect(isTestAccount('someone@gmail.com')).toBe(false);
    expect(isTestAccount('a.student@outlook.com')).toBe(false);
    // A guest has no email and is a real person using the app.
    expect(isTestAccount(null)).toBe(false);
    expect(isTestAccount('')).toBe(false);
  });

  it('excludes them from every count, and says how many', () => {
    const m = userMetrics([
      user(), user(), user({ isPro: true }),
      user({ email: 'debug.ui.1@example.com' }),
      user({ email: 'debug.ui.2@example.com', isPro: true }),
    ], NOW);
    expect(m.total).toBe(3);
    expect(m.pro).toBe(1);
    expect(m.excludedTestAccounts).toBe(2);
  });
});

describe('who is actually using it', () => {
  it('splits pro by how it was got', () => {
    // A granted key is not revenue. Reporting them together would make the
    // business look like it is selling when it is giving product away.
    const m = userMetrics([
      user({ isPro: true, proSource: 'key' }),
      user({ isPro: true, proSource: 'key' }),
      user({ isPro: true, proSource: 'subscription' }),
      user(),
    ], NOW);
    expect(m.proBySource).toEqual({ key: 2, subscription: 1 });
    expect(m.pro).toBe(3);
    expect(m.free).toBe(1);
  });

  it('counts active users by when they last signed in', () => {
    const m = userMetrics([
      user({ lastSeenAt: daysAgo(0.5) }),
      user({ lastSeenAt: daysAgo(3) }),
      user({ lastSeenAt: daysAgo(20) }),
      user({ lastSeenAt: daysAgo(90) }),
    ], NOW);
    expect(m.activeDay).toBe(1);
    expect(m.activeWeek).toBe(2);
    expect(m.activeMonth).toBe(3);
  });

  it('says NULL, not zero, when nothing records the date', () => {
    /*
      THE DISTINCTION THE WHOLE FILE EXISTS FOR. Firestore user documents had no
      createdAt on 16 of 19 accounts. Reporting "0 new users this week" from
      missing timestamps would read as a growth problem; it is a logging problem,
      and the two lead to completely different decisions.
    */
    const m = userMetrics([
      user({ createdAt: null, lastSeenAt: null }),
      user({ createdAt: null, lastSeenAt: null }),
    ], NOW);
    expect(m.newThisWeek).toBeNull();
    expect(m.activeWeek).toBeNull();
    expect(m.total).toBe(2);          // they are still real accounts
  });

  it('counts only PAID accounts as conversion', () => {
    /*
      THE MOST FLATTERING WRONG NUMBER THIS DASHBOARD COULD SHOW.

      On the day StudyQuest had taken £0, five of its seven accounts were Pro —
      all of them comped with keys. Counting those as conversion put "71%" on
      screen next to "£0.00 revenue". Conversion is defined against revenue, so
      giving product away can never move it.
    */
    const granted = userMetrics([
      user({ isPro: true, proSource: 'key' }),
      user({ isPro: true, proSource: 'key' }),
      user(), user(),
    ], NOW);
    expect(granted.conversion).toBe(0);
    expect(granted.grantedPro).toBe(2);
    expect(granted.pro).toBe(2);

    const bought = userMetrics([
      user({ isPro: true, proSource: 'subscription' }),
      user({ isPro: true, proSource: 'key' }),
      user(), user(),
    ], NOW);
    expect(bought.conversion).toBe(0.25);
    expect(bought.grantedPro).toBe(1);

    expect(userMetrics([], NOW).conversion).toBeNull();
  });
});

describe('the signup chart', () => {
  it('includes the quiet days', () => {
    // Skipping empty days compresses time and makes a flat line look like growth.
    const s = signupSeries([user({ createdAt: daysAgo(2) })], 7, NOW);
    expect(s).toHaveLength(7);
    expect(s.reduce((n, d) => n + d.count, 0)).toBe(1);
    expect(s[s.length - 1].date).toBe('2026-09-02');
  });

  it('ignores test accounts and anything outside the window', () => {
    const s = signupSeries([
      user({ createdAt: daysAgo(1) }),
      user({ createdAt: daysAgo(1), email: 'debug.ui.9@example.com' }),
      user({ createdAt: daysAgo(400) }),
    ], 30, NOW);
    expect(s.reduce((n, d) => n + d.count, 0)).toBe(1);
  });
});

describe('money', () => {
  const order = (over: Partial<RawOrder> = {}): RawOrder => ({
    total: 1999, currency: 'GBP', status: 'paid', createdAt: daysAgo(5), ...over,
  });
  const sub = (over: Partial<RawSubscription> = {}): RawSubscription => ({
    status: 'active', amount: 499, interval: 'month', createdAt: daysAgo(5), ...over,
  });

  it('divides an annual plan by twelve', () => {
    /*
      THE M IN MRR. Booking a year's payment as one month's recurring revenue
      overstates it twelvefold — and StudyQuest's own plan is annual, so this is
      the exact case, not a hypothetical.
    */
    const r = revenueMetrics([], [sub({ amount: 2400, interval: 'year' })]);
    expect(r.mrr).toBe(200);
  });

  it('counts a cancelled-but-not-expired subscription as still paying', () => {
    // Cancelled means "will not renew", not "stopped paying today".
    const r = revenueMetrics([], [
      sub({ status: 'cancelled' }), sub({ status: 'expired' }),
    ]);
    expect(r.mrr).toBe(499);
  });

  it('leaves refunded orders out of revenue', () => {
    const r = revenueMetrics(
      [order(), order({ refunded: true }), order({ status: 'refunded' })], []);
    expect(r.grossTotal).toBe(1999);
    expect(r.orders).toBe(1);
    expect(r.refunded).toBe(2);
  });

  it('reports average ORDER value, which is what the data supports', () => {
    // Not ARPU: an order carries no customer id, so two orders from one person
    // are indistinguishable from one each.
    const r = revenueMetrics([order({ total: 1000 }), order({ total: 2000 })], []);
    expect(r.averageOrder).toBe(1500);
    expect(revenueMetrics([], []).averageOrder).toBeNull();
  });

  it('groups revenue by month, oldest first', () => {
    const r = revenueMetrics([
      order({ total: 500, createdAt: '2026-08-14T00:00:00Z' }),
      order({ total: 700, createdAt: '2026-07-02T00:00:00Z' }),
      order({ total: 300, createdAt: '2026-08-30T00:00:00Z' }),
    ], []);
    expect(r.byMonth).toEqual([
      { month: '2026-07', total: 700, orders: 1 },
      { month: '2026-08', total: 800, orders: 2 },
    ]);
  });

  it('knows the difference between no sales and no billing', () => {
    // The live store: keys configured, webhook working, nothing ever sold.
    expect(revenueMetrics([], []).noSalesYet).toBe(true);
    expect(revenueMetrics([order()], []).noSalesYet).toBe(false);
  });

  it('formats amounts as money, and unknowns as a dash', () => {
    expect(money(1999)).toBe('£19.99');
    expect(money(0)).toBe('£0.00');
    expect(money(123456, 'USD')).toBe('$1,234.56');
    expect(money(null)).toBe('—');
  });

  it('keeps zero and unknown visually distinct', () => {
    expect(count(0)).toBe('0');
    expect(count(null)).toBe('—');
    expect(percent(0)).toBe('0%');
    expect(percent(null)).toBe('—');
    expect(percent(0.25)).toBe('25%');
    expect(percent(0.043)).toBe('4.3%');
  });
});

describe('the one-line summary', () => {
  it('says plainly that nothing has sold', () => {
    /*
      The true state of StudyQuest today: billing connected, £0 taken. A
      dashboard that dressed this up would be worse than no dashboard.
    */
    const users = userMetrics([
      user({ isPro: true, proSource: 'key' }), user(), user(),
    ], NOW);
    const line = headline(users, revenueMetrics([], []));
    expect(line).toMatch(/nothing sold yet/i);
    expect(line).toMatch(/granted Pro key/i);
    expect(line).toMatch(/no one has bought/i);
  });

  it('switches to real figures once money arrives', () => {
    const users = userMetrics([user({ isPro: true, proSource: 'subscription' })], NOW);
    const line = headline(users, revenueMetrics(
      [{ total: 2400, currency: 'GBP', status: 'paid', createdAt: daysAgo(1) }],
      [{ status: 'active', amount: 2400, interval: 'year', createdAt: daysAgo(1) }]));
    expect(line).toMatch(/£2\.00 MRR/);
    expect(line).toMatch(/1 active subscription\b/);
  });

  it('is honest when there is nobody at all', () => {
    expect(headline(userMetrics([], NOW), revenueMetrics([], [])))
      .toMatch(/no real accounts yet/i);
  });
});
