// Server-only. Never import this from client-bundled code (anything under
// src/components, src/views, src/App.tsx, src/store) — it reads real secret
// API keys via process.env. Only server.ts should import this file.

interface ProviderResult {
  text: string;
  model: string;
}

const runFallbackChain = async (
  chain: Array<{ name: string; fn: () => Promise<string> }>
): Promise<ProviderResult> => {
  for (const api of chain) {
    try {
      console.log(`🤖 Trying ${api.name}...`);
      const result = await api.fn();
      console.log(`✅ ${api.name} succeeded`);
      return { text: result ?? '', model: api.name };
    } catch (error: any) {
      console.warn(`⚠️ ${api.name} failed: ${error.message}`);
      continue;
    }
  }
  throw new Error('All AI services are currently busy. Please try again.');
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
  });
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

export const generateFree = (prompt: string): Promise<ProviderResult> =>
  runFallbackChain([
    { name: 'Gemini Flash', fn: () => callGemini(prompt, 'gemini-2.0-flash') },
    { name: 'Groq Llama 70B', fn: () => callGroq(prompt, 'llama-3.3-70b-versatile', 2048) },
    { name: 'OpenRouter Free', fn: () => callOpenRouter(prompt, 'meta-llama/llama-3.1-8b-instruct:free') },
  ]);

export const generatePro = (prompt: string): Promise<ProviderResult> =>
  runFallbackChain([
    { name: 'Groq Llama 70B', fn: () => callGroq(prompt, 'llama-3.3-70b-versatile', 4096) },
    { name: 'Gemini 1.5 Flash', fn: () => callGemini(prompt, 'gemini-1.5-flash') },
    { name: 'Groq Mixtral', fn: () => callGroq(prompt, 'mixtral-8x7b-32768', 4096) },
    { name: 'Groq Llama 8B', fn: () => callGroq(prompt, 'llama3-8b-8192', 4096) },
    { name: 'OpenRouter Free', fn: () => callOpenRouter(prompt, 'meta-llama/llama-3.1-8b-instruct:free') },
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
    model: 'gemini-1.5-flash',
    contents: [{
      parts: [
        { inlineData: { mimeType: mimeType as any, data: base64 } },
        { text: prompt },
      ],
    }],
  });
  return response.text ?? '';
};
