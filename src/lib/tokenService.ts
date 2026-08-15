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
export const FREE_MONTHLY_LIMIT = 120000;   // ~85 generations
export const PRO_MONTHLY_LIMIT = 500000;    // ~370 generations
export const FREE_DAILY_LIMIT = 12000;      // ~8 generations
export const PRO_DAILY_LIMIT = 50000;       // ~35 generations

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
      title: "You've used this month's AI allowance.",
      description: isPro
        ? 'It resets on the 1st of next month.'
        : 'It resets on the 1st. Pro has roughly four times the monthly allowance.',
    };
  }
  return {
    title: "You've hit today's AI limit.",
    description: isPro
      ? 'It resets tomorrow.'
      : 'It resets tomorrow. Pro gives you around four times as much per day.',
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
