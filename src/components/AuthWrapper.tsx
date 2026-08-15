import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useUserStore, UserData } from '../store/useUserStore';
import { currentMonthKey, currentDayKey } from '../lib/tokenService';
import DashboardSkeleton from './skeletons/DashboardSkeleton';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { setUser, setUserData, userData, setAuthLoading } = useUserStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Initial fetch
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const newUserData: UserData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            xp: 0,
            level: 1,
            streak: 0,
            isPro: false,
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
          await setDoc(userRef, newUserData);
          setUserData(newUserData);
        }

        // Real-time listener
        const unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserData;
            setUserData(data);

            // Token budgets roll over on the server (`readBudget` in server.ts), not here.
            // This listener used to do it: compare the stored reset date against the browser's
            // clock and write `tokensUsedToday: 0`. Both halves were client-controlled, so the
            // budget that costs real money per call could be cleared from devtools at will.
            // The next /api/generate call performs the rollover with the Admin SDK and this
            // listener simply sees the new values arrive.
          }
          setLoading(false);
          setAuthLoading(false);
        });

        return () => unsubDoc();
      } else {
        setUser(null);
        setUserData(null);
        setLoading(false);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, [setUser, setUserData]);

  if (loading || (auth.currentUser && !userData)) {
    return <DashboardSkeleton />;
  }

  return <>{children}</>;
};
