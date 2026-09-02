import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import {
  CATEGORIES, CATEGORY_LABELS, MAX_DESCRIPTION, STATUS_LABELS,
  readContext, validateReport,
  type IssueCategory, type IssueReport,
} from '../lib/issueReport';
import { myReports, submitReport } from '../lib/issueStore';
import { useUserStore } from '../store/useUserStore';

/**
 * Telling us what is broken.
 *
 * Two things shape this form.
 *
 * A student writing it is already annoyed — something just wasted their revision
 * time. So it is short, it says what happens next, and it never argues with
 * them. The one thing it insists on is a sentence of description, because "it
 * dosnt work" cannot be fixed and the difference is fifteen seconds of typing.
 *
 * And the technical context is COLLECTED but not paraded. The team needs to know
 * it was Chrome on a phone; the student does not need a panel of diagnostics to
 * feel like they filled in a form correctly. It is shown, once, in one line —
 * visible because collecting something about someone silently is not on.
 */

interface Props {
  onBack: () => void;
  /** Which screen they were on when they hit the problem. */
  fromView?: string;
}

export const ReportIssue: React.FC<Props> = ({ onBack, fromView = 'unknown' }) => {
  const { isGuest } = useUserStore();
  const [category, setCategory] = useState<IssueCategory>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<IssueReport[] | null>(null);

  const context = readContext(fromView, import.meta.env.VITE_APP_VERSION || 'dev');

  useEffect(() => {
    if (isGuest) { setMine([]); return; }
    myReports().then(setMine).catch(() => setMine([]));
  }, [isGuest, sent]);

  const send = async () => {
    const check = validateReport({ title, description, category });
    setErrors(check.errors as Record<string, string>);
    if (!check.ok) return;

    setSending(true);
    try {
      const ok = await submitReport({
        category, title, description,
        view: fromView,
        appVersion: import.meta.env.VITE_APP_VERSION || 'dev',
      });
      if (!ok) { toast.error('Could not send that. Try again in a moment.'); return; }
      setSent(true);
      setTitle('');
      setDescription('');
    } finally {
      setSending(false);
    }
  };

  if (isGuest) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <button onClick={onBack} className="mb-4 flex items-center gap-2 text-[13px] text-text-dim">
          <ArrowLeft size={16} /> Back
        </button>
        <p className="rounded-2xl border border-border-main bg-glass-bg p-5 text-[13.5px] text-text-dim">
          Make an account to report a problem — we need somewhere to reply if we have to ask
          you a question about it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 pb-24">
      <button onClick={onBack} className="flex items-center gap-2 text-[13px] text-text-dim hover:text-text-main">
        <ArrowLeft size={16} /> Back
      </button>

      <div>
        <h2 className="text-2xl font-black tracking-tight">Report a problem</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-text-dim">
          If something is broken, wrong or just annoying, tell us. Every two months we read
          everything sent in and fix whatever came up most.
        </p>
      </div>

      {sent && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.08] p-4">
          <Check size={18} className="mt-0.5 shrink-0 text-emerald-400" />
          <p className="text-[13.5px] leading-relaxed text-emerald-200">
            Sent — thank you. It goes into the next review, and if lots of people report the
            same thing it goes to the top of the list.
          </p>
        </div>
      )}

      {/* ── category ────────────────────────────────────────────── */}
      <fieldset>
        <legend className="mb-2 text-[11px] font-black uppercase tracking-widest text-text-dim">
          What kind of problem?
        </legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`min-h-11 rounded-xl border px-3 text-[13px] font-bold transition-all ${
                category === c
                  ? 'border-brand-purple bg-brand-purple/20 text-brand-purple'
                  : 'border-border-main bg-glass-bg text-text-dim hover:text-text-main'
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* ── title ───────────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1 block text-[11px] font-black uppercase tracking-widest text-text-dim">
          In a few words
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="The quiz got stuck loading"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'title-error' : undefined}
          className={`min-h-11 w-full rounded-xl border bg-glass-bg px-3 text-sm ${
            errors.title ? 'border-red-500/60' : 'border-border-main'
          }`}
        />
        {errors.title && (
          <span id="title-error" className="mt-1 block text-[12px] text-red-400">{errors.title}</span>
        )}
      </label>

      {/* ── description ─────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1 block text-[11px] font-black uppercase tracking-widest text-text-dim">
          What happened?
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={MAX_DESCRIPTION}
          placeholder="What were you doing, and what did the app do instead?"
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? 'desc-error' : undefined}
          className={`w-full resize-y rounded-xl border bg-glass-bg p-3 text-sm leading-relaxed ${
            errors.description ? 'border-red-500/60' : 'border-border-main'
          }`}
        />
        {errors.description && (
          <span id="desc-error" className="mt-1 block text-[12px] text-red-400">{errors.description}</span>
        )}
      </label>

      {/*
        Said out loud, in one line. Collecting anything about somebody silently
        is not on — and a wall of diagnostics would make a simple form feel like
        a legal document.
      */}
      <p className="text-[12px] leading-relaxed text-text-dim">
        Sent with this: {context.browser}, {context.screen}, from the{' '}
        <strong>{context.view}</strong> screen. Nothing else.
      </p>

      <button
        onClick={send}
        disabled={sending}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-purple px-4 py-3 font-black text-white transition-all disabled:opacity-60"
      >
        {sending ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : 'Send it'}
      </button>

      {/* ── what they have already sent ─────────────────────────── */}
      {mine && mine.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-text-dim">
            What you have reported
          </h3>
          <ul className="space-y-2">
            {mine.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-main bg-glass-bg px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{r.title}</span>
                  <span className="text-[11.5px] text-text-dim">
                    {CATEGORY_LABELS[r.category]} · {r.created_at.slice(0, 10)}
                  </span>
                </span>
                <span className="shrink-0 rounded-lg bg-glass-bg px-2 py-1 text-[11px] font-black uppercase tracking-widest text-text-dim">
                  {STATUS_LABELS[r.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ReportIssue;
