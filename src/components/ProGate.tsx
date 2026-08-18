import React from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { useUserStore } from '../store/useUserStore';
import { can, planOf, upsellFor, type Feature } from '../lib/entitlements';

/**
 * The Pro gate.
 *
 * Sibling to `GuestGuard`, which separates guests from signed-in users. That is
 * a different question, and conflating the two is why five of the six features
 * advertised on the payment page were available to every free account: the app
 * had a guest check and no paid check at all.
 *
 * WHAT THIS IS AND IS NOT. For anything that spends money — AI generation, the
 * tutor — the real gate is in `server.ts`, checked against a verified Firebase
 * token, because anyone can call the API directly. For study rooms it is on the
 * socket. This component is the part of the gate a person actually sees: it
 * explains what they are missing and offers the upgrade. It is not the boundary.
 *
 * Where a feature costs nothing to serve (analytics detail, the saved-kit cap)
 * this IS the whole gate, deliberately — the worst case of a bypass is that
 * somebody sees their own data in more detail, which is not worth server code.
 */

interface ProGateProps {
  feature: Feature;
  children: React.ReactNode;
  /**
   * Show the locked content behind a blur instead of replacing it.
   *
   * Better for a chart or a list, where seeing the shape of what you are missing
   * is the argument for paying. Wrong for anything holding real data.
   */
  preview?: boolean;
  /**
   * A single inline chip instead of a card.
   *
   * For small controls that sit inside someone's own content — a period
   * switcher, a toggle. A full upsell card there reads as an advert dropped into
   * the middle of their progress page, and on a phone it is taller than the
   * thing it is gating. The pitch belongs on the upgrade page.
   */
  compact?: boolean;
}

export const ProGate: React.FC<ProGateProps> = ({ feature, children, preview, compact }) => {
  const { userData, setActiveView, authLoading } = useUserStore();

  // Nothing flashes while we do not yet know the plan. Rendering the locked
  // state first and then unlocking is worse than a moment of nothing.
  if (authLoading) return null;

  const isPro = !!userData?.isPro || localStorage.getItem('brainify_test_pro') === 'true';
  if (can(planOf(isPro), feature)) return <>{children}</>;

  const { title, body } = upsellFor(feature);

  const cta = (
    <div className="flex flex-col items-center gap-3 text-center px-6 max-w-sm">
      <span className="w-11 h-11 rounded-2xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center">
        <Lock size={18} className="text-brand-purple" />
      </span>
      <p className="font-black text-text-main">{title}</p>
      <p className="text-sm text-text-dim leading-relaxed">{body}</p>
      <button
        onClick={() => setActiveView('upgrade')}
        className="btn-primary px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2"
      >
        <Sparkles size={15} />
        See Pro
      </button>
    </div>
  );

  if (compact) {
    // Matches the height and shape of the controls beside it, so it sits in the
    // row rather than on top of it.
    return (
      <button
        onClick={() => setActiveView('upgrade')}
        title={`${title} — see Pro`}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-glass-bg border border-border-main text-text-dim hover:text-text-main hover:border-brand-purple/40 transition-all text-xs font-bold"
      >
        <Lock size={13} className="text-brand-purple" />
        Pro
      </button>
    );
  }

  if (preview) {
    /*
      THE CTA IS ABSOLUTE, SO IT MUST NOT BE TALLER THAN WHAT IT COVERS.

      On the Analytics page this wrapped the weekly/monthly/all-time switcher —
      a row about 50px tall — while the CTA is an icon, a heading, a sentence and
      a button. Absolutely positioned inside a 50px box, it spilled straight up
      over the page title, so "Detailed progress is part of Pro" was printed
      across "Your Progress" on a phone.

      A minimum height keeps the box at least as tall as its own contents, so the
      blur and the message stay inside the thing being gated.
    */
    return (
      <div className="relative min-h-[13rem] rounded-2xl overflow-hidden">
        <div className="pointer-events-none select-none blur-sm opacity-40" aria-hidden="true">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-bg-main/70 backdrop-blur-[2px] rounded-2xl">
          {cta}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-border-main py-12 flex items-center justify-center">
      {cta}
    </div>
  );
};

export default ProGate;
