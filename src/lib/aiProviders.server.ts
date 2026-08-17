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

  // Logged in full for us; the user-facing half stays short.
  console.error('All providers failed:\n  ' + failures.join('\n  '));
  const err: any = new Error('All AI services are currently busy. Please try again.');
  err.providerFailures = failures;
  throw err;
};

const callGemini = async (prompt: string, model: string): Promise<string> => {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({ model, contents: prompt });
  return response.text ?? '';
};

const callGroq = async (prompt: string, model: string, maxTokens: number): Promise<string> => {
  const Groq = (await import('groq-sdk')).default;
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const response = await groq.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    /*
      REASONING SHARES THE TOKEN BUDGET, and that is a trap.

      These are reasoning models: they think first, and those thoughts are
      charged against `max_tokens` before a single character of answer is
      produced. Measured on gpt-oss-120b with a trivial prompt: at max_tokens 30
      the model spent all thirty thinking and returned **empty content** with
      finish_reason "length". No error, no warning — just nothing.

      A study kit is a long reply (twenty flashcards, or ten questions with
      explanations), so the old 2048 was close enough to the edge to truncate
      the JSON mid-object and fail the parse.

      "low" is right for this app rather than a compromise: the prompts in
      studyPrompts.ts already state the format precisely, so there is nothing to
      deliberate about. Measured on a real quiz prompt, it cut reasoning from
      296 characters to 26 and produced MORE usable output as a result.
    */
    reasoning_effort: 'low',
  } as any);
  return response.choices[0].message.content ?? '';
};

const callOpenRouter = async (prompt: string, model: string): Promise<string> => {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://brainifyai.app',
      'X-Title': 'StudyQuest',
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content ?? '';
};

/**
 * The models, in one place so `npm run check:ai` can test exactly what runs.
 *
 * Every one of these was verified against the live API before being written
 * here. `gemini-flash-latest` is an alias and is first in both chains for that
 * reason — see the note above.
 *
 * OpenRouter is no longer in either chain. Its free tier now refuses the model
 * we used ("unavailable for free — the paid version is available now"), and
 * every model still marked free returned a provider error when tested. A
 * fallback that is always dead is worse than none: it adds a slow failure to
 * every request before the real error surfaces.
 */
export const MODELS = {
  geminiFlash: 'gemini-flash-latest',
  groqLarge: 'openai/gpt-oss-120b',
  groqSmall: 'openai/gpt-oss-20b',
} as const;

export const generateFree = (prompt: string): Promise<ProviderResult> =>
  runFallbackChain([
    { name: 'Gemini Flash', fn: () => callGemini(prompt, MODELS.geminiFlash) },
    { name: 'Groq GPT-OSS 120B', fn: () => callGroq(prompt, MODELS.groqLarge, 4096) },
    { name: 'Groq GPT-OSS 20B', fn: () => callGroq(prompt, MODELS.groqSmall, 4096) },
  ]);

export const generatePro = (prompt: string): Promise<ProviderResult> =>
  runFallbackChain([
    { name: 'Gemini Flash', fn: () => callGemini(prompt, MODELS.geminiFlash) },
    { name: 'Groq GPT-OSS 120B', fn: () => callGroq(prompt, MODELS.groqLarge, 8192) },
    { name: 'Groq GPT-OSS 20B', fn: () => callGroq(prompt, MODELS.groqSmall, 8192) },
  ]);

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
