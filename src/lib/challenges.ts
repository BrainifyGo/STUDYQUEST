/**
 * CHALLENGES — race a friend through the same questions.
 *
 * Free, deliberately. Study rooms are the paid feature; challenging a friend is
 * the reason to add one in the first place, and a friends list where every
 * button leads to a paywall is not a free feature.
 *
 * TWO DECISIONS DO THE WORK HERE.
 *
 * 1. THE QUESTIONS LIVE ON THE CHALLENGE. They are generated once, by the
 *    challenger, and stored. Regenerating them for the second player — even
 *    from the same topic — would give the two people different questions, and
 *    two scores from different questions do not compare. A challenge whose
 *    scores cannot be compared is not a challenge.
 *
 * 2. EACH SCORE IS ITS OWN DOCUMENT, IN A SUBCOLLECTION, WRITTEN ONCE.
 *    `challenges/{id}/scores/{uid}` — you may create yours and nobody may
 *    update any. That single `allow update: if false` is what stops a player
 *    replaying until they beat their friend, and it means the rules never have
 *    to reason about which keys of a shared map changed, which is where this
 *    sort of thing usually goes wrong.
 */
import {
  db, auth, doc, getDoc, setDoc, deleteDoc, collection, query, where,
  getDocs, onSnapshot, Timestamp,
} from './firebase';
import { pairId } from './friends';
import type { QuizQuestion } from '../App';

export interface Challenge {
  id: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  uids: string[];
  topic: string;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface Score {
  uid: string;
  score: number;
  accuracy: number;
  correct: number;
  answered: number;
  at: string;
}

/** How many questions a challenge holds. Enough for a real race, short enough to finish. */
export const CHALLENGE_QUESTIONS = 10;

function me(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');
  return uid;
}

/**
 * Send a challenge.
 *
 * The id is generated here rather than by `addDoc` so the write is a `create`,
 * which is the only thing the rules permit — a challenge is never edited once
 * it exists, because editing it would mean changing the questions after someone
 * had already answered them.
 */
export async function sendChallenge(args: {
  toUid: string;
  toName: string;
  myName: string;
  topic: string;
  questions: QuizQuestion[];
}): Promise<string> {
  const uid = me();
  const { toUid, toName, myName, topic, questions } = args;

  if (toUid === uid) throw new Error('You cannot challenge yourself.');
  if (!questions.length) throw new Error('A challenge needs questions.');

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await setDoc(doc(db, 'challenges', id), {
    fromUid: uid,
    fromName: myName.slice(0, 60),
    toUid,
    toName: toName.slice(0, 60),
    // Sorted, so a rule can check membership with one `in` and the pair can be
    // matched against the friendship document without a query.
    uids: [uid, toUid].sort(),
    topic: topic.slice(0, 80),
    questions,
    createdAt: Timestamp.now().toDate().toISOString(),
  });
  return id;
}

/** Record your result. Once — the rules refuse a second attempt. */
export async function recordScore(challengeId: string, result: Omit<Score, 'uid' | 'at'>): Promise<void> {
  const uid = me();
  await setDoc(doc(db, 'challenges', challengeId, 'scores', uid), {
    uid,
    score: Math.max(0, Math.floor(result.score)),
    accuracy: Math.max(0, Math.min(100, Math.floor(result.accuracy))),
    correct: Math.max(0, Math.floor(result.correct)),
    answered: Math.max(0, Math.floor(result.answered)),
    at: Timestamp.now().toDate().toISOString(),
  });
}

/** Have you already played this one? Your score is final, so this decides the UI. */
export async function myScore(challengeId: string): Promise<Score | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'challenges', challengeId, 'scores', uid));
    return snap.exists() ? (snap.data() as Score) : null;
  } catch {
    return null;
  }
}

/** Both scores, for the result screen. */
export function watchScores(challengeId: string, onChange: (scores: Score[]) => void): () => void {
  return onSnapshot(
    collection(db, 'challenges', challengeId, 'scores'),
    (snap) => onChange(snap.docs.map((d) => d.data() as Score)),
    (err) => { console.warn('[challenge] scores watch failed:', err); onChange([]); }
  );
}

/** Every challenge you are part of, newest first. */
export function watchChallenges(onChange: (list: Challenge[]) => void): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { onChange([]); return () => {}; }

  return onSnapshot(
    query(collection(db, 'challenges'), where('uids', 'array-contains', uid)),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Challenge[];
      // Sorted here rather than with orderBy, which would need a composite index
      // for a list that is never going to be long.
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onChange(list);
    },
    (err) => { console.warn('[challenge] watch failed:', err); onChange([]); }
  );
}

export async function deleteChallenge(id: string): Promise<void> {
  // The score documents are left behind; Firestore has no cascading delete from
  // the client, and an orphaned score under a deleted parent is unreachable and
  // harmless. Worth knowing rather than pretending it is tidy.
  await deleteDoc(doc(db, 'challenges', id));
}

/** Who won, or null for a draw. Score first, accuracy breaks a tie. */
export function winnerOf(scores: Score[]): string | null {
  if (scores.length < 2) return null;
  const [a, b] = scores;
  if (a.score !== b.score) return a.score > b.score ? a.uid : b.uid;
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy ? a.uid : b.uid;
  return null;
}

/** The friendship this challenge sits under — the rules check the same id. */
export function friendshipFor(challenge: Pick<Challenge, 'uids'>): string {
  return pairId(challenge.uids[0], challenge.uids[1]);
}
