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
import { eraseAccount } from "./src/lib/accountData.server";
import { checkUsernameSafety, checkDisplayNameSafety, safetyMessage, usernameShapeProblem } from "./src/lib/usernameSafety";
import { assessCrisis, CRISIS_MESSAGE, SUPPORT_BANNER } from "./src/lib/crisisCheck";
import { sendEmail, resetCodeEmail, emailConfigured } from "./src/lib/email.server";
import { DuelMatch, type MatchPlayer } from "./src/lib/duelMatch";
import { composeReminder, dayKey, hourIn, shouldSend, EXAM_HORIZON_DAYS } from "./src/lib/reminders";

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
  /* ── STUDY REMINDERS ──────────────────────────────────────────────────────
     Settings has had a reminders toggle and the planner has been saving exams
     and tasks since long before this, and nothing ever sent anything. A switch
     that promises something and does nothing is worse than no switch.

     The rules — who gets one, what it says, and never twice in a day — are in
     `reminders.ts` and tested there. This part is the plumbing: when to look,
     who to look at, and writing down what was sent.

     WHO IT LOOKS AT. Not "every user": it starts from today's TASKS and the
     upcoming EXAMS and works back to their owners, so the work scales with how
     many people are actually studying rather than with how many have ever
     signed up. It also means somebody with nothing planned is never considered,
     which is the same thing the compose step would have decided anyway.
  */
  const REMINDER_HOUR = Number(process.env.REMINDER_HOUR ?? 7);
  const REMINDER_TZ = process.env.REMINDER_TZ || 'Europe/London';
  /*
     A CAP, because the failure mode here is expensive and public. Resend's free
     tier is 3,000 emails a month — about 100 a day — and a bug that emails
     everyone twice would spend it before anyone noticed. If this limit is ever
     actually reached it is a signal to move to a paid tier deliberately, not to
     discover it through bounced mail.
  */
  const REMINDER_MAX_PER_RUN = Number(process.env.REMINDER_MAX_PER_RUN ?? 100);

  let reminderRunning = false;

  async function sendDailyReminders(force = false): Promise<{ sent: number; considered: number; skipped: string }> {
    if (reminderRunning) return { sent: 0, considered: 0, skipped: 'already-running' };
    if (!emailConfigured()) return { sent: 0, considered: 0, skipped: 'email-not-configured' };

    const now = new Date();
    if (!force && hourIn(now, REMINDER_TZ) !== REMINDER_HOUR) {
      return { sent: 0, considered: 0, skipped: 'wrong-hour' };
    }

    reminderRunning = true;
    const today = dayKey(now, REMINDER_TZ);
    let sent = 0;
    let considered = 0;

    try {
      const db = admin.firestore();
      const horizon = new Date(now.getTime() + EXAM_HORIZON_DAYS * 86_400_000);
      const horizonDay = dayKey(horizon, REMINDER_TZ);

      // Dates are ISO strings, so a lexicographic range is a date range — and a
      // single-field range needs no composite index.
      const [taskSnap, examSnap] = await Promise.all([
        db.collection('study_tasks')
          .where('date', '>=', today).where('date', '<', `${today}\uf8ff`).get(),
        db.collection('exams')
          .where('date', '>=', today).where('date', '<=', `${horizonDay}\uf8ff`).get(),
      ]);

      const byUser = new Map<string, { tasks: any[]; exams: any[] }>();
      const bucket = (uid: string) => {
        if (!byUser.has(uid)) byUser.set(uid, { tasks: [], exams: [] });
        return byUser.get(uid)!;
      };
      for (const d of taskSnap.docs) {
        const t = d.data();
        if (t?.userId) bucket(t.userId).tasks.push(t);
      }
      for (const d of examSnap.docs) {
        const e = d.data();
        if (e?.userId) bucket(e.userId).exams.push(e);
      }

      for (const [uid, work] of byUser) {
        if (sent >= REMINDER_MAX_PER_RUN) {
          console.warn(`[reminders] hit the per-run cap of ${REMINDER_MAX_PER_RUN}`);
          break;
        }
        considered += 1;

        const userRef = db.collection('users').doc(uid);
        const user = (await userRef.get()).data();
        if (!user) continue;
        if (!shouldSend({
          studyReminders: user.studyReminders,
          email: user.email,
          lastReminderDay: user.lastReminderDay,
        }, today)) continue;

        const reminder = composeReminder({
          displayName: user.displayName || '',
          tasks: work.tasks as any,
          exams: work.exams as any,
          today,
        });
        if (!reminder) continue;

        /*
          WRITTEN BEFORE SENDING, deliberately. If the mark is written after and
          the process dies in between, the next run sends the same email again —
          and the person receiving it cannot tell a bug from nagging. Losing one
          reminder to a crash is a much smaller harm than sending it twice.
        */
        await userRef.set({ lastReminderDay: today }, { merge: true });

        try {
          await sendEmail({ to: user.email, subject: reminder.subject, text: reminder.text });
          sent += 1;
        } catch (err) {
          console.error(`[reminders] send failed for ${uid}:`, (err as Error).message);
        }
      }

      if (sent) console.log(`[reminders] sent ${sent} of ${considered} considered (${today})`);
      return { sent, considered, skipped: '' };
    } catch (err) {
      console.error('[reminders] run failed:', (err as Error).message);
      return { sent, considered, skipped: 'error' };
    } finally {
      reminderRunning = false;
    }
  }

  /*
    Checked every fifteen minutes rather than scheduled for exactly 07:00. A
    single daily timer is one restart away from being missed entirely, and this
    host restarts on every deploy. `lastReminderDay` is what makes polling safe:
    the extra checks find nothing to do.
  */
  if (process.env.NODE_ENV === 'production' || process.env.REMINDERS_IN_DEV === 'true') {
    setInterval(() => { void sendDailyReminders(); }, 15 * 60 * 1000);
    console.log(`[reminders] scheduler on — ${REMINDER_HOUR}:00 ${REMINDER_TZ}, max ${REMINDER_MAX_PER_RUN}/run`);
  }

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

      /*
        KEEP A RECORD OF THE EVENT, NOT JUST ITS EFFECT.

        This handler used to flip `isPro` and throw the rest away, which left two
        gaps. Lemon Squeezy's own order carries no StudyQuest user id, so nothing
        anywhere could say WHICH account a payment belonged to; and revenue
        history existed only inside Lemon Squeezy, so the dashboard had nothing
        to fall back on if that API was slow, rate-limited or changed.

        Written by the Admin SDK, so no client can forge a payment. Stored by
        event id, so a webhook Lemon Squeezy retries lands once rather than
        counting the same money twice.

        NO CARD DETAILS. Nothing here comes near a card number — the fields are
        the amount, the status and which account it was for. That is the whole
        record.
      */
      try {
        const attrs = req.body.data?.attributes ?? {};
        const eventId = String(req.body.data?.id ?? Date.now());
        await db.collection('payments').doc(`${eventName}-${eventId}`).set({
          userId,
          event: eventName,
          status: attrs.status ?? null,
          productName: attrs.product_name ?? null,
          variantName: attrs.variant_name ?? null,
          currency: attrs.currency ?? 'GBP',
          renewsAt: attrs.renews_at ?? null,
          endsAt: attrs.ends_at ?? null,
          occurredAt: attrs.created_at ?? new Date().toISOString(),
          recordedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        // A failed record must never fail the webhook: Lemon Squeezy would retry
        // it, and the part that actually matters — the user's access — is below.
        console.warn('[webhook] could not record the payment event:', err);
      }

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
  /*
    ROOM STATE LIVES HERE, BECAUSE NOTHING ELSE WAS HOLDING IT.

    `notes-update` and `room-quiz` used to be pure relays: whatever you typed was
    forwarded to everyone currently connected, and then forgotten. Two failures
    came straight out of that, and both were reported as "shared notes doesn't
    work":

      1. Join a room that already has notes in it and you see an empty box —
         nothing replays the state you missed.
      2. Then type one character. Your near-empty box is relayed to everybody
         else and OVERWRITES what they had written.

    So the room now holds its own notes and quiz, a joiner is sent the current
    state, and updates mutate that state rather than flying past it.

    Still deliberately in memory: a study room is ephemeral, dies with the last
    member, and persisting it would mean a retention policy for children's
    writing that nobody has agreed to.
  */
  interface RoomMember { id: string; name: string; uid: string }

  interface RoomState {
    users: Map<string, RoomMember>;      // socket.id -> member
    notes: string;
    quiz: unknown[] | null;
    /*
      PRIVATE BY DEFAULT.

      The people in these rooms are schoolchildren, so the safe default is the
      one where a stranger cannot find you. Public is something the owner opts
      into, never something a room becomes by accident.
    */
    visibility: 'public' | 'private';
    title: string;
    ownerUid: string;
    /** uids the owner has barred. Checked on join, so a kick is not just a nudge. */
    blocked: Set<string>;
    createdAt: number;
  }

  const rooms = new Map<string, RoomState>();

  /*
    Live duels, in memory alongside the rooms. A duel is a few minutes long and
    worthless once it is over, so persisting it would be storage nobody reads —
    the same call the study rooms make.
  */
  const duels = new Map<string, DuelMatch>();
  const duelTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const duelRoom = (id: string) => `duel:${id}`;

  /**
   * End every duel this socket was in, and tell the other player.
   *
   * Called both on an explicit leave and on disconnect, because closing the tab
   * is the commonest way to abandon a duel — the same reason the call code
   * handles `disconnecting` as well as a hang-up. Without it the person left
   * behind watches a clock that never moves.
   */
  const leaveDuels = (socketId: string) => {
    for (const [id, match] of duels) {
      if (!match.has(socketId)) continue;
      match.forfeit(socketId);
      clearTimeout(duelTimers.get(id));
      duelTimers.delete(id);
      io.to(duelRoom(id)).emit("duel-over", { forfeitedBy: socketId });
      duels.delete(id);
    }
  };

  const publicMembers = (r: RoomState) => Array.from(r.users.values());

  /*
    REPORTING HAS TO COST THE REPORTED PERSON SOMETHING, OR IT IS A PLACEBO.

    A report button that files a ticket nobody reads is worse than no button: it
    tells a child they have been helped when they have not. So reports are
    counted, and enough of them from DIFFERENT people suspends the account from
    rooms automatically.

    Distinct reporters is the part that matters. Counting raw reports would let
    one person suspend anyone they liked by pressing the button three times.
  */
  const REPORTS_TO_SUSPEND = 3;
  const SUSPENSION_HOURS = 24;

  async function isSuspended(uid: string): Promise<boolean> {
    try {
      const snap = await admin.firestore().collection('users').doc(uid).get();
      const until = snap.data()?.roomsSuspendedUntil;
      return typeof until === 'number' && until > Date.now();
    } catch {
      // Fail OPEN on suspension only: a Firestore blip should not lock a child
      // out of their lesson. The Pro check above still fails closed, because
      // that one guards who gets in at all.
      return false;
    }
  }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    /** The room this socket is actually in, and who they are in it. */
    const whereAmI = (): { roomId: string; room: RoomState; me: RoomMember } | null => {
      for (const [roomId, room] of rooms) {
        const me = room.users.get(socket.id);
        if (me) return { roomId, room, me };
      }
      return null;
    };

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
    socket.on("join-room", async ({ roomId, userName, idToken, visibility, title }) => {
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

      if (await isSuspended(uid)) {
        socket.emit("join-denied", { reason: 'SUSPENDED' });
        return;
      }

      const existing = rooms.get(roomId);
      if (existing?.blocked.has(uid)) {
        socket.emit("join-denied", { reason: 'BLOCKED' });
        return;
      }

      socket.join(roomId);

      // The first person through the door owns the room and chooses whether it
      // is listed. Everyone after that inherits what they set.
      const room: RoomState = existing ?? {
        users: new Map(),
        notes: '',
        quiz: null,
        visibility: visibility === 'public' ? 'public' : 'private',
        title: String(title || 'Study room').slice(0, 60),
        ownerUid: uid,
        blocked: new Set(),
        createdAt: Date.now(),
      };
      if (!existing) rooms.set(roomId, room);

      // The name is still cosmetic, but it is attached to a verified uid now, so
      // someone in a room can be identified rather than merely labelled.
      const user: RoomMember = { id: socket.id, name: String(userName || 'Student').slice(0, 40), uid };
      room.users.set(socket.id, user);

      // The state they missed. Without this a joiner sees an empty notes box and
      // then wipes everyone else's the moment they type.
      socket.emit("room-state", {
        notes: room.notes,
        quiz: room.quiz,
        visibility: room.visibility,
        title: room.title,
        isOwner: room.ownerUid === uid,
      });

      socket.to(roomId).emit("user-joined", user);
      io.to(roomId).emit("room-users", publicMembers(room));

      console.log(`${user.name} (${uid}) joined ${room.visibility} room: ${roomId}`);
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

    // A quiz built inside a room, shared with everyone in it — and kept, so
    // somebody arriving mid-session gets the quiz rather than an empty panel.
    socket.on("room-quiz", ({ roomId, quiz }) => {
      const room = rooms.get(roomId);
      if (!room || !room.users.has(socket.id)) return;
      room.quiz = Array.isArray(quiz) ? quiz : null;
      socket.to(roomId).emit("room-quiz", room.quiz);
    });

    socket.on("notes-update", ({ roomId, notes }) => {
      const room = rooms.get(roomId);
      // Only someone actually in the room may write to it. Without this check a
      // socket could type into any room whose code it could guess.
      if (!room || !room.users.has(socket.id)) return;
      room.notes = String(notes ?? '').slice(0, 20000);
      socket.to(roomId).emit("notes-update", room.notes);
    });

    /*
      The owner can list or unlist the room while it is running — the equivalent
      of closing the door once everybody who was invited has arrived.
    */
    socket.on("room-visibility", ({ visibility }) => {
      const here = whereAmI();
      if (!here || here.room.ownerUid !== here.me.uid) return;
      here.room.visibility = visibility === 'public' ? 'public' : 'private';
      io.to(here.roomId).emit("room-visibility", here.room.visibility);
    });

    /*
      BLOCKING IS THE OWNER'S TOOL; REPORTING IS EVERYONE'S.

      They solve different problems. Blocking is immediate and local: get this
      person out of my room now. Reporting is slower and global: this person
      should not be in anyone's room. A child being harassed needs the first one
      to work in a single tap, without waiting for anybody to review anything.
    */
    socket.on("block-user", ({ targetSocketId }) => {
      const here = whereAmI();
      if (!here || here.room.ownerUid !== here.me.uid) return;

      const target = here.room.users.get(String(targetSocketId));
      if (!target || target.uid === here.me.uid) return;   // never block yourself

      here.room.blocked.add(target.uid);
      here.room.users.delete(target.id);

      io.to(target.id).emit("removed-from-room", { reason: 'BLOCKED' });
      io.sockets.sockets.get(target.id)?.leave(here.roomId);
      io.to(here.roomId).emit("room-users", publicMembers(here.room));
    });

    socket.on("report-user", async ({ targetSocketId, reason }) => {
      const here = whereAmI();
      if (!here) return;

      const target = here.room.users.get(String(targetSocketId));
      if (!target || target.uid === here.me.uid) return;   // reporting yourself is not a thing

      try {
        const db = admin.firestore();
        // One document per reporter/target pair, so pressing the button five
        // times is still one report. THIS is what stops a single child
        // suspending somebody they have fallen out with.
        await db.collection('reports').doc(`${target.uid}__${here.me.uid}`).set({
          targetUid: target.uid,
          reporterUid: here.me.uid,
          roomId: here.roomId,
          reason: String(reason || '').slice(0, 300),
          at: Date.now(),
        });

        const all = await db.collection('reports').where('targetUid', '==', target.uid).get();
        const distinct = new Set(all.docs.map((d) => d.data().reporterUid)).size;

        socket.emit("report-filed", { name: target.name });

        if (distinct >= REPORTS_TO_SUSPEND) {
          const until = Date.now() + SUSPENSION_HOURS * 3600 * 1000;
          await db.collection('users').doc(target.uid).set({ roomsSuspendedUntil: until }, { merge: true });

          here.room.users.delete(target.id);
          io.to(target.id).emit("removed-from-room", { reason: 'SUSPENDED' });
          io.sockets.sockets.get(target.id)?.leave(here.roomId);
          io.to(here.roomId).emit("room-users", publicMembers(here.room));
          console.log(`[moderation] ${target.uid} suspended from rooms until ${new Date(until).toISOString()}`);
        }
      } catch (err) {
        console.error('report-user failed', err);
      }
    });

    /*
      CALL SIGNALLING - RELAY ONLY.

      Ported from GhostChat, whose calls ride Supabase's broadcast channel; here
      they ride the socket that already carries the room. The server's whole job
      is to pass sealed envelopes between two members of the same room: it never
      looks inside an SDP or a candidate, and it cannot - the media itself is
      peer-to-peer and never touches this process.

      The membership check is the security. Without it, anyone who guessed a
      six-character room code could offer a peer connection to a child in it.
    */
    const relayToPeer = (event: string, payload: any) => {
      const here = whereAmI();
      if (!here) return;
      const targetId = String(payload?.to || "");
      // Both ends must be in the room this socket is in. A socket id from
      // somewhere else is simply dropped.
      if (!here.room.users.has(targetId)) return;
      io.to(targetId).emit(event, { ...payload, from: socket.id, name: here.me.name });
    };

    socket.on("call-join", ({ media }) => {
      const here = whereAmI();
      if (!here) return;
      socket.to(here.roomId).emit("call-join", { from: socket.id, name: here.me.name, media });
    });

    socket.on("call-leave", () => {
      const here = whereAmI();
      if (!here) return;
      socket.to(here.roomId).emit("call-leave", { from: socket.id });
    });

    socket.on("call-offer", (p) => relayToPeer("call-offer", p));
    socket.on("call-answer", (p) => relayToPeer("call-answer", p));
    socket.on("call-ice", (p) => relayToPeer("call-ice", p));

    /* ── LIVE DUEL ──────────────────────────────────────────────────────────
       Two people, seven rounds, the same questions at the same time.

       The scoring is NOT re-implemented here. `duel.ts` already resolves a round
       from two committed answers and is deterministic, so both browsers reach an
       identical state from the same inputs — a second copy of the rules on the
       server would be the first thing to drift.

       What the server owns is the two facts a client must not be trusted with:
       whether an answer was right (the correct option is never sent until the
       round closes) and how long it took (measured here, from when the question
       went out). Both are covered by `duelMatch.test.ts`.

       AUTH IS THE SAME GATE AS EVERYTHING ELSE: a duel is created from inside a
       room, so `whereAmI()` has already established a verified, Pro, unsuspended
       member. There is no separate door here to leave unlocked.
    */
    const startRound = (match: DuelMatch) => {
      const prompt = match.nextRound(Date.now());
      if (!prompt) { finishDuel(match); return; }
      io.to(duelRoom(match.id)).emit("duel-round", prompt);

      // The buzzer. Cleared when both answer, so an early finish is not waiting
      // for a timer that has already been overtaken.
      clearTimeout(duelTimers.get(match.id));
      duelTimers.set(match.id, setTimeout(() => {
        if (match.expired(Date.now())) closeRound(match);
      }, (prompt.endsAt - Date.now()) + 1200));
    };

    const closeRound = (match: DuelMatch) => {
      const outcome = match.closeRound();
      if (!outcome) return;
      clearTimeout(duelTimers.get(match.id));
      io.to(duelRoom(match.id)).emit("duel-result", outcome);

      if (match.finished) { setTimeout(() => finishDuel(match), 2200); return; }
      // The pause is the reveal: both players read the explanation before the
      // next question replaces it.
      setTimeout(() => { if (duels.get(match.id) === match) startRound(match); }, 2200);
    };

    const finishDuel = (match: DuelMatch) => {
      clearTimeout(duelTimers.get(match.id));
      duelTimers.delete(match.id);
      io.to(duelRoom(match.id)).emit("duel-over", {
        forfeitedBy: match.forfeitedBy,
      });
      duels.delete(match.id);
    };

    socket.on("duel-create", ({ deck }) => {
      const here = whereAmI();
      if (!here) return socket.emit("duel-error", { reason: "NOT_IN_ROOM" });
      if (!Array.isArray(deck) || !deck.length) {
        return socket.emit("duel-error", { reason: "NO_QUESTIONS" });
      }

      const id = crypto.randomUUID().slice(0, 8);
      const host: MatchPlayer = {
        socketId: socket.id, uid: here.me.uid, name: here.me.name,
      };
      const match = new DuelMatch(id, deck, host);
      duels.set(id, match);
      socket.join(duelRoom(id));

      socket.emit("duel-created", { duelId: id, rounds: match.rounds });
      // Announced to the room rather than to one person: a duel is an open
      // invitation anyone studying with you can take.
      socket.to(here.roomId).emit("duel-offered", {
        duelId: id, from: host.name, rounds: match.rounds,
      });
    });

    socket.on("duel-accept", ({ duelId }) => {
      const here = whereAmI();
      const match = duels.get(String(duelId));
      if (!here || !match) return socket.emit("duel-error", { reason: "GONE" });

      const joined = match.join({
        socketId: socket.id, uid: here.me.uid, name: here.me.name,
      });
      if (!joined) return socket.emit("duel-error", { reason: "FULL" });

      socket.join(duelRoom(match.id));
      io.to(duelRoom(match.id)).emit("duel-start", {
        duelId: match.id,
        rounds: match.rounds,
        players: match.players.map((p) => ({ id: p.socketId, name: p.name })),
      });
      // Nobody is looking at the question yet, so a beat here is the difference
      // between "the duel started" and "the duel started and I missed round 1".
      setTimeout(() => { if (duels.get(match.id) === match) startRound(match); }, 1200);
    });

    socket.on("duel-answer", ({ duelId, round, option }) => {
      const match = duels.get(String(duelId));
      if (!match) return;
      if (!match.answer(socket.id, Number(round), option, Date.now())) return;
      // Tell the other side somebody has locked in, without saying what.
      socket.to(duelRoom(match.id)).emit("duel-opponent-answered", { round: match.round });
      if (match.everyoneAnswered) closeRound(match);
    });

    socket.on("duel-leave", () => leaveDuels(socket.id));

    socket.on("disconnecting", () => {
      // Walking out of a duel ends it for the other person, who would otherwise
      // sit watching a clock that never moves.
      leaveDuels(socket.id);
      for (const roomId of socket.rooms) {
        const room = rooms.get(roomId);
        if (!room) continue;
        if (room.users.delete(socket.id)) {
          socket.to(roomId).emit("user-left", socket.id);
          // Closing the tab is the commonest way to end a call, so the peers
          // need telling here as well as on an explicit hang-up.
          socket.to(roomId).emit("call-leave", { from: socket.id });
        }
        // The room dies with its last member, and its notes die with it.
        if (room.users.size === 0) rooms.delete(roomId);
        else io.to(roomId).emit("room-users", publicMembers(room));
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  /*
    The public room list. Reads the same in-memory map the sockets use, so a
    room appears the moment somebody opens it and vanishes when the last person
    leaves — no separate store to fall out of step.

    Private rooms are never listed. That is the whole difference between the two.
  */
  /*
    TURN CREDENTIALS.

    Calls are peer-to-peer and free wherever the network allows it. Where it does
    not -- symmetric NAT, or a school firewall blocking UDP -- the media has to be
    relayed, and that is what TURN does. StudyQuest is for students, so "works at
    home, fails at school" was not somewhere to leave it.

    THE KEY STAYS ON THE SERVER. `CLOUDFLARE_TURN_API_TOKEN` is a long-term
    secret: anyone holding it can relay traffic on the account and spend the
    bandwidth. So it is exchanged here for credentials that expire, and only
    those reach the browser. Putting the key in the client bundle would be
    handing it to everyone who opens the site.

    UNCONFIGURED IS A SUPPORTED STATE, not an error. With no keys set this
    answers with the same STUN-only list the app has always used, so calls behave
    exactly as before rather than breaking. That is what lets this ship before
    anyone has created a Cloudflare account.

    Cached until shortly before expiry, because every person joining every call
    would otherwise be a round trip to Cloudflare for credentials that are
    identical anyway.
  */
  let turnCache: { iceServers: unknown[]; expires: number; turn: boolean } | null = null;

  app.get('/api/turn-credentials', async (_req, res) => {
    const stunOnly = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (!keyId || !token) {
      return res.json({ iceServers: stunOnly, turn: false, reason: 'not-configured' });
    }

    if (turnCache && Date.now() < turnCache.expires) {
      return res.json({ iceServers: turnCache.iceServers, turn: turnCache.turn });
    }

    // Two hours. Long enough that one set covers any realistic study session,
    // short enough that a leaked set is worth little.
    const ttl = 2 * 60 * 60;
    try {
      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl }),
        },
      );

      if (!r.ok) {
        // Log the status, never the body: an error response can echo the request.
        console.error('[turn] Cloudflare refused the credential request:', r.status);
        return res.json({ iceServers: stunOnly, turn: false, reason: 'upstream-error' });
      }

      const data = await r.json() as { iceServers?: unknown };
      // Cloudflare returns either one object or an array depending on the key.
      const raw = data?.iceServers;
      const servers = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (!servers.length) {
        return res.json({ iceServers: stunOnly, turn: false, reason: 'empty-response' });
      }

      const hasRelay = JSON.stringify(servers).includes('turn:')
        || JSON.stringify(servers).includes('turns:');

      // Refreshed a few minutes early, so nobody is ever handed a set that
      // expires halfway through their call.
      turnCache = {
        iceServers: servers,
        expires: Date.now() + (ttl - 300) * 1000,
        turn: hasRelay,
      };
      return res.json({ iceServers: servers, turn: hasRelay });
    } catch (err) {
      console.error('[turn] credential request failed:', (err as Error).message);
      return res.json({ iceServers: stunOnly, turn: false, reason: 'unreachable' });
    }
  });

  app.get('/api/rooms', async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in first.' });
    try {
      await admin.auth().verifyIdToken(header.slice(7));
    } catch {
      return res.status(401).json({ error: 'Sign in first.' });
    }

    const open = Array.from(rooms.entries())
      .filter(([, r]) => r.visibility === 'public' && r.users.size > 0)
      .map(([id, r]) => ({ id, title: r.title, members: r.users.size, createdAt: r.createdAt }))
      .sort((a, b) => b.members - a.members)
      .slice(0, 50);

    res.json({ rooms: open });
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

  /*
    DELETE MY ACCOUNT — completely, and on the server.

    The browser version could never finish: it has to delete the Firestore data
    while still signed in and the Auth user last, so any failure in between
    strands a half-erased account; it can only remove what the rules let it see;
    and an account deleted from the Firebase console leaves its Firestore
    documents behind entirely. That last one is not hypothetical — it left an
    email address and two display names in the database.

    The Admin SDK has none of those limits. Authorisation is the ID token: you
    may only erase yourself.
  */
  /*
    IDENTITY IS WRITTEN HERE, NOT BY THE BROWSER.

    Usernames and display names are the two strings other children read: in a
    friends list, in a study room, on a challenge scoreboard. Both were filtered
    in `lib/usernameSafety.ts` — and both filters ran ONLY in the browser, while
    the Firestore rules checked nothing but shape (3-20 chars, `^[a-z0-9._]+$`).

    Proved on 2026-08-20 against the deployed rules: a signed-in account POSTed
    straight to the Firestore REST API and claimed a slur as its username. HTTP
    200. The filter had never been a gate — it was a suggestion the sign-up form
    made to people who used the sign-up form.

    So the rules now refuse `usernames` and `public_profiles` writes from clients
    entirely, and this route is the only way in. It runs the same shape check and
    the same safety check the form runs, then writes with admin credentials.

    ATOMICITY IS PRESERVED. The old client flow relied on Firestore `create`
    failing when the document exists, with `update` forbidden, so two people
    racing for one name could not both win. `.create()` on the Admin SDK fails
    the same way, so the race is still decided by the database rather than by
    checking first and hoping.
  */
  /*
    PASSWORD RESET BY CODE.

    Firebase's own reset sends a LINK, and RED wanted a code you paste into the
    app. That is not a setting — a link and a code are different flows — so this
    is built here, and it is built carefully, because a reset endpoint is the
    softest way into somebody's account.

    Five properties matter, and each one is a real attack if missed:

      1. THE RESPONSE NEVER SAYS WHETHER THE ACCOUNT EXISTS. `request-code`
         returns the same 200 either way. Otherwise this becomes a free tool for
         checking which of your classmates has an account.
      2. THE CODE IS STORED HASHED. A Firestore read — a leaked service account,
         a mis-set rule — must not hand over live reset codes for every account
         mid-reset.
      3. IT EXPIRES. Ten minutes.
      4. ATTEMPTS ARE CAPPED. Six digits is a million combinations, which sounds
         plenty until you try them all in a loop. Five wrong guesses burns the
         code.
      5. VERIFYING RETURNS A ONE-USE TICKET, not "you may now set a password".
         Without it, `reset` would have to trust an email address it was handed.

    The document lives at `password_resets/{uid}` and clients can neither read
    nor write it — see firestore.rules. Only this code touches it, with admin
    credentials.
  */
  const RESET_CODE_TTL_MS = 10 * 60 * 1000;
  const RESET_MAX_ATTEMPTS = 5;
  const RESET_COOLDOWN_MS = 60 * 1000;

  const hashCode = (code: string, uid: string) =>
    crypto.createHash('sha256').update(`${uid}:${code}`).digest('hex');

  app.post('/api/password/request-code', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Enter your email address.' });

    // The same answer whichever way it goes. See property 1 above.
    const vague = () => res.json({ ok: true });

    if (!emailConfigured()) {
      console.error('[reset] RESEND_API_KEY is not set — cannot send reset codes.');
      return res.status(503).json({
        error: 'Password reset by code is not switched on yet. Use “Send reset link” instead.',
      });
    }

    let uid: string;
    try {
      uid = (await admin.auth().getUserByEmail(email)).uid;
    } catch {
      return vague();          // no such account — say nothing either way
    }

    const db = admin.firestore();
    const ref = db.collection('password_resets').doc(uid);

    // One code a minute. Stops this being a way to flood somebody's inbox.
    const existing = (await ref.get()).data();
    if (existing?.sentAt && Date.now() - existing.sentAt < RESET_COOLDOWN_MS) {
      return vague();
    }

    // randomInt is uniform; `Math.random() * 900000` is not, and a reset code is
    // exactly the wrong place to be lazy about that.
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

    await ref.set({
      uid,
      codeHash: hashCode(code, uid),
      expiresAt: Date.now() + RESET_CODE_TTL_MS,
      attempts: 0,
      sentAt: Date.now(),
      ticket: null,
    });

    try {
      await sendEmail({ to: email, ...resetCodeEmail(code) });
    } catch (err) {
      console.error('[reset] could not send code:', err);
      return res.status(502).json({ error: 'Could not send the email. Try again in a moment.' });
    }

    return vague();
  });

  app.post('/api/password/verify-code', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').replace(/\D/g, '');
    if (!email || code.length !== 6) {
      return res.status(400).json({ error: 'Enter the 6-digit code from your email.' });
    }

    let uid: string;
    try {
      uid = (await admin.auth().getUserByEmail(email)).uid;
    } catch {
      // Same wording as a wrong code, so this cannot be used to probe for
      // accounts either.
      return res.status(400).json({ error: 'That code is wrong or has expired.' });
    }

    const ref = admin.firestore().collection('password_resets').doc(uid);
    const data = (await ref.get()).data();

    if (!data || Date.now() > (data.expiresAt || 0)) {
      return res.status(400).json({ error: 'That code is wrong or has expired.' });
    }
    if ((data.attempts || 0) >= RESET_MAX_ATTEMPTS) {
      await ref.delete().catch(() => {});
      return res.status(429).json({ error: 'Too many attempts. Ask for a new code.' });
    }

    if (data.codeHash !== hashCode(code, uid)) {
      await ref.update({ attempts: (data.attempts || 0) + 1 });
      return res.status(400).json({ error: 'That code is wrong or has expired.' });
    }

    // Correct. Swap the code for a single-use ticket, so the last step never has
    // to take an email address on trust.
    const ticket = crypto.randomBytes(32).toString('hex');
    await ref.update({ ticket, ticketExpiresAt: Date.now() + RESET_CODE_TTL_MS, codeHash: null });

    return res.json({ ok: true, ticket });
  });

  app.post('/api/password/reset', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ticket = String(req.body?.ticket || '');
    const password = String(req.body?.password || '');

    if (password.length < 6) {
      return res.status(400).json({ error: 'Passwords need at least 6 characters.' });
    }
    if (!ticket) return res.status(400).json({ error: 'Start again — that reset has expired.' });

    let uid: string;
    try {
      uid = (await admin.auth().getUserByEmail(email)).uid;
    } catch {
      return res.status(400).json({ error: 'Start again — that reset has expired.' });
    }

    const ref = admin.firestore().collection('password_resets').doc(uid);
    const data = (await ref.get()).data();

    if (!data?.ticket || data.ticket !== ticket || Date.now() > (data.ticketExpiresAt || 0)) {
      return res.status(400).json({ error: 'Start again — that reset has expired.' });
    }

    await admin.auth().updateUser(uid, { password });
    /*
      Every existing session is killed. Someone resetting a password may be
      doing it BECAUSE another person is in their account, and leaving that
      person signed in would defeat the whole exercise.
    */
    await admin.auth().revokeRefreshTokens(uid);
    await ref.delete().catch(() => {});

    return res.json({ ok: true });
  });

  app.post('/api/identity', async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Sign in first.' });
    }

    let uid: string;
    try {
      uid = (await admin.auth().verifyIdToken(header.slice(7))).uid;
    } catch {
      return res.status(401).json({ error: 'Sign in first.' });
    }

    const db = admin.firestore();
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
    const rawDisplay = typeof req.body?.displayName === 'string' ? req.body.displayName : '';
    const email = typeof req.body?.email === 'string' ? req.body.email : '';

    // The display name is what people actually read, so an unfiltered one beside
    // a filtered username would not be a filter at all.
    let displayName = (rawDisplay || email.split('@')[0] || 'Student').slice(0, 60);
    if (!checkDisplayNameSafety(displayName).ok) displayName = 'Student';

    const profileRef = db.doc(`public_profiles/${uid}`);
    const existing = (await profileRef.get()).data() || {};
    let username: string | undefined = existing.username;

    if (rawUsername) {
      const wanted = rawUsername.trim().toLowerCase();

      const shape = usernameShapeProblem(wanted);
      if (shape) return res.status(400).json({ error: shape });

      const verdict = checkUsernameSafety(wanted);
      if (!verdict.ok) {
        return res.status(400).json({ error: safetyMessage(verdict.reason || 'offensive') });
      }

      if (wanted !== username) {
        try {
          // Fails if it already exists. That failure IS the lock.
          await db.doc(`usernames/${wanted}`).create({ uid });
        } catch {
          const holder = (await db.doc(`usernames/${wanted}`).get()).data() as any;
          if (holder?.uid !== uid) {
            return res.status(409).json({ error: 'That username is taken.' });
          }
        }

        const previous = username;
        username = wanted;

        // Released only after the new one is secured, so a failure here leaves
        // you with a spare name rather than none.
        if (previous && previous !== wanted) {
          await db.doc(`usernames/${previous}`).delete().catch(() => {});
        }
      }
    }

    const payload: Record<string, unknown> = {
      uid,
      displayName,
      displayLower: displayName.toLowerCase(),
      emailLower: email.toLowerCase().slice(0, 256),
    };
    // Never blank an existing username by republishing without one — this runs
    // on every sign-in, and that would silently unclaim the name each time.
    if (username) payload.username = username;

    await profileRef.set(payload);
    return res.json({ ok: true, username, displayName });
  });

  app.post('/api/delete-account', async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Sign in first.' });
    }

    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(header.slice(7));
      uid = decoded.uid;
      /*
        Deleting an account is irreversible, so it needs a RECENT sign-in — the
        same rule Firebase applies to deleting a login. A stolen token that has
        been sitting in someone's pocket for a day must not be able to erase
        somebody's revision.
      */
      const age = Date.now() / 1000 - (decoded.auth_time ?? 0);
      if (age > 10 * 60) {
        return res.status(401).json({ error: 'REAUTH_REQUIRED' });
      }
    } catch {
      return res.status(401).json({ error: 'Your session is not valid. Sign in again.' });
    }

    try {
      const report = await eraseAccount(admin, uid);
      if (report.failures.length) {
        console.error('Account erasure had failures:', report.failures);
        // Some of it went. Say so rather than reporting a clean success.
        return res.status(207).json({ ok: false, ...report });
      }
      console.log(`Erased account ${uid}:`, report.deleted);
      res.json({ ok: true, ...report });
    } catch (error: any) {
      console.error('Account erasure failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /* ── the founders' dashboard ──────────────────────────────────────────────
     Everything RED and Daniel need to see how StudyQuest is doing, aggregated
     ON THE SERVER and behind an admin check.

     Server-side is not a preference here. The Lemon Squeezy API key may never
     reach a browser, and the figures need Firebase Auth's user metadata, which
     only the Admin SDK can read. Doing it in the client would mean either
     shipping the billing key or having no revenue numbers at all.

     Daniel gets in from his own machine because access is a role on his own
     account, granted through /api/admin/team — not a shared password, and not
     something that needs RED's laptop.
  */
  async function requireAdmin(authHeader: string | undefined): Promise<string> {
    if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in first.');
    let uid: string;
    try {
      uid = (await admin.auth().verifyIdToken(authHeader.slice(7))).uid;
    } catch {
      throw new HttpError(401, 'Invalid or expired session.');
    }
    const snap = await admin.firestore().collection('users').doc(uid).get();
    if (snap.data()?.role !== 'admin') {
      // Deliberately the same shape of refusal as a bad token: an ordinary user
      // probing this route learns only that they cannot have it.
      throw new HttpError(403, 'Not available on this account.');
    }
    return uid;
  }

  /*
    Cached, because one page load would otherwise mean a full Auth user listing,
    a dozen Firestore counts and two Lemon Squeezy calls. Refreshing repeatedly
    is exactly what someone does with a dashboard.
  */
  let metricsCache: { at: number; data: unknown } | null = null;
  const METRICS_TTL = 60_000;

  async function lemonSqueezy(path: string): Promise<any[]> {
    if (!LEMONSQUEEZY_API_KEY) return [];
    const out: any[] = [];
    let url: string | null =
      `https://api.lemonsqueezy.com/v1/${path}?filter[store_id]=${LEMONSQUEEZY_STORE_ID}&page[size]=100`;
    // Paginated: a store with more than 100 orders must not silently report 100.
    while (url && out.length < 1000) {
      const r: any = await fetch(url, {
        headers: {
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          Authorization: `Bearer ${LEMONSQUEEZY_API_KEY}`,
        },
      });
      if (!r.ok) break;
      const j: any = await r.json();
      out.push(...(j.data ?? []));
      url = j.links?.next ?? null;
    }
    return out;
  }

  app.get('/api/admin/metrics', async (req, res) => {
    try {
      await requireAdmin(req.headers.authorization);

      if (metricsCache && Date.now() - metricsCache.at < METRICS_TTL) {
        return res.json({ ...(metricsCache.data as object), cached: true });
      }

      const db = admin.firestore();

      /* Users: Firestore for what they do, Auth for when they arrived. Auth
         always records creation and last sign-in; the user documents did not. */
      const [authUsers, userDocs] = await Promise.all([
        admin.auth().listUsers(1000),
        db.collection('users').get(),
      ]);
      const byUid = new Map(userDocs.docs.map((d) => [d.id, d.data()]));
      const users = authUsers.users.map((u) => {
        const doc = byUid.get(u.uid) ?? {};
        return {
          uid: u.uid,
          email: u.email ?? null,
          isPro: !!doc.isPro,
          proSource: doc.proSource ?? null,
          subscriptionType: doc.subscriptionType ?? null,
          createdAt: u.metadata.creationTime
            ? new Date(u.metadata.creationTime).toISOString() : null,
          lastSeenAt: u.metadata.lastSignInTime
            ? new Date(u.metadata.lastSignInTime).toISOString() : null,
          xp: doc.xp ?? 0,
          streak: doc.streak ?? 0,
          studyLevel: doc.studyLevel ?? null,
        };
      });

      const countOf = async (name: string) => {
        try { return (await db.collection(name).count().get()).data().count; }
        catch { return 0; }
      };
      const [
        studyKits, studySessions, paperSessions, mistakesLogged, tasks, exams,
        insights, profiles,
      ] = await Promise.all([
        countOf('study_history'), countOf('study_sessions'), countOf('paper_sessions'),
        countOf('study_mistakes'), countOf('study_tasks'), countOf('exams'),
        countOf('examiner_insights'), countOf('public_profiles'),
      ]);

      let openIssues = 0;
      try {
        openIssues = (await db.collection('issue_reports')
          .where('status', '==', 'open').count().get()).data().count;
      } catch { openIssues = 0; }

      const [orders, subs] = await Promise.all([
        lemonSqueezy('orders'), lemonSqueezy('subscriptions'),
      ]);

      /*
        A subscription does not carry its own price. Lemon Squeezy keeps the
        amount and the billing interval on a separate `prices` object, reached
        through first_subscription_item.price_id — so MRR needs a second lookup
        per distinct price, cached here so ten subscriptions on one plan cost one
        request rather than ten.

        Without this the interval is unknown, and an annual plan counted whole
        would overstate MRR twelvefold. StudyQuest's own plan is annual, so that
        is the live case, not a hypothetical.
      */
      const priceIds = [...new Set(subs
        .map((s: any) => s.attributes?.first_subscription_item?.price_id)
        .filter(Boolean))];
      const prices = new Map<string, { unit: number; unit_interval: string; qty: number }>();
      for (const id of priceIds) {
        try {
          const r: any = await fetch(`https://api.lemonsqueezy.com/v1/prices/${id}`, {
            headers: {
              Accept: 'application/vnd.api+json',
              Authorization: `Bearer ${LEMONSQUEEZY_API_KEY}`,
            },
          });
          if (!r.ok) continue;
          const j: any = await r.json();
          prices.set(String(id), {
            unit: j.data?.attributes?.unit_price ?? 0,
            unit_interval: j.data?.attributes?.renewal_interval_unit ?? 'month',
            qty: j.data?.attributes?.renewal_interval_quantity ?? 1,
          });
        } catch { /* a missing price leaves that subscription out of MRR, not the page */ }
      }

      const data = {
        generatedAt: new Date().toISOString(),
        users,
        orders: orders.map((o: any) => ({
          total: o.attributes.total ?? 0,
          currency: o.attributes.currency ?? 'GBP',
          status: o.attributes.status ?? 'unknown',
          createdAt: o.attributes.created_at ?? '',
          refunded: !!o.attributes.refunded,
        })),
        subscriptions: subs.map((s: any) => {
          const p = prices.get(String(s.attributes?.first_subscription_item?.price_id));
          return {
            status: s.attributes.status ?? 'unknown',
            // Normalised to one billing period; a "every 3 months" plan is
            // divided down so MRR stays monthly.
            amount: p ? Math.round(p.unit / (p.qty || 1)) : null,
            interval: p?.unit_interval ?? null,
            createdAt: s.attributes.created_at ?? '',
            productName: s.attributes.product_name ?? '',
            variantName: s.attributes.variant_name ?? '',
          };
        }),
        usage: {
          studyKits, studySessions, paperSessions, mistakesLogged, tasks, exams,
          insights, openIssues,
          // public_profiles outnumbering users means rows were left behind by
          // account deletions. Worth seeing rather than quietly carrying.
          orphanedProfiles: Math.max(0, profiles - userDocs.size),
        },
        billing: {
          configured: !!LEMONSQUEEZY_API_KEY && !!LEMONSQUEEZY_STORE_ID,
          storeId: LEMONSQUEEZY_STORE_ID ?? null,
        },
      };

      metricsCache = { at: Date.now(), data };
      res.json({ ...data, cached: false });
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[admin/metrics]', err);
      res.status(status).json({ error: err.message ?? 'Could not load metrics.' });
    }
  });

  /* Who can see the dashboard, and adding Daniel to that list. */
  app.get('/api/admin/team', async (req, res) => {
    try {
      await requireAdmin(req.headers.authorization);
      const snap = await admin.firestore().collection('users')
        .where('role', '==', 'admin').get();
      res.json({
        team: snap.docs.map((d) => ({
          uid: d.id, email: d.data().email ?? null,
          displayName: d.data().displayName ?? null,
        })),
      });
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 500;
      res.status(status).json({ error: err.message ?? 'Could not load the team.' });
    }
  });

  app.post('/api/admin/team', async (req, res) => {
    try {
      const actor = await requireAdmin(req.headers.authorization);
      const { email, grant } = req.body ?? {};
      if (typeof email !== 'string' || !email.includes('@')) {
        throw new HttpError(400, 'That is not an email address.');
      }

      const target = await admin.auth().getUserByEmail(email.trim().toLowerCase())
        .catch(() => null);
      if (!target) {
        // The account has to exist first, and only its owner can create it.
        throw new HttpError(404,
          'No StudyQuest account with that email. Ask them to sign up first, then add them.');
      }

      if (!grant && target.uid === actor) {
        throw new HttpError(400, 'You cannot remove your own access.');
      }
      if (!grant) {
        const admins = await admin.firestore().collection('users')
          .where('role', '==', 'admin').get();
        // Never leave the dashboard with nobody able to open it.
        if (admins.size <= 1) throw new HttpError(400, 'That is the last admin.');
      }

      await admin.firestore().collection('users').doc(target.uid)
        .set({ role: grant ? 'admin' : 'client' }, { merge: true });
      res.json({ ok: true, uid: target.uid, email: target.email, role: grant ? 'admin' : 'client' });
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[admin/team]', err);
      res.status(status).json({ error: err.message ?? 'Could not change access.' });
    }
  });

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

      /*
        CRISIS CHECK, BEFORE ANY MODEL IS CALLED.

        A mobile test typed "why do people kill themself and why do they think
        about that" and StudyQuest produced a study kit titled "Suicide", with
        Quick Facts and Exam Tips on "answering questions about suicidal
        thoughts and behaviors", and no helpline anywhere. That is the wrong
        answer to the one message where being wrong matters most.

        HERE, not in the browser, and for the same reason the username filter
        moved: a check in the client is a suggestion, and this is the single
        call that reaches a model.

        Only the USER's prompt is assessed, never `systemPrompt` — the app's own
        instructions are not somebody asking for help, and letting them count
        would fire the check on a template.
      */
      const risk = assessCrisis(prompt);
      if (risk.level === 'crisis') {
        // Logged WITHOUT the text. Knowing it fired is operationally useful;
        // keeping what a distressed teenager typed in a server log is not.
        console.warn(`[crisis] refused generation (${risk.matched})`);
        // 200, not an error: the client renders this as the result. A failure
        // status would show a red "something went wrong", which is the last
        // thing this person should be looking at.
        return res.json({ result: CRISIS_MESSAGE, model: 'safety', crisis: true });
      }

      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      const { text, model } = await generateWithAI(fullPrompt, isPro ? 'pro' : 'free');

      await recordTokenUsage(uid, estimateTokens(fullPrompt) + estimateTokens(text));

      /*
        The topic came up with no sign that it is about them — Durkheim, Health
        and Social Care, a psychology essay. They still get the kit, because
        refusing the syllabus just sends a student somewhere with no safeguards
        at all. Help goes above it, where it is read first.
      */
      const result = risk.level === 'support' ? SUPPORT_BANNER + text : text;

      res.json({ result, model, ...(risk.level === 'support' ? { support: true } : {}) });
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
        The third route that reaches a model, and the weakest of the three for
        this — the risk here is in the PHOTO, which nothing on this server can
        read. What can be checked is the caption typed alongside it, so that is
        what is checked.

        Recorded plainly rather than left implied: a picture of something
        worrying will pass straight through. Closing that needs the vision model
        itself to flag it, which is a different and much larger piece of work.
      */
      const shotRisk = assessCrisis(prompt);
      if (shotRisk.level === 'crisis') {
        console.warn(`[crisis] refused analyze-image (${shotRisk.matched})`);
        return res.json({ result: CRISIS_MESSAGE, model: 'safety', crisis: true });
      }


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

    /*
      THE SAME CRISIS CHECK AS /api/generate, AND THIS ROUTE NEEDS IT MORE.

      "Go Deeper" is a conversation, not a topic box. A topic box gets a subject
      typed into it; a chat gets whatever is actually on someone's mind, and it
      is the surface where a person is most likely to say something about
      themselves rather than about a syllabus.

      Adding the check to /api/generate alone was an incomplete fix, and the
      comment in crisisCheck.ts calling that "the single call that reaches a
      model" was simply wrong — there are three.

      Only the newest USER message is assessed. The whole history would re-fire
      on every subsequent turn once the topic had come up, and the assistant's
      own words are not somebody asking for help.
    */
    const lastUser = [...messages].reverse()
      .find((m: { role?: string }) => (m?.role ?? 'user') === 'user');
    const chatRisk = assessCrisis(
      typeof lastUser?.content === 'string' ? lastUser.content : lastUser?.text
    );
    if (chatRisk.level === 'crisis') {
      console.warn(`[crisis] refused expand-chat (${chatRisk.matched})`);
      return res.json({ result: CRISIS_MESSAGE, model: 'safety', crisis: true });
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
