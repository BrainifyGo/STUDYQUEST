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

export const resetPassword = async (email: string) => {
  await sendPasswordResetEmail(auth, email);
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