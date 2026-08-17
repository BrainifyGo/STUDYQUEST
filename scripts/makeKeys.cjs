/**
 * Mint upgrade keys.
 *
 *   node scripts/makeKeys.cjs [count] [monthly|annual]
 *
 * The key string IS the document id — that is what makes redemption a direct
 * `getDoc` rather than a query over the whole collection, and it is why the
 * rules can deny `list` and still let someone redeem a key they were given.
 *
 * Keys are generated with `crypto.randomBytes`, not `Math.random`. A guessable
 * upgrade key is a free subscription for anyone who tries a few, and Math.random
 * is not designed to resist that.
 *
 * Needs the service-account credentials already in .env — creating a key
 * requires isAdmin() from the client, and this bypasses the rules entirely.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
require('dotenv').config();

const COUNT = Number(process.argv[2]) || 2;
const TYPE = process.argv[3] === 'monthly' ? 'monthly' : 'annual';

// No I, O, 0 or 1: these get written down and read back off a screen, and those
// four are the ones people mistype.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeKey() {
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `SQ-${out}`;
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});

(async () => {
  const db = admin.firestore();
  const made = [];

  for (let i = 0; i < COUNT; i++) {
    const key = makeKey();
    const ref = db.collection('upgrade_keys').doc(key);

    // `create` fails if the id already exists, so a collision cannot silently
    // reset somebody's already-redeemed key back to unused.
    await ref.create({
      key,
      type: TYPE,
      isUsed: false,
      createdAt: new Date().toISOString(),
    });
    made.push(key);
  }

  console.log(`\n  ${COUNT} ${TYPE} key(s):\n`);
  for (const k of made) console.log(`    ${k}`);
  console.log('\n  Redeem at Upgrade -> "Have a key?".\n');
  process.exit(0);
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
