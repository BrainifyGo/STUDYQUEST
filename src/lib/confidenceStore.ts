import { addDoc, collection, getDocs, limit, query, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type { Attempt } from './confidence';

/**
 * Where confidence attempts are kept.
 *
 * Separate from `study_mistakes` on purpose. A mistake is one row per question
 * that gets retired when you finally get it right; an attempt is an immutable
 * event, and the interesting patterns are only visible across many of them —
 * including all the times the student was RIGHT, which the mistakes collection
 * deliberately does not keep.
 *
 * Writes are fire-and-forget from the quiz. Losing one attempt costs a data
 * point; blocking a student mid-question to save it costs the feature.
 */

const COLLECTION = 'confidence_attempts';

/** Keep the read bounded — this is a dashboard, not an archive. */
export const HISTORY_LIMIT = 400;

export interface StoredAttempt extends Attempt {
  user_id: string;
  created_at: string;
}

export async function recordAttempt(attempt: Attempt): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;                       // guests keep nothing, by design

  try {
    await addDoc(collection(db, COLLECTION), {
      user_id: uid,
      topic: (attempt.topic || 'General').slice(0, 120),
      confidence: attempt.confidence === 'sure' ? 'sure' : 'unsure',
      correct: attempt.correct === true,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, COLLECTION);
  }
}

export async function listAttempts(): Promise<StoredAttempt[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  try {
    const snap = await getDocs(query(
      collection(db, COLLECTION),
      where('user_id', '==', uid),
      limit(HISTORY_LIMIT),
    ));
    return snap.docs
      .map((d) => d.data() as StoredAttempt)
      // Sorted here rather than in the query. `where` plus `orderBy` on a
      // different field needs a composite index, and firestore.indexes.json is
      // deliberately empty — an index that was never deployed is a feature that
      // silently returns nothing. The list is capped, so the cost is nothing.
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, COLLECTION);
    return [];
  }
}
