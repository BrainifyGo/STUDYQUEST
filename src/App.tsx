import React, { useState, useEffect, useRef, lazy, Suspense, useCallback} from 'react';
import { toast } from 'sonner';
import { 
  BookOpen, 
  Layout, 
  FileText, 
  Youtube, 
  Link as LinkIcon, 
  Upload, 
  Sparkles, 
  Flame, 
  Zap, 
  CheckCircle2, 
  Copy, 
  Download, 
  RefreshCw, 
  ChevronRight, 
  Brain, 
  History, 
  LogOut, 
  Menu, 
  X,
  AlertCircle,
  Clock,
  Check,
  Lightbulb,
  RotateCcw,
  Users,
  UserPlus,
  BarChart3,
  FolderOpen,
  MessageSquareText,
  Plus,
  Star,
  ArrowRight,
  Mic,
  MoreHorizontal,
  Bot,
  Music,
  Calendar,
  Trophy,
  Target,
  Sun,
  Moon,
  VolumeX,
  Volume2,
  Github,
  Mail,
  Phone,
  Eye,
  EyeOff,
  Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import * as pdfjsLib from 'pdfjs-dist';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useUserStore } from './store/useUserStore';
import { createGuestSession, incrementGuestGeneration } from './lib/guestSession';
import { 
  auth, 
  signInWithGoogle, 
  handleRedirectResult,
  signInWithGitHub,
  signUpWithEmail,
  signInWithEmail,
  resetPassword,
  setupRecaptcha,
  signInWithPhone,
  db, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  transferGuestDataToUser,
  updateStudyStreak,
  onSnapshot,
  Timestamp, 
  addDoc, 
  getDocFromServer,
  deleteDoc,
  orderBy,
  limit,
  OperationType,
  handleFirestoreError
} from './lib/firebase';
const UpgradePage = lazy(() => import('./components/UpgradePage'));
const LegalPage = lazy(() => import('./components/LegalPage'));
const MistakesView = lazy(() => import('./components/MistakesView'));
const GameMode = lazy(() => import('./components/GameMode'));
const FocusTimer = lazy(() => import('./components/FocusTimer'));
const AITutorChat = lazy(() => import('./components/AITutorChat'));
const Library = lazy(() => import('./components/Library'));
const Analytics = lazy(() => import('./components/Analytics'));
const CollaborativeRoom = lazy(() => import('./components/CollaborativeRoom'));
import TimerEngine from './components/TimerEngine';
import { MindMap } from './components/MindMap';
const VoiceBuddy = lazy(() => import('./components/VoiceBuddy').then(m => ({ default: m.VoiceBuddy })));
const StudyMusic = lazy(() => import('./components/StudyMusic'));
const MusicBar = lazy(() => import('./components/MusicBar'));
const FriendsView = lazy(() => import('./components/FriendsView'));
import { ProGate } from './components/ProGate';
import { canSaveKit, planOf, FREE_SAVED_KITS } from './lib/entitlements';
import SnapInput from './components/SnapInput';
import { GuestGuard } from './components/GuestGuard';
const ExpandModal = lazy(() => import('./components/ExpandModal'));
import { Logo } from './components/Logo';
const StudyPlanner = lazy(() => import('./components/StudyPlanner'));
const Leaderboard = lazy(() => import('./components/Leaderboard'));
import { Navigation } from './components/Navigation';
const SettingsView = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from 'sonner';
import { AutoUpdateBanner } from './components/AutoUpdateBanner';
import { checkForUpdates, performUpdate, APP_VERSION } from './lib/updateChecker';
import { usePdfUpload } from './hooks/usePdfUpload';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { YoutubeTranscript } from 'youtube-transcript';
import { Howl } from 'howler';
import { callAI } from './lib/aiService';
import {
  buildStudyPrompt, isJsonMode, parseJsonReply, normaliseFlashcards, normaliseQuiz,
} from './lib/studyPrompts';
import { getMonthlyLimit, getDailyLimit, kitsLeftToday, kitsPerDay } from './lib/tokenService';
import { limitAdvice } from './lib/tokenService';
import { levelFromXP, levelProgress } from './lib/progress';
import { publishProfile, publishStats } from './lib/friends';
import { describeAuthError } from './lib/authErrors';
import { recordMistake, retireMistake, listMistakes, asQuiz, type Mistake } from './lib/mistakes';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Helper for local date string (YYYY-MM-DD) to avoid timezone issues
const localDateStr = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

// --- Types ---
export type StudyMode = 'summary' | 'flashcards' | 'quiz' | 'explain' | 'mindmap';
type InputMethod = 'text' | 'youtube' | 'article' | 'pdf' | 'snap';

export interface Flashcard {
  question: string;
  answer: string;
  nextReview?: string; // SRS
  interval?: number; // SRS
  easeFactor?: number; // SRS
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface MindMapData {
  nodes: { id: string; group: number }[];
  links: { source: string; target: string; value: number }[];
}

export interface OutputState {
  summary?: string;
  flashcards?: Flashcard[];
  quiz?: QuizQuestion[];
  explain?: string;
  mindmap?: MindMapData;
}

// --- Constants ---
const GEMINI_MODEL = "gemini-2.0-flash-lite";

const SUGGESTIONS = [
  "Quantum Physics for beginners",
  "The French Revolution key events",
  "How photosynthesis works in plants",
  "Summary of the Great Gatsby",
  "Basics of React Hooks"
];

const LOADING_STATUSES = [
  "Reading content...",
  "Extracting key ideas...",
  "Building your output...",
  "Almost ready..."
];

// Force dark mode immediately
document.documentElement.classList.add('dark');

export default function App() {
  // --- Auth State ---
  const [authTab, setAuthTab] = useState<'email' | 'phone'>('email');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);

  // --- App State ---
  const [inputMethod, setInputMethod] = useState<InputMethod>('text');
  const [inputText, setInputText] = useState('');
  const [studyMode, setStudyMode] = useState<StudyMode>('summary');
  const [detectedSubject, setDetectedSubject] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStatusIndex, setLoadingStatusIndex] = useState(0);
  const [currentModel, setCurrentModel] = useState('');
  const [outputModes, setOutputModes] = useState<OutputState>({});
  const [activeOutputTab, setActiveOutputTab] = useState<StudyMode>('summary');
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { 
    activeView, 
    setActiveView, 
    showVoiceBuddy, 
    setShowVoiceBuddy, 
    showMusic, 
    setShowMusic,
    userData,
    setUserData,
    user,
    setUser,
    sidebarCollapsed,
    setSidebarCollapsed,
    dailyGenerationCount,
    incrementGenerationCount,
    resetGenerationCount,
    authLoading,
    isGuest,
    setAuthLoading,
    setIsGuest,
    setGuestGenerations,
    timerIsRunning,
    timerTimeLeft
  } = useUserStore();
  const [showTutor, setShowTutor] = useState(false);
  const [collabRoomId, setCollabRoomId] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isConfigMissing, setIsConfigMissing] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [isExtractingPDF, setIsExtractingPDF] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showLimitAlert, setShowLimitAlert] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);

  /*
    THE LEVEL-UP POPUP HAD NO WAY OUT.

    It was dismissed by a setTimeout that lived inside the XP-on-generate blocks
    — and those blocks were removed when XP became Arcade-only, which took the
    only `setShowLevelUp(false)` in the file with them. The remaining caller
    turned it on and nothing ever turned it off, so it sat there for the rest of
    the session. My regression, and this is the fix: the timer belongs with the
    popup, not with whatever happened to raise it.
  */
  useEffect(() => {
    if (!showLevelUp) return;
    const t = setTimeout(() => setShowLevelUp(false), 4000);
    return () => clearTimeout(t);
  }, [showLevelUp]);
  const [musicDropdownOpen, setMusicDropdownOpen] = useState(false);
  const [ambientSounds, setAmbientSounds] = useState<Record<string, { active: boolean, volume: number, howl: Howl | null }>>({
    rain: { active: false, volume: 0.5, howl: null },
    cafe: { active: false, volume: 0.5, howl: null },
    forest: { active: false, volume: 0.5, howl: null },
    whiteNoise: { active: false, volume: 0.5, howl: null },
    lofi: { active: false, volume: 0.5, howl: null },
    ocean: { active: false, volume: 0.5, howl: null },
    fire: { active: false, volume: 0.5, howl: null },
    night: { active: false, volume: 0.5, howl: null }
  });
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [currentRadio, setCurrentRadio] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const { uploadPdf, progress: pdfProgress, isProcessing: isPdfProcessing, extractedText: pdfExtractedText } = usePdfUpload();

  // One source of truth for the sidebar level bar, which used to run its own
  // (wrong) sums. See src/lib/progress.ts.
  const sidebarProgress = levelProgress(userData?.xp || 0);


  /*
    COLLAPSING IS A DESKTOP IDEA.

    `sidebarCollapsed` was applied at every width, so on a phone the menu could
    open as an 80px strip with every label hidden — which reads as "the sidebar
    does not open". Entering a study room sets collapsed, so anyone who had
    opened a room once got that strip from then on. `railCollapsed` is the value
    the sidebar actually draws with, and it is false on mobile whatever the
    stored preference says.
  */
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const railCollapsed = isDesktop && sidebarCollapsed;

  /*
    A STUDY ROOM TAKES THE SCREEN ON A PHONE, NOT ON A DESKTOP.

    Hiding the app chrome was the right call for mobile — the room draws its own
    header and there is no width to share. On a desktop it went too far: you lost
    the sidebar and the header, so leaving a room meant hunting for the room's own
    close button rather than just clicking Dashboard. There is plenty of room for
    both on a laptop.
  */
  const inRoom = activeView === 'collab';
  const roomTakesScreen = inRoom && !isDesktop;


  /** The mobile tools sheet. Header-local, so it stays out of the store. */
  const [showTools, setShowTools] = useState(false);

  /*
    Hide the header on the way down, bring it back on the way up.

    A sticky header that never moves costs the same strip of every screen
    forever, which on a phone is about a fifth of the page. The threshold stops
    it flickering: a couple of pixels of scroll jitter should not toggle it, and
    it always returns near the top.
  */
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const [headerHidden, setHeaderHidden] = useState(false);

  const handleContentScroll = useCallback(() => {
    const y = scrollAreaRef.current?.scrollTop ?? 0;
    const delta = y - lastScrollY.current;
    if (Math.abs(delta) < 8) return;
    setHeaderHidden(y > 80 && delta > 0);
    lastScrollY.current = y;
  }, []);

  /*
    ON A MOUSE, THE HEADER COMES BACK ON HOVER.

    Scrolling up to retrieve it is fine on a phone, where scrolling is how you
    move anyway. On a desktop it means scrolling the page just to reach the
    Upgrade button, which is the wrong trade. A thin strip along the top of the
    window brings it back, so it is out of the way while you read and one
    movement away when you want it.

    Pointer-based rather than a breakpoint: a touch device that happens to be
    wide should keep the scroll behaviour, because it has no hover to offer.
  */
  const [headerHovered, setHeaderHovered] = useState(false);
  const headerVisible = !headerHidden || headerHovered;

  /*
    Get out of the way in a study room.

    A room is its own workspace — participants, chat, a shared kit — and it does
    not need the app's navigation competing for the left edge of a laptop screen.
    The sidebar collapses on the way in and is restored to whatever it was on the
    way out, so someone who likes it collapsed does not find it expanded again.
  */
  const sidebarBeforeRoom = useRef<boolean | null>(null);
  useEffect(() => {
    if (activeView === 'collab') {
      if (sidebarBeforeRoom.current === null) {
        sidebarBeforeRoom.current = sidebarCollapsed;
        setSidebarCollapsed(true);
      }
    } else if (sidebarBeforeRoom.current !== null) {
      setSidebarCollapsed(sidebarBeforeRoom.current);
      sidebarBeforeRoom.current = null;
    }
  }, [activeView, sidebarCollapsed, setSidebarCollapsed]);

  /**
   * Bank XP earned in the arcade.
   *
   * Goes through the SAME level curve as everything else — a separate currency
   * would make the arcade feel like a different app bolted on. Guests have
   * nowhere to save it, so it is skipped rather than half-applied.
   */
  const awardArcadeXP = useCallback(async (earned: number) => {
    if (!earned || earned <= 0 || !user || !userData) return;

    const newXp = (userData.xp || 0) + earned;
    const newLevel = levelFromXP(newXp);
    const levelledUp = newLevel > (userData.level || 1);

    try {
      await updateDoc(doc(db, 'users', user.uid), { xp: newXp, level: newLevel });
      setUserData({ ...userData, xp: newXp, level: newLevel });

      // Mirror it where friends can see it. Free feature, on purpose: seeing
      // where your friends are is the reason to add one.
      publishStats({
        displayName: userData.displayName || user.email?.split('@')[0] || 'Student',
        level: newLevel, xp: newXp,
        streak: userData.streak || 0,
        sessions: (userData.studyDays || []).length,
      });
      if (levelledUp) {
        setShowLevelUp(true);
        toast.success(`Level up — you're now level ${newLevel}`);
      } else {
        toast.success(`+${earned} XP`);
      }
    } catch (err) {
      // Losing the XP is annoying; losing the round to an error would be worse.
      console.warn('[arcade] could not save XP:', err);
    }
  }, [user, userData, setUserData]);

  // Give each view its own <title>. Without a router every view shared one title, which made
  // browser tabs, history and bookmarks all read "StudyQuest".
  useDocumentTitle(activeView);
  const [dueFlashcardsCount, setDueFlashcardsCount] = useState(0);
  const [studyGoal, setStudyGoal] = useState(2); // Default 2 hours daily
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [showExpandModal, setShowExpandModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('brainify_onboarded');
  });

  // The real, server-enforced budget check (see server.ts verifyUserAndBudget)
  const isProUser = localStorage.getItem('brainify_test_pro') === 'true' || userData?.isPro || false;
  const dailyTokenLimitReached = (userData?.tokensUsedToday || 0) >= getDailyLimit(isProUser);

  // --- Theme Effect ---
  useEffect(() => {
    const savedTheme = localStorage.getItem('brainify_theme') as 'dark' | 'light' | null;
    // Only use saved theme if it was explicitly set to light by user
    if (savedTheme === 'light') {
      setTheme('light');
    } else {
      setTheme('dark');
      localStorage.setItem('brainify_theme', 'dark');
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('brainify_theme', theme);
  }, [theme]);

  // --- Update Checker Effect ---
  useEffect(() => {
    const check = async () => {
      const update = await checkForUpdates();
      if (update) {
        const dismissed = localStorage.getItem('brainify_dismissed_version');
        if (dismissed !== update.version) {
          setUpdateAvailable(update);
          setShowUpdateBanner(true);
        }
      }
    };
    check();
    // Check every hour
    const interval = setInterval(check, 3600000);
    return () => clearInterval(interval);
  }, []);

  // --- Pro Test Key Effect ---
  useEffect(() => {
    const handleKeySequence = () => {
      const keys: string[] = [];
      return (e: KeyboardEvent) => {
        keys.push(e.key);
        if (keys.length > 6) keys.shift();
        
        // Secret sequence: type "prokey" to toggle pro
        if (keys.join('') === 'prokey') {
          const current = localStorage.getItem('brainify_test_pro');
          const newValue = current === 'true' ? 'false' : 'true';
          localStorage.setItem('brainify_test_pro', newValue);
          
          // Show toast
          if (newValue === 'true') {
            toast.success('Pro test mode ON - refresh to apply');
          } else {
            toast.success('Pro test mode OFF - refresh to apply');
          }
        }
      };
    };
    
    const handler = handleKeySequence();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // --- Global Mute Effect ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && e.target instanceof HTMLElement && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        setIsMuted(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isMuted) {
      // Logic to mute all howls
      Object.values(ambientSounds).forEach(s => s.howl?.mute(true));
      // Show toast
      console.log('🔇 Muted');
    } else {
      Object.values(ambientSounds).forEach(s => s.howl?.mute(false));
      console.log('🔊 Unmuted');
    }
  }, [isMuted, ambientSounds]);

  // --- Usage Alert Effect ---
  useEffect(() => {
    if (dailyTokenLimitReached) {
      setShowLimitAlert(true);
    }
  }, [dailyTokenLimitReached]);

  // --- Smart Options ---
  const [options, setOptions] = useState({
    shorter: false,
    examFocused: false,
    bulletPoints: true
  });

  // --- Refs ---
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputSectionRef = useRef<HTMLDivElement>(null);
  const isGeneratingRef = useRef(false);

  const handleInputMethodChange = (method: InputMethod) => {
    if (method !== inputMethod) {
      setInputMethod(method);
      setInputText('');
      setCharCount(0);
    }
  };

  // --- Auth & Real-time Sync ---
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (authLoading) {
        setAuthLoading(false);
      }
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeout);
      setAuthLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Check for Stripe success
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('success') === 'true') {
          try {
            await updateDoc(doc(db, 'users', firebaseUser.uid), { isPro: true });
            setShowUpgradeSuccess(true);
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch (err) {
            console.error("Failed to update Pro status:", err);
          }
        }

        // Real-time user data sync
        const userRef = doc(db, 'users', firebaseUser.uid);
        const unsubUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as any;
            setUserData(data);
            
            // Sync daily count if it's a new day
            const today = localDateStr();
            if (data.lastGenerationDate !== today) {
              resetGenerationCount();
              updateDoc(userRef, { dailyGenerations: 0, lastGenerationDate: today });
            }
          } else {
            const newUserData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              isPro: false,
              dailyGenerations: 0,
              lastGenerationDate: localDateStr(),
              xp: 0,
              level: 1,
              streak: 0,
              studyDays: [],
              badges: []
            };
            setDoc(userRef, newUserData);
            setUserData(newUserData);
          }
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        });

        // Mirror the two searchable fields into public_profiles, so friends can
        // find this account. Done on every sign-in rather than only at creation,
        // so accounts that existed before friends did get one too.
        publishProfile(
          firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Student',
          firebaseUser.email
        );

        setAuthLoading(false);
        return () => unsubUser();
      } else {
        setUser(null);
        setUserData(null);
        setHistory([]);
        resetGenerationCount();
      }
      setAuthLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, 'study_history'), where('user_id', '==', user.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const historyData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any[];
        setHistory(historyData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'study_history');
      });
      return () => unsubscribe();
    }
  }, [user]);

  // Loading status cycler
  useEffect(() => {
    let interval: any;
    if (isGenerating) {
      interval = setInterval(() => {
        setLoadingStatusIndex((prev) => (prev + 1) % LOADING_STATUSES.length);
      }, 800);
    } else {
      setLoadingStatusIndex(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Subject detection debounce
  useEffect(() => {
    if (inputText.length < 50) {
      setDetectedSubject('');
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const res = await callAI(`Detect the main subject of this text in 3 words or less. Text: ${inputText.substring(0, 500)}`);
        if (res && res.length < 50) {
          // A CHARACTER CLASS, NOT AN ALTERNATION — this was silently corrupting the result.
          // `[📘 Detected:|Subject:]` doesn't strip those *phrases*; it strips every one of
          // those *characters* individually, anywhere in the string. So a detected subject of
          // "Cell Biology" came back as "CllBiology", with the e, t, c, d, S, u, b, j and
          // spaces eaten. Alternation needs `|` outside a class.
          setDetectedSubject(res.replace(/📘|Detected:|Subject:/g, '').trim());
        }
      } catch (e) {
        console.error("Subject detection failed", e);
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [inputText]);

  const calculateDueCards = () => {
    const today = localDateStr();
    let count = 0;
    history.forEach(item => {
      if (item.outputModes?.flashcards) {
        item.outputModes.flashcards.forEach((card: Flashcard) => {
          if (card.nextReview && card.nextReview <= today) {
            count++;
          }
        });
      }
    });
    setDueFlashcardsCount(count);
  };

  useEffect(() => {
    calculateDueCards();
  }, [history]);

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail === 'dashboard') setActiveView('dashboard');
    };
    window.addEventListener('brainify:navigate', handler);
    return () => window.removeEventListener('brainify:navigate', handler);
  }, []);

  // --- Functions ---
  const getStreak = () => {
    const dates = JSON.parse(localStorage.getItem('brainify_study_days') || '[]');
    if (dates.length === 0) return 0;
    
    // Sort unique dates descending
    const sortedDates = Array.from(new Set(dates)).sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime()) as string[];
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // If the most recent study date is not today or yesterday, streak is broken
    if (sortedDates[0] !== today && sortedDates[0] !== yesterdayStr) return 0;
    
    let count = 0;
    const current = new Date(sortedDates[0]);   // mutated via setDate, never reassigned
    
    for (let i = 0; i < sortedDates.length; i++) {
      const dayStr = new Date(sortedDates[i]).toISOString().split('T')[0];
      const expectedStr = current.toISOString().split('T')[0];
      
      if (dayStr === expectedStr) {
        count++;
        current.setDate(current.getDate() - 1);
      } else {
        break;
      }
    }
    return count;
  };

  const updateStreak = () => {
    const today = localDateStr();
    const dates = JSON.parse(localStorage.getItem('brainify_study_days') || '[]');
    if (!dates.includes(today)) {
      dates.push(today);
      localStorage.setItem('brainify_study_days', JSON.stringify(dates));
    }
  };

  const completeOnboarding = (withExample = false) => {
    localStorage.setItem('brainify_onboarded', 'true');
    setShowOnboarding(false);
    if (withExample) {
      setInputText("Mitochondria are the powerhouse of the cell. They produce ATP through a process called cellular respiration. This involves three main stages: glycolysis (in the cytoplasm), the Krebs cycle (in the mitochondrial matrix), and oxidative phosphorylation (on the inner mitochondrial membrane). The electron transport chain uses NADH and FADH2 to pump protons across the membrane, creating a gradient that drives ATP synthase to produce ATP from ADP and phosphate.");
      setCharCount(450);
      setInputMethod('text');
      setStudyMode('summary');
      setTimeout(() => inputSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    }
  };

  const tryExample = () => {
    setInputMethod('text');
    setInputText("Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy that, through cellular respiration, can later be released to fuel the organism's activities. This chemical energy is stored in carbohydrate molecules, such as sugars and starches, which are synthesized from carbon dioxide and water.");
    setCharCount(345);
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      // This used to only console.error, so a failed sign-in looked like a dead
      // button. Say what went wrong, on screen, where the person clicking is.
      console.error('Login failed', err);
      const { message, isSetupProblem } = describeAuthError(err);
      toast.error(message, {
        // A configuration fault needs reading, not glancing at.
        duration: isSetupProblem ? 12000 : 5000,
      });
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleOpenLibraryItem = (item: any) => {
    setInputText(item.content);
    setDetectedSubject(item.subject);
    setStudyMode(item.mode);
    setOutputModes(item.outputModes || {});
    setActiveOutputTab(item.mode);
    setActiveView('dashboard');
    setCurrentHistoryId(item.id);
    
    // Scroll to output
    setTimeout(() => {
      const outputEl = document.getElementById('study-output');
      if (outputEl) {
        outputEl.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  const handleJoinRoom = () => {
    if (!joinRoomId.trim()) return;
    setCollabRoomId(joinRoomId);
    setActiveView('collab');
    setShowJoinModal(false);
    setJoinRoomId('');
  };

  const handleCreateRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCollabRoomId(newRoomId);
    setActiveView('collab');
  };

  // --- Authentication Handlers ---
  const handleEmailAuth = async () => {
    try {
      if (isSignUp) {
        if (password.length < 6) {
          toast.error('Password must be at least 6 characters.');
          return;
        }
        if (password !== confirmPassword) {
          toast.error('Passwords do not match.');
          return;
        }
        await signUpWithEmail(email, password);
        toast.success('Account created. Welcome to StudyQuest.');
      } else {
        await signInWithEmail(email, password);
        toast.success('Welcome back to StudyQuest.');
      }
      
      // Create user document if first time
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (!userDoc.exists()) {
          const userData = {
            // REQUIRED by isValidUser() in firestore.rules, which checks
            // hasAll(['uid', 'email']). Without it the account is created in
            // Firebase Auth and then this write is refused, so signing up
            // appears to fail while leaving a half-made account behind.
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            displayName: auth.currentUser.displayName || email.split('@')[0],
            plan: 'free',
            xp: 0,
            level: 1,
            streak: 0,
            studyDays: [],
            badges: [],
            createdAt: new Date(),
            notifications: true
          };
          await setDoc(doc(db, 'users', auth.currentUser.uid), userData);
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);

      // This was a hand-written if/else over six codes, and everything it did not
      // list fell through to "Sign in failed. Please try again." — which is what a
      // misconfigured deployment looked like, so nobody could tell a wrong
      // password from a site that was never authorised for sign-in.
      if (error?.code === 'auth/account-exists-with-different-credential') {
        toast.error('An account exists with this email. Try signing in with Google.');
      } else if (error?.code === 'permission-denied') {
        // Auth succeeded but the Firestore write did not, which leaves a real
        // account with no profile behind it. Worth saying out loud.
        toast.error(
          "Your account was created but your profile couldn't be saved. Try signing in — " +
          'if it keeps happening, tell us.',
          { duration: 10000 }
        );
      } else {
        const { message, isSetupProblem } = describeAuthError(error);
        toast.error(message, { duration: isSetupProblem ? 12000 : 5000 });
      }
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      toast.error('Please enter your email address.');
      return;
    }
    
    try {
      await resetPassword(email);
      /*
        Deliberately not "sent! check your inbox".

        Firebase has email-enumeration protection on by default, so this call
        succeeds *even when no account exists for that address* — that is the
        point of it, it stops people probing for who has an account. It also
        sends nothing to an account created with Google sign-in, because such an
        account has no password to reset. Both cases previously showed a
        confident "sent!" and then nothing arrived, which is exactly what Daniel
        saw. So the message says what is actually true, and names the two reasons
        an email would not turn up.
      */
      toast.success('If that email has a StudyQuest password, a reset link is on its way. Check your spam folder.');
      setShowPasswordReset(false);
    } catch (error: any) {
      const { message } = describeAuthError(error);
      toast.error(message);
      console.error('Password reset failed:', error?.code, error);
    }
  };

  const handleGitHubLogin = async () => {
    try {
      await signInWithGitHub();
      toast.success('Welcome back to StudyQuest.');
      
      // Create user document if first time
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (!userDoc.exists()) {
          const userData = {
            // Required by isValidUser() in firestore.rules — see the note on the
            // email sign-up path above. Missing it means the write is refused.
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            displayName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0],
            plan: 'free',
            xp: 0,
            level: 1,
            streak: 0,
            studyDays: [],
            badges: [],
            createdAt: new Date(),
            notifications: true
          };
          await setDoc(doc(db, 'users', auth.currentUser.uid), userData);
        }
      }
    } catch (error: any) {
      if (error.code === 'auth/account-exists-with-different-credential') {
        toast.error('An account exists with this email. Try signing in with Google.');
      } else {
        toast.error('GitHub sign in failed. Try again.');
      }
    }
  };

  const handlePhoneAuth = async () => {
    if (!phoneNumber) {
      toast.error('Please enter your phone number.');
      return;
    }

    try {
      const verifier = setupRecaptcha('phone-send-button');
      const result = await signInWithPhone(phoneNumber, verifier);
      setConfirmationResult(result);
      toast.success('Code sent! Check your messages');
    } catch (error: any) {
      if (error.code === 'auth/invalid-phone-number') {
        toast.error('Invalid phone number. Include country code.');
      } else if (error.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please wait and try again.');
      } else {
        toast.error('Failed to send code. Please try again.');
      }
    }
  };

  const handlePhoneCodeVerify = async () => {
    if (!confirmationResult || !phoneCode) {
      toast.error('Please enter the verification code.');
      return;
    }

    try {
      await confirmationResult.confirm(phoneCode);
      toast.success('Phone verified. Welcome to StudyQuest.');
      
      // Create user document if first time
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (!userDoc.exists()) {
          const userData = {
            // Required by isValidUser() in firestore.rules — see the note on the
            // email sign-up path above. Missing it means the write is refused.
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            displayName: auth.currentUser.displayName || 'User',
            plan: 'free',
            xp: 0,
            level: 1,
            streak: 0,
            studyDays: [],
            badges: [],
            createdAt: new Date(),
            notifications: true
          };
          await setDoc(doc(db, 'users', auth.currentUser.uid), userData);
        }
      }
    } catch (error: any) {
      if (error.code === 'auth/code-expired') {
        toast.error('Code expired. Please request a new one.');
      } else {
        toast.error('Invalid code. Try again.');
      }
    }
  };

  const handleGuestMode = () => {
    const { setIsGuest, setAuthLoading, setGuestGenerations } = useUserStore.getState();
    createGuestSession();
    setIsGuest(true);
    setAuthLoading(false);
    setGuestGenerations(0);
    toast.success('Welcome! You have 1 free study kit generation.');
  };

  const generateStudyKit = async () => {
  setIsGenerating(true);
  setCurrentModel('');

  try {
    const testProMode = localStorage.getItem('brainify_test_pro') === 'true';
    const userPlan = testProMode || userData?.isPro ? 'pro' : 'free';

    // One prompt per mode, and options that are instructions rather than a line
    // of trivia the model was free to ignore. See src/lib/studyPrompts.ts for
    // what the old single prompt actually did to flashcards.
    const prompt = buildStudyPrompt({
      mode: studyMode,
      content: inputText,
      options,
      isPro: userPlan === 'pro',
      source: inputMethod,
    });

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        plan: userPlan,
        userId: user?.uid || 'guest'
      })
    });

    const { result } = await response.json();

    let parsedResult = result;
    if (isJsonMode(studyMode)) {
      const data = parseJsonReply(result);
      parsedResult = studyMode === 'flashcards' ? normaliseFlashcards(data)
                   : studyMode === 'quiz' ? normaliseQuiz(data)
                   : data;
    }

    const newOutput = { ...outputModes, [studyMode]: parsedResult };
    setOutputModes(newOutput);
    setActiveOutputTab(studyMode);
    
    // Update usage and streak in Firestore
    if (user && userData) {
      const today = localDateStr();
      const isNewDay = userData.lastGenerationDate !== today;
      const newCount = isNewDay ? 1 : (userData.dailyGenerations || 0) + 1;
      
      const studyDays = userData.studyDays || [];
      const newStudyDays = studyDays.includes(today) ? studyDays : [...studyDays, today];

      const userRef = doc(db, 'users', user.uid);
      
      // Also update localStorage for requested streak tracker
      updateStreak();
      
      /*
        NO XP HERE. XP is the Arcade's currency now.

        Generating a study kit used to pay 20 XP, which meant the fastest way to
        level up was to paste text and never read it. That is levelling for using
        the app rather than for learning anything, and it makes the level number
        worthless as a measure. Levels are now earned only by answering questions
        in the Arcade, where being right is the only thing that pays.
        Streaks and study days still count — turning up is still worth recording.
      */
      await updateDoc(userRef, {
        dailyGenerations: newCount,
        lastGenerationDate: today,
        studyDays: newStudyDays,
      });

      // Check for usage limit (free users only)
      if (!userData.isPro && newCount >= 10) {
        setShowLimitAlert(true);
      }
    }
  } catch (error: any) {
    toast.error(
      error.message || 'Generation failed. Please try again.'
    );
  } finally {
    setIsGenerating(false);
    setCurrentModel('');
  }
};

  const extractTextFromPDF = async (file: File) => {
    setIsExtractingPDF(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => (item as any).str).join(' ');
        fullText += pageText + '\n';
      }
      
      setInputText(fullText);
      setCharCount(fullText.length);
      setDetectedSubject(file.name.replace('.pdf', ''));
    } catch (err) {
      console.error('Error extracting PDF:', err);
      // alert('Failed to extract text from PDF. Please try a different file.');
    } finally {
      setIsExtractingPDF(false);
    }
  };

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  };

  const fetchYoutubeTranscript = async (url: string) => {
    const videoId = extractYoutubeId(url);
    if (!videoId) {
      throw new Error("Invalid YouTube URL. Please check the link.");
    }

    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      return transcript.map(t => t.text).join(' ');
    } catch (err) {
      console.error("Transcript fetch error:", err);
      throw new Error("Could not fetch transcript. Make sure the video has captions enabled and is publicly accessible.");
    }
  };

  const fetchArticleContent = async (url: string) => {
    try {
      const encodedUrl = encodeURIComponent(url);
      const response = await fetch(`https://api.allorigins.win/get?url=${encodedUrl}`);
      if (!response.ok) throw new Error("Network response was not ok");
      
      const data = await response.json();
      const parser = new DOMParser();
      const doc = parser.parseFromString(data.contents, 'text/html');
      
      // Remove unwanted elements
      const scripts = doc.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript');
      scripts.forEach(s => s.remove());
      
      // Extract main content
      const content = doc.querySelector('article, main, .content, .post-content') || doc.body;
      const text = Array.from(content.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))
        .map(el => el.textContent?.trim())
        .filter(t => t && t.length > 20)
        .join('\n\n');
        
      if (!text || text.length < 100) {
        throw new Error("Could not extract enough text from this article.");
      }
      
      return text;
    } catch (err) {
      console.error("Article fetch error:", err);
      throw new Error("Could not read this URL. Try pasting the text directly.");
    }
  };

  const handleGenerate = async () => {
    // Prevent duplicate generation calls
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    
    // Debounce: prevent duplicate requests within 2 seconds
    const now = Date.now();
    if (now - lastRequestTime < 2000) {
      isGeneratingRef.current = false;
      return;
    }
    setLastRequestTime(now);

    if (dailyTokenLimitReached) {
      setShowLimitAlert(true);
      return;
    }

    let finalInputText = inputText;

    if (inputMethod === 'youtube' && inputText.startsWith('http')) {
      setIsGenerating(true);
      setLoadingStatusIndex(0);
      try {
        const transcript = await fetchYoutubeTranscript(inputText);
        finalInputText = transcript;
        setInputText(transcript);
        setCharCount(transcript.length);
      } catch (err: any) {
        setIsGenerating(false);
        console.error(err.message);
        // Show toast error here
        return;
      }
    } else if (inputMethod === 'article' && inputText.startsWith('http')) {
      setIsGenerating(true);
      setLoadingStatusIndex(0);
      try {
        const articleText = await fetchArticleContent(inputText);
        finalInputText = articleText;
        setInputText(articleText);
        setCharCount(articleText.length);
      } catch (err: any) {
        setIsGenerating(false);
        console.error(err.message);
        // Show toast error here
        return;
      }
    }

    if (!finalInputText.trim()) return;

    setIsGenerating(true);
    try {
      const isUrlInput = inputMethod === 'youtube' || inputMethod === 'article';
      
      /*
        Both generate paths now share ONE prompt builder.

        This path used to carry its own hand-written system prompt with a fixed
        OUTPUT FORMAT block (Key Concepts / Summary / Quick Facts / Exam Tips)
        that applied to every mode. Flashcards were asked for that Markdown and
        then JSON.parsed, which is why the flashcard tab never filled, and the
        three Smart Options were passed as `Shorter: true` with nothing telling
        the model what that meant — so every option produced the same summary.
      */
      const testProMode = localStorage.getItem('brainify_test_pro') === 'true';
      const userPrompt = buildStudyPrompt({
        mode: studyMode,
        content: finalInputText,
        options,
        isPro: testProMode || userData?.isPro || false,
        source: inputMethod,
      });

      const result = await callAI(userPrompt);
      if (!result) throw new Error('Empty response from AI');

      let parsedResult: any = result;
      if (isJsonMode(studyMode)) {
        const data = parseJsonReply(result);
        parsedResult = studyMode === 'flashcards' ? normaliseFlashcards(data)
                     : studyMode === 'quiz' ? normaliseQuiz(data)
                     : data;
      }

      const newOutput = { ...outputModes, [studyMode]: parsedResult };
      setOutputModes(newOutput);
      setActiveOutputTab(studyMode);
      
      // Update usage and streak in Firestore
      if (user && userData) {
        const today = localDateStr();
        const isNewDay = userData.lastGenerationDate !== today;
        const newCount = isNewDay ? 1 : (userData.dailyGenerations || 0) + 1;
        
        const studyDays = userData.studyDays || [];
        const newStudyDays = studyDays.includes(today) ? studyDays : [...studyDays, today];

        const userRef = doc(db, 'users', user.uid);
        
        // Also update localStorage for requested streak tracker
        updateStreak();
        
        // No XP for generating — see the note on the other generate path. Badges
        // that measure turning up rather than levelling still apply.
        const newBadges = [...(userData.badges || [])];
        if (newStudyDays.length >= 7 && !newBadges.includes('Weekly Warrior')) newBadges.push('Weekly Warrior');

        await updateDoc(userRef, {
          dailyGenerations: newCount,
          lastGenerationDate: today,
          studyDays: newStudyDays,
          badges: newBadges
        });

        // Update local state immediately for better UX
        setUserData({
          ...userData,
          dailyGenerations: newCount,
          lastGenerationDate: today,
          studyDays: newStudyDays,
          badges: newBadges
        });
      } else {
        // For non-logged in users, still update localStorage streak
        updateStreak();
        const newCount = (userData?.dailyGenerations || 0) + 1;
        incrementGenerationCount();
        const today = localDateStr();
        localStorage.setItem('brainify_guest_usage', JSON.stringify({ count: newCount, date: today }));
      }

      const title = inputText.slice(0, 40).trim() + (inputText.length > 40 ? "..." : "");
      const historyItem = {
        subject: title,
        mode: studyMode,
        content: inputText,
        outputModes: newOutput,
        created_at: new Date().toISOString()
      };

      // Cloud Save
      if (user) {
        try {
          /*
            THE FREE SAVED-KIT ALLOWANCE.

            A free account keeps its most recent FREE_SAVED_KITS; making a new
            one past that retires the oldest rather than refusing to generate.
            Refusing would punish the person for using the app, which is the
            opposite of what a free tier is for — and the kit they wanted is the
            new one.

            Enforced in the client only, and that is deliberate rather than an
            oversight: it costs us nothing to store, so the worst case of a
            bypass is somebody keeping their own notes. The gates that cost money
            are on the server. See src/lib/entitlements.ts.
          */
          if (!canSaveKit(planOf(userData?.isPro), history.length)) {
            const oldest = [...history].sort(
              (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
            )[0];
            if (oldest?.id) {
              await deleteDoc(doc(db, 'study_history', String(oldest.id))).catch(() => {});
              setHistory((prev) => prev.filter((h) => h.id !== oldest.id));
              toast.info(`Free accounts keep ${FREE_SAVED_KITS} kits — your oldest one was removed to make room.`);
            }
          }

          const docRef = await addDoc(collection(db, 'study_history'), {
            user_id: user.uid,
            ...historyItem
          });
          setCurrentHistoryId(docRef.id);

          // Also track as a study session for analytics
          await addDoc(collection(db, 'study_sessions'), {
            userId: user.uid,
            date: new Date().toISOString(),
            duration: 0.5, // Default estimate per generation
            score: 80, // Default starting score
            subject: title
          });

          await updateStudyStreak(user.uid);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'study_history');
        }
      }

    } catch (err: any) {
      console.error(err);
      if (err?.message === 'TOKEN_LIMIT_EXCEEDED' ||
          err?.message === 'TOKEN_MONTHLY_LIMIT_EXCEEDED') {
        const advice = limitAdvice(err.message, !!userData?.isPro);
        toast.error(advice.title, {
          description: advice.description,
          action: userData?.isPro ? undefined : {
            label: 'Upgrade',
            onClick: () => setActiveView('upgrade'),
          },
        });
      }
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
    }
  };

  const deleteHistoryItem = async (id: string | number) => {
    if (user) {
      try {
        await deleteDoc(doc(db, 'study_history', String(id)));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `study_history/${id}`);
      }
    }
  };

  const handleOpenExpand = () => {
    if (isGuest) {
      toast.error('Sign up to unlock Go Deeper — dive into your study kit with AI chat and notes.');
      return;
    }
    if (!user) {
      toast.error('Sign in to use Go Deeper.');
      return;
    }
    setShowExpandModal(true);
  };

  const handleCopy = () => {
    const content = outputModes[activeOutputTab];
    if (!content) return;

    let textToCopy = "";
    if (typeof content === 'string') {
      textToCopy = content;
    } else if (Array.isArray(content)) {
      textToCopy = JSON.stringify(content, null, 2);
    }

    navigator.clipboard.writeText(textToCopy);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 2000);
  };

  const handleSave = () => {
    const content = outputModes[activeOutputTab];
    if (!content) return;

    const blob = new Blob([typeof content === 'string' ? content : JSON.stringify(content, null, 2)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brainify-${activeOutputTab}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSRS = async (index: number, quality: number) => {
    const flashcards = outputModes.flashcards;
    if (!flashcards) return;

    const card = flashcards[index];
    const easeFactor = card.easeFactor || 2.5;
    const interval = card.interval || 0;
    
    let newInterval = 1;
    let newEaseFactor = easeFactor;

    if (quality >= 3) {
      if (interval === 0) newInterval = 1;
      else if (interval === 1) newInterval = 6;
      else newInterval = Math.round(interval * easeFactor);
      
      newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    } else {
      newInterval = 1;
      newEaseFactor = Math.max(1.3, easeFactor - 0.2);
    }

    const newNextReview = new Date();
    newNextReview.setDate(newNextReview.getDate() + newInterval);

    const updatedFlashcards = [...flashcards];
    updatedFlashcards[index] = {
      ...card,
      interval: newInterval,
      easeFactor: newEaseFactor,
      nextReview: newNextReview.toISOString().split('T')[0]
    };

    const newOutputModes = { ...outputModes, flashcards: updatedFlashcards };
    setOutputModes(newOutputModes);

    /*
      Say something.

      These four buttons were reported as "inactive". They were not — they ran
      the whole spaced-repetition calculation and saved it. They just changed
      nothing you could see: same card, same face, no message. A button that
      produces no visible effect is indistinguishable from a broken one, and the
      only honest fix is to show the result.
    */
    toast.success(
      newInterval === 1
        ? 'Noted — you will see this card again tomorrow.'
        : `Got it. Next review in ${newInterval} day${newInterval === 1 ? '' : 's'}.`
    );

    // Update history state
    if (currentHistoryId) {
      setHistory(prev => prev.map(item => 
        item.id === currentHistoryId 
          ? { ...item, outputModes: newOutputModes } 
          : item
      ));

      // Update Firestore
      if (user) {
        try {
          await updateDoc(doc(db, 'study_history', currentHistoryId), {
            outputModes: newOutputModes
          });
        } catch (err) {
          console.error("Error updating SRS in Firestore:", err);
        }
      }
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('study-output-content');
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#0f0f1a', // Match app background
        logging: false,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      // Handle multi-page if needed, but for now single page is fine
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, 297));
      pdf.save(`brainify-study-kit-${detectedSubject.toLowerCase().replace(/\s+/g, '-') || 'general'}.pdf`);
    } catch (error) {
      console.error('PDF Export Error:', error);
    }
  };

  const getPlaceholder = () => {
    switch (inputMethod) {
      case 'text': return "Paste your study notes, a textbook chapter, or type a topic you want to master...";
      case 'youtube': return "Paste YouTube URL here (e.g. https://youtube.com/watch?v=...)";
      case 'article': return "Paste Article URL here (e.g. https://medium.com/...)";
      case 'pdf': return "Click to upload PDF or drag and drop...";
      case 'snap': return "Take or upload a photo of your notes...";
      default: return "Start typing or paste content...";
    }
  };

  // --- Render Helpers ---
  const renderOutput = () => {
    if (isGenerating) {
      return (
        <div className="space-y-8 animate-pulse">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-white/5" />
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-white/5 rounded w-1/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          </div>
          
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5" />
                <div className="h-4 bg-white/5 rounded w-32" />
              </div>
              <div className="space-y-2 pl-11">
                <div className="h-3 bg-white/5 rounded w-full" />
                <div className="h-3 bg-white/5 rounded w-full" />
                <div className="h-3 bg-white/5 rounded w-3/4" />
              </div>
            </div>
          ))}

          <div className="flex flex-col items-center justify-center py-10 space-y-6">
            <div className="relative">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="w-20 h-20 border-2 border-dashed border-border-main rounded-full"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Brain className="w-8 h-8 text-text-dim animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <AnimatePresence mode="wait">
                <motion.p 
                  key={loadingStatusIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-lg font-bold text-text-main"
                >
                  {LOADING_STATUSES[loadingStatusIndex]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </div>
      );
    }

    const content = outputModes[activeOutputTab];
    if (!content) return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="p-4 rounded-full bg-glass-bg border border-border-main">
          <Brain className="w-10 h-10 text-text-dim" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-text-main">Your results will appear here</h3>
          <p className="text-text-dim max-w-xs mx-auto mt-2">
            Select a study mode and click generate to start your learning journey.
          </p>
        </div>
      </div>
    );

    if (activeOutputTab === 'flashcards') {
      return (
        <div id="study-output-content" className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-up p-4 bg-glass-bg rounded-2xl">
          {(content as Flashcard[]).map((card, i) => (
            <div key={i} className="space-y-2">
              <FlashcardComponent card={card} />
              {card.nextReview && (
                <p className="text-center text-[10px] font-bold uppercase tracking-widest text-brand-purple">
                  Next review {card.nextReview}
                </p>
              )}
              <div className="flex items-center gap-1 justify-center">
                <button 
                  onClick={() => handleSRS(i, 1)}
                  className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-[10px] font-bold hover:bg-red-500 hover:text-white transition-all"
                >
                  Again
                </button>
                <button 
                  onClick={() => handleSRS(i, 2)}
                  className="px-2 py-1 rounded bg-orange-500/20 text-orange-400 text-[10px] font-bold hover:bg-orange-500 hover:text-white transition-all"
                >
                  Hard
                </button>
                <button 
                  onClick={() => handleSRS(i, 4)}
                  className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-[10px] font-bold hover:bg-green-500 hover:text-white transition-all"
                >
                  Good
                </button>
                <button 
                  onClick={() => handleSRS(i, 5)}
                  className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold hover:bg-blue-500 hover:text-white transition-all"
                >
                  Easy
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeOutputTab === 'quiz') {
      return (
        <div id="study-output-content" className="space-y-6 animate-fade-up p-4 bg-glass-bg rounded-2xl">
          {(content as QuizQuestion[]).map((q, i) => (
            <QuizComponent key={i} question={q} index={i} />
          ))}
        </div>
      );
    }

    if (activeOutputTab === 'mindmap') {
      return (
        <div id="study-output-content" className="animate-fade-up p-4 bg-glass-bg rounded-2xl">
          <MindMap data={content as MindMapData} />
        </div>
      );
    }

    // For Summary and Explain, we parse the sections
    if (typeof content === 'string') {
      const sections = content.split('###').filter(s => s.trim());
      
      if (sections.length > 1) {
        return (
          <div id="study-output-content" className="space-y-8 animate-fade-up p-4 bg-glass-bg rounded-2xl">
            {sections.map((section, idx) => {
              const lines = section.trim().split('\n');
              const title = lines[0].trim();
              const body = lines.slice(1).join('\n').trim();
              
              let Icon = BookOpen;
              let color = "text-brand-purple";
              let bgColor = "bg-brand-purple/10";
              
              if (title.toLowerCase().includes('key points') || title.toLowerCase().includes('concept') || title.toLowerCase().includes('📌') || title.toLowerCase().includes('concepts')) {
                Icon = Lightbulb;
                color = "text-amber-400";
                bgColor = "bg-amber-500/10";
              } else if (title.toLowerCase().includes('summary') || title.toLowerCase().includes('📖')) {
                Icon = FileText;
                color = "text-blue-400";
                bgColor = "bg-blue-500/10";
              } else if (title.toLowerCase().includes('exam tips') || title.toLowerCase().includes('fact') || title.toLowerCase().includes('🎯') || title.toLowerCase().includes('⚡') || title.toLowerCase().includes('facts') || title.toLowerCase().includes('quick facts')) {
                Icon = Zap;
                color = "text-emerald-400";
                bgColor = "bg-emerald-500/10";
              } else if (title.toLowerCase().includes('title') || title.toLowerCase().includes('📌')) {
                Icon = Layout;
                color = "text-brand-purple";
                bgColor = "bg-brand-purple/10";
              }

              return (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="relative pl-8 border-l border-border-main"
                >
                  <div className={`absolute -left-4 top-0 p-2 rounded-lg ${bgColor} border border-border-main shadow-lg`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <h4 className={`text-sm font-bold uppercase tracking-wider mb-3 ${color}`}>
                    {title}
                  </h4>
                  <div className="prose prose-invert max-w-none text-text-main leading-relaxed">
                    <Markdown>{body}</Markdown>
                  </div>
                </motion.div>
              );
            })}
          </div>
        );
      }

      return (
        <div className="prose prose-invert max-w-none animate-fade-up">
          <Markdown>{content}</Markdown>
        </div>
      );
    }

    return null;
  };

  if (authLoading) return <div className="h-dvh w-screen flex items-center justify-center bg-bg-main"><Zap className="animate-pulse text-brand-purple" size={48} /></div>;

  if (!user && !isGuest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-4 bg-gradient-to-b from-black to-[#0a0a0f]">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl flex flex-col items-center text-center"
        >
          <section className="w-full py-10 md:py-20 flex items-center justify-center overflow-visible">
            <Logo className="scale-110 md:scale-125" />
          </section>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="space-y-6 w-full max-w-md"
          >
            <div className="space-y-2">
              <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-white">StudyQuest</h1>
              <p className="text-text-dim text-base md:text-lg font-medium">Your AI-Powered Study Companion</p>
            </div>

            <div className="pt-8 space-y-4">
              {/* Auth Tabs */}
              <div className="flex space-x-1 mb-6 bg-white/10 rounded-xl p-1">
                <button
                  onClick={() => setAuthTab('email')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    authTab === 'email' 
                      ? 'bg-brand-purple text-white shadow-lg' 
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </button>
                <button
                  onClick={() => setAuthTab('phone')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    authTab === 'phone' 
                      ? 'bg-brand-purple text-white shadow-lg' 
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Phone
                </button>
              </div>

              {/* Email/Password Form */}
              {authTab === 'email' && (
                <div className="space-y-4">
                  {/* Toggle between Sign In/Sign Up */}
                  <div className="flex space-x-2 mb-4 bg-white/10 rounded-xl p-1">
                    <button
                      onClick={() => setIsSignUp(false)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        !isSignUp 
                          ? 'bg-brand-purple text-white shadow-lg' 
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => setIsSignUp(true)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        isSignUp 
                          ? 'bg-brand-purple text-white shadow-lg' 
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      Sign Up
                    </button>
                  </div>

                  {/* Email Input */}
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-purple/50"
                  />

                  {/* Password Input */}
                  <input
                    type="password"
                    placeholder={showPasswordReset ? "Email for reset" : "Password"}
                    value={showPasswordReset ? email : password}
                    onChange={(e) => showPasswordReset ? setEmail(e.target.value) : setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-purple/50"
                  />

                  {/* Confirm Password (Sign Up only) */}
                  {isSignUp && !showPasswordReset && (
                    <input
                      type="password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-purple/50"
                    />
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={showPasswordReset ? handlePasswordReset : handleEmailAuth}
                    className="w-full bg-brand-purple text-white py-3 px-6 rounded-xl hover:bg-brand-purple/90 transition-all font-medium"
                  >
                    {showPasswordReset ? 'Send Reset Email' : (isSignUp ? 'Create Account' : 'Sign In')}
                  </button>

                  {/* Forgot Password Link */}
                  {!isSignUp && !showPasswordReset && (
                    <button
                      onClick={() => setShowPasswordReset(true)}
                      className="w-full text-sm text-white/50 hover:text-brand-purple transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
              )}

              {/* Phone Form */}
              {authTab === 'phone' && (
                <div className="space-y-4">
                  {/* Country Code + Phone Number */}
                  <div className="flex space-x-2">
                    <select
                      value={phoneNumber.slice(0, 3)}
                      onChange={(e) => setPhoneNumber(e.target.value + phoneNumber.slice(3))}
                      className="px-3 py-3 bg-glass-bg border border-border-main rounded-xl text-text-main focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-transparent"
                    >
                      <option value="+44">🇬🇧 +44 (UK)</option>
                      <option value="+1">🇺🇸 +1 (US)</option>
                      <option value="+33">🇫🇷 +33 (FR)</option>
                      <option value="+49">🇩🇪 +49 (DE)</option>
                      <option value="+91">🇮🇳 +91 (IN)</option>
                    </select>
                    <input
                      type="tel"
                      placeholder="Phone number"
                      value={phoneNumber.slice(3)}
                      onChange={(e) => setPhoneNumber(phoneNumber.slice(0, 3) + e.target.value)}
                      className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-purple/50"
                    />
                  </div>

                  {!confirmationResult ? (
                    /* Send Code Button */
                    <button
                      id="phone-send-button"
                      onClick={handlePhoneAuth}
                      className="w-full bg-brand-purple text-white py-3 px-6 rounded-xl hover:bg-brand-purple/90 transition-all font-medium"
                    >
                      Send Code
                    </button>
                  ) : (
                    /* Verify Code Form */
                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Enter 6-digit code"
                        value={phoneCode}
                        onChange={(e) => setPhoneCode(e.target.value)}
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-purple/50"
                        maxLength={6}
                      />
                      <button
                        onClick={handlePhoneCodeVerify}
                        className="w-full bg-brand-purple text-white py-3 px-6 rounded-xl hover:bg-brand-purple/90 transition-all font-medium"
                      >
                        Verify Code
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Social Login Buttons */}
              <div className="space-y-3 pt-4 border-t border-border-main">
                <button 
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-3 bg-white text-black font-black py-4 px-6 rounded-2xl hover:bg-white/90 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)] group"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  Continue with Google
                </button>

                <button 
                  onClick={handleGitHubLogin}
                  className="w-full flex items-center justify-center gap-3 bg-gray-900 border border-white/20 text-white font-black py-4 px-6 rounded-2xl hover:bg-gray-800 transition-all group"
                >
                  <Github className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  Continue with GitHub
                </button>

                <button 
                  onClick={handleGuestMode}
                  className="w-full flex flex-col items-center justify-center gap-1 bg-white/5 border border-white/10 text-text-dim font-black py-4 px-6 rounded-2xl hover:bg-white/10 hover:text-text-main transition-all group"
                >
                  <span className="text-sm">Continue as Guest</span>
                  <span className="text-[10px] font-medium opacity-70">1 free study kit · No account needed</span>
                </button>
              </div>
              
              <p className="text-[10px] text-center text-text-dim/40 uppercase tracking-[0.3em] font-black mt-12">
                Secure • Fast • Simple
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster position="bottom-right" />
      <TimerEngine />
      <AutoUpdateBanner
        show={showUpdateBanner} 
        version={updateAvailable?.version || ''} 
        onClose={() => {
          setShowUpdateBanner(false);
          if (updateAvailable) localStorage.setItem('brainify_dismissed_version', updateAvailable.version);
        }}
        onUpdate={performUpdate}
      />
      <div className="min-h-dvh bg-bg-main flex text-text-main overflow-hidden max-w-screen">
      {/* --- Sidebar --- */}
      <AnimatePresence>
        {/* Backdrop — mobile only, tap anywhere outside to close sidebar */}
        {sidebarOpen && !roomTakesScreen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {sidebarOpen && !roomTakesScreen && (
          <div>
            <motion.aside 
              key="sidebar"
              initial={{ x: -300 }}
              animate={{ 
                x: 0,
                width: railCollapsed ? 80 : 256
              }}
              exit={{ x: -300 }}
              className={`glass-panel border-r border-border-main flex flex-col z-50 fixed h-full transition-all duration-300 overflow-hidden ${!sidebarOpen ? 'border-r-0' : ''}`}
            >
            <div className="p-6 flex items-center gap-2">
              <button 
                onClick={() => setSidebarCollapsed(!railCollapsed)}
                className="p-2 hover:bg-glass-bg rounded-lg text-text-muted hidden md:flex ml-auto"
                aria-label={railCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                title={railCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                <ChevronRight size={20} className={railCollapsed ? "" : "rotate-180"} />
              </button>
            </div>

            <nav className="flex-1 px-4 space-y-2 overflow-y-auto py-4 scrollbar-hide">
              {!railCollapsed && <div className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] mb-4 px-3">Main</div>}
              <SidebarItem 
                icon={<Layout size={18} />} 
                label="Dashboard" 
                active={activeView === 'dashboard'} 
                onClick={() => setActiveView('dashboard')}
                collapsed={railCollapsed}
              />
              <GuestGuard featureName="Library">
                <SidebarItem
                  icon={<FolderOpen size={18} />}
                  label="Library"
                  active={activeView === 'library'}
                  onClick={() => setActiveView('library')}
                  collapsed={railCollapsed}
                />
              </GuestGuard>
              <GuestGuard featureName="Arcade">
                <SidebarItem
                  icon={<Zap size={18} />}
                  label="Arcade"
                  active={activeView === 'arcade'}
                  onClick={() => setActiveView('arcade')}
                  collapsed={railCollapsed}
                />
              </GuestGuard>
              <GuestGuard featureName="Friends">
                <SidebarItem
                  icon={<UserPlus size={18} />}
                  label="Friends"
                  active={activeView === 'friends'}
                  onClick={() => setActiveView('friends')}
                  collapsed={railCollapsed}
                />
              </GuestGuard>
              <GuestGuard featureName="My Mistakes">
                <SidebarItem
                  icon={<RotateCcw size={18} />}
                  label="My Mistakes"
                  active={activeView === 'mistakes'}
                  onClick={() => setActiveView('mistakes')}
                  collapsed={railCollapsed}
                />
              </GuestGuard>
              <GuestGuard featureName="Analytics">
                <SidebarItem
                  icon={<BarChart3 size={18} />}
                  label="Analytics"
                  active={activeView === 'analytics'}
                  onClick={() => setActiveView('analytics')}
                  collapsed={railCollapsed}
                />
              </GuestGuard>
              <GuestGuard featureName="Study Planner">
                <SidebarItem
                  icon={<Calendar size={18} />}
                  label="Study Planner"
                  active={activeView === 'planner'}
                  onClick={() => setActiveView('planner')}
                  collapsed={railCollapsed}
                />
              </GuestGuard>
              <GuestGuard featureName="Leaderboard">
                <SidebarItem
                  icon={<Trophy size={18} />}
                  label="Leaderboard"
                  active={activeView === 'leaderboard'}
                  onClick={() => setActiveView('leaderboard')}
                  collapsed={railCollapsed}
                />
              </GuestGuard>
              <SidebarItem
                icon={<Clock size={18} />}
                label="Focus Timer"
                active={activeView === 'focus'}
                onClick={() => setActiveView('focus')}
                collapsed={railCollapsed}
              />
              {timerIsRunning && activeView !== 'focus' && (
                <button
                  onClick={() => setActiveView('focus')}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-brand-purple/10 border border-brand-purple/20 text-brand-purple text-xs font-black transition-all hover:bg-brand-purple/20",
                    railCollapsed ? "justify-center" : "justify-between"
                  )}
                  title="Focus session in progress — click to return"
                >
                  <span className="flex items-center gap-1.5">
                    {!railCollapsed && `${Math.floor(timerTimeLeft / 60).toString().padStart(2, '0')}:${(timerTimeLeft % 60).toString().padStart(2, '0')} remaining`}
                  </span>
                  {railCollapsed && (
                    <span className="sr-only">
                      {`${Math.floor(timerTimeLeft / 60).toString().padStart(2, '0')}:${(timerTimeLeft % 60).toString().padStart(2, '0')} remaining`}
                    </span>
                  )}
                </button>
              )}
              <GuestGuard featureName="Study Rooms">
                <SidebarItem
                  icon={<Users size={18} />}
                  label="Study Rooms"
                  active={activeView === 'collab'}
                  onClick={() => setActiveView('collab')}
                  collapsed={railCollapsed}
                />
              </GuestGuard>

              {/* "Recent Sessions" lived here. Removed: it showed the newest five
                  of exactly the same list the Library shows in full, so it was a
                  worse copy of a screen one click away, and it was the reason the
                  sidebar needed its own scrollbar. */}
            </nav>

            {/* The mobile bottom nav is fixed at z-50, and the music bar stacks on
                top of it, so this block sat underneath both — the level bar and
                the account row were half covered even after the nav was
                accounted for. `pb-chrome` reserves whatever is actually down
                there; see index.css. */}
            <div className="p-4 pb-chrome lg:pb-4 border-t border-border-main space-y-4">
              {/* Gamification Stats */}
              {!railCollapsed && (
                <div className="px-2 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-text-dim">
                    {/* Was `xp % 100` out of 100 — the flat rule the app stopped
                        using. It disagreed with every other level bar in the app. */}
                    <span>Level {sidebarProgress.level}</span>
                    <span>{sidebarProgress.into.toLocaleString()}/{sidebarProgress.needed.toLocaleString()} XP</span>
                  </div>
                  <div className="h-1.5 w-full bg-glass-bg rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${sidebarProgress.percent}%` }}
                      className="h-full bg-brand-purple shadow-[0_0_10px_rgba(124,124,255,0.5)]"
                    />
                  </div>
                  {(userData?.badges || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(userData?.badges || []).map((b, i) => (
                        <div key={i} className="p-1 rounded bg-brand-purple/20 text-brand-purple" title={b}>
                          <Star size={10} fill="currentColor" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/*
                The whole row opens Settings.

                It already had `cursor-pointer` and a hover background, so it
                looked tappable — and did nothing. The only way through was a
                16px gear icon beside it, which is under the 44px a finger can
                reliably hit. RED asked for the obvious thing: tap your profile,
                get your settings.
              */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setActiveView('settings')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveView('settings');
                  }
                }}
                title="Open settings"
                className={cn(
                "flex items-center gap-3 p-2 rounded-xl hover:bg-glass-bg transition-colors cursor-pointer group",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/60",
                railCollapsed && "justify-center"
              )}>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-purple to-brand-purple-dark flex items-center justify-center font-bold text-white shrink-0">
                  {user?.email?.[0].toUpperCase() || 'G'}
                </div>
                {!railCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-text-main">{user?.email?.split('@')[0] || (isGuest ? 'Guest' : 'User')}</div>
                    <div className="text-xs text-text-dim truncate">
                      {isGuest ? 'Guest Mode' : (localStorage.getItem('brainify_test_pro') === 'true' ? 'Test Pro' : (userData?.isPro ? 'Pro Plan' : 'Free Plan'))}
                    </div>
                  </div>
                )}
                {!railCollapsed && !isGuest && (
                  <button
                    // Inside the row, so without this it would open Settings on
                    // the way out.
                    onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                    title="Sign out"
                    className="text-text-dim group-hover:text-red-400 transition-colors shrink-0"
                  >
                    <LogOut size={18} />
                  </button>
                )}
              </div>
            </div>
          </motion.aside>
          </div>
        )}
      </AnimatePresence>

        {/* Level Up Notification */}
        <AnimatePresence>
          {showLevelUp && (
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setShowLevelUp(false)}
              role="status"
              className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-4 bg-brand-purple p-5 sm:p-6 rounded-3xl shadow-2xl shadow-brand-purple/40 border border-white/20 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                <Star className="text-white" size={24} fill="currentColor" />
              </div>
              <div>
                <h4 className="text-lg font-black text-white leading-tight">Level Up!</h4>
                <p className="text-white/70 text-sm font-medium">You've reached Level {userData?.level || 1}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      {/* Credit Limit Alert Modal */}
      <AnimatePresence>
        {showLimitAlert && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md glass p-10 rounded-[2.5rem] border border-brand-purple/30 text-center space-y-8 shadow-2xl"
            >
              <div className="w-20 h-20 rounded-3xl bg-brand-purple/10 flex items-center justify-center mx-auto mb-6">
                <Zap className="text-brand-purple" size={40} fill="currentColor" />
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-text-main tracking-tight">Daily AI Limit Reached</h3>
                <p className="text-text-dim text-sm font-medium leading-relaxed">
                  You've used your AI budget for today — it resets tomorrow. Upgrade to Pro for a much higher daily limit, advanced analytics, and collaborative study rooms.
                </p>
              </div>
              <div className="space-y-4">
                <button 
                  onClick={() => {
                    setShowLimitAlert(false);
                    setActiveView('upgrade');
                  }}
                  className="w-full btn-primary h-16 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-brand-purple/20"
                >
                  Upgrade to Pro
                  <ArrowRight size={20} />
                </button>
                <button 
                  onClick={() => setShowLimitAlert(false)}
                  className="w-full py-4 text-text-dim hover:text-text-main transition-colors font-bold text-xs uppercase tracking-widest"
                >
                  Maybe Later
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Main Content --- */}
      {/*
        The sidebar is `fixed`, so it is out of the document flow and <main>
        started at x=0 underneath it. Only the LOGO was pushed clear, with an
        ml-64 — so the header looked right and every page below it was sitting
        under the sidebar. That is the "sidebar hovers over other tabs" report.
        Main is now padded by the sidebar's real width on desktop; on mobile the
        sidebar stays a proper overlay with its backdrop.
      */}
      <main
        className={cn(
          /*
            h-dvh, NOT h-screen.

            `100vh` on iOS Safari is the height of the viewport with the address
            bar HIDDEN — which is taller than what you can actually see while it
            is showing. So the bottom of the app sat underneath the browser
            chrome, taking the mobile bottom nav with it. `dvh` is the dynamic
            viewport height and follows the chrome as it moves.
          */
          "flex-1 flex flex-col h-dvh overflow-hidden relative transition-all duration-300 scrollbar-hide max-w-full",
          sidebarOpen && !roomTakesScreen ? (railCollapsed ? "md:pl-20" : "md:pl-64") : "pl-0"
        )}
      >
        {/* Sticky Header */}
        {/*
          NO APP HEADER IN A ROOM.

          The room draws its own header, its own participant list and its own
          close button. With the app header on top as well, the two collided —
          "Room: W7TG0A" printed straight through the StudyQuest wordmark, and
          the music panel floated over the shared quiz. Stacking them and hoping
          z-index sorts it out is what produced that; a room is a screen, so it
          gets the screen.
        */}
        {!roomTakesScreen && (
        <>
        {/* The strip that catches the pointer while the header is hidden. It has
            no pointer events on touch, where there is nothing to hover. */}
        <div
          onMouseEnter={() => setHeaderHovered(true)}
          className="hidden md:block fixed top-0 left-0 right-0 h-4 z-30 pointer-events-auto"
          aria-hidden="true"
        />
        <header
          className={cn(
            "sticky top-0 z-40 glass-panel border-b border-border-main px-3 md:px-6 py-2",
            "flex items-center justify-between gap-2",
            // Slides away as you read down and comes straight back the moment you
            // scroll up. It used to sit there permanently, eating the top of every
            // screen — worst on a phone, where it cost a fifth of the page.
            "transition-transform duration-300 will-change-transform",
            headerVisible ? "translate-y-0" : "-translate-y-full"
          )}
          onMouseEnter={() => setHeaderHovered(true)}
          onMouseLeave={() => setHeaderHovered(false)}
        >
          {/* LEFT: hamburger + streak (streak hidden on mobile) */}
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-glass-bg rounded-lg text-text-main flex-shrink-0"
              >
                <Menu size={20} />
              </button>
            )}
            
            {/* 62px of logo inside a py-2 header is most of a phone's header
                height. Full wordmark on desktop, mark only on mobile. */}
            <span className="hidden sm:block"><Logo size={62} /></span>
            <span className="sm:hidden"><Logo size={34} showText={false} /></span>

            <div className="hidden sm:flex items-center gap-2 bg-glass-bg px-3 py-1.5 rounded-full border border-border-main shrink-0">
              <Flame size={16} className={(userData?.studyDays || []).includes(localDateStr()) ? "text-orange-500 animate-pulse" : "text-text-dim"} />
              <div className="flex gap-1">
                {[...Array(7)].map((_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() - (6 - i));
                  const dateStr = date.toISOString().split('T')[0];
                  const done = (userData?.studyDays || []).includes(dateStr);
                  return (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full transition-all duration-500 ${done ? 'bg-brand-purple shadow-[0_0_8px_rgba(124,124,255,0.6)] scale-110' : 'bg-text-dim'}`}
                    />
                  );
                })}
              </div>
              <span className="text-xs font-medium text-text-muted ml-1">{userData?.streak || 0} day streak</span>
            </div>
          </div>

          {/* RIGHT: icon buttons + upgrade — compact on mobile */}
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {/* Everything hidden above, on one button. */}
            <button
              onClick={() => setShowTools(true)}
              aria-label="Study tools"
              className="md:hidden p-2 rounded-xl bg-glass-bg border border-border-main text-text-muted"
            >
              <MoreHorizontal size={18} />
            </button>

            {/*
              THE TOOLS ARE DESKTOP-ONLY UP HERE.

              On a phone this row held Voice Buddy, Music, a theme toggle, a
              token counter, AI Tutor and Upgrade, next to a 62px logo — six
              controls fighting for about 200px, which is the "header is packed"
              report. The app already has a bottom nav on mobile, so the header
              only needs to carry what is not navigation: the menu, the mark, how
              many tokens are left, and Upgrade. The rest moved into the sheet
              behind the "..." button below.
            */}
            <button
              onClick={() => setShowVoiceBuddy(true)}
              className={cn(
                "hidden md:flex p-2 md:p-2.5 rounded-xl border transition-all items-center gap-2",
                showVoiceBuddy 
                  ? "bg-brand-purple/10 border-brand-purple/20 text-brand-purple"
                  : "bg-glass-bg border-border-main text-text-muted hover:text-text-main"
              )}
              title="Voice Study Buddy"
            >
              <Mic size={18} />
              <span className="text-xs font-bold hidden md:inline">Voice Buddy</span>
            </button>

            {/* TEST PRO Indicator */}
            {localStorage.getItem('brainify_test_pro') === 'true' && (
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/30">
                TEST PRO
              </span>
            )}

            {/* Music Control */}
            <button
              onClick={() => setShowMusic(true)}
              className={cn(
                "hidden md:flex p-2 md:p-2.5 rounded-xl border transition-all items-center gap-2 relative",
                showMusic
                  ? "bg-brand-purple/10 border-brand-purple/20 text-brand-purple"
                  : "bg-glass-bg border-border-main text-text-muted hover:text-text-main"
              )}
              title="Study Music & Ambience"
            >
              <Music size={18} />
              <span className="text-xs font-bold hidden md:inline">Music</span>
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="hidden md:block p-2 rounded-xl bg-glass-bg border border-border-main text-text-muted hover:text-text-main transition-all"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Usage counter — hidden on very small screens, shown sm+ */}
            {(localStorage.getItem('brainify_test_pro') === 'true' || userData?.isPro || false) ? (
              <div className="hidden sm:flex px-3 py-1.5 rounded-full text-xs font-bold border items-center gap-2 bg-brand-purple/10 border-brand-purple/20 text-brand-purple">
                <Zap size={12} className="fill-current" />
                <span className="hidden md:inline">
                  {(userData?.tokensUsedThisMonth || 0).toLocaleString()} / {getMonthlyLimit(true).toLocaleString()} tokens
                </span>
                <span className="md:hidden">
                  {Math.max(0, Math.round(((userData?.tokensUsedThisMonth || 0) / getMonthlyLimit(true)) * 100))}%
                </span>
              </div>
            ) : (() => {
              // Reflects the budget the server actually enforces
              // (tokensUsedToday vs FREE_DAILY_LIMIT), not the old
              // dailyGenerations count — that count no longer blocks
              // anything (IS_UNLIMITED_FOR_NOW bypasses it) and was
              // showing a number disconnected from the real limit.
              const dailyLimit = getDailyLimit(false);
              const usedToday = userData?.tokensUsedToday || 0;
              const pctUsed = Math.min(100, Math.round((usedToday / dailyLimit) * 100));
              const isNearLimit = pctUsed >= 70;
              return (
                <motion.div
                  animate={{
                    scale: isNearLimit ? [1, 1.05, 1] : 1,
                    color: isNearLimit ? '#f87171' : '#7c7cff'
                  }}
                  transition={{ repeat: isNearLimit ? Infinity : 0, duration: 2 }}
                  className={`hidden sm:flex px-3 py-1.5 rounded-full text-xs font-bold border items-center gap-2 ${
                    isNearLimit
                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                      : 'bg-brand-purple/10 border-brand-purple/20 text-brand-purple'
                  }`}
                  title={`${kitsLeftToday(usedToday, isProUser)} of ${kitsPerDay(isProUser)} study kits left today`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${isNearLimit ? 'bg-red-500 animate-pulse' : 'bg-brand-purple'}`} />
                  {/*
                    KITS, NOT TOKENS.

                    This said "10,968 tokens left today". A token is a unit from
                    our billing arithmetic; nobody revising for a GCSE can plan
                    around one. How many study kits they can still make is the
                    same fact in a form they can act on.
                  */}
                  <span className="hidden md:inline">
                    {kitsLeftToday(usedToday, isProUser)} study kit{kitsLeftToday(usedToday, isProUser) === 1 ? '' : 's'} left today
                  </span>
                  <span className="md:hidden">{kitsLeftToday(usedToday, isProUser)}</span>
                </motion.div>
              );
            })()}

            {/* AI Tutor — icon only on mobile */}
            <button
              onClick={() => setShowTutor(!showTutor)}
              className={cn(
                "hidden md:flex p-2 rounded-xl border transition-all items-center gap-2",
                showTutor
                  ? "bg-brand-purple text-white border-brand-purple shadow-lg shadow-brand-purple/20"
                  : "bg-glass-bg border-border-main text-text-muted hover:text-text-main"
              )}
            >
              <MessageSquareText size={18} />
              <span className="text-xs font-bold hidden md:inline">AI Tutor</span>
            </button>

            {/* UPGRADE BUTTON — always visible, properly sized */}
            <button
              onClick={() => setActiveView('upgrade')}
              style={{ 
                background: 'linear-gradient(135deg, #7c7cff, #5a5aee)',
                color: 'white',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '8px',
                whiteSpace: 'nowrap',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              ⚡ Upgrade
            </button>
          </div>
        </header>
        </>
        )}

        <div
          ref={scrollAreaRef}
          onScroll={handleContentScroll}
          className="w-full max-w-7xl mx-auto p-3 sm:p-4 md:p-6 lg:p-8 space-y-6 lg:space-y-12 pb-chrome lg:pb-12 overflow-x-hidden overflow-y-auto scrollbar-hide">
          {/* One boundary for every route-level view. They are code-split, so each one's
              JavaScript is fetched the first time you open it rather than up front — the whole
              app used to arrive in a single 2.7 MB file before the first flashcard appeared.
              The fallback is a quiet spinner: these chunks are small and usually land in well
              under a second, so a skeleton screen would flash more than it reassured. */}
          <Suspense fallback={
            <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
              <div className="w-8 h-8 rounded-full border-2 border-brand-purple border-t-transparent animate-spin" />
            </div>
          }>
          {activeView === 'upgrade' ? (
            <UpgradePage 
              onBack={() => setActiveView('dashboard')} 
              isSubscribed={localStorage.getItem('brainify_test_pro') === 'true' || userData?.isPro || false}
            />
          ) : activeView === 'arcade' ? (
            <GameMode
              onBack={() => setActiveView('dashboard')}
              onAwardXP={awardArcadeXP}
            />
          ) : activeView === 'friends' ? (
            <FriendsView
              onStartRoom={(code) => { setCollabRoomId(code); setActiveView('collab'); }}
            />
          ) : activeView === 'mistakes' ? (
            <MistakesView
              onBack={() => setActiveView('dashboard')}
              // The quiz renderer is passed IN so MistakesView never imports App —
              // that would be a circular import, and practising has to go through
              // the same QuizComponent that records and retires, not a copy of it.
              renderQuiz={(questions, onAnswered) => (
                <div className="space-y-8">
                  {questions.map((q, i) => (
                    <QuizComponent
                      key={`${q.question}-${i}`}
                      question={q}
                      index={i}
                      subject="Review"
                      onAnswered={onAnswered}
                    />
                  ))}
                </div>
              )}
            />
          ) : (activeView === 'privacy' || activeView === 'terms' || activeView === 'contact') ? (
            <LegalPage
              view={activeView as 'privacy' | 'terms' | 'contact'}
              onBack={() => setActiveView('dashboard')}
            />
          ) : activeView === 'focus' ? (
            <FocusTimer />
          ) : activeView === 'analytics' ? (
            <Analytics />
          ) : activeView === 'library' ? (
            <Library onOpenItem={handleOpenLibraryItem} />
          ) : activeView === 'planner' ? (
            <StudyPlanner />
          ) : activeView === 'leaderboard' ? (
            <Leaderboard />
          ) : activeView === 'settings' ? (
            <SettingsView />
          ) : activeView === 'collab' ? (
            /* The visible half of the gate. The real one is on the socket —
               see the note on join-room in server.ts. */
            <ProGate feature="study-rooms">
              <CollaborativeRoom
                roomId={collabRoomId || ''}
                userName={user?.email?.split('@')[0] || 'Student'}
                onClose={() => setActiveView('dashboard')}
                onPickStudyKit={() => setActiveView('library')}
                currentStudyKit={outputModes}
                onStartQuiz={() => {
                  setStudyMode('quiz');
                  setActiveOutputTab('quiz');
                  setActiveView('dashboard');
                  setTimeout(() => {
                    document.getElementById('study-output')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
              />
            </ProGate>
          ) : (
            <>
              {/* Hero Section */}
              <section className="relative w-full pt-4 pb-6 animate-fade-up">
                <div className="flex items-center gap-4 mb-6">
                  {/* Small inline logo + greeting — not fullscreen hero */}
                  <div className="flex items-center gap-3">
                    <Logo showText={false} size={62} />
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple text-[10px] font-semibold uppercase tracking-wider">
                        <Sparkles size={11} />
                        AI-Powered Learning
                      </div>
                      <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-text-main mt-1">
                        Master Any Subject{" "}
                        <span className="text-brand-purple">Faster Than Ever</span>
                      </h1>
                      <p className="text-text-dim text-xs sm:text-sm font-medium mt-1 hidden sm:block">
                        Paste notes, upload PDFs, or drop in a YouTube transcript → instant study kit.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* Input Section */}
                <section ref={inputSectionRef} className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
                  <div className="glass rounded-[2rem] overflow-hidden shadow-2xl border border-border-main">
                    {/* Input Tabs */}
                    <div className="flex border-b border-border-main">
                      <InputTab 
                        active={inputMethod === 'text'} 
                        onClick={() => handleInputMethodChange('text')} 
                        icon={<FileText size={18} />} 
                        label="Text" 
                      />
                      <InputTab 
                        active={inputMethod === 'youtube'} 
                        onClick={() => handleInputMethodChange('youtube')} 
                        icon={<Youtube size={18} />} 
                        label="YouTube" 
                      />
                      <InputTab 
                        active={inputMethod === 'article'} 
                        onClick={() => handleInputMethodChange('article')} 
                        icon={<LinkIcon size={18} />} 
                        label="Article" 
                      />
                      <InputTab
                        active={inputMethod === 'pdf'}
                        onClick={() => handleInputMethodChange('pdf')}
                        icon={<Upload size={18} />}
                        label="PDF"
                      />
                      <InputTab
                        active={inputMethod === 'snap'}
                        onClick={() => handleInputMethodChange('snap')}
                        icon={<Camera size={18} />}
                        label="Snap"
                      />
                    </div>

                    <div className="p-6 md:p-8 space-y-6">
                      {inputMethod === 'snap' ? (
                        <SnapInput
                          isPro={localStorage.getItem('brainify_test_pro') === 'true' || userData?.isPro || false}
                          onImageAnalysed={(text) => {
                            setInputText(text);
                            setCharCount(text.length);
                            setInputMethod('text');
                          }}
                        />
                      ) : (
                      <>
                      <div className="relative group">
                          <textarea
                            ref={textareaRef}
                            value={inputText}
                            onChange={(e) => {
                              setInputText(e.target.value);
                              setCharCount(e.target.value.length);
                            }}
                            placeholder={getPlaceholder()}
                            onClick={() => {
                              if (inputMethod === 'pdf') {
                                document.getElementById('pdf-upload')?.click();
                              }
                            }}
                            className={`w-full h-48 bg-white/5 border border-white/5 rounded-xl p-4 resize-none focus:outline-none text-lg placeholder:text-white/10 leading-relaxed input-focus-glow transition-all ${inputMethod === 'pdf' ? 'cursor-pointer' : ''}`}
                          />
                          
                          {(isExtractingPDF || isPdfProcessing) && (
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center space-y-4 z-20">
                              <div className="w-10 h-10 border-4 border-brand-purple/20 border-t-brand-purple rounded-full animate-spin"></div>
                              <p className="text-sm font-medium text-brand-purple">
                                {/* pdfProgress is {progress, currentPage, totalPages}, and this
                                    used to interpolate the whole object — the label read
                                    "Extracting PDF... [object Object]%" and the bar below it
                                    was given a width of "[object Object]%", which is not a
                                    length, so it never moved. */}
                                {isPdfProcessing
                                  ? `Extracting page ${pdfProgress?.currentPage ?? 0} of ${pdfProgress?.totalPages ?? '?'}`
                                  : 'Processing...'}
                              </p>
                              {isPdfProcessing && (
                                <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-brand-purple transition-all duration-300" 
                                    style={{ width: `${pdfProgress?.progress ?? 0}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        
                        <div className="absolute top-4 right-4 text-[10px] font-mono text-white/20">
                          {charCount} chars
                        </div>
                        {inputMethod === 'pdf' && (
                          <input 
                            id="pdf-upload"
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              // Reset first, so picking the SAME file again re-fires
                              // onChange. Without this, one failed upload meant the
                              // input was dead until you chose a different file.
                              e.target.value = '';
                              if (!file) return;
                              try {
                                /*
                                  The result was previously dropped on the floor:
                                  uploadPdf's promise was ignored and the hook's
                                  `extractedText` was destructured in this component and
                                  then never read by anything. The PDF was parsed
                                  correctly and the text went nowhere, which is why the
                                  upload appeared to do nothing at all.
                                */
                                const text = await uploadPdf(file);
                                if (!text || !text.trim()) {
                                  toast.error('No text found in that PDF. If it is a scan, use Snap instead.');
                                  return;
                                }
                                setInputText(text);
                                setCharCount(text.length);
                                toast.success(`Read ${text.length.toLocaleString()} characters from ${file.name}`);
                              } catch (err: any) {
                                console.error('[pdf]', err);
                                toast.error(err?.message || 'Could not read that PDF.');
                              }
                            }}
                          />
                        )}
                        
                        <AnimatePresence>
                          {detectedSubject && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="absolute bottom-2 left-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-purple/20 border border-brand-purple/30 text-xs"
                            >
                              <BookOpen size={14} className="text-brand-purple" />
                              <span className="text-text-dim">Detected:</span>
                              <span className="font-bold text-text-muted">{detectedSubject}</span>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="absolute bottom-2 right-0 flex items-center gap-4">
                          {inputText && (
                            <button 
                              onClick={() => {
                                setInputText('');
                                setDetectedSubject('');
                                setOutputModes({});
                              }}
                              className="text-xs text-red-400 hover:text-red-500 transition-colors"
                            >
                              Clear all
                            </button>
                          )}
                          <button 
                            onClick={tryExample}
                            className="text-xs text-text-dim hover:text-brand-purple transition-colors"
                          >
                            Try example →
                          </button>
                        </div>
                      </div>

                      {/* Suggestions */}
                      {!inputText && (
                        <div className="flex flex-wrap gap-2">
                          {SUGGESTIONS.map((s, i) => (
                            <button
                              key={i}
                              onClick={() => setInputText(s)}
                              className="px-4 py-2 rounded-full bg-glass-bg border border-border-main text-xs text-text-dim hover:bg-glass-bg/80 hover:text-text-main transition-all"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      </>
                      )}

                      <div className="h-px bg-border-main" />

                      {/* Mode & Options */}
                      <div className="space-y-6">
                        <div className="flex flex-wrap gap-3">
                          <ModeButton 
                            active={studyMode === 'summary'} 
                            onClick={() => setStudyMode('summary')} 
                            label="Summary" 
                          />
                          <ModeButton 
                            active={studyMode === 'flashcards'} 
                            onClick={() => setStudyMode('flashcards')} 
                            label="Flashcards" 
                          />
                          <ModeButton 
                            active={studyMode === 'quiz'} 
                            onClick={() => setStudyMode('quiz')} 
                            label="Quiz" 
                          />
                          <ModeButton 
                            active={studyMode === 'explain'} 
                            onClick={() => setStudyMode('explain')} 
                            label="Explain Simple" 
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs font-semibold text-text-dim uppercase tracking-wider mr-2">Smart Options:</span>
                          <ModeButton 
                            active={options.shorter} 
                            onClick={() => setOptions({...options, shorter: !options.shorter})} 
                            label="Make it shorter" 
                          />
                          <ModeButton 
                            active={options.examFocused} 
                            onClick={() => setOptions({...options, examFocused: !options.examFocused})} 
                            label="Exam focused" 
                          />
                          <ModeButton 
                            active={options.bulletPoints} 
                            onClick={() => setOptions({...options, bulletPoints: !options.bulletPoints})} 
                            label="Bullet points" 
                          />
                        </div>

                        <div className="relative">
                          <motion.button
                            whileHover={!dailyTokenLimitReached ? { scale: 1.02, boxShadow: "0 0 20px rgba(124, 124, 255, 0.4)" } : {}}
                            whileTap={!dailyTokenLimitReached ? { scale: 0.98 } : {}}
                            onClick={handleGenerate}
                            disabled={isGenerating || !inputText.trim() || dailyTokenLimitReached}
                            className={`w-full btn-primary flex items-center justify-center gap-3 h-16 text-xl font-bold transition-all duration-300 group relative overflow-hidden ${
                              dailyTokenLimitReached
                                ? 'opacity-50 grayscale cursor-not-allowed border-red-500/50'
                                : !isGenerating && inputText.trim()
                                  ? 'shadow-[0_0_20px_rgba(124,124,255,0.4)] hover:shadow-[0_0_30px_rgba(124,124,255,0.6)]'
                                  : ''
                            }`}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-brand-purple to-brand-purple-dark opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <span className="relative z-10 flex items-center gap-3">
                              {isGenerating ? (
                                <>
                                  <RefreshCw className="animate-spin" size={24} />
                                  Processing...
                                </>
                              ) : dailyTokenLimitReached ? (
                                <>
                                  <AlertCircle size={24} />
                                  Daily Limit Reached
                                </>
                              ) : (
                                <>
                                  <Sparkles size={24} />
                                  Generate Study Kit
                                </>
                              )}
                            </span>
                          </motion.button>
                          {isGenerating && currentModel && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                              <span>Powered by {currentModel}</span>
                            </div>
                          )}
                          {dailyTokenLimitReached && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center"
                            >
                              <p className="text-sm text-red-400 font-medium mb-2">
                                You've used your AI budget for today — it resets tomorrow.
                              </p>
                              <button
                                onClick={() => setShowUpgrade(true)}
                                className="text-xs font-bold text-white bg-red-500 px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                              >
                                Upgrade to Pro for a Higher Limit →
                              </button>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Output Section */}
                <div className="lg:sticky lg:top-24">
                  <AnimatePresence mode="wait">
                    {(Object.keys(outputModes).length > 0 || isGenerating) ? (
                      <motion.section 
                        key="output"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="glass rounded-[2rem] border border-border-main overflow-hidden shadow-2xl bg-glass-bg"
                        id="study-output"
                      >
                        {/* Output Header */}
                        <div className="px-8 py-6 border-b border-border-main flex flex-col md:flex-row md:items-center justify-between gap-4 bg-glass-bg">
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-brand-purple/20 border border-brand-purple/30">
                              <Brain className="w-6 h-6 text-brand-purple" />
                            </div>
                            <div>
                              <h2 className="text-xl font-bold text-text-main">Study Kit</h2>
                              <p className="text-sm text-text-dim">Generated for: {detectedSubject || 'General Study'}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 p-1 bg-glass-bg rounded-xl border border-border-main overflow-x-auto max-w-full">
                            {(['summary', 'flashcards', 'quiz', 'explain', 'mindmap'] as StudyMode[]).map((mode) => (
                              <button
                                key={mode}
                                onClick={() => setActiveOutputTab(mode)}
                                disabled={!outputModes[mode] && !isGenerating}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                                  activeOutputTab === mode 
                                    ? 'bg-brand-purple text-white shadow-lg shadow-brand-purple/20' 
                                    : outputModes[mode] 
                                      ? 'text-text-dim hover:text-text-main hover:bg-glass-bg' 
                                      : 'text-text-dim/50 cursor-not-allowed'
                                }`}
                              >
                                {mode === 'mindmap' ? 'Mind Map' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Output Content */}
                        <div className="p-8 min-h-[400px] relative">
                          {renderOutput()}
                        </div>

                        {/* Output Actions */}
                        {!isGenerating && Object.keys(outputModes).length > 0 && (
                          <div className="px-8 py-6 bg-glass-bg border-t border-border-main flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={handleCopy}
                                className="p-2.5 rounded-xl bg-glass-bg border border-border-main text-text-dim hover:bg-glass-bg hover:text-text-main transition-all group relative"
                                title="Copy to Clipboard"
                              >
                                {showCopyFeedback ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                                <AnimatePresence>
                                  {showCopyFeedback && (
                                    <motion.span 
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0 }}
                                      className="absolute -top-10 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] px-2 py-1 rounded"
                                    >
                                      Copied!
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </button>

                              <button 
                                onClick={handleDownloadPDF}
                                className="p-2.5 rounded-xl bg-glass-bg border border-border-main text-text-dim hover:bg-glass-bg hover:text-text-main transition-all group relative"
                                title="Download as PDF"
                              >
                                <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
                              </button>
                              <button 
                                onClick={handleSave}
                                className="p-2.5 rounded-xl bg-glass-bg border border-border-main text-text-dim hover:bg-glass-bg hover:text-text-main transition-all group"
                              >
                                <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
                              </button>
                            </div>
                            <div className="flex items-center gap-4">
                              <button
                                onClick={handleOpenExpand}
                                className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-brand-purple/20"
                              >
                                Go Deeper
                                <ArrowRight className="w-4 h-4" />
                              </button>
                              <button
                                onClick={handleGenerate}
                                className="flex items-center gap-2 text-sm font-medium text-brand-purple hover:text-brand-purple/80 transition-colors group"
                              >
                                <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                                Regenerate
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.section>
                    ) : (
                      <motion.div
                        key="placeholder"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="glass p-12 rounded-[2.5rem] border border-border-main flex flex-col items-center justify-center text-center space-y-6 min-h-[400px]"
                      >
                        <div className="w-24 h-24 rounded-[2rem] bg-glass-bg flex items-center justify-center mb-4">
                          <Brain className="text-text-dim/50" size={48} />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-2xl font-black text-text-dim">Your study kit will appear here</h3>
                          <p className="text-text-dim/50 text-sm max-w-xs mx-auto">
                            Choose a mode, provide your material, and let StudyQuest do the magic.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Features Grid */}
              <div className="space-y-10">
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-up" style={{ animationDelay: '0.2s' }}>
                  <FeatureCard 
                    icon={<BookOpen className="text-brand-purple" />} 
                    title="Smart Summaries" 
                    desc="Turn long chapters into concise, readable bullet points." 
                    onClick={() => {
                      setStudyMode('summary');
                      inputSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  />
                  <FeatureCard 
                    icon={<Zap className="text-yellow-500" />} 
                    title="Active Recall" 
                    desc="Generate flashcards and quizzes to test your knowledge." 
                    onClick={() => {
                      setStudyMode('flashcards');
                      inputSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  />
                  <FeatureCard 
                    icon={<Sparkles className="text-blue-400" />} 
                    title="Simple Explainer" 
                    desc="Complex topics broken down for anyone to understand." 
                    onClick={() => {
                      setStudyMode('explain');
                      inputSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  />
                </section>

                {/* Collaborative Study Section */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-up" style={{ animationDelay: '0.3s' }}>
                  <motion.div 
                    whileHover={{ y: -5 }}
                    className="glass p-8 rounded-[2.5rem] border border-white/10 space-y-6 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-purple/10 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-brand-purple/20 transition-all" />
                    <div className="w-14 h-14 rounded-2xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center text-brand-purple">
                      <Users size={28} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black text-white tracking-tight">Study Room</h3>
                      <p className="text-white/40 text-sm leading-relaxed">
                        Join a live study session with friends. Collaborate on notes and take quizzes together.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={handleCreateRoom}
                        className="flex-1 btn-primary py-4 rounded-2xl font-bold shadow-2xl shadow-brand-purple/20"
                      >
                        Create Room
                      </button>
                      <button 
                        onClick={() => setShowJoinModal(true)}
                        className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-4 rounded-2xl transition-all"
                      >
                        Join with ID
                      </button>
                    </div>
                  </motion.div>

                  <motion.div 
                    whileHover={{ y: -5 }}
                    className="glass p-8 rounded-[2.5rem] border border-white/10 space-y-6 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-yellow-400/20 transition-all" />
                    <div className="w-14 h-14 rounded-2xl bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center text-yellow-400">
                      <Flame size={28} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black text-white tracking-tight">Study Streak</h3>
                      <p className="text-white/40 text-sm leading-relaxed">
                        You've studied for {userData?.streak || 0} days in a row! Keep it up to unlock exclusive study themes.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
                        const todayDate = new Date();
                        const dayOfWeek = todayDate.getDay(); // 0 (Sun) to 6 (Sat)
                        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                        const d = new Date(todayDate);
                        d.setDate(todayDate.getDate() - mondayOffset + i);
                        const dStr = d.toISOString().split('T')[0];
                        const isActive = (userData?.studyDays || []).includes(dStr);
                        return (
                          <div 
                            key={i}
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black transition-all",
                              isActive ? "bg-yellow-400 text-bg-dark shadow-lg shadow-yellow-400/20" : "bg-white/5 text-white/20 border border-white/5"
                            )}
                          >
                            {day}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>

                  {/* Daily Review Card */}
                  <motion.div 
                    whileHover={{ y: -5 }}
                    onClick={() => setActiveView('library')}
                    className="glass p-8 rounded-[2.5rem] border border-white/10 space-y-6 relative overflow-hidden group cursor-pointer"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/10 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-emerald-400/20 transition-all" />
                    <div className="w-14 h-14 rounded-2xl bg-emerald-400/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                      <Calendar className="text-emerald-400" size={28} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black text-white tracking-tight">Daily Review</h3>
                      <p className="text-white/40 text-sm leading-relaxed">
                        You have <span className="text-emerald-400 font-bold">{dueFlashcardsCount}</span> flashcards due for review today.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <div className="px-4 py-2 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-xs font-bold">
                        Review Now →
                      </div>
                    </div>
                  </motion.div>
                </section>

                {/* Quick Start Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-5xl mx-auto px-4 py-12 border-t border-white/5">
                  <QuickAction 
                    icon={<FileText size={20} className="text-brand-purple" />}
                    label="Summarize Notes"
                    onClick={() => {
                      setInputMethod('text');
                      setStudyMode('summary');
                      inputSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  />
                  <QuickAction 
                    icon={<Zap size={20} className="text-amber-400" />}
                    label="Create Flashcards"
                    onClick={() => {
                      setInputMethod('text');
                      setStudyMode('flashcards');
                      inputSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  />
                  <QuickAction 
                    icon={<CheckCircle2 size={20} className="text-emerald-400" />}
                    label="Generate Quiz"
                    onClick={() => {
                      setInputMethod('text');
                      setStudyMode('quiz');
                      inputSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  />
                  <QuickAction 
                    icon={<Brain size={20} className="text-blue-400" />}
                    label="Explain Simply"
                    onClick={() => {
                      setInputMethod('text');
                      setStudyMode('explain');
                      inputSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  />
                </div>

                {/* Footer */}
                <footer className="pt-12 pb-24 border-t border-white/5 mt-12">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <Logo size={62} className="opacity-80" />
                    <p className="text-text-dim text-xs">© 2026 StudyQuest. All rights reserved.</p>
                    {/* These were all `href="#"` — three links that looked like policies and
                        went nowhere. A privacy policy is a legal requirement once you collect
                        email addresses and take payments, and StudyQuest does both. */}
                    <div className="flex items-center gap-6 text-xs text-text-dim font-medium">
                      <button type="button" onClick={() => setActiveView('privacy')}
                        className="hover:text-brand-purple transition-colors">Privacy</button>
                      <button type="button" onClick={() => setActiveView('terms')}
                        className="hover:text-brand-purple transition-colors">Terms</button>
                      <button type="button" onClick={() => setActiveView('contact')}
                        className="hover:text-brand-purple transition-colors">Contact</button>
                    </div>
                  </div>
                </footer>
              </div>
            </>
          )}
          </Suspense>
        </div>

        {/* Mobile Bottom Navigation */}
        <Navigation />
      </main>

      {/* Success Toast */}
      <AnimatePresence>
        {showUpgradeSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4"
          >
            <div className="glass p-4 rounded-2xl border border-green-500/30 bg-green-500/10 flex items-center gap-4 shadow-2xl shadow-green-500/20">
              <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center text-white shrink-0">
                <Check size={24} />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-white">Upgrade Successful!</h4>
                <p className="text-xs text-white/60">Welcome to StudyQuest Pro. Enjoy unlimited access.</p>
              </div>
              <button 
                onClick={() => setShowUpgradeSuccess(false)}
                className="text-white/20 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Join Room Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJoinModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative glass w-full max-w-md p-8 rounded-[2.5rem] border border-white/10 space-y-8 shadow-2xl"
            >
              <button 
                onClick={() => setShowJoinModal(false)}
                className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-all"
                aria-label="Close Modal"
              >
                <X size={20} />
              </button>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white tracking-tight">Join Study Room</h2>
                <p className="text-white/40 text-sm">Enter the Room ID shared by your friend.</p>
              </div>

              <div className="space-y-4">
                <input 
                  autoFocus
                  type="text" 
                  placeholder="e.g. ABCD-1234"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-lg font-mono text-center tracking-widest focus:outline-none focus:border-brand-purple/50 transition-all placeholder:text-white/10"
                />
                
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setShowJoinModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleJoinRoom}
                    disabled={!joinRoomId.trim()}
                    className="flex-1 btn-primary py-4 rounded-2xl font-bold shadow-2xl shadow-brand-purple/20 disabled:opacity-50 disabled:grayscale"
                  >
                    Join Room
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
      {/* AI Tutor Chat Overlay */}
      <AnimatePresence>
        {showTutor && (
          /* Visible half only — /api/generate refuses a tutor request from a
             free account, because that is the call that costs money. */
          <ProGate feature="ai-tutor">
            <AITutorChat
              context={inputText}
              onClose={() => setShowTutor(false)}
            />
          </ProGate>
        )}
      </AnimatePresence>

      {/* Expand ("Go Deeper") Overlay */}
      <AnimatePresence>
        {showExpandModal && outputModes[activeOutputTab] && (
          <ExpandModal
            mode={activeOutputTab}
            content={outputModes[activeOutputTab]}
            subject={detectedSubject}
            historyId={currentHistoryId}
            isPro={localStorage.getItem('brainify_test_pro') === 'true' || userData?.isPro || false}
            onClose={() => setShowExpandModal(false)}
            onUpgrade={() => {
              setShowExpandModal(false);
              setActiveView('upgrade');
            }}
          />
        )}
      </AnimatePresence>


      {/*
        The tools sheet — mobile only.

        Four controls that used to sit in the header on a 390px screen. A sheet
        gives each one a full-width row with its name next to it, which is both
        readable and a legal tap target; crammed into the header they were 32px
        icons with no labels.
      */}
      <AnimatePresence>
        {showTools && (
          <div className="fixed inset-0 z-[85] md:hidden">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowTools(false)}
              className="absolute inset-0 bg-black/60"
            />
            <motion.div
              initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
              className="absolute bottom-0 left-0 right-0 glass-panel border-t border-border-main rounded-t-3xl p-4 space-y-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <div className="w-10 h-1 rounded-full bg-border-main mx-auto mb-3" />
              {([
                { label: 'Study Music', icon: <Music size={18} />, run: () => setShowMusic(true) },
                { label: 'AI Tutor', icon: <Bot size={18} />, run: () => setShowTutor(true) },
                { label: 'Voice Buddy', icon: <Mic size={18} />, run: () => setShowVoiceBuddy(true) },
                {
                  label: theme === 'dark' ? 'Light mode' : 'Dark mode',
                  icon: theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />,
                  run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
                },
              ]).map((tool) => (
                <button
                  key={tool.label}
                  onClick={() => { tool.run(); setShowTools(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-glass-bg border border-border-main text-text-main font-bold text-sm hover:border-brand-purple/40 transition-all"
                >
                  <span className="text-brand-purple">{tool.icon}</span>
                  {tool.label}
                </button>
              ))}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/*
        Study Music.

        In a room the full panel is hidden — it used to float over the shared
        quiz — but the SOUND carries on, because the audio engines live outside
        React. The bar below is the control that goes with it.
      */}
      <AnimatePresence>
        {showMusic && !roomTakesScreen && (
          <StudyMusic onClose={() => setShowMusic(false)} />
        )}
      </AnimatePresence>

      {/* Whatever is playing, whenever the full player is not on screen. */}
      {(!showMusic || roomTakesScreen) && (
        <MusicBar
          onExpand={() => { setActiveView('dashboard'); setShowMusic(true); }}
          raised={!roomTakesScreen}
        />
      )}

      {/* Voice Buddy Overlay */}
      <AnimatePresence>
        {showVoiceBuddy && (
          <VoiceBuddy 
            isOpen={showVoiceBuddy}
            onClose={() => setShowVoiceBuddy(false)} 
            onTranscript={(text) => {
              setInputText(text);
              setInputMethod('text');
              toast.success('Voice input added!');
            }}
          />
        )}
      </AnimatePresence>
      </Suspense>

      {/* --- Onboarding Modal --- */}
      <AnimatePresence>
        {showOnboarding && user && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', damping: 25 }}
              className="glass border border-brand-purple/30 rounded-[2rem] p-8 max-w-md w-full shadow-2xl shadow-brand-purple/20 space-y-6"
            >
              {/* Header */}
              <div className="text-center space-y-3">
                <div className="w-16 h-16 bg-brand-purple/20 border border-brand-purple/30 rounded-2xl flex items-center justify-center mx-auto">
                  <Logo showText={false} size={62} />
                </div>
                <h2 className="text-2xl font-black text-text-main">Welcome to StudyQuest</h2>
                <p className="text-text-dim text-sm">Turn any study material into a complete study kit in seconds.</p>
              </div>

              {/* 3 steps */}
              <div className="space-y-3">
                {[
                  { step: '01', icon: '1', title: 'Add your content', desc: 'Paste notes, upload a PDF, or add a YouTube transcript' },
                  { step: '02', icon: '⚡', title: 'Pick a study mode', desc: 'Summary, Flashcards, Quiz, or Explain Simply' },
                  { step: '03', icon: '3', title: 'Study smarter', desc: 'Save to your library, quiz yourself, ace your exams' },
                ].map(({ step, icon, title, desc }) => (
                  <div key={step} className="flex items-start gap-4 p-3 rounded-xl bg-glass-bg border border-border-main">
                    <div className="w-8 h-8 rounded-lg bg-brand-purple flex items-center justify-center text-white text-xs font-black shrink-0">
                      {step}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-main">{icon} {title}</p>
                      <p className="text-xs text-text-dim mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => completeOnboarding(true)}
                  className="w-full btn-primary py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2"
                >
                  <Sparkles size={18} />
                  Try an Example — See the Magic
                </button>
                <button
                  onClick={() => completeOnboarding(false)}
                  className="w-full py-3 text-text-dim hover:text-text-main transition-colors text-sm font-medium"
                >
                  I'll figure it out myself →
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

// --- Sub-Components ---

function SidebarItem({ icon, label, active = false, onClick, collapsed = false }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, collapsed?: boolean }) {
  return (
    <motion.div 
      whileHover={{ x: collapsed ? 0 : 4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all",
        active 
          ? 'bg-brand-purple/10 text-brand-purple sidebar-active-glow' 
          : 'text-text-muted hover:text-text-main hover:bg-glass-bg',
        collapsed && "justify-center px-0"
      )}
      title={collapsed ? label : undefined}
    >
      <div className={active ? 'text-brand-purple' : 'text-text-dim'}>
        {icon}
      </div>
      {!collapsed && <span className="font-medium text-sm truncate">{label}</span>}
      {active && !collapsed && (
        <motion.div 
          layoutId="sidebar-active-pill"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-purple shadow-[0_0_8px_rgba(124,124,255,0.8)]"
        />
      )}
    </motion.div>
  );
}

function InputTab({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <motion.button 
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 md:px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all relative ${active ? 'text-brand-purple' : 'text-text-dim hover:text-text-muted'}`}
    >
      {icon}
      {label}
      {active && (
        <motion.div 
          layoutId="input-tab-underline"
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-purple shadow-[0_0_12px_rgba(124,124,255,0.8)]"
        />
      )}
    </motion.button>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <motion.button 
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
        active 
          ? 'bg-brand-purple border-brand-purple text-white shadow-lg shadow-brand-purple/40 glow-purple' 
          : 'bg-glass-bg border-border-main text-text-muted hover:bg-glass-bg hover:text-text-main hover:border-border-main'
      }`}
    >
      {label}
    </motion.button>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="glass p-6 rounded-3xl border border-border-main flex flex-col items-center gap-4 hover:bg-glass-bg hover:border-brand-purple/30 transition-all group shadow-xl"
    >
      <div className="w-12 h-12 rounded-2xl bg-glass-bg flex items-center justify-center group-hover:scale-110 transition-transform group-hover:bg-brand-purple/10">
        {icon}
      </div>
      <span className="text-xs font-black uppercase tracking-widest text-text-main group-hover:text-brand-purple transition-colors">{label}</span>
    </motion.button>
  );
}

function FeatureCard({ icon, title, desc, onClick }: { icon: React.ReactNode, title: string, desc: string, onClick?: () => void }) {
  return (
    <motion.div 
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="glass p-6 rounded-2xl space-y-3 hover:bg-glass-bg transition-all duration-300 group cursor-pointer hover:border-brand-purple/50 border border-transparent shadow-xl hover:shadow-brand-purple/10"
    >
      <div className="w-12 h-12 rounded-xl bg-glass-bg flex items-center justify-center group-hover:scale-110 transition-transform group-hover:bg-brand-purple/20 group-hover:text-brand-purple">
        {icon}
      </div>
      <h3 className="font-bold text-lg group-hover:text-brand-purple transition-colors text-text-main">{title}</h3>
      <p className="text-sm text-text-dim leading-relaxed group-hover:text-text-muted transition-colors">{desc}</p>
    </motion.div>
  );
}

function FlashcardComponent({ card }: { card: Flashcard, key?: any }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const isDue = card.nextReview && new Date(card.nextReview) <= new Date();

  return (
    <div 
      onClick={() => setIsFlipped(!isFlipped)}
      className="h-48 perspective-1000 cursor-pointer group relative"
    >
      {isDue && (
        <div className="absolute -top-2 -right-2 z-10 px-2 py-1 rounded-lg bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest shadow-lg animate-bounce">
          Due
        </div>
      )}
      <motion.div 
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 260, damping: 20 }}
        className="relative w-full h-full preserve-3d"
      >
        {/* Front */}
        <div className="absolute inset-0 backface-hidden glass p-6 rounded-2xl flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase tracking-widest text-brand-purple font-bold mb-2">Question</span>
          <p className="font-medium text-text-main">{card.question}</p>
          <div className="mt-auto text-[10px] text-text-dim">Click to flip</div>
        </div>
        {/* Back */}
        <div className="absolute inset-0 backface-hidden glass p-6 rounded-2xl flex flex-col items-center justify-center text-center rotate-y-180 bg-brand-purple/10 border-brand-purple/30">
          <span className="text-[10px] uppercase tracking-widest text-brand-purple font-bold mb-2">Answer</span>
          <p className="font-medium text-text-muted">{card.answer}</p>
        </div>
      </motion.div>
    </div>
  );
}

function QuizComponent({ question, index, subject = '', onAnswered }: {
  question: QuizQuestion, index: number, subject?: string,
  onAnswered?: (correct: boolean) => void, key?: any
}) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const isCorrect = selectedOption === question.correctAnswer;

  // Wrong answers are saved so they can be practised again; right ones retire the
  // saved copy. Fire-and-forget on purpose — bookkeeping must never make the
  // student wait, and never break the quiz they are in the middle of.
  const handleSelect = (opt: string) => {
    if (selectedOption !== null) return;
    setSelectedOption(opt);
    const correct = opt === question.correctAnswer;
    (correct ? retireMistake(question) : recordMistake(question, opt, subject))
      .catch(() => { /* already logged in mistakes.ts */ });
    onAnswered?.(correct);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <span className="w-6 h-6 rounded-full bg-brand-purple/20 text-brand-purple text-xs flex items-center justify-center font-bold shrink-0">
          {index + 1}
        </span>
        <h3 className="font-medium text-text-main">{question.question}</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-9">
        {question.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleSelect(opt)}
            disabled={selectedOption !== null}
            className={`p-4 rounded-xl text-sm text-left transition-all border flex items-start gap-2 ${
              selectedOption === opt
                ? opt === question.correctAnswer
                  ? 'bg-green-500/20 border-green-500/50 text-green-400'
                  : 'bg-red-500/20 border-red-500/50 text-red-400'
                : selectedOption !== null && opt === question.correctAnswer
                  ? 'bg-green-500/20 border-green-500/50 text-green-400'
                  : 'bg-glass-bg border-border-main text-text-muted hover:bg-glass-bg hover:text-text-main'
            }`}
          >
            {/* Green and red are close to identical for red-green colourblindness —
                roughly 1 in 12 boys, a large slice of a GCSE audience. The tick or
                cross is what makes right and wrong readable without the colour. */}
            {selectedOption !== null && (
              opt === question.correctAnswer
                ? <Check className="w-4 h-4 shrink-0 mt-0.5" aria-label="Correct answer" />
                : selectedOption === opt
                  ? <X className="w-4 h-4 shrink-0 mt-0.5" aria-label="Your answer, incorrect" />
                  : <span className="w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{opt}</span>
          </button>
        ))}
      </div>
      <AnimatePresence>
        {selectedOption && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pl-9"
          >
            <div className={`p-4 rounded-xl text-sm ${isCorrect ? 'bg-green-500/10 text-green-400/80' : 'bg-red-500/10 text-red-400/80'}`}>
              <div className="font-bold mb-1">{isCorrect ? 'Correct!' : 'Incorrect'}</div>
              {question.explanation}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
