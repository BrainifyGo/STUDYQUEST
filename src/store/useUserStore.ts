import { create } from 'zustand';
import { User } from 'firebase/auth';
import { getDailyLimit, getMonthlyLimit } from '../lib/tokenService';

import type { StudyLevel } from '../lib/studyLevel';
import type { ThemeChoice } from '../lib/themes';

export interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  xp: number;
  level: number;
  streak: number;
  isPro: boolean;
  plan?: 'free' | 'pro';
  notifications?: boolean;
  studyReminders?: boolean;
  dailyGenerations: number;
  lastGenerationDate: string;
  lastStudyDate?: string;
  studyDays: string[];
  badges: string[];
  tokensUsedThisMonth?: number;
  tokensUsedToday?: number;
  tokenResetDate?: string;
  tokenDailyResetDate?: string;
  /**
   * Year group, and set per subject. Optional: existing accounts have no level
   * until they fill one in, and everything degrades to a generic pitch.
   * See src/lib/studyLevel.ts — sets are per SUBJECT, not per student.
   */
  studyLevel?: StudyLevel;
  /**
   * How the app looks: a chosen theme, or a new one each day. Absent means the
   * default, so existing accounts see exactly what they saw before.
   * See src/lib/themes.ts.
   */
  themeChoice?: ThemeChoice;
}

// Helper function to get pro status with test override
export const getProStatus = (userData: UserData | null): boolean => {
  const testProMode = localStorage.getItem('brainify_test_pro') === 'true';
  return testProMode || userData?.isPro || false;
};

export type TimerMode = 'work' | 'shortBreak' | 'longBreak';

export const TIMER_DURATIONS: Record<TimerMode, number> = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

interface UserState {
  user: User | null;
  userData: UserData | null;
  activeView: string;
  showOnboarding: boolean;
  sidebarCollapsed: boolean;
  dailyGenerationCount: number;
  lastGenerationDate: string | null;
  showVoiceBuddy: boolean;
  showMusic: boolean;
  authLoading: boolean;
  isGuest: boolean;
  guestGenerations: number;
  timerTimeLeft: number;
  timerIsRunning: boolean;
  timerMode: TimerMode;
  timerSessionCount: number;
  tokensUsedThisMonth: number;
  tokensUsedToday: number;
  canGenerate: () => boolean;
  setTokensUsedThisMonth: (tokens: number) => void;
  setTokensUsedToday: (tokens: number) => void;
  setUser: (user: User | null) => void;
  setUserData: (userData: UserData | null) => void;
  setActiveView: (view: string) => void;
  setShowOnboarding: (show: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  incrementGenerationCount: () => void;
  resetGenerationCount: () => void;
  setShowVoiceBuddy: (show: boolean) => void;
  setShowMusic: (show: boolean) => void;
  setAuthLoading: (loading: boolean) => void;
  setIsGuest: (isGuest: boolean) => void;
  setGuestGenerations: (count: number) => void;
  setTimerTimeLeft: (timeLeft: number) => void;
  decrementTimerTimeLeft: () => void;
  setTimerIsRunning: (isRunning: boolean) => void;
  setTimerMode: (mode: TimerMode) => void;
  setTimerSessionCount: (count: number) => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  userData: null,
  activeView: 'dashboard',
  showOnboarding: false,
  sidebarCollapsed: true,
  dailyGenerationCount: 0,
  lastGenerationDate: null,
  showVoiceBuddy: false,
  showMusic: false,
  authLoading: true,
  isGuest: false,
  guestGenerations: 0,
  timerTimeLeft: 25 * 60,
  timerIsRunning: false,
  timerMode: 'work',
  timerSessionCount: 0,
  tokensUsedThisMonth: 0,
  tokensUsedToday: 0,
  canGenerate: () => {
    const { userData, isGuest } = get();
    if (isGuest) return true; // guests are gated by their own 1-generation session limit
    const isPro = getProStatus(userData);
    const usedMonth = userData?.tokensUsedThisMonth ?? 0;
    const usedToday = userData?.tokensUsedToday ?? 0;
    return usedMonth < getMonthlyLimit(isPro) && usedToday < getDailyLimit(isPro);
  },
  setTokensUsedThisMonth: (tokens) => set({ tokensUsedThisMonth: tokens }),
  setTokensUsedToday: (tokens) => set({ tokensUsedToday: tokens }),
  setUser: (user) => set({ user }),
  setUserData: (userData) => set({
    userData,
    tokensUsedThisMonth: userData?.tokensUsedThisMonth ?? 0,
    tokensUsedToday: userData?.tokensUsedToday ?? 0,
  }),
  setActiveView: (view) => set({ activeView: view }),
  setShowOnboarding: (show) => set({ showOnboarding: show }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  incrementGenerationCount: () => set((state) => ({ dailyGenerationCount: state.dailyGenerationCount + 1 })),
  resetGenerationCount: () => set({ dailyGenerationCount: 0 }),
  setShowVoiceBuddy: (show) => set({ showVoiceBuddy: show }),
  setShowMusic: (show) => set({ showMusic: show }),
  setAuthLoading: (loading) => set({ authLoading: loading }),
  setIsGuest: (isGuest) => set({ isGuest }),
  setGuestGenerations: (count) => set({ guestGenerations: count }),
  setTimerTimeLeft: (timeLeft) => set({ timerTimeLeft: timeLeft }),
  decrementTimerTimeLeft: () => set((state) => ({ timerTimeLeft: Math.max(0, state.timerTimeLeft - 1) })),
  setTimerIsRunning: (isRunning) => set({ timerIsRunning: isRunning }),
  setTimerMode: (mode) => set({ timerMode: mode }),
  setTimerSessionCount: (count) => set({ timerSessionCount: count }),
}));
