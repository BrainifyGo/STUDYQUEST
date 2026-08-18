import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged, 
  User as FirebaseUser,
  GithubAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  deleteUser,
} from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  Timestamp, 
  addDoc, 
  getDocFromServer, 
  deleteDoc, 
  orderBy, 
  limit 
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

// Modern way to enable persistence using localCache settings
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

// GitHub provider
const githubProvider = new GithubAuthProvider();
githubProvider.addScope('user:email');

export const signInWithGitHub = async () => {
  try {
    const result = await signInWithPopup(auth, githubProvider);
    return result.user;
  } catch (error: any) {
    if (
      error.code === 'auth/popup-blocked' ||
      error.code === 'auth/popup-closed-by-user'
    ) {
      await signInWithRedirect(auth, githubProvider);
    }
    throw error;
  }
};

// Email/Password authentication
export const signUpWithEmail = async (
  email: string,
  password: string
) => {
  const result = await createUserWithEmailAndPassword(
    auth, email, password
  );
  return result.user;
};

export const signInWithEmail = async (
  email: string,
  password: string
) => {
  const result = await signInWithEmailAndPassword(
    auth, email, password
  );
  return result.user;
};

/**
 * Every collection that stores rows belonging to one person, keyed by `userId`.
 *
 * Deleting the profile alone used to leave all of these behind, still readable
 * by their rules and counted by nothing — a deleted account whose sessions,
 * mistakes and history were all still in the database. "Delete my account" has
 * to mean the data too.
 */
const USER_OWNED_COLLECTIONS = [
  'study_sessions', 'study_tasks', 'study_history', 'study_mistakes', 'exams',
];

/**
 * Delete the signed-in account, its data, and its login.
 *
 * ORDER MATTERS, and the old code had it backwards. It deleted the Firestore
 * profile first and then the auth account — so when the auth step failed with
 * `requires-recent-login` (which it does for anyone signed in more than a few
 * minutes, i.e. nearly everyone), the profile was already gone and the person was
 * left able to log in to an account with no data and no way to finish deleting.
 *
 * So: re-authenticate FIRST, and only start deleting once we know the last step
 * can succeed.
 *
 * @param password  Required for accounts created with an email and password.
 *                  Google and GitHub accounts re-authenticate with a popup.
 */
export const deleteMyAccount = async (password?: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in.');

  // 1. Prove it is really you, before anything is destroyed.
  const providers = user.providerData.map((p) => p.providerId);
  if (providers.includes('password')) {
    if (!password) {
      const err: any = new Error('Enter your password to confirm.');
      err.code = 'studyquest/password-required';
      throw err;
    }
    const cred = EmailAuthProvider.credential(user.email || '', password);
    await reauthenticateWithCredential(user, cred);
  } else if (providers.includes('google.com')) {
    await reauthenticateWithPopup(user, googleProvider);
  } else if (providers.includes('github.com')) {
    await reauthenticateWithPopup(user, new GithubAuthProvider());
  }
  // A phone-only account cannot be re-authenticated without another SMS round
  // trip; deleteUser below will report requires-recent-login if it needs to.

  /*
    2. THE ERASURE ITSELF RUNS ON THE SERVER.

    The client used to do this, and could never finish it:
      - it can only delete what the rules let it query;
      - it must delete the Auth user LAST (it needs to be signed in for the
        rest), so any failure in between strands a half-erased account; and
      - none of it runs at all if the account is removed from the Firebase
        console, which is how three documents holding an email address and two
        display names were left behind by accounts that no longer existed.

    The server uses the Admin SDK, which has none of those limits. The
    re-authentication above still happens here, because proving it is really you
    has to happen where the password is typed.
  */
  const idToken = await user.getIdToken(true);
  const res = await fetch('/api/delete-account', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body?.error === 'REAUTH_REQUIRED') {
      const err: any = new Error('For security, sign in again and retry.');
      err.code = 'auth/requires-recent-login';
      throw err;
    }
    // 207 means some of it went. Saying "deleted" would be a lie, and saying
    // "failed" would send them back to try again on a half-erased account.
    if (res.status === 207) {
      throw new Error('Most of your data was deleted, but some of it could not be. Tell us and we will finish it.');
    }
    throw new Error(body?.error || 'Could not delete your account. Please try again.');
  }

  // The Auth user is gone, so this session is already invalid — signing out
  // locally just clears what the browser is holding.
  await auth.signOut().catch(() => { /* already gone */ });
};

export const resetPassword = async (email: string) => {
  // Trimmed, because a trailing space from a phone keyboard's autocomplete is a
  // silent "no such account" — and Firebase does not tell you that (below).
  const clean = email.trim().toLowerCase();
  // Send the reader back to StudyQuest after they set the new password, rather
  // than to Firebase's bare "password changed" page with no way home.
  const siteUrl = import.meta.env.VITE_SITE_URL;
  if (siteUrl) {
    await sendPasswordResetEmail(auth, clean, { url: siteUrl, handleCodeInApp: false });
    return;
  }
  await sendPasswordResetEmail(auth, clean);
};

// Phone authentication
export const setupRecaptcha = (buttonId: string) => {
  return new RecaptchaVerifier(auth, buttonId, {
    size: 'invisible',
    callback: () => {
      console.log('reCAPTCHA verified');
    },
    'expired-callback': () => {
      console.warn('reCAPTCHA expired - please retry');
    }
  });
};

export const signInWithPhone = async (
  phoneNumber: string,
  recaptchaVerifier: RecaptchaVerifier
) => {
  const confirmationResult = await signInWithPhoneNumber(
    auth,
    phoneNumber,
    recaptchaVerifier
  );
  return confirmationResult;
};

// Improved Google sign-in with redirect fallback
export const signInWithGoogle = async () => {
  try {
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    });
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error('Auth error:', error.code, error.message);
    
    // If popup blocked, fall back to redirect
    if (
      error.code === 'auth/popup-blocked' ||
      error.code === 'auth/popup-closed-by-user'
    ) {
      console.log('Popup blocked, trying redirect...');
      await signInWithRedirect(auth, googleProvider);
    }
    throw error;
  }
};

// Handle redirect result on app load
export const handleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      return result.user;
    }
  } catch (error) {
    console.error('Redirect result error:', error);
  }
  return null;
};

// Error handling helper
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.warn('Firestore permission error:', JSON.stringify(errInfo));
  // Log instead of throwing to prevent crashes while Firebase rules are being fixed
}

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

// Guest data transfer function
export const transferGuestDataToUser = async (userId: string): Promise<boolean> => {
  try {
    // Read guest study kit from localStorage
    const guestStudyKit = localStorage.getItem('brainify_guest_session');
    if (!guestStudyKit) {
      return false;
    }

    const session = JSON.parse(guestStudyKit);
    if (!session.studyKit) {
      return false;
    }

    // Write to Firestore under users/{userId}/studyHistory
    const studyHistoryRef = doc(db, 'users', userId, 'studyHistory', Date.now().toString());
    await setDoc(studyHistoryRef, {
      ...session.studyKit,
      transferredAt: new Date(),
      transferredFromGuest: true
    });

    // Only clear localStorage AFTER successful Firestore write
    localStorage.removeItem('brainify_guest_session');
    return true;
  } catch (error) {
    console.error('Error transferring guest data:', error);
    // Keep localStorage on error
    return false;
  }
};

// Study streak tracking
export const updateStudyStreak = async (userId: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const data = userSnap.data();
    const currentStreak: number = data.streak || 0;
    const lastStudyDate: string | undefined = data.lastStudyDate;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let newStreak: number;
    if (lastStudyDate === today) {
      // Already studied today — keep streak as-is
      newStreak = currentStreak;
    } else if (lastStudyDate === yesterdayStr) {
      // Studied yesterday — extend the streak
      newStreak = currentStreak + 1;
    } else {
      // First study day, or the streak lapsed — restart
      newStreak = 0;
    }

    await updateDoc(userRef, {
      streak: newStreak,
      lastStudyDate: today,
    });
  } catch (error) {
    console.error('Error updating study streak:', error);
  }
};

export { 
  signInWithPopup, 
  onAuthStateChanged, 
  type FirebaseUser,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  Timestamp, 
  addDoc, 
  getDocFromServer,
  deleteDoc,
  orderBy,
  limit
};