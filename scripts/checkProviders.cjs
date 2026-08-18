/**
 * Are the AI providers actually alive?
 *
 *   npm run check:ai
 *
 * WHY THIS EXISTS. On 2026-08-17 study kit generation stopped working entirely,
 * and the only symptom was "All AI services are currently busy" — the message
 * you show for rate limiting. The real cause was that every model id in both
 * fallback chains had been retired by its provider. Nothing in the app had
 * changed; the ground moved.
 *
 * There was no way to find that out except hand-testing six APIs with curl.
 * This is that, as one command, so the next retirement is something we check
 * for rather than something a user reports.
 *
 * It tests every provider that has a key set, and lists the ones that do not —
 * each of those is a separate company's free tier going unused. It calls the
 * real APIs, so it costs a handful of tokens.
 */
require('dotenv').config();

const PROMPT = 'Reply with exactly: OK';

// Kept in step with src/lib/aiProviders.server.ts. Duplicated deliberately:
// this script must run without compiling the TypeScript app.
const GEMINI_MODEL = 'gemini-flash-latest';

const PROVIDERS = [
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY', model: 'openai/gpt-oss-20b', reasoning: true,
    signup: 'https://console.groq.com/keys' },
  { name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1',
    keyEnv: 'CEREBRAS_API_KEY', model: 'llama3.1-8b',
    signup: 'https://cloud.cerebras.ai/' },
  { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1',
    keyEnv: 'MISTRAL_API_KEY', model: 'mistral-small-latest',
    signup: 'https://console.mistral.ai/api-keys/' },
  // GitHub Models is being retired by GitHub — see aiProviders.server.ts.
  { name: 'Together', baseUrl: 'https://api.together.xyz/v1',
    keyEnv: 'TOGETHER_API_KEY', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    signup: 'https://api.together.ai/settings/api-keys' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY', model: 'mistralai/mistral-small-24b-instruct-2501',
    signup: 'https://openrouter.ai/keys' },
];

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, why: 'GEMINI_API_KEY is not set' };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }] }) }
  );
  const d = await r.json().catch(() => ({}));
  if (d.error) return { ok: false, why: `${d.error.code} ${d.error.message}`.slice(0, 100) };
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? { ok: true, why: text.trim().slice(0, 30) } : { ok: false, why: 'empty response' };
}

async function checkProvider(p) {
  const key = process.env[p.keyEnv];
  if (!key) return { missing: true };

  const body = { model: p.model, messages: [{ role: 'user', content: PROMPT }], max_tokens: 512 };
  // Reasoning is charged against max_tokens BEFORE any answer appears, so a
  // small budget reports a healthy model as dead. This script found that out
  // about its own first version, which asked for 30.
  if (p.reasoning) body.reasoning_effort = 'low';

  const r = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (d.error) {
    const m = typeof d.error === 'string' ? d.error : d.error.message;
    return { ok: false, why: String(m).slice(0, 100) };
  }
  if (!r.ok) return { ok: false, why: `HTTP ${r.status}` };
  const text = d.choices?.[0]?.message?.content;
  return text?.trim() ? { ok: true, why: text.trim().slice(0, 30) } : { ok: false, why: 'empty response' };
}

(async () => {
  console.log('\n  Testing the models the app actually uses:\n');

  let alive = 0, dead = 0;
  const missing = [];

  const g = await checkGemini().catch((e) => ({ ok: false, why: e.message }));
  if (g.ok) alive++; else dead++;
  console.log(`  ${g.ok ? 'OK  ' : 'DEAD'}  ${('Gemini ' + GEMINI_MODEL).padEnd(46)} ${g.why}`);

  for (const p of PROVIDERS) {
    let res;
    try {
      res = await checkProvider(p);
    } catch (err) {
      res = { ok: false, why: err.message };
    }
    if (res.missing) { missing.push(p); continue; }
    if (res.ok) alive++; else dead++;
    console.log(`  ${res.ok ? 'OK  ' : 'DEAD'}  ${(p.name + ' ' + p.model).padEnd(46)} ${res.why}`);
  }

  console.log('');

  if (missing.length) {
    console.log('  Not set up — each is a separate company\'s free tier going unused:\n');
    for (const p of missing) {
      console.log(`    ${p.name.padEnd(14)} ${p.keyEnv.padEnd(20)} ${p.signup}`);
    }
    console.log('\n  Add the key to .env locally and to Render\'s environment, then redeploy.');
    console.log('  Nothing else changes — a provider with a key set joins the chain by itself.\n');
  }

  if (alive === 0) {
    console.log('  NOTHING IS WORKING. Generation is down for every user.');
    console.log('  Most likely the model ids have been retired again. To list live ones:\n');
    console.log('    Gemini: curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"');
    console.log('    Groq:   curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"\n');
    console.log('  Then update PROVIDERS in src/lib/aiProviders.server.ts and here.\n');
    process.exit(1);
  }

  console.log(`  ${alive} alive, ${dead} dead, ${missing.length} not set up.\n`);
  process.exit(0);
})();
