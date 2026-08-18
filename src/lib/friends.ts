/**
 * FRIENDS — usernames, requests, acceptance, and the list.
 *
 * The shape is ported from GhostChat, not the code: GhostChat is on Supabase
 * with SQL row-level security and SECURITY DEFINER functions, and this is
 * Firestore. What carries over is the design, and the decisions in it that
 * matter:
 *
 *  1. A REQUEST IS NOT A FRIENDSHIP. Adding someone creates a pending request
 *     that they have to accept. Anything else lets a stranger put themselves in
 *     your list, and this app is used by fourteen-year-olds.
 *
 *  2. A FRIENDSHIP IS ONE DOCUMENT WITH A DEDUCIBLE ID, not two rows. The id is
 *     the two uids sorted and joined, so `areFriends(a, b)` is a single get with
 *     no query and no index, and two people cannot end up half-friends because
 *     one of a pair of writes failed.
 *
 *  3. A USERNAME IS CLAIMED, NOT DERIVED. The first version generated one from
 *     the display name, which meant every account called "Ola" produced the
 *     username `ola` and only one of them was findable. A username is now a
 *     document in `usernames/` that you own; Firestore `create` fails if the
 *     document already exists, so the claim is atomic without a transaction.
 */
import {
  db, auth, doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs,
  onSnapshot, Timestamp, orderBy, limit,
} from './firebase';
import { checkUsernameSafety, checkDisplayNameSafety, safetyMessage } from './usernameSafety';

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromName: string;
  fromUsername?: string;
  toUid: string;
  createdAt: string;
}

export interface Friend {
  uid: string;
  name: string;
  username?: string;
  since: string;
}

export interface Person {
  uid: string;
  name: string;
  username?: string;
}

/** Search results are capped. A search that returns everyone is a directory. */
const MAX_RESULTS = 10;

/**
 * The id of the friendship document for a pair, in a fixed order.
 *
 * Sorted, so `pairId(a, b) === pairId(b, a)`. Without that you need two
 * documents per friendship, and every read has to check both.
 */
export function pairId(a: string, b: string): string {
  return [a, b].sort().join('__');
}

/** The id of a request. Directional — A asking B is not B asking A. */
export function requestId(fromUid: string, toUid: string): string {
  return `${fromUid}__${toUid}`;
}

function me(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');
  return uid;
}

/* ------------------------------------------------------------- usernames */

/**
 * What a username is allowed to be.
 *
 * Lower case only, so `Ola` and `ola` cannot both exist and be mistaken for each
 * other. No leading or trailing punctuation, and no runs of it, because
 * `o...l...a` reads as a different person at a glance — impersonation by
 * punctuation is a real thing on any app with a friends list.
 */
export function usernameProblem(name: string): string | null {
  const u = name.trim().toLowerCase();
  if (u.length < 3) return 'Usernames need at least 3 characters.';
  if (u.length > 20) return 'Usernames can be at most 20 characters.';
  if (!/^[a-z0-9._]+$/.test(u)) return 'Use letters, numbers, dots and underscores only.';
  if (/^[._]|[._]$/.test(u)) return 'It cannot start or end with a dot or underscore.';
  if (/[._]{2,}/.test(u)) return 'No two dots or underscores in a row.';

  /*
    SHAPE FIRST, THEN MEANING.

    Ola and Daniel found the n-word could be registered. The check lives in
    lib/usernameSafety.ts because it is a different question from length and
    punctuation, and because it needs its own tests — a word list without tests
    for the evasions (n1gger, n.i.g.g.e.r, niiigger) catches almost nothing.
  */
  const verdict = checkUsernameSafety(u);
  if (!verdict.ok) return safetyMessage(verdict.reason || 'offensive');

  return null;
}

export function normaliseUsername(name: string): string {
  return name.trim().toLowerCase();
}

export async function isUsernameFree(name: string): Promise<boolean> {
  const u = normaliseUsername(name);
  const snap = await getDoc(doc(db, 'usernames', u));
  return !snap.exists() || (snap.data() as any)?.uid === auth.currentUser?.uid;
}

/**
 * Claim a username, releasing the previous one.
 *
 * The claim relies on Firestore `create` failing when the document already
 * exists, and on the rules forbidding `update` — so two people racing for the
 * same name cannot both win, with no transaction and no server.
 */
export async function claimUsername(name: string, displayName: string, email: string | null): Promise<void> {
  const uid = me();
  const u = normaliseUsername(name);
  const problem = usernameProblem(u);
  if (problem) throw new Error(problem);

  const existing = await getDoc(doc(db, 'usernames', u));
  if (existing.exists()) {
    if ((existing.data() as any)?.uid !== uid) throw new Error('That username is taken.');
    return;                                   // already yours; nothing to do
  }

  // The old name is released only after the new one is secured, so a failure
  // here leaves you with your existing username rather than none at all.
  const profile = await getDoc(doc(db, 'public_profiles', uid));
  const previous = (profile.data() as any)?.username as string | undefined;

  await setDoc(doc(db, 'usernames', u), { uid });
  await publishProfile(displayName, email, u);

  if (previous && previous !== u) {
    try {
      await deleteDoc(doc(db, 'usernames', previous));
    } catch (err) {
      // A stranded claim costs one unusable name; failing the rename here would
      // cost the user their new one.
      console.warn('[friends] could not release the old username:', err);
    }
  }
}

/* -------------------------------------------------------------- profiles */

/**
 * Make sure this account is findable.
 *
 * Searching means reading a stranger's document, and the rule on /users
 * correctly refuses that — a user document holds their email, their plan, their
 * token spend and their whole progress. So only the searchable fields are
 * mirrored into `public_profiles`, which holds nothing else.
 *
 * `displayLower` exists purely so display-name search can be a range query.
 * Firestore has no case-insensitive comparison, so the lower-cased copy IS the
 * index.
 */
export async function publishProfile(
  displayName: string,
  email: string | null,
  username?: string
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  let name = (displayName || email?.split('@')[0] || 'Student').slice(0, 60);
  // A filtered username beside an unfiltered display name is not a filter — the
  // display name is what people actually read in a friends list.
  if (!checkDisplayNameSafety(name).ok) name = 'Student';

  const payload: Record<string, unknown> = {
    uid,
    displayName: name,
    displayLower: name.toLowerCase(),
    emailLower: (email || '').toLowerCase().slice(0, 256),
  };

  // Never blank an existing username by republishing without one — this runs on
  // every sign-in, and that would silently unclaim the name every time.
  const current = username ?? (await getDoc(doc(db, 'public_profiles', uid))).data()?.username;
  if (current) payload.username = current;

  try {
    await setDoc(doc(db, 'public_profiles', uid), payload);
  } catch (err) {
    // Not being findable is a smaller problem than not being able to sign in.
    console.warn('[friends] could not publish profile:', err);
  }
}

export async function myProfile(): Promise<{ username?: string; displayName?: string } | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'public_profiles', uid));
  return snap.exists() ? (snap.data() as any) : null;
}

/* ---------------------------------------------------------------- search */

/**
 * Find people by username, display name or email.
 *
 * Username and email are exact. Display name is a prefix match, because that is
 * the only thing anyone can remember about a friend — but it is capped at ten
 * results and needs three characters, so it is a lookup rather than a browsable
 * directory of every child using the app.
 */
export async function findPeople(term: string): Promise<Person[]> {
  const q = term.trim().toLowerCase();
  if (q.length < 3) return [];

  const profiles = collection(db, 'public_profiles');
  const found = new Map<string, Person>();
  const mine = auth.currentUser?.uid;

  const add = (id: string, data: any) => {
    if (id === mine || found.has(id)) return;
    found.set(id, { uid: id, name: data.displayName || data.username || 'Student', username: data.username });
  };

  const [byUsername, byEmail] = await Promise.all([
    getDocs(query(profiles, where('username', '==', q))),
    getDocs(query(profiles, where('emailLower', '==', q))),
  ]);
  byUsername.docs.forEach((d) => add(d.id, d.data()));
  byEmail.docs.forEach((d) => add(d.id, d.data()));

  // Prefix range. '' is the highest code point Firestore will sort, so
  // [q, q+] is every string beginning with q.
  const byName = await getDocs(query(
    profiles,
    orderBy('displayLower'),
    where('displayLower', '>=', q),
    where('displayLower', '<=', q + ''),
    limit(MAX_RESULTS)
  ));
  byName.docs.forEach((d) => add(d.id, d.data()));

  return Array.from(found.values()).slice(0, MAX_RESULTS);
}

/* ----------------------------------------------------------------- stats */

export interface FriendStats {
  level: number;
  xp: number;
  streak: number;
  sessions: number;
}

/**
 * Publish your level and streak for friends to see.
 *
 * Kept out of the user document on purpose. That one holds your email, your
 * plan, your token spend and your redeemed key, and its rule correctly refuses
 * to show any of it to anyone else — loosening that to expose a level number
 * would expose everything sitting beside it.
 */
export async function publishStats(stats: Partial<FriendStats> & { displayName?: string }): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await setDoc(doc(db, 'user_stats', uid), {
      uid,
      displayName: (stats.displayName || 'Student').slice(0, 60),
      level: Math.max(1, Math.floor(stats.level ?? 1)),
      xp: Math.max(0, Math.floor(stats.xp ?? 0)),
      streak: Math.max(0, Math.floor(stats.streak ?? 0)),
      sessions: Math.max(0, Math.floor(stats.sessions ?? 0)),
      updatedAt: Timestamp.now().toDate().toISOString(),
    });
  } catch (err) {
    // Not being visible to friends is a smaller problem than blocking the app.
    console.warn('[friends] could not publish stats:', err);
  }
}

/**
 * Read a friend's stats. Returns null when they have none yet, or when the
 * rules refuse — which is what happens the moment you stop being friends.
 */
export async function statsFor(uid: string): Promise<FriendStats | null> {
  try {
    const snap = await getDoc(doc(db, 'user_stats', uid));
    if (!snap.exists()) return null;
    const d = snap.data() as any;
    return {
      level: Number(d.level) || 1,
      xp: Number(d.xp) || 0,
      streak: Number(d.streak) || 0,
      sessions: Number(d.sessions) || 0,
    };
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- friends */

export async function areFriends(otherUid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'friendships', pairId(me(), otherUid)));
  return snap.exists();
}

/**
 * Ask someone to be friends.
 *
 * If they have already asked YOU, this accepts theirs instead of creating a
 * mirror request — otherwise two people who add each other at the same time end
 * up with two pending requests and no friendship, and both are left wondering
 * why the button did nothing.
 */
export async function sendRequest(toUid: string, myName: string, myUsername?: string): Promise<'sent' | 'accepted'> {
  const uid = me();
  if (toUid === uid) throw new Error('You cannot add yourself.');
  if (await areFriends(toUid)) throw new Error('You are already friends.');

  const theirs = await getDoc(doc(db, 'friend_requests', requestId(toUid, uid)));
  if (theirs.exists()) {
    await acceptRequest(toUid, (theirs.data() as any).fromName || 'Student', myName);
    return 'accepted';
  }

  await setDoc(doc(db, 'friend_requests', requestId(uid, toUid)), {
    fromUid: uid,
    fromName: myName,
    ...(myUsername ? { fromUsername: myUsername } : {}),
    toUid,
    createdAt: Timestamp.now().toDate().toISOString(),
  });
  return 'sent';
}

/** Accept a request from `fromUid`, creating the single friendship document. */
export async function acceptRequest(fromUid: string, theirName: string, myName: string): Promise<void> {
  const uid = me();
  await setDoc(doc(db, 'friendships', pairId(uid, fromUid)), {
    // Both uids are stored as an array so each side can query "my friendships"
    // with one array-contains, rather than two queries OR'd together.
    uids: [uid, fromUid].sort(),
    names: { [uid]: myName, [fromUid]: theirName },
    since: Timestamp.now().toDate().toISOString(),
  });
  // The request has done its job. Left behind, it would show as pending forever.
  await deleteDoc(doc(db, 'friend_requests', requestId(fromUid, uid)));
}

export async function declineRequest(fromUid: string): Promise<void> {
  await deleteDoc(doc(db, 'friend_requests', requestId(fromUid, me())));
}

/** Withdraw a request you sent. */
export async function cancelRequest(toUid: string): Promise<void> {
  await deleteDoc(doc(db, 'friend_requests', requestId(me(), toUid)));
}

export async function removeFriend(otherUid: string): Promise<void> {
  await deleteDoc(doc(db, 'friendships', pairId(me(), otherUid)));
}

/** Live list of your friends. Returns an unsubscribe. */
export function watchFriends(onChange: (friends: Friend[]) => void): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { onChange([]); return () => {}; }

  return onSnapshot(
    query(collection(db, 'friendships'), where('uids', 'array-contains', uid)),
    (snap) => {
      onChange(snap.docs.map((d) => {
        const data = d.data() as any;
        const otherUid = (data.uids as string[]).find((u) => u !== uid) || '';
        return {
          uid: otherUid,
          name: data.names?.[otherUid] || 'Student',
          since: data.since || '',
        };
      }));
    },
    (err) => { console.warn('[friends] watch failed:', err); onChange([]); }
  );
}

/**
 * Live list of requests YOU have sent and nobody has answered.
 *
 * Without this, sending a request was a dead end: it vanished from the screen,
 * there was no way to tell whether it had gone, and `cancelRequest` existed with
 * nothing anywhere able to call it. You could also send the same person a second
 * request without ever seeing the first.
 */
export function watchOutgoing(onChange: (reqs: FriendRequest[]) => void): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { onChange([]); return () => {}; }

  return onSnapshot(
    query(collection(db, 'friend_requests'), where('fromUid', '==', uid)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    (err) => { console.warn('[friends] outgoing watch failed:', err); onChange([]); }
  );
}

/** Live list of requests waiting for YOU. Returns an unsubscribe. */
export function watchIncoming(onChange: (reqs: FriendRequest[]) => void): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { onChange([]); return () => {}; }

  return onSnapshot(
    query(collection(db, 'friend_requests'), where('toUid', '==', uid)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    (err) => { console.warn('[friends] requests watch failed:', err); onChange([]); }
  );
}
