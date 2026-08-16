/**
 * DIRECT MESSAGES between friends.
 *
 * Stored at `dms/{pairId}/messages/{id}`, where `pairId` is the same sorted-pair
 * id as the friendship document. That is the whole design decision: because the
 * conversation and the friendship share an id, the security rule can check
 *
 *     exists(/databases/$(db)/documents/friendships/$(pairId))
 *
 * without storing a second copy of who is allowed to be here. There is no
 * members list to drift out of step with the friends list, and unfriending
 * closes the conversation for both sides the instant it happens — the exists()
 * runs on every read, not once when the chat was opened.
 *
 * Sent over Firestore rather than the Socket.IO server the study rooms use. A
 * room is ephemeral, so relaying is right there; a DM has to survive both people
 * being offline, which is a database, not a socket.
 */
import {
  db, auth, doc, setDoc, deleteDoc, collection, query, orderBy, limit,
  onSnapshot, Timestamp,
} from './firebase';
import { pairId } from './friends';

export interface DirectMessage {
  id: string;
  senderUid: string;
  text: string;
  sentAt: string;
}

/** How much history is loaded. Enough to scroll, not enough to cost anything. */
const HISTORY = 200;

/** The longest a single message may be. Mirrored in the rules, which decide. */
export const MAX_MESSAGE = 2000;

export function conversationId(otherUid: string): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');
  return pairId(uid, otherUid);
}

/**
 * Watch a conversation. Returns an unsubscribe.
 *
 * Ordered by `sentAt` ascending so messages arrive in the order they were sent
 * rather than the order Firestore happens to return them.
 */
export function watchMessages(
  otherUid: string,
  onChange: (messages: DirectMessage[]) => void,
  onError?: (err: Error) => void
): () => void {
  let convo: string;
  try {
    convo = conversationId(otherUid);
  } catch (err) {
    onError?.(err as Error);
    return () => {};
  }

  return onSnapshot(
    query(collection(db, 'dms', convo, 'messages'), orderBy('sentAt'), limit(HISTORY)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    (err) => {
      // The likely cause is that the friendship is gone — the rule refuses the
      // read the moment it is. Say so rather than showing an empty chat.
      console.warn('[dm] watch failed:', err);
      onError?.(new Error('This conversation is closed. You are no longer friends.'));
    }
  );
}

/**
 * Send a message.
 *
 * The id is generated here rather than by `addDoc` so the message can be written
 * with `setDoc` — `create` rather than `update` — which is what the rules allow.
 * A message is written once and never edited.
 */
export async function sendMessage(otherUid: string, text: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');

  const body = text.trim();
  if (!body) return;
  if (body.length > MAX_MESSAGE) throw new Error(`Messages can be at most ${MAX_MESSAGE} characters.`);

  const convo = conversationId(otherUid);
  const sentAt = Timestamp.now().toDate().toISOString();
  // Timestamp first so the id sorts the same way the query does, then a random
  // tail so two messages in the same millisecond cannot collide.
  const id = `${sentAt}_${Math.random().toString(36).slice(2, 8)}`;

  await setDoc(doc(db, 'dms', convo, 'messages', id), { senderUid: uid, text: body, sentAt });
}

/** Delete one of your own messages. The rules refuse anyone else's. */
export async function deleteMessage(otherUid: string, messageId: string): Promise<void> {
  await deleteDoc(doc(db, 'dms', conversationId(otherUid), 'messages', messageId));
}

/** A short preview for a friends list. Empty string when there is nothing yet. */
export function watchLatest(
  otherUid: string,
  onChange: (preview: DirectMessage | null) => void
): () => void {
  let convo: string;
  try {
    convo = conversationId(otherUid);
  } catch {
    onChange(null);
    return () => {};
  }

  return onSnapshot(
    query(collection(db, 'dms', convo, 'messages'), orderBy('sentAt', 'desc'), limit(1)),
    (snap) => {
      const d = snap.docs[0];
      onChange(d ? ({ id: d.id, ...(d.data() as any) } as DirectMessage) : null);
    },
    () => onChange(null)
  );
}
