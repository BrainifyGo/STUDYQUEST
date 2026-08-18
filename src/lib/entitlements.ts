/**
 * ENTITLEMENTS — what each plan actually gets.
 *
 * ONE SOURCE OF TRUTH, shared by the client and the server. The upgrade page
 * advertised six Pro features and **five of them were available to every free
 * account**, because the only gate in the app was `GuestGuard`, which separates
 * guests from signed-in users and has nothing to do with paying.
 *
 * WHERE A GATE HAS TO LIVE depends on what it protects:
 *
 *   - Anything that spends money on an AI provider is enforced SERVER-SIDE, in
 *     server.ts, against a verified Firebase ID token. A client-side check is a
 *     suggestion: anyone can call `/api/generate` with curl.
 *
 *   - Study rooms are enforced on the SOCKET, for the same reason plus a worse
 *     one: `join-room` previously took a username string and no token at all, so
 *     any six-character code let anyone into a room. That is a Pro hole and a
 *     safeguarding problem, and the second matters more.
 *
 *   - Analytics detail and the saved-kit cap are enforced in the CLIENT ONLY,
 *     and that is a deliberate, stated choice. They cost us nothing to serve, so
 *     the worst case of someone bypassing them is that they see their own data
 *     in more detail. Writing that down beats implying a security boundary that
 *     is not there.
 */

export type Plan = 'free' | 'pro';

export type Feature =
  | 'ai-tutor'          // deep explanations, follow-up questions
  | 'study-rooms'       // real-time collaboration, and the multiplayer quiz in it
  | 'advanced-analytics'// period switching, subject breakdown, badges
  | 'unlimited-kits'    // saving more than the free allowance
  | '3d-arena';        // the boss fight rendered in 3D rather than 2D

/** What Pro unlocks, in the order it is advertised. */
export const PRO_FEATURES: Feature[] = [
  'ai-tutor', 'study-rooms', 'advanced-analytics', 'unlimited-kits', '3d-arena',
];

/**
 * How many study kits a free account keeps.
 *
 * Not zero, and not one: a free account has to be genuinely usable or nobody
 * ever gets far enough to want Pro. Twenty is roughly a term of one subject.
 */
export const FREE_SAVED_KITS = 20;

export function planOf(isPro: boolean | undefined): Plan {
  return isPro ? 'pro' : 'free';
}

/** The only question anything should be asking. */
export function can(plan: Plan, feature: Feature): boolean {
  if (plan === 'pro') return true;
  return !PRO_FEATURES.includes(feature);
}

/** Can this account save another kit? */
export function canSaveKit(plan: Plan, savedCount: number): boolean {
  return plan === 'pro' || savedCount < FREE_SAVED_KITS;
}

/**
 * What to tell someone who has hit a gate.
 *
 * Kept here rather than written at each call site, so the same feature does not
 * get three different explanations in three different screens.
 */
export function upsellFor(feature: Feature): { title: string; body: string } {
  switch (feature) {
    case 'ai-tutor':
      return {
        title: 'The AI Tutor is part of Pro',
        body: 'Ask follow-up questions and get a topic explained properly, as many times as you need.',
      };
    case 'study-rooms':
      return {
        title: 'Study Rooms are part of Pro',
        body: 'Revise with friends in real time — shared notes, a shared quiz, live chat and the Arcade.',
      };
    case 'advanced-analytics':
      return {
        title: 'Detailed progress is part of Pro',
        body: 'See your subject breakdown, switch between weekly, monthly and all-time, and collect badges.',
      };
    case '3d-arena':
      return {
        title: 'The 3D arena is part of Pro',
        body: 'Fight the boss in a real 3D arena. Free keeps the 2D fight, which plays exactly the same.',
      };
    case 'unlimited-kits':
      return {
        title: `Free accounts keep ${FREE_SAVED_KITS} study kits`,
        body: 'Pro keeps every kit you ever make, so nothing you have revised from disappears.',
      };
  }
}

/**
 * The Pro list, worded truthfully.
 *
 * "Unlimited AI Study Kit Generation" was on the payment page, and it was not
 * true: Pro carries a 50,000-token daily cap (PRO_DAILY_LIMIT), which exists so
 * one account cannot run up an unbounded provider bill. A cap that exists has to
 * be described, especially to somebody about to enter their card details.
 */
export const PRO_SELLING_POINTS: { headline: string; detail: string }[] = [
  {
    headline: 'Around 4× more AI every day',
    detail: 'A much larger daily allowance — roughly 35 study kits a day against 8 on Free.',
  },
  {
    headline: 'Full AI Tutor access',
    detail: 'Deep explanations and follow-up questions on anything you generate.',
  },
  {
    headline: 'Keep every study kit',
    detail: `Free accounts keep your ${FREE_SAVED_KITS} most recent. Pro keeps all of them.`,
  },
  {
    headline: 'Real-time study rooms',
    detail: 'Shared notes, live chat and a quiz built from them, with your friends.',
  },
  {
    headline: 'Multiplayer quizzes and the Arcade',
    detail: 'Race each other through the same questions and post scores to the room.',
  },
  {
    headline: 'Detailed progress tracking',
    detail: 'Subject breakdown, weekly / monthly / all-time views, and badges.',
  },
  {
    headline: 'The boss fight in 3D',
    detail: 'A real 3D arena instead of the 2D one. Same fight, considerably more of a spectacle.',
  },
];
