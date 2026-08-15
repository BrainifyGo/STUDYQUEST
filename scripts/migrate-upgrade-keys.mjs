/**
 * Re-key the `upgrade_keys` collection so the DOCUMENT ID IS THE KEY STRING.
 *
 * Why this has to happen once.
 * ---------------------------
 * Keys used to live at random document IDs with the secret in a `key` field, so the only way to
 * redeem one was to query the collection for a match — which required every signed-in user to be
 * able to read every key. That was the hole. With the key as the document ID, redemption is a
 * direct lookup, `list` can be denied, and a key you weren't given is undiscoverable.
 *
 * The new rules deny `list` to non-admins, so any key still sitting at a random ID is
 * unreachable by the app and effectively dead until it is moved here.
 *
 * Safety
 * ------
 *  - Dry run by default. Nothing is written unless you pass --commit.
 *  - Copies, never moves: the original documents are left exactly where they are, so this can be
 *    run again, and a mistake costs nothing. Delete the old ones by hand once you're happy.
 *  - Refuses to overwrite an existing key document, so a re-run can't un-spend a used key.
 *
 * Usage (from the Brainify folder):
 *   node scripts/migrate-upgrade-keys.mjs            # show what would happen
 *   node scripts/migrate-upgrade-keys.mjs --commit   # actually write
 */

import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const COMMIT = process.argv.includes('--commit');

const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    'Missing admin credentials. This script needs VITE_FIREBASE_PROJECT_ID,\n' +
    'FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env — the same three\n' +
    'server.ts already uses.'
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();

const snap = await db.collection('upgrade_keys').get();

if (snap.empty) {
  console.log('No upgrade keys found. Nothing to do.');
  process.exit(0);
}

let moved = 0;
let alreadyFine = 0;
let skipped = 0;

for (const docSnap of snap.docs) {
  const data = docSnap.data();
  const key = data.key;

  if (typeof key !== 'string' || key.length === 0) {
    console.log(`SKIP  ${docSnap.id} — no usable \`key\` field`);
    skipped += 1;
    continue;
  }

  if (docSnap.id === key) {
    alreadyFine += 1;
    continue;
  }

  const target = db.collection('upgrade_keys').doc(key);

  // Never clobber. If a document already sits at this ID it may be a key that has since been
  // spent, and overwriting it would hand out a second free upgrade.
  if ((await target.get()).exists) {
    console.log(`SKIP  ${docSnap.id} -> ${key} — a document already exists at that ID`);
    skipped += 1;
    continue;
  }

  console.log(`${COMMIT ? 'MOVE ' : 'WOULD'} ${docSnap.id} -> ${key}  (${data.type}, used: ${data.isUsed === true})`);

  if (COMMIT) {
    await target.set({
      key,
      type: data.type,
      isUsed: data.isUsed === true,
      ...(data.usedBy ? { usedBy: data.usedBy } : {}),
    });
  }
  moved += 1;
}

console.log(
  `\n${COMMIT ? 'Copied' : 'Would copy'} ${moved} key(s). ` +
  `${alreadyFine} already correct, ${skipped} skipped.`
);
if (!COMMIT && moved > 0) {
  console.log('Re-run with --commit to write. The old documents are left in place either way.');
}
if (COMMIT && moved > 0) {
  console.log('The originals are still there. Delete them from the Firebase console once you have checked a key redeems.');
}

process.exit(0);
