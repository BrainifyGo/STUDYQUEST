import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();

/**
 * Cloud Function to award XP to a user.
 * This prevents users from updating their own XP in the frontend.
 */
export const awardXP = onCall(async (request) => {
  // 1. Check if user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in.');
  }

  const uid = request.auth.uid;
  const data = request.data;
  const action = data?.action;

  // 2. Define XP rewards
  const XP_REWARDS: Record<string, number> = {
    'study_kit_generated': 50,
    'quiz_completed': 100,
    'daily_streak_maintained': 20,
    'voice_buddy_session': 30
  };

  const xpAmount = XP_REWARDS[action] || 0;
  if (xpAmount === 0) {
    throw new HttpsError('invalid-argument', 'Invalid action.');
  }

  // 3. Update XP and Level in a transaction
  const userRef = db.collection('users').doc(uid);

  try {
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error("User document does not exist.");
      }

      const currentXP = userDoc.data()?.xp || 0;
      const newXP = currentXP + xpAmount;
      
      // Simple level logic: Level = floor(sqrt(XP / 100)) + 1
      const newLevel = Math.floor(Math.sqrt(newXP / 100)) + 1;

      transaction.update(userRef, {
        xp: newXP,
        level: newLevel,
        lastXPUpdate: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return { success: true, xpAwarded: xpAmount };
  } catch (error) {
    console.error("Error awarding XP:", error);
    throw new HttpsError('internal', 'Failed to award XP.');
  }
});

/**
 * Redeem an upgrade key.
 *
 * WHY THIS HAS TO BE SERVER-SIDE.
 * Redemption used to happen entirely in the browser: the client queried `upgrade_keys`, marked
 * one used, then wrote `isPro: true` onto its own user document. Both writes were permitted by
 * the security rules, which meant two separate free-Pro routes for anyone who opened devtools:
 *
 *   1. `updateDoc(doc(db,'users',myUid), { isPro: true })` — the rules validated that isPro was
 *      a *bool*, never that it hadn't changed.
 *   2. Reading the whole `upgrade_keys` collection and redeeming any unused key, because
 *      `allow read: if isAuthenticated()` let a user enumerate every secret in it.
 *
 * Both rules are now closed, so the client can no longer do either — which is exactly why this
 * function must exist. It runs with the Admin SDK, which bypasses security rules, so it is the
 * only path that can grant Pro. The key never leaves the server, and the whole thing runs in a
 * transaction so the same key can't be redeemed twice by two simultaneous requests.
 */
export const redeemUpgradeKey = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in to redeem a key.');
  }

  const uid = request.auth.uid;
  const key = String(request.data?.key ?? '').trim();
  if (!key || key.length > 128) {
    throw new HttpsError('invalid-argument', 'Enter a valid upgrade key.');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      const matches = await transaction.get(
        db.collection('upgrade_keys').where('key', '==', key).limit(1)
      );
      if (matches.empty) {
        // Deliberately the same message for "no such key" and "already used": telling the
        // difference lets someone probe which keys exist.
        throw new HttpsError('not-found', 'Invalid or already used key.');
      }

      const keyDoc = matches.docs[0];
      const keyData = keyDoc.data();
      if (keyData.isUsed) {
        throw new HttpsError('not-found', 'Invalid or already used key.');
      }

      const type = ['monthly', 'annual'].includes(keyData.type) ? keyData.type : 'monthly';

      transaction.update(keyDoc.ref, {
        isUsed: true,
        usedBy: uid,
        usedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      transaction.update(db.collection('users').doc(uid), {
        isPro: true,
        subscriptionType: type,
        upgradedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { success: true, subscriptionType: type };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;   // keep the user-facing message
    console.error('Error redeeming upgrade key:', error);
    throw new HttpsError('internal', 'Could not redeem that key. Please try again.');
  }
});

/**
 * Consume one AI generation from the daily quota.
 *
 * `dailyGenerations` was writable by its owner, so a user could reset the counter to 0 the
 * moment they hit the limit and generate unlimited AI content — which costs real money per
 * call. The rules now pin the field, and this is the only way it moves.
 */
export const consumeGeneration = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in.');
  }

  const uid = request.auth.uid;
  const FREE_DAILY_LIMIT = 5;
  const today = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD, matches the stored shape

  try {
    return await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(uid);
      const snap = await transaction.get(userRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'User not found.');
      }
      const data = snap.data() ?? {};

      if (data.isPro === true) {
        return { allowed: true, remaining: null, isPro: true };
      }

      // A new day resets the count. Done here rather than on the client so the clock that
      // matters is the server's, not one the user can change in their phone settings.
      const used = data.lastGenerationDate === today ? (data.dailyGenerations ?? 0) : 0;
      if (used >= FREE_DAILY_LIMIT) {
        return { allowed: false, remaining: 0, isPro: false };
      }

      transaction.update(userRef, {
        dailyGenerations: used + 1,
        lastGenerationDate: today
      });
      return { allowed: true, remaining: FREE_DAILY_LIMIT - (used + 1), isPro: false };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Error consuming generation:', error);
    throw new HttpsError('internal', 'Could not check your quota. Please try again.');
  }
});
