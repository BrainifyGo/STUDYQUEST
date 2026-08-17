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
 * There was no way to find that out except by hand-testing six APIs with curl.
 * This is that, as one command, so the next retirement is a thing we check
 * rather than a thing a user reports.
 *
 * It calls the real APIs with the real keys, so it costs a handful of tokens.
 */
require('dotenv').config();

const GEMINI = process.env.GEMINI_API_KEY;
const GROQ = process.env.GROQ_API_KEY;

const PROMPT = 'Reply with exactly: OK';

/** Kept in step with src/lib/aiProviders.server.ts by hand — see the report at the end. */
const MODELS = {
  geminiFlash: 'gemini-flash-latest',
  groqLarge: 'openai/gpt-oss-120b',
  groqSmall: 'openai/gpt-oss-20b',
};

async function checkGemini(model) {
  if (!GEMINI) return { ok: false, why: 'GEMINI_API_KEY is not set' };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }] }) }
  );
  const d = await r.json();
  if (d.error) return { ok: false, why: `${d.error.code} ${d.error.message}`.slice(0, 120) };
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? { ok: true, why: text.trim().slice(0, 40) } : { ok: false, why: 'empty response' };
}

async function checkGroq(model) {
  if (!GROQ) return { ok: false, why: 'GROQ_API_KEY is not set' };
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ}`, 'Content-Type': 'application/json' },
    // Reasoning is charged against max_tokens BEFORE any answer appears, so a
    // small budget here reports a perfectly healthy model as dead. This script
    // found that out about its own first version.
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: PROMPT }],
      max_tokens: 512,
      reasoning_effort: 'low',
    }),
  });
  const d = await r.json();
  if (d.error) return { ok: false, why: String(d.error.message).slice(0, 120) };
  const text = d.choices?.[0]?.message?.content;
  return text?.trim() ? { ok: true, why: text.trim().slice(0, 40) } : { ok: false, why: 'empty response' };
}

(async () => {
  const checks = [
    ['Gemini  ' + MODELS.geminiFlash, () => checkGemini(MODELS.geminiFlash)],
    ['Groq    ' + MODELS.groqLarge, () => checkGroq(MODELS.groqLarge)],
    ['Groq    ' + MODELS.groqSmall, () => checkGroq(MODELS.groqSmall)],
  ];

  console.log('\n  Testing the models the app actually uses:\n');
  let alive = 0;

  for (const [label, fn] of checks) {
    let res;
    try {
      res = await fn();
    } catch (err) {
      res = { ok: false, why: err.message };
    }
    if (res.ok) alive++;
    console.log(`  ${res.ok ? 'OK  ' : 'DEAD'}  ${label.padEnd(34)} ${res.why}`);
  }

  console.log('');
  if (alive === 0) {
    console.log('  NOTHING IS WORKING. Generation is down for every user.');
    console.log('  Most likely the model ids have been retired again. To find live ones:\n');
    console.log('    Gemini: curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"');
    console.log('    Groq:   curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"\n');
    console.log('  Then update MODELS in src/lib/aiProviders.server.ts and here.\n');
    process.exit(1);
  }
  if (alive < checks.length) {
    console.log(`  ${alive}/${checks.length} alive — generation still works, but the fallback is thinner.\n`);
    process.exit(0);
  }
  console.log(`  All ${alive} alive.\n`);
  process.exit(0);
})();
