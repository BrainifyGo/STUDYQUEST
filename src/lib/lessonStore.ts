import {
  collection, deleteDoc, doc, getDocs, limit, query, setDoc, where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { forStorage, fromStorage, type SavedLesson } from './lesson';

/**
 * Keeping a lesson so it can be picked up tomorrow.
 *
 * THE METHOD REQUIRES THIS. "You do not drop the subject on the whole, you drop
 * it bit by bit" — and bit by bit happens across days, not in one sitting. A
 * lesson that vanished when the tab closed quietly demanded the opposite: finish
 * now or lose it. For a student with twenty minutes before dinner, that is the
 * difference between a tool and a demo.
 *
 * One document per lesson, keyed `uid__lessonId`, so saving from two tabs
 * converges rather than leaving the student to choose between duplicates. Saves
 * are best-effort: losing one costs a step of progress, blocking someone
 * mid-question to write it costs the feature.
 */

const COLLECTION = 'lessons';

/** Enough to be a shelf of lessons, not so many the list becomes a scroll. */
export const MAX_LESSONS = 40;

export async function saveLesson(lesson: SavedLesson): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !lesson?.id) return;   // guests keep nothing, by design

  try {
    await setDoc(doc(db, COLLECTION, `${uid}__${lesson.id}`), {
      ...forStorage({ ...lesson, updatedAt: new Date().toISOString() }),
      user_id: uid,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, COLLECTION);
  }
}

export async function listLessons(): Promise<SavedLesson[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  try {
    const snap = await getDocs(query(
      collection(db, COLLECTION),
      where('user_id', '==', uid),
      limit(MAX_LESSONS),
    ));
    return snap.docs
      .map((d) => fromStorage(d.data()))
      .filter((l): l is SavedLesson => l !== null)
      // Sorted here, not in the query: `where` plus `orderBy` on another field
      // needs a composite index, and firestore.indexes.json is empty by design.
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, COLLECTION);
    return [];
  }
}

export async function deleteLesson(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !id) return;
  try {
    await deleteDoc(doc(db, COLLECTION, `${uid}__${id}`));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, COLLECTION);
  }
}
