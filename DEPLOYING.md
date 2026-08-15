# Deploying StudyQuest

## Read this first: StudyQuest is not a static site

`server.ts` isn't just a dev convenience. In production it serves the API as well as the page:

- `/api/generate` and `/api/expand` — the AI calls
- the AI provider keys, which **must** stay server-side
- the token budget, which is only enforceable on a server
- Firebase Admin, which verifies sign-in tokens

So it needs a host that **runs Node**. On a static-only host (GitHub Pages, plain Firebase
Hosting, Netlify or Vercel in static mode) the page will load and then every AI feature will
fail with a 404, because there is no server to answer.

Hosts that work: **Render**, **Railway**, **Fly.io**, **Vercel** (as a Node app, not static),
**Northflank**, or any VPS.

## What the host needs to know

| Setting | Value |
|---|---|
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Node version | 20 or newer |
| Port | Leave it to the host — the server reads `PORT` |

## Environment variables

Add every one of these in the host's dashboard. There is no `.env` file on a server — the host
supplies them.

**Client — read at BUILD time, so changing one means rebuilding, not restarting:**

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_SITE_URL          (your live URL, no trailing slash)
```

**Server — read at run time:**

```
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
GEMINI_API_KEY
GROQ_API_KEY            (optional)
OPENROUTER_API_KEY      (optional)
LEMONSQUEEZY_API_KEY
LEMONSQUEEZY_STORE_ID
LEMONSQUEEZY_VARIANT_ID
LEMONSQUEEZY_WEBHOOK_SECRET
```

Copy the values from your local `.env`. They are the same ones.

### The private key is the one that goes wrong

`FIREBASE_PRIVATE_KEY` is a multi-line value. Paste it **exactly** as it appears in `.env`:
one line, wrapped in double quotes, with the `\n` sequences left as the two characters `\` and
`n` — not real line breaks. `server.ts` converts them back.

If you get `Failed to parse private key: Invalid PEM formatted message`, that value is the
problem — either it is still the placeholder from `.env.example`, or the `\n`s were turned into
real newlines by the paste.

## Why the site was a white page

The `VITE_FIREBASE_*` values are compiled **into the JavaScript bundle** when `npm run build`
runs. Build without them and every value is `undefined`; Firebase throws on the first sign-in
call, React never mounts, and the browser shows a blank white rectangle with the real reason
only in the console.

The app now checks for them before rendering and shows a page listing whichever are missing.
If you see that page, the fix is: **set the variables, then trigger a new build.** Restarting
alone will not help, because the values are already baked into the bundle that was shipped.

## Deploying on Render (the shortest path)

1. **New → Web Service**, connect `BrainifyGo/STUDYQUEST`.
2. Build command `npm install && npm run build`, start command `npm start`.
3. Add every environment variable from the lists above.
4. Deploy, then set `VITE_SITE_URL` to the URL Render gives you and **redeploy**, so the
   canonical link and social share tags point at the right place.

## After the first deploy

- **Firebase console → Authentication → Settings → Authorised domains**: add your live domain,
  or sign-in fails with `auth/unauthorized-domain`.
- **Lemon Squeezy → webhook URL**: point it at `https://your-domain/api/lemonsqueezy/webhook`,
  or purchases will not mark anyone as Pro.
- Check `/robots.txt` and `/sitemap.xml` load — they are generated from the request host, so
  they should show your live domain automatically.
