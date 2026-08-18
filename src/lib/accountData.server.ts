/**
 * ERASING AN ACCOUNT, COMPLETELY.
 *
 * Server-only. Uses the Admin SDK, which bypasses security rules — which is the
 * whole point, because the rules are what made the client-side version
 * incomplete.
 *
 * WHY THE CLIENT COULD NEVER FINISH THE JOB.
 *
 * `deleteMyAccount()` in the browser does its best, and its best has three
 * holes that no amount of client code can close:
 *
 *   1. It deletes the Firebase Auth user LAST, because it needs to be signed in
 *      to delete the Firestore data first. If anything fails in between — a
 *      dropped connection, a rule refusing one collection — the account is left
 *      half-erased with no way to retry, because the next sign-in may not work.
 *
 *   2. It can only delete what the rules let it see. A document it cannot query
 *      is a document it cannot remove.
 *
 *   3. Deleting an Auth user from the Firebase console (which is what happened
 *      here) does not touch Firestore at all. Three documents were left behind
 *      holding an email address and two display names of accounts that no longer
 *      existed.
 *
 * So erasure runs on the server, in one pass, with the Auth record deleted LAST —
 * so a failure leaves the account still usable and retryable rather than
 * stranded.
 */
import type admin from 'firebase-admin';

/** Collections holding rows that belong to one person, keyed by a uid field. */
const OWNED_BY_FIELD: { collection: string; field: string }[] = [
  { collection: 'study_sessions', field: 'userId' },
  { collection: 'study_tasks', field: 'userId' },
  { collection: 'exams', field: 'userId' },
  { collection: 'study_history', field: 'user_id' },
  { collection: 'study_mistakes', field: 'user_id' },
];

/** Collections whose DOCUMENT ID is the uid. */
const KEYED_BY_UID = ['users', 'public_profiles', 'user_stats'];

export interface ErasureReport {
  uid: string;
  deleted: Record<string, number>;
  failures: string[];
}

/**
 * Delete everything belonging to `uid`, then the login itself.
 *
 * Never throws for a partial failure: a collection that refuses is recorded and
 * the rest still goes. Half-deleting and then stopping would leave more behind
 * than half-deleting and continuing.
 */
export async function eraseAccount(
  app: typeof admin,
  uid: string,
  opts: { deleteAuthUser?: boolean } = {}
): Promise<ErasureReport> {
  const db = app.firestore();
  const report: ErasureReport = { uid, deleted: {}, failures: [] };

  const count = (k: string, n: number) => { if (n) report.deleted[k] = (report.deleted[k] ?? 0) + n; };

  // 1. Rows that reference the uid in a field.
  for (const { collection, field } of OWNED_BY_FIELD) {
    try {
      const snap = await db.collection(collection).where(field, '==', uid).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
      count(collection, snap.size);
    } catch (err: any) {
      report.failures.push(`${collection}: ${err?.message ?? err}`);
    }
  }

  // 2. The username claim, which lives at an id derived from the NAME, not the
  //    uid — so it has to be looked up before the profile that names it goes.
  try {
    const profile = await db.collection('public_profiles').doc(uid).get();
    const username = profile.data()?.username;
    if (username) {
      const claim = await db.collection('usernames').doc(username).get();
      // Only if it is still theirs. Someone else may have taken the name after
      // a rename, and deleting an account must not free a stranger's username.
      if (claim.exists && claim.data()?.uid === uid) {
        await claim.ref.delete();
        count('usernames', 1);
      }
    }
  } catch (err: any) {
    report.failures.push(`usernames: ${err?.message ?? err}`);
  }

  // 3. Friendships and requests, either direction.
  try {
    const [asMember, sent, received] = await Promise.all([
      db.collection('friendships').where('uids', 'array-contains', uid).get(),
      db.collection('friend_requests').where('fromUid', '==', uid).get(),
      db.collection('friend_requests').where('toUid', '==', uid).get(),
    ]);
    // The DM thread lives under the friendship id, so it goes with it.
    for (const d of asMember.docs) {
      const messages = await db.collection('dms').doc(d.id).collection('messages').get();
      await Promise.all(messages.docs.map((m) => m.ref.delete()));
      count('dm_messages', messages.size);
      await d.ref.delete();
    }
    count('friendships', asMember.size);
    await Promise.all([...sent.docs, ...received.docs].map((d) => d.ref.delete()));
    count('friend_requests', sent.size + received.size);
  } catch (err: any) {
    report.failures.push(`friends: ${err?.message ?? err}`);
  }

  // 4. Challenges, and the scores underneath them.
  try {
    const snap = await db.collection('challenges').where('uids', 'array-contains', uid).get();
    for (const d of snap.docs) {
      const scores = await d.ref.collection('scores').get();
      await Promise.all(scores.docs.map((sc) => sc.ref.delete()));
      await d.ref.delete();
    }
    count('challenges', snap.size);
  } catch (err: any) {
    report.failures.push(`challenges: ${err?.message ?? err}`);
  }

  // 5. The documents keyed by the uid itself.
  for (const collection of KEYED_BY_UID) {
    try {
      const ref = db.collection(collection).doc(uid);
      if ((await ref.get()).exists) { await ref.delete(); count(collection, 1); }
    } catch (err: any) {
      report.failures.push(`${collection}: ${err?.message ?? err}`);
    }
  }

  // 6. The login, LAST. If any of the above failed, the account still works and
  //    the request can simply be retried — which is the whole reason this order
  //    matters.
  if (opts.deleteAuthUser !== false) {
    try {
      await app.auth().deleteUser(uid);
      report.deleted.authUser = 1;
    } catch (err: any) {
      // "user not found" is success here: this also cleans up after an account
      // deleted from the Firebase console, which is how orphans appeared.
      if (err?.code !== 'auth/user-not-found') {
        report.failures.push(`auth: ${err?.message ?? err}`);
      }
    }
  }

  return report;
}
