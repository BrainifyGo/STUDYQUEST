import type { User } from 'firebase/auth';
import type { UserData } from '../store/useUserStore';
import { currentDayKey, currentMonthKey } from './tokenService';

/**
 * The users/{uid} document written when an account is first seen.
 *
 * This exists because the same payload was being built in four places and one of
 * them drifted. `firestore.rules` says:
 *
 *     (!('displayName' in data) || data.displayName is string && data.displayName.size() < 100)
 *
 * A fresh email/password account has `displayName === null` on the Firebase Auth
 * user. Writing that through means the key IS present and is NOT a string, so
 * `isValidUser()` is false and the create is refused — every time, for every
 * email signup. The three handlers in App.tsx already guarded this; AuthWrapper
 * did not, and threw an uncaught "Missing or insufficient permissions" on every
 * new account.
 *
 * So the guarantee this function makes, and that its test pins, is simple:
 * **displayName is always a non-empty string.**
 */
export function newUserProfile(user: Pick<User, 'uid' | 'email' | 'displayName' | 'photoURL'>): UserData {
  return {
    uid: user.uid,
    email: user.email,
    displayName: displayNameFor(user),
    photoURL: user.photoURL,
    xp: 0,
    level: 1,
    streak: 0,
    isPro: false,
    // Header.tsx reads `userData.plan === 'pro'` as a fallback for isPro, and the
    // handlers this replaced all wrote it. Keeping it means the document stays a
    // superset of the old shape, so nothing that reads it starts seeing undefined.
    plan: 'free',
    notifications: true,
    dailyGenerations: 0,
    lastGenerationDate: new Date().toDateString(),
    studyDays: [],
    badges: [],
    tokensUsedThisMonth: 0,
    tokensUsedToday: 0,
    tokenResetDate: currentMonthKey(),
    tokenDailyResetDate: currentDayKey(),
  };
}

/**
 * A name to show, derived the same way as App.tsx's sign-up handlers: the
 * provider's name, else the local part of the email, else a neutral fallback.
 *
 * Never returns null and never returns '' — an empty string passes the rule but
 * renders as a blank greeting, and 'Student' reads better than nothing.
 */
export function displayNameFor(
  user: Pick<User, 'email' | 'displayName'>,
): string {
  const given = (user.displayName || '').trim();
  if (given) return given.slice(0, 99);

  const local = (user.email || '').split('@')[0].trim();
  if (local) return local.slice(0, 99);

  return 'Student';
}
