# AI providers — how to add free capacity

StudyQuest's whole product is AI generation, so the number of providers behind it *is* the
reliability of the app. This is how to add more.

Run **`npm run check:ai`** at any time. It tests every model the app actually uses, and lists the
providers you have not set up yet.

---

## The short version

**More providers, not more accounts.**

Signing up for several Google accounts to multiply the Gemini free tier does not work and is not
worth trying:

- **It breaks their terms.** Google, Groq, Mistral and the rest all prohibit additional accounts
  created to get around rate limits.
- **They can see it.** Accounts are linked by phone number, payment method and device. This is not
  hard for them to detect.
- **The downside is the whole app.** The realistic outcome of being caught is *every linked account
  closed*, including the one the live site runs on — StudyQuest goes down, and the account that was
  fine is gone with the rest.
- **It often does not even help.** Limits are frequently per payment identity rather than per
  account, so the second account shares the first's ceiling anyway.

Six companies' free tiers, each under its own terms, gives more capacity than six accounts at one
company would have — and none of it can be taken away for cheating.

---

## Adding a provider

1. Sign up and copy the key (links below).
2. Put it in `.env` locally, and in **Render → Environment**.
3. Redeploy.

That is all. A provider with a key set joins the fallback chain on its own; one with no key is
skipped silently. No code change.

| Provider | Environment variable | Sign up |
|---|---|---|
| **Google Gemini** | `GEMINI_API_KEY` | <https://aistudio.google.com/apikey> |
| **Groq** | `GROQ_API_KEY` | <https://console.groq.com/keys> |
| **Cerebras** | `CEREBRAS_API_KEY` | <https://cloud.cerebras.ai/> |
| **Mistral** | `MISTRAL_API_KEY` | <https://console.mistral.ai/api-keys/> |
| **GitHub Models** | `GITHUB_MODELS_TOKEN` | <https://github.com/settings/tokens> — fine-grained, **Models: read** |
| **Together** | `TOGETHER_API_KEY` | <https://api.together.ai/settings/api-keys> |
| **OpenRouter** | `OPENROUTER_API_KEY` | <https://openrouter.ai/keys> |

Free-tier sizes change often enough that quoting them here would be wrong within a month. Check each
provider's own pricing page.

**A note on OpenRouter.** Its free model ids rotate constantly, and every one tested on 2026-08-17
either refused free use or returned a provider error. It sits last in the chain for that reason — its
failures are expected, not a fault.

---

## Adding one that is not on the list

Almost every inference company speaks the OpenAI chat-completions shape, so adding one is a row in
`PROVIDERS` in `src/lib/aiProviders.server.ts`:

```ts
{
  id: 'example', name: 'Example',
  baseUrl: 'https://api.example.com/v1',   // no trailing slash
  keyEnv: 'EXAMPLE_API_KEY',
  large: 'their-big-model',                 // used for Pro
  small: 'their-small-model',               // used for Free
  reasoning: false,                         // true if it thinks before answering — see below
  signup: 'https://example.com/keys',
}
```

Add the same row to `scripts/checkProviders.cjs` so `npm run check:ai` covers it.

---

## Two traps worth knowing

**1. Pinned model ids die.** On 2026-08-17 every model in both chains had been retired by its
provider, and generation stopped completely — with nothing in the app having changed. Prefer a
rolling alias where one exists (`gemini-flash-latest` rather than `gemini-2.0-flash`). Where none
exists, `npm run check:ai` is how you find out before a user does.

**2. Reasoning models charge their thinking against `max_tokens`.** Groq's `gpt-oss` models think
first, and those thoughts are billed against the budget *before any answer appears*. Measured: at
`max_tokens: 30` the model spent all thirty thinking and returned **empty content** with
`finish_reason: "length"` — no error at all. Mark such providers `reasoning: true`, which sends
`reasoning_effort: 'low'`; on a real quiz prompt that cut reasoning from 296 characters to 26 **and
produced more usable output**.

---

## When you outgrow the free tiers

Worth knowing before you spend a lot of effort chasing free capacity: paid inference for this kind of
work is very cheap. A study kit is on the order of a couple of thousand output tokens, and flash-class
models are priced per *million*. Pro at £5/month covers an enormous number of generations.

So the honest framing is: the free tiers exist to serve **free users**, which is a customer-acquisition
cost. If free usage ever gets expensive enough to matter, that is a signal the app is working, and the
answer is a small paid allowance on top — not a search for more free accounts.
