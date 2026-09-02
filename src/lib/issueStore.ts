import {
  addDoc, collection, doc, getDocs, limit, query, updateDoc, where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  fingerprint, readContext, suggestSeverity,
  type IssueCategory, type IssueReport, type IssueStatus, type Severity,
} from './issueReport';

const COLLECTION = 'issue_reports';

/** Enough for a two-month cycle several times over. */
export const MAX_FETCH = 1000;

/**
 * Sending a report, and reading them back for the review.
 *
 * A student can WRITE a report and read their own; only an admin can read
 * everybody's. That split is enforced in firestore.rules rather than here,
 * because a check in the browser is a suggestion.
 *
 * `status`, `severity` and `notes` are set at creation and then only ever
 * changed by the team. A student cannot mark their own report critical — that
 * would make the two-month ranking a popularity contest for whoever shouts.
 */
export async function submitReport(input: {
  category: IssueCategory;
  title: string;
  description: string;
  view: string;
  appVersion?: string;
}): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;

  const title = input.title.trim().slice(0, 120);
  const description = input.description.trim().slice(0, 4000);

  try {
    await addDoc(collection(db, COLLECTION), {
      user_id: uid,
      category: input.category,
      title,
      description,
      context: readContext(input.view, input.appVersion),
      status: 'new',
      severity: suggestSeverity(input.category, description),
      notes: '',
      fingerprint: fingerprint(input.category, title),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, COLLECTION);
    return false;
  }
}

/** The reports this student has sent — so they can see it landed. */
export async function myReports(): Promise<IssueReport[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await getDocs(query(
      collection(db, COLLECTION),
      where('user_id', '==', uid),
      limit(50),
    ));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<IssueReport, 'id'>) }))
      // Sorted here: `where` plus `orderBy` needs a composite index, and
      // firestore.indexes.json is deliberately empty.
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, COLLECTION);
    return [];
  }
}

/**
 * Triage: what the team decided about a report.
 *
 * Admin only, enforced in firestore.rules. Only these three fields can move —
 * the report itself is what the student wrote and is never edited on their
 * behalf. Changing someone's words and then acting on them would make the whole
 * collection untrustworthy as a record of what was actually said.
 */
export async function updateReport(
  id: string,
  changes: { status?: IssueStatus; severity?: Severity; notes?: string },
): Promise<boolean> {
  if (!auth.currentUser || !id) return false;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.status) patch.status = changes.status;
  if (changes.severity) patch.severity = changes.severity;
  if (changes.notes !== undefined) patch.notes = changes.notes.slice(0, 2000);

  try {
    await updateDoc(doc(db, COLLECTION, id), patch);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, COLLECTION);
    return false;
  }
}

/**
 * Every report, for the two-month review. Admin only — the rules refuse this
 * for anybody else, so a normal account gets an empty list rather than data it
 * should not see.
 */
export async function allReports(): Promise<IssueReport[]> {
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), limit(MAX_FETCH)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<IssueReport, 'id'>) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, COLLECTION);
    return [];
  }
}
