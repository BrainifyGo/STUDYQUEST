/*
  WHAT ONE GENERATION ACTUALLY COSTS — measured, not guessed.

  `/api/generate` charges `estimateTokens(systemPrompt + prompt) + estimateTokens(output)`,
  and `estimateTokens` is `chars / 4`. For a real study kit:

      system prompt   424 chars   ~106 tokens   (measured in App.tsx)
      pasted notes  ~2000 chars   ~500 tokens   (about one page)
      AI output     ~3000 chars   ~750 tokens   (Key Concepts + Summary + Facts + Tips)
                                  ------------
                                  ~1350 tokens for ONE generation

  THE OLD FREE_DAILY_LIMIT WAS 2000. That is 1.4 generations per day.

  This was not theoretical. Production on 2026-08-15 held three users, and two of the
  three free accounts were already over the cap — at 2,614 and 2,040 tokens — with their
  MONTHLY totals identical to their daily ones. Both hit the wall on their first day and
  stopped. Two thirds of the userbase was locked out by a constant.

  The numbers below are sized from that measurement rather than picked: free gets roughly
  8 generations a day and 85 a month, Pro roughly 35 a day. If these need to change, change
  them here — the arithmetic above is the reason they are what they are.
*/
/*
  ROUND NUMBERS, AND NO HIDDEN SECOND WALL.

  The previous set had two problems.

  1. THE MONTHLY CAP WAS THE REAL LIMIT, AND NOBODY COULD SEE IT.
     Free was 12,000 a day and 120,000 a month — exactly ten full days. Somebody
     revising properly hit the monthly wall on the 10th and was locked out for
     the remaining three weeks, having been told all along about a DAILY limit
     that reset tomorrow. It did reset. It just did not help.

     The monthly allowance is now twenty full days for both plans. Nobody
     studies at full tilt every single day, so the daily limit is the one people
     meet — which is the one the interface talks about.

  2. THE NUMBERS WERE NOT ROUND, so nothing derived from them was either.
     "10,968 tokens left today" is not information a fifteen-year-old can act on.

  Sized from the measurement above: one study kit is about 1,250 tokens.
*/

/** What one study kit costs, near enough to reason with. */
export const TOKENS_PER_KIT = 1250;

export const FREE_DAILY_LIMIT = 10000;      // 8 study kits a day
export const PRO_DAILY_LIMIT = 50000;       // 40 study kits a day

// Twenty full days of the daily allowance. See the note above: this exists as a
// backstop against a runaway account, not as the limit people are meant to feel.
export const FREE_MONTHLY_LIMIT = 200000;   // 160 study kits a month
export const PRO_MONTHLY_LIMIT = 1000000;   // 800 study kits a month

/**
 * How many study kits an allowance is worth.
 *
 * The interface should talk in kits, never in tokens. "8 study kits left today"
 * is something a student can plan around; "10,968 tokens" is a number from our
 * billing system that happens to be on their screen.
 */
export function kitsFrom(tokens: number): number {
  return Math.max(0, Math.floor(tokens / TOKENS_PER_KIT));
}

/** Study kits left today, for the header and the usage bar. */
export function kitsLeftToday(usedToday: number, isPro: boolean): number {
  return kitsFrom(getDailyLimit(isPro) - (usedToday || 0));
}

/** The whole daily allowance, in kits. */
export function kitsPerDay(isPro: boolean): number {
  return kitsFrom(getDailyLimit(isPro));
}

export const TOKEN_LIMIT_EXCEEDED = 'TOKEN_LIMIT_EXCEEDED';

// The MONTHLY budget is a separate code because the advice differs. The UI told
// everyone "your daily limit resets tomorrow", which for someone who had run out
// of monthly allowance was simply untrue — they would come back tomorrow, find it
// still blocked, and conclude the app was broken.
export const TOKEN_MONTHLY_LIMIT_EXCEEDED = 'TOKEN_MONTHLY_LIMIT_EXCEEDED';

/** When the block lifts, and what to do about it. Shared so every screen agrees. */
export function limitAdvice(code: string, isPro: boolean): { title: string; description: string } {
  if (code === TOKEN_MONTHLY_LIMIT_EXCEEDED) {
    return {
      title: "You've used this month's allowance.",
      description: isPro
        ? 'It resets on the 1st of next month.'
        : 'It resets on the 1st. Pro has five times the monthly allowance.',
    };
  }
  return {
    title: "You've used today's study kits.",
    description: isPro
      ? `Your ${kitsPerDay(true)} kits come back tomorrow.`
      : `Your ${kitsPerDay(false)} kits come back tomorrow. Pro gives you ${kitsPerDay(true)} a day.`,
  };
}

// Flat cost per Expand chat message (not estimated like generation — a known,
// predictable cost so the client can pre-check budget before sending).
export const EXPAND_MESSAGE_COST_FREE = 500;
export const EXPAND_MESSAGE_COST_PRO = 200;

export function getExpandMessageCost(isPro: boolean): number {
  return isPro ? EXPAND_MESSAGE_COST_PRO : EXPAND_MESSAGE_COST_FREE;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function getMonthlyLimit(isPro: boolean): number {
  return isPro ? PRO_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;
}

export function getDailyLimit(isPro: boolean): number {
  return isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
}

// YYYY-MM, used to detect month rollover
export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

// YYYY-MM-DD, used to detect day rollover
export function currentDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
