// Server-only. Never import this from client-bundled code (anything under
// src/components, src/views, src/App.tsx, src/store) — it reads real secret
// API keys via process.env. Only server.ts should import this file.

interface ProviderResult {
  text: string;
  model: string;
}

/*
  MODEL IDS ARE NOT FOREVER.

  Every model in both chains had been retired by the provider, and generation
  stopped completely. Checked against the live APIs on 2026-08-17:

    gemini-2.0-flash          404 — "no longer available"
    gemini-1.5-flash          404 — "not found for API version v1beta"
    llama-3.3-70b-versatile   gone from Groq's model list
    mixtral-8x7b-32768        gone
    llama3-8b-8192            gone
    llama-3.1-8b-instruct:free  "unavailable for free" — paid slug only

  Nothing in the app had changed. The providers moved underneath us, and the
  only signal was "All AI services are currently busy", which is what you say
  when everything is rate limited — not when every model id you hold is dead.
  That message cost a day of looking in the wrong place.

  Two things follow, and both are implemented below:

   1. PREFER ROLLING ALIASES. `gemini-flash-latest` tracks whatever the current
      flash model is, so it cannot retire out from under us the way a pinned
      version does. Where a provider offers no alias, the id is pinned and this
      file will need revisiting — `npm run check:ai` exists to make that a
      one-command check rather than a user report.

   2. SAY WHAT ACTUALLY FAILED. The error now names each provider and its
      reason, so a dead model id reads as a dead model id.
*/
const runFallbackChain = async (
  chain: Array<{ name: string; fn: () => Promise<string> }>
): Promise<ProviderResult> => {
  const failures: string[] = [];

  for (const api of chain) {
    try {
      console.log(`🤖 Trying ${api.name}...`);
      const result = await api.fn();
      // A provider that returns 200 and an empty string has still failed; taking
      // it would hand the user a blank study kit and call it a success.
      if (!result || !result.trim()) throw new Error('returned an empty response');
      console.log(`✅ ${api.name} succeeded`);
      return { text: result, model: api.name };
    } catch (error: any) {
      const why = error?.message || String(error);
      console.warn(`⚠️ ${api.name} failed: ${why}`);
      failures.push(`${api.name}: ${why}`);
      continue;
    }
  }

  /*
    "BUSY" IS A DIAGNOSIS, AND IT WAS THE WRONG ONE.

    Every failure here reported "All AI services are currently busy", which reads
    as rate limiting and tells you to wait. On 2026-08-20 that message was shown
    for a completely different cause: the provider keys had been rotated and the
    new ones were never added to Render, so every call failed instantly with an
    auth error. The site said "busy, try again", and waiting could never fix it.
    It failed in 1.1s -- far too fast to have been busy, if anyone had been able
    to see that number.

    A key that is missing, revoked or malformed is not a busy service. Saying so
    turns an afternoon of guessing into one glance.
  */
  const isAuth = (f: string) =>
    /(^|\W)(401|403)(\W|$)|invalid|unauthor|api[ _-]?key|credential|permission denied/i.test(f);
  const isRate = (f: string) =>
    /(^|\W)429(\W|$)|quota|rate.?limit|exceeded|too many requests/i.test(f);

  console.error('All providers failed:\n  ' + failures.join('\n  '));

  let message: string;
  let kind: 'unconfigured' | 'auth' | 'ratelimit' | 'mixed';
  if (!failures.length) {
    // Nothing was even attempted, so no provider had a key set.
    kind = 'unconfigured';
    message = 'No AI provider is configured on the server.';
  } else if (failures.every(isAuth)) {
    kind = 'auth';
    message =
      'The server’s AI keys are being rejected — they are missing, expired or ' +
      'mistyped. Waiting will not fix this one.';
  } else if (failures.every(isRate)) {
    kind = 'ratelimit';
    message = 'Every AI service has hit its limit for now. Please try again shortly.';
  } else {
    kind = 'mixed';
    message = 'All AI services are currently busy. Please try again.';
  }

  const err: any = new Error(message);
  err.providerFailures = failures;
  // Lets a route tell "the configuration is broken" apart from "come back later"
  // without re-parsing the message text.
  err.kind = kind;
  throw err;
};

const callGemini = async (prompt: string, model: string): Promise<string> => {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({ model, contents: prompt });
  return response.text ?? '';
};

/*
  THE PROVIDER REGISTRY.

  Nearly every inference company speaks the OpenAI chat-completions shape, so
  one function talks to all of them and a provider is a row in a list rather
  than a new code path. Adding one is: sign up, put the key in the environment,
  add four lines here. Nothing else changes, and `npm run check:ai` tests it.

  EACH PROVIDER IS ITS OWN FREE TIER. That is the legitimate way to get more
  free capacity, and it is strictly better than the alternative of holding
  several accounts with one company:

    - Terms. Google, Groq and the rest all prohibit extra accounts created to
      get around rate limits. They link accounts by phone number, payment
      method and device fingerprint, so it is also not difficult for them to
      spot.
    - Risk. The realistic outcome of being caught is every linked account
      closed — including the one the live app runs on. That is the whole app
      down, for a bit more free quota.
    - It does not even work well. One company's limits are usually per project
      OR per payment identity, so a second account often shares the first's
      ceiling anyway.

  Six companies' free tiers, each under its own terms, is more capacity than
  six accounts at one company would have given, and none of it can be taken
  away for cheating.

  A provider with no key set is skipped silently. That is deliberate: the app
  has to run for anyone who has cloned it with one key, and a missing optional
  key is not an error.
*/
export interface Provider {
  id: string;
  name: string;
  /** OpenAI-compatible base, without a trailing slash. */
  baseUrl: string;
  /** Environment variable holding the key. Absent = provider skipped. */
  keyEnv: string;
  /** Bigger model for Pro, smaller for Free. Same string is fine. */
  large: string;
  small: string;
  /** Some hosts want extra headers (OpenRouter attributes traffic this way). */
  headers?: Record<string, string>;
  /**
   * True for models that think before answering (Groq's gpt-oss, for example).
   *
   * REASONING SHARES THE TOKEN BUDGET, and that is a trap. Those thoughts are
   * charged against `max_tokens` before a single character of answer appears.
   * Measured on gpt-oss-120b with a trivial prompt: at max_tokens 30 the model
   * spent all thirty thinking and returned EMPTY content with finish_reason
   * "length" — no error, no warning, just nothing.
   *
   * Setting this sends `reasoning_effort: 'low'`, which is right for this app
   * rather than a compromise: the prompts in studyPrompts.ts state the format
   * precisely, so there is nothing to deliberate about. Measured on a real quiz
   * prompt it cut reasoning from 296 characters to 26 and produced MORE usable
   * output. It is only sent to providers marked here, because an unrecognised
   * field is a 400 on some hosts.
   */
  reasoning?: boolean;
  /** Where to sign up, so this file answers "how do I add capacity". */
  signup: string;
}

/**
 * The providers, IN CHAIN ORDER.
 *
 * The order is the fallback order, and it is chosen from measured allowances
 * rather than from which company is best known:
 *
 *   1. Groq       — generous free tier, fast. 8,000 tokens/minute.
 *   2. Mistral    — free tier, verified working 2026-08-18.
 *   3. Cerebras   — free tier, very fast (add a key and it joins here).
 *   4. Together   — key present but the account has no credit; fails fast.
 *   5. OpenRouter — PREPAID CREDIT, so it costs real money. Last on purpose:
 *                   it should only ever answer when every free tier has failed.
 *
 * Gemini is appended after all of these in buildChain — see the note there. Its
 * free tier is twenty requests a DAY, which cannot lead a chain.
 */
export const PROVIDERS: Provider[] = [
  {
    id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    large: 'openai/gpt-oss-120b', small: 'openai/gpt-oss-20b',
    reasoning: true,
    signup: 'https://console.groq.com/keys',
  },
  {
    id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1',
    keyEnv: 'MISTRAL_API_KEY',
    large: 'mistral-large-latest', small: 'mistral-small-latest',
    signup: 'https://console.mistral.ai/api-keys/',
  },
  {
    id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1',
    keyEnv: 'CEREBRAS_API_KEY',
    large: 'llama-3.3-70b', small: 'llama3.1-8b',
    signup: 'https://cloud.cerebras.ai/',
  },
  {
    id: 'together', name: 'Together', baseUrl: 'https://api.together.xyz/v1',
    keyEnv: 'TOGETHER_API_KEY',
    // Tested 2026-08-18: "Credit limit exceeded". The key is valid, the account
    // simply has no credit — it will start working the moment any is added, and
    // it fails fast until then, which is why it sits last.
    large: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    small: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    signup: 'https://api.together.ai/settings/api-keys',
  },
  {
    id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    /*
      PAID MODELS, NOT THE FREE ONES.

      Every `:free` id tested has refused — OpenRouter has been steadily moving
      them behind payment. But an OpenRouter key carries prepaid credit, and at
      roughly $0.0005 a study kit even $5 is several thousand of them, which is
      far more useful than a free tier that will not serve a request.

      Verified working on 2026-08-18. If this ever starts failing with a billing
      error, the credit has run out — that is a top-up, not a bug.
    */
    large: 'meta-llama/llama-3.3-70b-instruct',
    small: 'mistralai/mistral-small-24b-instruct-2501',
    headers: { 'HTTP-Referer': 'https://studyquest-ruuq.onrender.com', 'X-Title': 'StudyQuest' },
    signup: 'https://openrouter.ai/keys',
  },
];

/** The providers that actually have a key set right now. */
export const activeProviders = (): Provider[] =>
  PROVIDERS.filter((p) => !!process.env[p.keyEnv]?.trim());

/** One call, any OpenAI-compatible host. */
export const callOpenAICompatible = async (
  provider: Provider,
  prompt: string,
  model: string,
  maxTokens: number
): Promise<string> => {
  const key = process.env[provider.keyEnv];
  if (!key) throw new Error(`${provider.keyEnv} is not set`);

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
  };
  // Only sent where it is understood; an unknown field is a 400 on some hosts.
  if (provider.reasoning) body.reasoning_effort = 'low';

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(provider.headers ?? {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : data.error.message);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return data?.choices?.[0]?.message?.content ?? '';
};

/**
 * The models Gemini uses, kept separate because Gemini is not OpenAI-shaped
 * through its own SDK and because vision goes through it.
 *
 * `gemini-flash-latest` is an alias: it tracks whatever the current flash model
 * is, so it cannot retire out from under us the way `gemini-2.0-flash` did.
 */
export const MODELS = {
  geminiFlash: 'gemini-flash-latest',
} as const;

/**
 * Build the chain: Gemini first, then every provider that has a key.
 *
 * Order is deliberate. Gemini leads because it is the highest quality of the
 * free tiers for this job; the rest follow in registry order so the fastest and
 * most generous come next. Every one of them is a separate company's free
 * allowance, so a chain of six is six independent daily quotas.
 */
const buildChain = (prompt: string, plan: 'free' | 'pro') => {
  const maxTokens = plan === 'pro' ? 8192 : 4096;

  const chain: Array<{ name: string; fn: () => Promise<string> }> = [];

  // The registry order IS the chain order — see the note on PROVIDERS. Free and
  // generous first, paid last.
  for (const provider of activeProviders()) {
    const model = plan === 'pro' ? provider.large : provider.small;
    chain.push({
      name: `${provider.name} ${model}`,
      fn: () => callOpenAICompatible(provider, prompt, model, maxTokens),
    });
  }

  /*
    GEMINI IS NOT FIRST ANY MORE, and the reason is a measured number.

    Its free tier is **20 requests per day, per model** — the whole allowance,
    not per user. Measured on 2026-08-18, when a morning of testing exhausted it
    and the API said so in as many words:

      "Quota exceeded ... limit: 20, model: gemini-3.7-flash"

    Twenty requests does not survive a single classroom. Leading with it meant
    almost every real request paid for a failed call before reaching a provider
    that could actually answer. It sits near the end now — still useful, because
    twenty free requests is twenty more than none, just not as the front door.
  */
  chain.push({ name: 'Gemini Flash', fn: () => callGemini(prompt, MODELS.geminiFlash) });

  return chain;
};

export const generateFree = (prompt: string): Promise<ProviderResult> =>
  runFallbackChain(buildChain(prompt, 'free'));

export const generatePro = (prompt: string): Promise<ProviderResult> =>
  runFallbackChain(buildChain(prompt, 'pro'));

export const generateWithAI = (prompt: string, plan: 'free' | 'pro'): Promise<ProviderResult> =>
  plan === 'pro' ? generatePro(prompt) : generateFree(prompt);

// Vision (image) analysis — used by the /api/analyze-image route for Snap Input.
export const analyzeImage = async (
  base64: string,
  mimeType: string,
  prompt: string
): Promise<string> => {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    // Was gemini-1.5-flash, which 404s — so Snap/image input had been dead for
    // exactly as long as generation, from the same cause.
    model: MODELS.geminiFlash,
    contents: [{
      parts: [
        { inlineData: { mimeType: mimeType as any, data: base64 } },
        { text: prompt },
      ],
    }],
  });
  return response.text ?? '';
};
