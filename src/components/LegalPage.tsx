import React from 'react';
import { ArrowLeft, Mail, Clock, ShieldCheck } from 'lucide-react';

/**
 * Privacy, Terms and Contact.
 *
 * These three links existed in the footer as `href="#"` — they looked like a real policy and
 * went nowhere. That is worse than having no link at all: a privacy policy is a legal
 * requirement once you collect email addresses and take payments, and Brainify does both.
 *
 * The content below describes what the app ACTUALLY does, checked against the code rather than
 * copied from a template: Firebase Auth for sign-in, Firestore for study history and progress,
 * a server-side AI call whose token usage is metered per user, and upgrade keys for Pro.
 * Anything not verifiable from the codebase is deliberately absent.
 */

export type LegalView = 'privacy' | 'terms' | 'contact';

interface LegalPageProps {
  view: LegalView;
  onBack: () => void;
}

// Set this once and it is used everywhere a contact address is shown.
const SUPPORT_EMAIL = 'support@brainify.ai';
const LAST_UPDATED = '13 August 2026';

const H: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-lg font-bold text-text-main mt-8 mb-2">{children}</h2>
);

const P: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={`text-text-dim leading-relaxed mb-3 ${className ?? ''}`}>{children}</p>
);

const LI: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="text-text-dim leading-relaxed mb-1.5">{children}</li>
);

const Privacy = () => (
  <>
    <P>
      This policy explains exactly what Brainify AI stores about you, why, and how to get rid
      of it. It covers the app at this domain and nothing else.
    </P>

    <H>What we store</H>
    <ul className="list-disc pl-5 mb-3">
      <LI><b>Your account</b> — email address, display name and profile photo, taken from the
        Google or email sign-in you used. Handled by Firebase Authentication.</LI>
      <LI><b>Your study data</b> — the study kits you generate, your history, exams, tasks,
        sessions, XP, level, streak and badges.</LI>
      <LI><b>Usage</b> — how many AI tokens you have used today and this month. This is what
        enforces the free daily limit, so it cannot be turned off while you use the AI.</LI>
      <LI><b>Subscription state</b> — whether you are on Pro, which plan, and the upgrade key
        used to redeem it.</LI>
    </ul>
    <P>
      We do not store your payment card. Payments are handled by the payment provider and
      Brainify only ever sees whether a subscription is active.
    </P>

    <H>What we send to the AI</H>
    <P>
      When you generate a study kit, the text you paste or upload is sent to an AI provider to
      produce the result. Do not paste anything you would not want processed by a third party —
      passwords, medical details, or someone else's personal information.
    </P>

    <H>Who can see your data</H>
    <P>
      Only you. Security rules restrict every study record to the account that created it, and
      those rules are enforced by the database itself rather than by the app. An administrator
      account exists for support and can read account records.
    </P>

    <H>Cookies and tracking</H>
    <P>
      Brainify uses browser local storage to remember your theme and keep you signed in. There
      is no advertising, no third-party tracking pixel and nothing is sold to anyone.
    </P>

    <H>Your rights</H>
    <P>
      You can ask for a copy of everything held about you, ask for it to be corrected, or ask
      for your account and all its data to be deleted. Email {SUPPORT_EMAIL} and it will be
      done within 30 days. Deletion is permanent and includes your study history.
    </P>

    <H>Under 18</H>
    <P>
      Brainify is built for GCSE students, so most users are under 18. We collect no more than
      the list above, and never location, contacts or advertising identifiers. If you are under
      13, ask a parent or guardian before creating an account.
    </P>

    <H>Changes</H>
    <P>
      If this policy changes in a way that affects what we collect, the notice will appear in
      the app. This version is dated {LAST_UPDATED}.
    </P>
  </>
);

const Terms = () => (
  <>
    <P>By creating an account or using Brainify AI, you agree to the following.</P>

    <H>What Brainify is</H>
    <P>
      A study tool that turns your notes and past papers into revision material using AI. It is
      a revision aid, not a teacher and not an exam board. <b>AI output can be wrong.</b> Check
      anything important against your specification or textbook before you rely on it, and
      never submit generated text as your own coursework — that is your school's rules to
      answer to, not ours.
    </P>

    <H>Your account</H>
    <ul className="list-disc pl-5 mb-3">
      <LI>One account per person. Keep your sign-in details to yourself.</LI>
      <LI>You are responsible for what is generated from your account.</LI>
      <LI>Do not use Brainify to produce anything illegal, hateful, or aimed at harassing
        someone.</LI>
      <LI>Do not attempt to bypass usage limits, billing, or the security rules. Accounts doing
        so can be suspended without refund.</LI>
    </ul>

    <H>Free and Pro</H>
    <P>
      The free tier has a daily AI usage limit. Pro raises those limits and is granted either
      by subscription or by redeeming an upgrade key. An upgrade key works once, for one
      account, and cannot be reused or transferred after it has been redeemed.
    </P>

    <H>Cancelling and refunds</H>
    <P>
      You can cancel a subscription at any time and keep Pro until the end of the period you
      have paid for. If something has gone wrong — a payment taken twice, a key that did not
      apply — email {SUPPORT_EMAIL} and it will be sorted out.
    </P>

    <H>Your content</H>
    <P>
      What you paste in and what Brainify generates for you stays yours. We store it so you can
      come back to it, and we do not publish it or use it to train anything.
    </P>

    <H>Availability</H>
    <P>
      Brainify is provided as-is. It is a small, independent product and there is no uptime
      guarantee — during exam season especially, generation may be slower. We are not liable
      for exam results, missed revision, or losses arising from using the app.
    </P>

    <H>Ending your account</H>
    <P>
      You can delete your account at any time by emailing {SUPPORT_EMAIL}. We may suspend an
      account that breaks these terms.
    </P>

    <P className="pt-2">Last updated {LAST_UPDATED}.</P>
  </>
);

const Contact = () => (
  <>
    <P>
      Brainify is built and run by a small independent team. Questions, bugs, billing problems
      and data requests all go to the same place, and a real person reads them.
    </P>

    <div className="grid gap-3 sm:grid-cols-2 mt-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <Mail className="w-5 h-5 text-brand-purple mb-2" />
        <div className="font-semibold text-text-main mb-1">Email</div>
        <a href={`mailto:${SUPPORT_EMAIL}`}
           className="text-brand-purple hover:underline break-all">{SUPPORT_EMAIL}</a>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <Clock className="w-5 h-5 text-brand-purple mb-2" />
        <div className="font-semibold text-text-main mb-1">Response time</div>
        {/* A promise that can actually be kept. Overstating this is the fastest way to turn
            one annoyed user into a refund request. */}
        <p className="text-text-dim text-sm m-0">
          Within <b>2 working days</b>. Billing and account-deletion requests are handled first.
        </p>
      </div>
    </div>

    <H>Before you email about a bug</H>
    <P>
      It helps enormously if you say what you were doing, what you expected, and what happened
      instead — plus your browser. A screenshot is worth several paragraphs.
    </P>

    <H>Data requests</H>
    <P>
      To get a copy of your data or have your account deleted, email from the address you
      signed up with and say which you want. See the{' '}
      <span className="text-text-main">Privacy Policy</span> for what is held and how long it
      takes.
    </P>
  </>
);

const TITLES: Record<LegalView, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  contact: 'Contact',
};

const BLURBS: Record<LegalView, string> = {
  privacy: 'What we store, why, and how to delete it.',
  terms: 'The rules for using Brainify AI.',
  contact: 'Get in touch — a real person replies.',
};

export const LegalPage: React.FC<LegalPageProps> = ({ view, onBack }) => (
  <div className="min-h-screen w-full bg-bg-dark px-4 py-10 md:px-8 md:py-14">
    <div className="mx-auto w-full max-w-3xl">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-text-dim hover:text-text-main
                   transition-colors mb-8 text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck className="w-6 h-6 text-brand-purple" />
        <h1 className="text-3xl font-bold text-text-main m-0">{TITLES[view]}</h1>
      </div>
      <p className="text-text-dim mb-8">{BLURBS[view]}</p>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
        {view === 'privacy' && <Privacy />}
        {view === 'terms' && <Terms />}
        {view === 'contact' && <Contact />}
      </div>
    </div>
  </div>
);

export default LegalPage;
