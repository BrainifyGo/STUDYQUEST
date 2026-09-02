import {
  collection, deleteDoc, doc, getDocs, limit, query, setDoc, where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type { Insight } from './examinerReport';

/**
 * Where mined examiner insights live.
 *
 * SHARED, NOT PER-STUDENT — and that is the design decision, not an
 * implementation detail.
 *
 * Examiner reports are public and identical for everybody. If each student mined
 * them, StudyQuest would spend a model call per student on the same PDF, produce
 * a slightly different set of findings each time, and have no way to fix a bad
 * one. Mining centrally means one pass, consistent wording, and a human able to
 * delete anything that reads wrong — which matters, because these are presented
 * as what real examiners said.
 *
 * So: everyone signed in can READ; only an admin can write. Enforced in
 * firestore.rules, not here.
 */

const COLLECTION = 'examiner_insights';

/** Plenty for several subjects' worth of reports. */
export const MAX_INSIGHTS = 500;

export async function listInsights(subject?: string | null): Promise<Insight[]> {
  if (!auth.currentUser) return [];
  try {
    const snap = await getDocs(
      subject
        ? query(collection(db, COLLECTION),
            where('source.subject', '==', subject), limit(MAX_INSIGHTS))
        : query(collection(db, COLLECTION), limit(MAX_INSIGHTS)),
    );
    return snap.docs
      .map((d) => d.data() as Insight)
      // Sorted here rather than in the query: `where` plus `orderBy` on another
      // field needs a composite index, and firestore.indexes.json is empty.
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, COLLECTION);
    return [];
  }
}

/**
 * Publish mined insights. Admin only — the rules refuse everyone else, so a
 * student calling this gets nothing rather than a corrupted shared library.
 *
 * `setDoc` by id, so re-mining the same report updates its insights instead of
 * doubling them.
 */
export async function publishInsights(insights: Insight[]): Promise<number> {
  if (!auth.currentUser) return 0;
  let written = 0;
  for (const insight of insights) {
    try {
      await setDoc(doc(db, COLLECTION, insight.id), insight);
      written++;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, COLLECTION);
    }
  }
  return written;
}

export async function deleteInsight(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, COLLECTION);
  }
}
