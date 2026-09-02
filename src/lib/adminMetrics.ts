/**
 * Shaping raw counts into the numbers on the founders' dashboard.
 *
 * Pure functions, no I/O — the server does the reading, this decides what the
 * reading means. That split exists so the arithmetic behind "MRR" and
 * "conversion" can be tested, because a business number that is quietly wrong is
 * worse than one that is missing: RED and Daniel would make decisions on it.
 *
 * THE RULE THIS FILE IS BUILT AROUND: never invent a number. Where the data
 * cannot answer a question, the answer is `null` and the dashboard says so.
 * A zero and an unknown are different things — "£0 revenue" is a fact about the
 * business, "no signup dates recorded" is a fact about the database, and showing
 * the second as the first would be a lie about how the company is doing.
 */

export interface RawUser {
  uid: string;
  email: string | null;
  isPro: boolean;
  proSource?: string | null;
  subscriptionType?: string | null;
  /** ISO. From Firebase Auth, which always records it. */
  createdAt: string | null;
  /** ISO. Auth's lastSignInTime. */
  lastSeenAt: string | null;
  xp?: number;
  streak?: number;
  studyLevel?: unknown;
}

/**
 * Accounts this project's own debugging created.
 *
 * They are real rows in the real database, so every count includes them unless
 * something takes them out — and at the time of writing that was FOURTEEN of
 * nineteen users. A dashboard reporting nineteen users would not be slightly
 * off; it would be wrong by a factor of three about the only number that
 * matters early on.
 *
 * Excluded by pattern rather than deleted, because deleting live accounts is
 * the owner's call, not a side effect of building a dashboard. The dashboard
 * says how many it set aside.
 */
export function isTestAccount(email: string | null | undefined): boolean {
  const e = (email ?? '').toLowerCase();
  if (!e) return false;                       // anonymous/guest users are real
  return /^debug\.[a-z]+\.\d+@example\.com$/.test(e)
      || /^e2e[.-]/.test(e)
      || e.endsWith('@example.com');
}

export interface UserMetrics {
  total: number;
  excludedTestAccounts: number;
  pro: number;
  free: number;
  /** Pro accounts by how they got it. Keys are grants; subscriptions are revenue. */
  proBySource: Record<string, number>;
  /** Signed in within the window. null when nothing records a last sign-in. */
  activeDay: number | null;
  activeWeek: number | null;
  activeMonth: number | null;
  newThisWeek: number | null;
  newThisMonth: number | null;
  /**
   * PAID conversion: the share of accounts that actually bought, 0–1.
   *
   * Counts subscription-sourced Pro only. Counting granted keys here would have
   * reported StudyQuest at 71% conversion on the day it had taken £0 — five
   * comped accounts out of seven. That is the single most flattering wrong
   * number this dashboard could show, so it is defined against revenue.
   */
  conversion: number | null;
  /** Pro that was given away. Not revenue, and shown separately for that reason. */
  grantedPro: number;
  withStudyLevel: number;
}

const DAY = 86_400_000;

function ageInDays(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (now - t) / DAY;
}

export function userMetrics(all: RawUser[], now = Date.now()): UserMetrics {
  const excluded = all.filter((u) => isTestAccount(u.email));
  const users = all.filter((u) => !isTestAccount(u.email));

  const within = (iso: string | null, days: number) => {
    const a = ageInDays(iso, now);
    return a !== null && a <= days;
  };

  const anySeen = users.some((u) => u.lastSeenAt);
  const anyCreated = users.some((u) => u.createdAt);

  const proBySource: Record<string, number> = {};
  for (const u of users) {
    if (!u.isPro) continue;
    const key = u.proSource || 'unknown';
    proBySource[key] = (proBySource[key] ?? 0) + 1;
  }

  const pro = users.filter((u) => u.isPro).length;
  const paying = proBySource.subscription ?? 0;
  const grantedPro = pro - paying;

  return {
    total: users.length,
    excludedTestAccounts: excluded.length,
    pro,
    free: users.length - pro,
    proBySource,
    activeDay: anySeen ? users.filter((u) => within(u.lastSeenAt, 1)).length : null,
    activeWeek: anySeen ? users.filter((u) => within(u.lastSeenAt, 7)).length : null,
    activeMonth: anySeen ? users.filter((u) => within(u.lastSeenAt, 30)).length : null,
    newThisWeek: anyCreated ? users.filter((u) => within(u.createdAt, 7)).length : null,
    newThisMonth: anyCreated ? users.filter((u) => within(u.createdAt, 30)).length : null,
    conversion: users.length ? paying / users.length : null,
    grantedPro,
    withStudyLevel: users.filter((u) => u.studyLevel).length,
  };
}

/**
 * Signups per day for the last `days` days, oldest first.
 *
 * Every day in the window is present, including the empty ones — a chart that
 * skipped quiet days would compress time and make a flat line look like growth.
 */
export function signupSeries(
  all: RawUser[], days = 30, now = Date.now(),
): { date: string; count: number }[] {
  const users = all.filter((u) => !isTestAccount(u.email));
  const buckets = new Map<string, number>();

  for (let i = days - 1; i >= 0; i--) {
    buckets.set(new Date(now - i * DAY).toISOString().slice(0, 10), 0);
  }
  for (const u of users) {
    if (!u.createdAt) continue;
    const key = u.createdAt.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets].map(([date, count]) => ({ date, count }));
}

/* ── money ────────────────────────────────────────────────────────────────── */

export interface RawOrder {
  /** Minor units, as Lemon Squeezy reports them. */
  total: number;
  currency: string;
  status: string;
  createdAt: string;
  refunded?: boolean;
}

export interface RawSubscription {
  status: string;
  /** Minor units per renewal, when the variant is known. */
  amount?: number | null;
  interval?: 'month' | 'year' | string | null;
  createdAt: string;
}

export interface RevenueMetrics {
  currency: string;
  /** Minor units. Paid, non-refunded orders only. */
  grossTotal: number;
  orders: number;
  refunded: number;
  /** Monthly recurring revenue in minor units, annual plans divided by 12. */
  mrr: number;
  activeSubscriptions: number;
  subsByStatus: Record<string, number>;
  /**
   * Average value of a paid order, minor units. null before the first sale.
   *
   * NOT called ARPU, because it is not that. ARPU is revenue divided by paying
   * CUSTOMERS, and an order carries no customer id here — two orders from one
   * person are indistinguishable from one each. Average order value is what this
   * data can actually support, so it is what it is named.
   */
  averageOrder: number | null;
  byMonth: { month: string; total: number; orders: number }[];
  /** True when billing is wired up but nothing has ever been sold. */
  noSalesYet: boolean;
}

/** Statuses Lemon Squeezy treats as money actually received. */
const PAID = new Set(['paid', 'partial_refund']);
/** Statuses that are still generating revenue each period. */
const LIVE_SUB = new Set(['active', 'on_trial', 'past_due', 'cancelled']);

export function revenueMetrics(
  orders: RawOrder[],
  subs: RawSubscription[],
  currency = 'GBP',
): RevenueMetrics {
  const paid = orders.filter((o) => PAID.has(o.status) && !o.refunded);
  const grossTotal = paid.reduce((n, o) => n + (o.total || 0), 0);

  const byMonth = new Map<string, { total: number; orders: number }>();
  for (const o of paid) {
    const m = (o.createdAt || '').slice(0, 7);
    if (!m) continue;
    const row = byMonth.get(m) ?? { total: 0, orders: 0 };
    row.total += o.total || 0;
    row.orders += 1;
    byMonth.set(m, row);
  }

  const subsByStatus: Record<string, number> = {};
  for (const s of subs) subsByStatus[s.status] = (subsByStatus[s.status] ?? 0) + 1;

  /*
    "cancelled" still pays until the period ends, so it counts toward MRR while
    live; "expired" does not. Annual is divided by 12 rather than counted whole,
    which is the whole point of the M in MRR — booking a year's payment as one
    month's recurring revenue would overstate it twelvefold.
  */
  const live = subs.filter((s) => LIVE_SUB.has(s.status));
  const mrr = live.reduce((n, s) => {
    const amt = s.amount ?? 0;
    if (!amt) return n;
    return n + (s.interval === 'year' ? amt / 12 : amt);
  }, 0);

  return {
    currency,
    grossTotal,
    orders: paid.length,
    refunded: orders.filter((o) => o.refunded || o.status === 'refunded').length,
    mrr: Math.round(mrr),
    activeSubscriptions: subs.filter((s) => s.status === 'active').length,
    subsByStatus,
    averageOrder: paid.length ? Math.round(grossTotal / paid.length) : null,
    byMonth: [...byMonth].map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    noSalesYet: paid.length === 0 && subs.length === 0,
  };
}

/** Minor units to a readable amount. 1999 GBP -> "£19.99". */
export function money(minor: number | null | undefined, currency = 'GBP'): string {
  if (minor === null || minor === undefined) return '—';
  const symbol = { GBP: '£', USD: '$', EUR: '€' }[currency] ?? `${currency} `;
  return `${symbol}${(minor / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

/** A count that might be unknown. Keeps "none" and "not recorded" apart. */
export function count(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('en-GB');
}

export function percent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '—';
  // Exactly zero is "0%", not "0.0%": the extra decimal implies a measurement
  // precise enough to have rounded down, when nothing happened at all.
  if (fraction === 0) return '0%';
  return `${(fraction * 100).toFixed(fraction >= 0.1 ? 0 : 1)}%`;
}

/* ── how the app itself is doing ──────────────────────────────────────────── */

export interface UsageMetrics {
  studyKits: number;
  studySessions: number;
  paperSessions: number;
  mistakesLogged: number;
  tasks: number;
  exams: number;
  insights: number;
  openIssues: number;
  /** public_profiles with no matching user document. */
  orphanedProfiles: number;
}

/**
 * One plain sentence on where the business actually stands.
 *
 * Deliberately blunt, and deliberately not congratulatory. The most useful thing
 * a dashboard can tell two founders early on is which single number is the
 * problem, and at zero revenue that is never "engagement".
 */
export function headline(u: UserMetrics, r: RevenueMetrics): string {
  if (u.total === 0) return 'No real accounts yet — the first job is getting anyone to sign up.';

  if (r.noSalesYet) {
    return `${u.total} account${u.total === 1 ? '' : 's'}, ${
      u.grantedPro > 0 ? `${u.grantedPro} on granted Pro keys, ` : ''
    }and nothing sold yet. Billing is connected and working — no one has bought.`;
  }

  return `${u.total} accounts, ${u.pro} on Pro, ${money(r.mrr, r.currency)} MRR from ${
    r.activeSubscriptions} active subscription${r.activeSubscriptions === 1 ? '' : 's'}.`;
}
