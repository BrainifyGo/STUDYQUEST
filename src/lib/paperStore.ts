import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { forStorage, type PaperSession } from './paperSession';

/**
 * Saving a paper session so it can be picked up tomorrow.
 *
 * One document per session, keyed by the session id, because the whole point is
 * to come back to a specific paper rather than to a feed. `setDoc` with the id
 * means saving twice from two tabs converges instead of creating a duplicate the
 * student then has to choose between.
 *
 * Saves are best-effort from the UI: losing one save costs a few sentences,
 * blocking someone mid-question to write it costs the feature.
 */

const COLLECTION = 'paper_sessions';

/** Enough to be a library, not so many that the list becomes a scroll. */
export const MAX_SESSIONS = 40;

interface StoredSession extends PaperSession {
  user_id: string;
}

export async function saveSession(session: PaperSession): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !session?.id) return;   // guests keep nothing, by design

  try {
    await setDoc(doc(db, COLLECTION, `${uid}__${session.id}`), {
      ...forStorage(session),
      user_id: uid,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, COLLECTION);
  }
}

export async function loadSession(id: string): Promise<PaperSession | null> {
  const uid = auth.currentUser?.uid;
  if (!uid || !id) return null;

  try {
    const snap = await getDoc(doc(db, COLLECTION, `${uid}__${id}`));
    if (!snap.exists()) return null;
    const { user_id: _ignored, ...session } = snap.data() as StoredSession;
    return session as PaperSession;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, COLLECTION);
    return null;
  }
}

export async function listSessions(): Promise<PaperSession[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  try {
    const snap = await getDocs(query(
      collection(db, COLLECTION),
      where('user_id', '==', uid),
      limit(MAX_SESSIONS),
    ));
    return snap.docs
      .map((d) => {
        const { user_id: _ignored, ...session } = d.data() as StoredSession;
        return session as PaperSession;
      })
      // Sorted here, not in the query. `where` plus `orderBy` on another field
      // needs a composite index, and firestore.indexes.json is empty by design.
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, COLLECTION);
    return [];
  }
}

export async function deleteSession(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !id) return;
  try {
    await deleteDoc(doc(db, COLLECTION, `${uid}__${id}`));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, COLLECTION);
  }
}
