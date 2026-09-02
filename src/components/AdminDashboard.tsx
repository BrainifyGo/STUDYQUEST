import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, Activity, MessageSquareWarning, RefreshCw, ShieldCheck,
  TrendingUp, Users, Wallet,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { forgetPass, recallPass, rememberPass } from '../lib/secretEntry';
import { IssueTriage } from './IssueTriage';
import {
  count, headline, money, percent, revenueMetrics, signupSeries, userMetrics,
  type RawOrder, type RawSubscription, type RawUser, type UsageMetrics,
} from '../lib/adminMetrics';

/**
 * How StudyQuest is actually doing — for RED and Daniel, not for students.
 *
 * Built to be READ RATHER THAN ADMIRED. The order of the page is the order of
 * the questions two founders actually ask: is anyone paying, is anyone here, are
 * they using it, is anything broken. The headline sentence at the top exists so
 * that the answer is available without interpreting a single chart.
 *
 * NOTHING HERE IS INVENTED. Every figure comes from Firebase Auth, Firestore or
 * the Lemon Squeezy API, and anything the data cannot answer renders as "—"
 * rather than a zero. That distinction is the whole point: "£0 revenue" is a
 * fact about the business, "no signup dates recorded" is a fact about the
 * database, and confusing the two would send RED chasing the wrong problem.
 *
 * Daniel reaches this from his own machine. Access is a role on his own account,
 * so nothing here needs RED's laptop or a shared password.
 */

type Tab = 'overview' | 'revenue' | 'people' | 'app' | 'issues' | 'team';

interface Payload {
  generatedAt: string;
  users: RawUser[];
  orders: RawOrder[];
  subscriptions: RawSubscription[];
  usage: UsageMetrics;
  billing: { configured: boolean; storeId: string | null };
  cached?: boolean;
}

interface TeamMember { uid: string; email: string | null; displayName: string | null }

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <TrendingUp size={15} /> },
  { id: 'revenue', label: 'Revenue', icon: <Wallet size={15} /> },
  { id: 'people', label: 'People', icon: <Users size={15} /> },
  { id: 'app', label: 'App health', icon: <Activity size={15} /> },
  { id: 'issues', label: 'Reports', icon: <MessageSquareWarning size={15} /> },
  { id: 'team', label: 'Access', icon: <ShieldCheck size={15} /> },
];

async function authed(path: string, init: RequestInit = {}) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  // The passphrase the founder typed to get in. The server holds the real one in
  // its environment and does the comparing; this bundle never knows whether what
  // it is sending is right.
  const pass = recallPass();
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(pass ? { 'x-sq-pass': pass } : {}),
      ...(init.headers ?? {}),
    },
  });
}

/* ── small building blocks ────────────────────────────────────────────────── */

const Stat: React.FC<{
  label: string; value: string; note?: string; tone?: 'ok' | 'warn' | 'bad' | 'none';
}> = ({ label, value, note, tone = 'none' }) => (
  <div
    className={`rounded-2xl border border-border-main bg-glass-bg p-4 ${
      tone === 'ok' ? 'border-l-[3px] border-l-emerald-500'
        : tone === 'warn' ? 'border-l-[3px] border-l-amber-500'
        : tone === 'bad' ? 'border-l-[3px] border-l-red-500' : ''
    }`}
  >
    <p className="text-[10.5px] font-black uppercase tracking-[0.14em] text-text-dim">{label}</p>
    <p className="mt-1.5 text-2xl font-black tabular-nums leading-tight">{value}</p>
    {note && <p className="mt-1 text-[11.5px] leading-snug text-text-dim">{note}</p>}
  </div>
);

const Panel: React.FC<{ title: string; aside?: string; children: React.ReactNode }> = ({
  title, aside, children,
}) => (
  <section className="overflow-hidden rounded-2xl border border-border-main bg-glass-bg">
    <h3 className="flex items-baseline justify-between gap-3 border-b border-border-main px-4 py-3">
      <span className="text-[12.5px] font-black uppercase tracking-[0.12em]">{title}</span>
      {aside && <span className="text-[11.5px] font-normal text-text-dim">{aside}</span>}
    </h3>
    {children}
  </section>
);

const Row: React.FC<{ label: string; value: string; hint?: string }> = ({
  label, value, hint,
}) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-border-main/50 px-4 py-2.5 last:border-b-0">
    <span className="min-w-0 text-[13px]">
      {label}
      {hint && <span className="ml-2 text-[11.5px] text-text-dim">{hint}</span>}
    </span>
    <span className="shrink-0 text-[13px] font-bold tabular-nums">{value}</span>
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-4 py-6 text-[13px] leading-relaxed text-text-dim">{children}</p>
);

/** Signups per day. Plain divs rather than a chart library — it is a bar chart. */
const Bars: React.FC<{ data: { date: string; count: number }[] }> = ({ data }) => {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);

  if (total === 0) {
    return <Empty>No signups in the last 30 days.</Empty>;
  }
  return (
    <div className="px-4 py-4">
      <div className="flex h-24 items-end gap-[3px]" role="img"
           aria-label={`${total} signups over the last ${data.length} days`}>
        {data.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.count}`}
            className="flex-1 rounded-t-[3px] bg-brand-purple/70 transition-all hover:bg-brand-purple"
            style={{ height: `${Math.max(d.count ? 8 : 2, (d.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-text-dim">
        <span>{data[0]?.date}</span>
        <span>{total} in {data.length} days</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
};

/* ── the screen ───────────────────────────────────────────────────────────── */

export const AdminDashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [invite, setInvite] = useState('');
  const [needsPass, setNeedsPass] = useState(false);
  const [passDraft, setPassDraft] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await authed('/api/admin/metrics');
      const json = await res.json();
      if (!res.ok) {
        // A wrong passphrase must not sit in the tab being retried; forget it so
        // the next attempt starts clean and the prompt below can ask again.
        if (res.status === 403) { forgetPass(); setNeedsPass(true); }
        throw new Error(json.error ?? 'Could not load the dashboard.');
      }
      setNeedsPass(false);
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the dashboard.');
    } finally {
      setBusy(false);
    }
  }, []);

  const loadTeam = useCallback(async () => {
    const res = await authed('/api/admin/team');
    if (res.ok) setTeam((await res.json()).team);
  }, []);

  useEffect(() => { void load(); void loadTeam(); }, [load, loadTeam]);

  const users = useMemo(() => userMetrics(data?.users ?? []), [data]);
  const revenue = useMemo(
    () => revenueMetrics(data?.orders ?? [], data?.subscriptions ?? []),
    [data],
  );
  const series = useMemo(() => signupSeries(data?.users ?? [], 30), [data]);
  const usage = data?.usage;

  const changeAccess = async (email: string, grant: boolean) => {
    const res = await authed('/api/admin/team', {
      method: 'POST',
      body: JSON.stringify({ email, grant }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? 'Could not change access.'); return; }
    toast.success(grant ? `${json.email} can now open the dashboard.`
                        : `${json.email} no longer has access.`);
    setInvite('');
    void loadTeam();
  };

  /*
    Refused for the passphrase: ask for it rather than showing a dead end.

    This is what makes the passphrase a real second factor rather than a
    formality. When the server's ADMIN_PASSPHRASE is the same as the word that
    opens the door, this never appears. Change it to something else and the door
    still opens on the word, but the data needs the passphrase — so reading the
    bundle is no longer enough to see anything.

    Deliberately says nothing about what it is guarding.
  */
  if (needsPass) {
    const submit = () => {
      if (!passDraft.trim()) return;
      rememberPass(passDraft.trim());
      setPassDraft('');
      setNeedsPass(false);
      void load();
    };
    return (
      <div className="mx-auto max-w-sm space-y-4 p-6 pt-16">
        <input
          type="password"
          autoFocus
          value={passDraft}
          onChange={(e) => setPassDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          aria-label="Passphrase"
          className="min-h-11 w-full rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
        />
        <div className="flex gap-2">
          <button onClick={submit}
                  className="min-h-11 flex-1 rounded-xl bg-brand-purple px-4 font-black text-white">
            Continue
          </button>
          <button onClick={onBack}
                  className="min-h-11 rounded-xl border border-border-main px-4 text-[13px] font-bold text-text-dim">
            Back
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <button onClick={onBack} className="flex items-center gap-2 text-[13px] text-text-dim hover:text-text-main">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5">
          <p className="font-bold">{error}</p>
          <button onClick={() => void load()} className="mt-3 text-[13px] underline">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-[13px] text-text-dim hover:text-text-main">
          <ArrowLeft size={16} /> Back
        </button>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border-main bg-glass-bg px-3 text-[13px] font-bold disabled:opacity-60"
        >
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div>
        <h2 className="text-2xl font-black tracking-tight">How StudyQuest is doing</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-text-dim">
          {data ? headline(users, revenue) : 'Loading…'}
        </p>
        {data && (
          <p className="mt-1 text-[11.5px] text-text-dim">
            As of {new Date(data.generatedAt).toLocaleString('en-GB')}
            {data.cached && ' · cached, refreshes every minute'}
            {users.excludedTestAccounts > 0
              && ` · ${users.excludedTestAccounts} test account${
                users.excludedTestAccounts === 1 ? '' : 's'} left out of every figure`}
          </p>
        )}
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-[13px] font-bold transition-all ${
              tab === t.id ? 'border-brand-purple bg-brand-purple/20 text-brand-purple'
                : 'border-border-main bg-glass-bg text-text-dim hover:text-text-main'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {!data && <Empty>Loading the numbers&hellip;</Empty>}

      {data && tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Accounts" value={count(users.total)}
                  note={`${count(users.free)} free · ${count(users.pro)} Pro`} />
            <Stat label="Active this week" value={count(users.activeWeek)}
                  note={users.activeWeek === null ? 'no sign-in dates' : 'signed in within 7 days'} />
            <Stat label="MRR" value={money(revenue.mrr, revenue.currency)}
                  tone={revenue.mrr > 0 ? 'ok' : 'warn'}
                  note={`${count(revenue.activeSubscriptions)} active subscription${
                    revenue.activeSubscriptions === 1 ? '' : 's'}`} />
            <Stat label="Revenue, all time" value={money(revenue.grossTotal, revenue.currency)}
                  tone={revenue.grossTotal > 0 ? 'ok' : 'warn'}
                  note={`${count(revenue.orders)} paid order${revenue.orders === 1 ? '' : 's'}`} />
          </div>

          {revenue.noSalesYet && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
              <p className="text-[13.5px] font-bold">Nothing has sold yet.</p>
              <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
                Billing is connected and the store is live &mdash; this is not a broken
                checkout, it is that no one has bought. Every Pro account so far was
                granted with a key. The number to move is the first sale, not engagement.
              </p>
            </div>
          )}

          <Panel title="Signups" aside="last 30 days">
            <Bars data={series} />
          </Panel>

          <Panel title="At a glance">
            <Row label="Paid conversion" value={percent(users.conversion)}
                 hint="accounts that actually bought" />
            <Row label="Pro given away on keys" value={count(users.grantedPro)}
                 hint="not revenue" />
            <Row label="Students who set a year and set" value={count(users.withStudyLevel)} />
            <Row label="Study kits made" value={count(usage?.studyKits)} />
            <Row label="Past papers practised" value={count(usage?.paperSessions)} />
            <Row label="Issues reported and open" value={count(usage?.openIssues)} />
          </Panel>
        </>
      )}

      {data && tab === 'revenue' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="MRR" value={money(revenue.mrr, revenue.currency)} />
            <Stat label="All-time revenue" value={money(revenue.grossTotal, revenue.currency)} />
            <Stat label="Paid orders" value={count(revenue.orders)} />
            <Stat label="Average order" value={money(revenue.averageOrder, revenue.currency)} />
          </div>

          <Panel title="Subscriptions" aside={data.billing.configured
            ? `Lemon Squeezy store ${data.billing.storeId}` : 'billing not configured'}>
            {Object.keys(revenue.subsByStatus).length === 0
              ? <Empty>No subscriptions have ever been created.</Empty>
              : Object.entries(revenue.subsByStatus).map(([status, n]) => (
                  <Row key={status} label={status.replace(/_/g, ' ')} value={count(n)} />
                ))}
          </Panel>

          <Panel title="Revenue by month">
            {revenue.byMonth.length === 0
              ? <Empty>No paid orders yet, so there is nothing to chart.</Empty>
              : revenue.byMonth.map((m) => (
                  <Row key={m.month} label={m.month} value={money(m.total, revenue.currency)}
                       hint={`${m.orders} order${m.orders === 1 ? '' : 's'}`} />
                ))}
          </Panel>

          <Panel title="Where Pro came from">
            {Object.keys(users.proBySource).length === 0
              ? <Empty>No Pro accounts.</Empty>
              : Object.entries(users.proBySource).map(([src, n]) => (
                  <Row key={src} label={src === 'key' ? 'Granted with a key'
                         : src === 'subscription' ? 'Paid subscription' : src}
                       value={count(n)}
                       hint={src === 'key' ? 'not revenue' : undefined} />
                ))}
          </Panel>
        </>
      )}

      {data && tab === 'people' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Accounts" value={count(users.total)} />
            <Stat label="Active today" value={count(users.activeDay)} />
            <Stat label="Active this month" value={count(users.activeMonth)} />
            <Stat label="New this month" value={count(users.newThisMonth)} />
          </div>

          <Panel title="Signups" aside="last 30 days">
            <Bars data={series} />
          </Panel>

          <Panel title="Breakdown">
            <Row label="Free accounts" value={count(users.free)} />
            <Row label="Pro accounts" value={count(users.pro)} />
            <Row label="Paid conversion" value={percent(users.conversion)}
                 hint="excludes granted keys" />
            <Row label="Pro given away on keys" value={count(users.grantedPro)} />
            <Row label="Told us their year and set" value={count(users.withStudyLevel)}
                 hint="questions get pitched properly" />
            <Row label="Test accounts excluded" value={count(users.excludedTestAccounts)}
                 hint="created by debugging" />
          </Panel>
        </>
      )}

      {data && tab === 'app' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Study kits" value={count(usage?.studyKits)} />
            <Stat label="Paper sessions" value={count(usage?.paperSessions)} />
            <Stat label="Mistakes logged" value={count(usage?.mistakesLogged)} />
            <Stat label="Open issues" value={count(usage?.openIssues)}
                  tone={(usage?.openIssues ?? 0) > 0 ? 'warn' : 'ok'} />
          </div>

          <Panel title="What students are doing">
            <Row label="Study kits made" value={count(usage?.studyKits)} />
            <Row label="Study sessions" value={count(usage?.studySessions)} />
            <Row label="Past papers practised" value={count(usage?.paperSessions)} />
            <Row label="Mistakes saved to revisit" value={count(usage?.mistakesLogged)} />
            <Row label="Planner tasks" value={count(usage?.tasks)} />
            <Row label="Exams added" value={count(usage?.exams)} />
            <Row label="Examiner insights published" value={count(usage?.insights)} />
          </Panel>

          <Panel title="Data health">
            <Row label="Issue reports open" value={count(usage?.openIssues)} />
            <Row label="Orphaned public profiles" value={count(usage?.orphanedProfiles)}
                 hint="rows left behind by deleted accounts" />
            <Row label="Billing configured" value={data.billing.configured ? 'yes' : 'NO'} />
          </Panel>
        </>
      )}

      {/* Reads Firestore directly — the rules gate this on the admin role, so it
          does not depend on the metrics API being reachable. */}
      {tab === 'issues' && <IssueTriage />}

      {data && tab === 'team' && (
        <>
          <Panel title="Who can open this dashboard" aside={team ? `${team.length}` : ''}>
            {!team ? <Empty>Loading&hellip;</Empty>
              : team.map((m) => (
                  <div key={m.uid}
                       className="flex items-center justify-between gap-3 border-b border-border-main/50 px-4 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold">
                        {m.displayName || m.email || m.uid}
                      </p>
                      {m.displayName && m.email
                        && <p className="truncate text-[11.5px] text-text-dim">{m.email}</p>}
                    </div>
                    {m.uid === auth.currentUser?.uid
                      ? <span className="shrink-0 text-[11.5px] text-text-dim">you</span>
                      : (
                        <button
                          onClick={() => m.email && void changeAccess(m.email, false)}
                          className="shrink-0 rounded-lg border border-border-main px-2.5 py-1.5 text-[12px] font-bold text-text-dim hover:text-text-main"
                        >
                          Remove
                        </button>
                      )}
                  </div>
                ))}
          </Panel>

          <Panel title="Give someone access">
            <div className="space-y-3 p-4">
              <p className="text-[13px] leading-relaxed text-text-dim">
                They need a StudyQuest account first &mdash; ask them to sign up with the
                email you add here, then they can open this from their own laptop.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="daniel@example.com"
                  className="min-h-11 flex-1 rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
                />
                <button
                  onClick={() => invite.trim() && void changeAccess(invite.trim(), true)}
                  className="min-h-11 rounded-xl bg-brand-purple px-4 font-black text-white"
                >
                  Give access
                </button>
              </div>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
