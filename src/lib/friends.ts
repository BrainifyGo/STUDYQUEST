/**
 * FRIENDS — requests, acceptance, and the list.
 *
 * The shape is ported from GhostChat, not the code: GhostChat is on Supabase
 * with SQL row-level security and SECURITY DEFINER functions, and this is
 * Firestore. What carries over is the design, and the two decisions in it that
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
 * Searching is by exact username or email. There is no fuzzy directory search on
 * purpose — a browsable list of every child using the app is not something we
 * are going to build.
 */
import {
  db, auth, doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs,
  onSnapshot, Timestamp,
} from './firebase';

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  createdAt: string;
}

export interface Friend {
  uid: string;
  name: string;
  since: string;
}

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

/**
 * Make sure this account is findable.
 *
 * Searching means reading a stranger's document, and the rule on /users
 * correctly refuses that — a user document holds their email, their plan, their
 * token spend and their whole progress. So the two searchable fields are
 * mirrored into `public_profiles`, which holds nothing else. Called on sign-in,
 * so existing accounts get one without having to do anything.
 */
export async function publishProfile(displayName: string, email: string | null): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const name = (displayName || email?.split('@')[0] || 'Student').slice(0, 60);
  try {
    await setDoc(doc(db, 'public_profiles', uid), {
      uid,
      displayName: name,
      username: name.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32),
      emailLower: (email || '').toLowerCase().slice(0, 256),
    });
  } catch (err) {
    // Not being findable is a smaller problem than not being able to sign in.
    console.warn('[friends] could not publish profile:', err);
  }
}

/** Find one person by exact username or email. Never a browsable list. */
export async function findPerson(term: string): Promise<{ uid: string; name: string } | null> {
  const q = term.trim().toLowerCase();
  if (q.length < 3) return null;

  const profiles = collection(db, 'public_profiles');
  // Email first — it is the field every account definitely has. Both are stored
  // lower-cased so the comparison does not depend on how someone typed it.
  const byEmail = await getDocs(query(profiles, where('emailLower', '==', q)));
  const hit = byEmail.docs[0]
    ?? (await getDocs(query(profiles, where('username', '==', q)))).docs[0];

  if (!hit) return null;
  if (hit.id === auth.currentUser?.uid) return null;   // you already know yourself

  const data = hit.data() as any;
  return { uid: hit.id, name: data.displayName || data.username || 'Student' };
}

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
export async function sendRequest(toUid: string, myName: string): Promise<'sent' | 'accepted'> {
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
