import express from "express";
import { createServer as createViteServer } from "vite";
import path, { dirname } from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { createServer } from "http";
import crypto from "crypto";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { generateWithAI, analyzeImage } from "./src/lib/aiProviders.server";
import { getMonthlyLimit, getDailyLimit, estimateTokens, getExpandMessageCost, TOKEN_LIMIT_EXCEEDED, TOKEN_MONTHLY_LIMIT_EXCEEDED, currentMonthKey, currentDayKey } from "./src/lib/tokenService";
import { can, planOf, type Feature } from "./src/lib/entitlements";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/*
  Check the credentials BEFORE handing them to Firebase.

  Copying .env.example to .env and running `npm run dev` used to die on
  "Failed to parse private key: Invalid PEM formatted message" and a stack trace
  through firebase-admin internals — which tells you nothing about the actual
  problem, namely that the file still contains the example's placeholders.
  A setup step that fails should say what to do about it.
*/
const REQUIRED_SERVER_ENV = [
  'VITE_FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
] as const;

function checkServerEnv(): void {
  const missing = REQUIRED_SERVER_ENV.filter((k) => !process.env[k]?.trim());

  // The placeholder in .env.example is a real PEM header wrapped around "...",
  // so it looks plausible and passes an emptiness check. Catch it by name.
  const key = process.env.FIREBASE_PRIVATE_KEY ?? '';
  const stillTemplate = key.includes('\\n...\\n') || key.includes('\n...\n');

  if (!missing.length && !stillTemplate) return;

  console.error('\n  StudyQuest cannot start: the server credentials are not set up.\n');
  if (missing.length) {
    console.error('  Missing from .env:');
    missing.forEach((k) => console.error('    - ' + k));
  }
  if (stillTemplate) {
    console.error('  FIREBASE_PRIVATE_KEY is still the placeholder from .env.example.');
  }
  console.error(
    '\n  Copying .env.example gives you the KEYS, not the VALUES. Fill them in:\n' +
    '    - Firebase console -> Project settings -> Service accounts -> Generate new private key\n' +
    '      That JSON holds client_email and private_key.\n' +
    '    - The VITE_FIREBASE_* values are on the same page, under "Your apps".\n' +
    '\n  Keep the whole private key on one line, quoted, with the \\n escapes intact.\n'
  );
  process.exit(1);
}

checkServerEnv();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  // Hosts tell the app which port to listen on via PORT, and route traffic to it.
  // Hard-coding 3000 means the host's router finds nothing listening where it
  // expects — the app boots fine and the site still fails to load.
  const PORT = Number(process.env.PORT) || 3000;
  const distPath = path.join(process.cwd(), "dist");

  app.use(express.json());

  // --- Lemon Squeezy Integration ---
  const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY;
  const LEMONSQUEEZY_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID;
  const LEMONSQUEEZY_VARIANT_ID = process.env.LEMONSQUEEZY_VARIANT_ID;
  const LEMONSQUEEZY_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  // Startup check for Lemon Squeezy keys
  console.log('Lemon Squeezy keys present:', {
    api: !!LEMONSQUEEZY_API_KEY,
    variant: !!LEMONSQUEEZY_VARIANT_ID,
    store: !!LEMONSQUEEZY_STORE_ID,
    webhook: !!LEMONSQUEEZY_WEBHOOK_SECRET
  });

  // GET /api/lemonsqueezy/checkout - Creates checkout URL
  app.get("/api/lemonsqueezy/checkout", async (req, res) => {
    try {
      const { email, uid } = req.query;

      if (!email || !uid) {
        return res.status(400).json({ error: "Missing email or uid" });
      }

      const response = await fetch(`https://api.lemonsqueezy.com/v1/checkouts`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`
        },
        body: JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: {
              checkout_data: {
                custom: {
                  user_id: uid as string
                }
              }
            },
            relationships: {
              store: {
                data: {
                  type: 'stores',
                  id: LEMONSQUEEZY_STORE_ID
                }
              },
              variant: {
                data: {
                  type: 'variants',
                  id: LEMONSQUEEZY_VARIANT_ID
                }
              }
            }
          }
        })
      });

      const data = await response.json();
      
      if (data.errors) {
        console.error('Lemon Squeezy Error:', data.errors);
        return res.status(500).json({ error: 'Failed to create checkout' });
      }

      const checkoutUrl = data.data.attributes.url;
      res.json({ url: checkoutUrl });
    } catch (error: any) {
      console.error('Lemon Squeezy Checkout Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/lemonsqueezy/webhook - Handles webhook events
  app.post("/api/lemonsqueezy/webhook", async (req, res) => {
    try {
      const signature = req.headers['x-signature'] as string;
      const payload = JSON.stringify(req.body);

      if (!signature) {
        return res.status(400).json({ error: "Missing signature" });
      }

      // Verify signature
      const hmac = crypto.createHmac('sha256', LEMONSQUEEZY_WEBHOOK_SECRET);
      const digest = hmac.update(payload).digest('hex');

      if (signature !== digest) {
        console.error('Invalid webhook signature');
        return res.status(400).json({ error: "Invalid signature" });
      }

      const eventName = req.body.meta.event_name;
      const customData = req.body.meta.custom_data;
      const userId = customData?.user_id;

      if (!userId) {
        console.error('Missing user_id in webhook');
        return res.status(400).json({ error: "Missing user_id" });
      }

      const db = admin.firestore();

      if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
        const status = req.body.data.attributes.status;
        const isPro = status === 'active';

        /*
          NEVER REVOKE PRO THAT CAME FROM A KEY.

          This used to write `isPro` unconditionally. An account that redeemed a
          key and later took out (then cancelled) a subscription would be set
          back to free by this line — and because a key can only be spent once,
          it could never recover. Founder and comp accounts would silently lose
          their access to an unrelated billing event.

          A key is a permanent grant. A subscription is a rental. Only the
          rental is revocable here.
        */
        const userRef = db.collection('users').doc(userId);
        const snap = await userRef.get();
        const fromKey = snap.data()?.proSource === 'key';

        if (!isPro && fromKey) {
          console.log(`Subscription lapsed for ${userId}, but Pro came from a key — leaving it alone.`);
        } else {
          await userRef.update({
            isPro,
            // Only stamp the source when granting; clearing it on a downgrade
            // would throw away the very fact this check depends on.
            ...(isPro ? { proSource: 'subscription' } : {}),
          });
          console.log(`Updated user ${userId} isPro to ${isPro}`);
        }
      }

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Webhook Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Socket.io Logic ---
  const rooms = new Map<string, Set<{ id: string, name: string, uid?: string }>>();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    /*
      JOINING A ROOM NOW REQUIRES PROOF OF WHO YOU ARE.

      This used to take a `userName` string and nothing else. Two consequences,
      and the second is the serious one:

        1. Study Rooms are sold as a Pro feature and every free account had them.
        2. ANY six-character code let ANYONE into a room. No token, no account,
           no check at all. Room codes are short and guessable, and the people in
           these rooms are schoolchildren. That is a safeguarding hole, not a
           billing one, and it is why this is enforced here and not in the UI.

      The client sends the Firebase ID token it already holds; it is verified
      against the project, and the plan is read from Firestore — never from
      anything the client claimed about itself.
    */
    socket.on("join-room", async ({ roomId, userName, idToken }) => {
      if (typeof roomId !== 'string' || !roomId.trim()) {
        socket.emit("join-denied", { reason: 'BAD_ROOM' });
        return;
      }

      let uid: string;
      try {
        if (!idToken) throw new Error('no token');
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
      } catch {
        socket.emit("join-denied", { reason: 'SIGN_IN_REQUIRED' });
        return;
      }

      let isPro = false;
      try {
        const snap = await admin.firestore().collection('users').doc(uid).get();
        isPro = !!snap.data()?.isPro;
      } catch (err) {
        // Fail CLOSED. A Firestore blip must not hand out the paid feature, and
        // it must certainly not hand out access to a room full of children.
        console.error('join-room: could not read plan', err);
        socket.emit("join-denied", { reason: 'TRY_AGAIN' });
        return;
      }

      if (!can(planOf(isPro), 'study-rooms')) {
        socket.emit("join-denied", { reason: 'PRO_REQUIRED' });
        return;
      }

      socket.join(roomId);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      // The name is still cosmetic, but it is attached to a verified uid now, so
      // someone in a room can be identified rather than merely labelled.
      const user = { id: socket.id, name: String(userName || 'Student').slice(0, 40), uid };
      rooms.get(roomId)?.add(user);

      socket.to(roomId).emit("user-joined", user);
      io.to(roomId).emit("room-users", Array.from(rooms.get(roomId) || []));

      console.log(`${user.name} (${uid}) joined room: ${roomId}`);
    });

    socket.on("send-message", ({ roomId, message }) => {
      socket.to(roomId).emit("receive-message", message);
    });

    // Typing indicator, ported from GhostChat. Relayed rather than stored: a
    // "typing" that outlives the socket is worse than none, and the client
    // times its own out anyway.
    socket.on("typing", ({ roomId, userName, typing }) => {
      socket.to(roomId).emit("typing", { userName, typing: !!typing });
    });

    // A quiz built inside a room, shared with everyone in it. Relayed rather
    // than stored: the room is ephemeral and so is the quiz.
    socket.on("room-quiz", ({ roomId, quiz }) => {
      socket.to(roomId).emit("room-quiz", quiz);
    });

    socket.on("notes-update", ({ roomId, notes }) => {
      socket.to(roomId).emit("notes-update", notes);
    });

    socket.on("disconnecting", () => {
      for (const roomId of socket.rooms) {
        if (rooms.has(roomId)) {
          const roomUsers = rooms.get(roomId);
          if (roomUsers) {
            for (const user of roomUsers) {
              if (user.id === socket.id) {
                roomUsers.delete(user);
                socket.to(roomId).emit("user-left", socket.id);
                break;
              }
            }
            if (roomUsers.size === 0) {
              rooms.delete(roomId);
            } else {
              io.to(roomId).emit("room-users", Array.from(roomUsers));
            }
          }
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // --- AI generation (server-side — provider keys never reach the browser) ---
  // Registered before the Vite middleware below, same as the Lemon Squeezy
  // routes above — Vite's SPA-mode middleware intercepts unmatched requests
  // before they'd reach any route registered after it.

  class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  // READ A USER'S TOKEN BUDGET, ROLLING IT OVER ON THE SERVER'S CLOCK.
  //
  // The month/day rollover used to run in the browser: AuthWrapper's snapshot listener compared
  // the stored reset date against `new Date()` and wrote `tokensUsedToday: 0` itself. That made
  // the budget self-service — the client decided both when the day had ended and what the usage
  // was reset to, so `updateDoc(userRef, { tokensUsedToday: 0 })` bought unlimited AI. These are
  // the fields that cost real money, so they can only be written by the Admin SDK, here.
  async function readBudget(userRef: admin.firestore.DocumentReference) {
    const userData = (await userRef.get()).data();
    const isPro = !!userData?.isPro;

    const nowMonth = currentMonthKey();
    const nowDay = currentDayKey();
    const rollover: Record<string, unknown> = {};

    let usedMonth = userData?.tokensUsedThisMonth || 0;
    let usedToday = userData?.tokensUsedToday || 0;

    if (userData?.tokenResetDate !== nowMonth) {
      usedMonth = 0;
      rollover.tokensUsedThisMonth = 0;
      rollover.tokenResetDate = nowMonth;
    }
    if (userData?.tokenDailyResetDate !== nowDay) {
      usedToday = 0;
      rollover.tokensUsedToday = 0;
      rollover.tokenDailyResetDate = nowDay;
    }
    if (Object.keys(rollover).length > 0) {
      await userRef.update(rollover).catch((err) => console.warn('Token rollover failed:', err));
    }

    return { isPro, usedMonth, usedToday };
  }

  // No Authorization header = guest. Guests are exempt from the token budget
  // (they're already capped by their own single-generation session limit
  // enforced client-side via localStorage).
  async function verifyUserAndBudget(
    authHeader: string | undefined
  ): Promise<{ uid: string | null; isPro: boolean }> {
    if (!authHeader?.startsWith('Bearer ')) {
      return { uid: null, isPro: false };
    }

    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch (err) {
      throw new HttpError(401, 'Invalid or expired session. Please sign in again.');
    }

    const { isPro, usedMonth, usedToday } = await readBudget(
      admin.firestore().collection('users').doc(uid)
    );

    // Reported separately: "resets tomorrow" is false when it is the monthly
    // allowance that ran out, and sends the user away to find it still blocked.
    if (usedMonth >= getMonthlyLimit(isPro)) {
      throw new HttpError(429, TOKEN_MONTHLY_LIMIT_EXCEEDED);
    }
    if (usedToday >= getDailyLimit(isPro)) {
      throw new HttpError(429, TOKEN_LIMIT_EXCEEDED);
    }

    return { uid, isPro };
  }

  async function recordTokenUsage(uid: string | null, tokensUsed: number) {
    if (!uid) return;
    try {
      await admin.firestore().collection('users').doc(uid).update({
        tokensUsedThisMonth: admin.firestore.FieldValue.increment(tokensUsed),
        tokensUsedToday: admin.firestore.FieldValue.increment(tokensUsed),
      });
    } catch (err) {
      console.warn('Failed to record token usage:', err);
    }
  }

  app.post('/api/generate', async (req, res) => {
    const { prompt, systemPrompt, feature } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    try {
      const { uid, isPro } = await verifyUserAndBudget(req.headers.authorization);

      /*
        THE PAID GATE, ON THE SERVER.

        The AI Tutor is advertised as a Pro feature, and a check in the browser
        is a suggestion — anyone can post to this route with curl. It is enforced
        here, against the verified token, because this is the call that spends
        money with the provider.

        Only named features are gated; a request with no `feature` is ordinary
        study-kit generation, which Free gets within its token budget.
      */
      if (feature && !can(planOf(isPro), feature as Feature)) {
        return res.status(402).json({ error: 'PRO_REQUIRED', feature });
      }

      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      const { text, model } = await generateWithAI(fullPrompt, isPro ? 'pro' : 'free');

      await recordTokenUsage(uid, estimateTokens(fullPrompt) + estimateTokens(text));

      res.json({ result: text, model });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Generate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/analyze-image', async (req, res) => {
    const { imageBase64, mimeType, prompt } = req.body;
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Missing image data' });
    }

    try {
      const { uid, isPro } = await verifyUserAndBudget(req.headers.authorization);

      /*
        TRANSCRIBE, DO NOT SUMMARISE.

        This used to ask for "a comprehensive and structured summary of
        everything you can see" (and, on the free tier, just "summarise the main
        points"). The result was then fed into the study-kit generator as the
        source material — so a photo of a page of notes became a summary, and the
        kit was a summary OF a summary. Details the student photographed
        specifically because they mattered were gone before the kit was written,
        which is exactly the "it doesn't read properly" report.

        The summarising belongs in the kit step, which already does it properly
        and knows which mode you asked for. This step's only job is to get the
        page into text faithfully.
      */
      const analysisPrompt = prompt || `Transcribe this photo of study material into text.

RULES:
- Copy the text EXACTLY as written. Do not summarise, shorten, correct or explain it.
- Keep the structure: headings stay headings, lists stay lists, and the order on the page is the order you write.
- Write equations and formulae in plain readable notation, for example x^2 for x squared and (a+b)/c for a fraction.
- Where a diagram, graph or table carries information, describe it in enough detail to work from${isPro ? ', including axis labels, units and any values you can read' : ''}. Do not describe decoration.
- If part of the page is genuinely unreadable, write [unclear] there rather than guessing at it.
- Output only the transcription. No preamble, no commentary, no "here is the text".`;

      const text = await analyzeImage(imageBase64, mimeType, analysisPrompt);

      if (!text || text.length < 20) {
        return res.status(422).json({ error: 'Could not extract content from this image. Try better lighting or a clearer photo of text.' });
      }

      await recordTokenUsage(uid, estimateTokens(analysisPrompt) + estimateTokens(text));

      res.json({ result: text });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Analyze image error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Expand ("Go Deeper") chat — contextual follow-up conversation anchored to
  // a generated study kit. Sign-in required (no guest access), flat per-message
  // token cost pre-checked against the same monthly/daily budget as generation.
  app.post('/api/expand-chat', async (req, res) => {
    const { studyKitContext, messages } = req.body;
    if (!studyKitContext || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing study kit context or messages' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Sign in to use Go Deeper.' });
    }

    try {
      let uid: string;
      try {
        const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
        uid = decoded.uid;
      } catch (err) {
        throw new HttpError(401, 'Invalid or expired session. Please sign in again.');
      }

      const userRef = admin.firestore().collection('users').doc(uid);
      const { isPro, usedMonth, usedToday } = await readBudget(userRef);
      const cost = getExpandMessageCost(isPro);

      if (usedMonth + cost > getMonthlyLimit(isPro)) {
        throw new HttpError(429, TOKEN_MONTHLY_LIMIT_EXCEEDED);
      }
      if (usedToday + cost > getDailyLimit(isPro)) {
        throw new HttpError(429, TOKEN_LIMIT_EXCEEDED);
      }

      const conversation = messages
        .map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Student' : 'AI'}: ${m.content}`)
        .join('\n\n');

      const fullPrompt = `You are Brainify AI's study companion. The student just generated the study material below and wants to go deeper on it — answer their questions clearly and concisely, referencing the material when relevant.

STUDY KIT CONTEXT:
${studyKitContext}

CONVERSATION SO FAR:
${conversation}

Respond as the AI to the student's latest message above.`;

      const { text, model } = await generateWithAI(fullPrompt, isPro ? 'pro' : 'free');

      await userRef.update({
        tokensUsedThisMonth: admin.firestore.FieldValue.increment(cost),
        tokensUsedToday: admin.firestore.FieldValue.increment(cost),
      }).catch((err) => console.warn('Failed to record Expand token usage:', err));

      res.json({ result: text, model });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Expand chat error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
  }

  // ── robots.txt and sitemap.xml ──────────────────────────────────────────────
  // Generated rather than kept in public/, because both need the site's ABSOLUTE URL and
  // nothing in this repo knows what that is — there is no hosting config, and hardcoding a
  // guess would point crawlers at the wrong domain. The request does know, so it is derived
  // from the Host header at serve time and is correct on localhost, on a preview URL and in
  // production without anyone remembering to change a constant.
  function siteOrigin(req: express.Request): string {
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    return `${proto.split(",")[0]}://${req.get("host")}`;
  }

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(
      `# Brainify AI\n\n` +
      `User-agent: *\n` +
      `Allow: /\n\n` +
      `# Not real pages — these return JSON. Letting a crawler spend its budget here costs\n` +
      `# indexing of the pages that matter.\n` +
      `Disallow: /api/\n\n` +
      `Sitemap: ${siteOrigin(req)}/sitemap.xml\n`
    );
  });

  app.get("/sitemap.xml", (req, res) => {
    // The app is a single state-driven page with no client-side router, so `/` is genuinely
    // the only URL a crawler can reach. Listing invented paths would fill the sitemap with
    // soft 404s and is a good way to lose trust with a crawler.
    const origin = siteOrigin(req);
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url>\n` +
      `    <loc>${origin}/</loc>\n` +
      `    <changefreq>weekly</changefreq>\n` +
      `    <priority>1.0</priority>\n` +
      `  </url>\n` +
      `</urlset>\n`
    );
  });

  // ── the catch-all ───────────────────────────────────────────────────────────
  // This used to return index.html with **HTTP 200 for every unknown path**. A typo, a stale
  // link or a crawler probing /wp-admin all got the full app and a success status — a "soft
  // 404". Search engines treat those as duplicate content and it makes real broken links
  // invisible in analytics, because nothing is ever recorded as an error.
  //
  // The app has no client-side router: `/` is the only real page. Anything else is genuinely
  // not found and now says so with a 404 status, while still serving a friendly page.
  const APP_PATHS = new Set(["/", "/index.html"]);

  app.get("*", (req, res) => {
    if (APP_PATHS.has(req.path)) {
      return res.sendFile(path.join(distPath, "index.html"));
    }
    const notFound = path.join(distPath, "404.html");
    if (fs.existsSync(notFound)) {
      return res.status(404).sendFile(notFound);
    }
    // In dev there is no dist/, so fall back to the app itself — but keep the honest status.
    res.status(404).sendFile(path.join(distPath, "index.html"), (err) => {
      if (err) res.status(404).type("text/plain").send("404 — page not found");
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
