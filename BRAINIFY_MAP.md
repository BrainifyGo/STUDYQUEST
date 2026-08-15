# Brainify — Architecture Map

> A compressed guide to the whole app, written for RED and for JARVIS (his AI models are
> small and can't hold 55 files in their head — this map is their cheat-sheet). Keep it
> updated when the shape of the app changes. For the running history of edits, see
> `Brainify_CHANGELOG.md`.

## What it is
Brainify is a **GCSE/A-level study web app**. A student pastes notes (or a YouTube link,
article URL, PDF, or photo) and Brainify's AI turns it into a **summary, flashcards, a quiz,
a plain-English explanation, or a mind-map**. It has accounts, streaks/XP/badges, a
leaderboard, a focus timer, study music, collaborative rooms, and a free/Pro plan with paid
upgrades. It's a real product with real users — not a demo.

## Stack
- **Frontend:** React 19 + TypeScript, built with **Vite 6**, styled with **Tailwind 4**.
- **State:** **Zustand** (`src/store/useUserStore.ts`) — the single global store.
- **Backend:** **Firebase** — Auth (Google/GitHub/email/phone), **Firestore** (database),
  Cloud Functions (`functions/index.ts`). Plus a small **Express** dev server (`server.ts`)
  that also runs **socket.io** for the collaborative rooms.
- **AI:** Gemini + Groq + OpenRouter, called through one fallback chain (`src/lib/aiService.ts`).
- **Payments:** **Stripe** + **LemonSqueezy** (the `isPro` flag on the user unlocks Pro).

## How to run / ship it
| Command | What it does |
|---|---|
| `npm run dev` | Starts `server.ts` (Express + socket.io + `/api/generate`) via tsx — the dev app. |
| `npm run build` | `vite build` → static site into `dist/`. |
| `npm run lint` | `tsc --noEmit` — **type-checks the whole app. This is the check JARVIS runs after every edit.** |
| `firebase deploy` | Pushes hosting + Firestore rules + functions live (see `firebase.json`). |

## The flow (what happens when a student uses it)
1. **`src/main.tsx`** boots React and mounts **`src/App.tsx`** (the big one — see "Gotchas").
2. **Auth:** `App.tsx` runs `onAuthStateChanged` (from `src/lib/firebase.ts`). On login it
   creates/loads the user's Firestore doc at `users/{uid}` and live-syncs it with `onSnapshot`.
   Not logged in? A **guest** gets 1 free generation (`src/lib/guestSession.ts`, `GuestGuard`).
3. **Generate:** the student picks a mode + input, and the app calls the AI (see below),
   parses the result (JSON for flashcards/quiz/mindmap, Markdown otherwise), shows it, saves
   it to `study_history`, and updates usage/XP/streak on the user doc.
4. **State** for the current view, user, timer, guest status, etc. lives in `useUserStore`.

## The AI layer — `src/lib/aiService.ts` (the core value)
- **`callAI(prompt, systemPrompt)`** is the main entry. It checks the user's token budget
  (`canGenerate()`), runs the generation, then records estimated tokens used back to Firestore.
- **Fallback chain** (if one provider is down/rate-limited, it tries the next):
  - **Free plan:** Gemini 2.0 Flash → Groq Llama-3.3-70B → OpenRouter (Llama 3.1 8B free).
  - **Pro plan:** Groq 70B → Gemini 1.5 Flash → Groq Mixtral → Groq Llama 8B → OpenRouter.
- There is ALSO a server route **`/api/generate`** in `server.ts` (used by `generateStudyKit`).
  So there are **two AI paths** — the client-side `callAI` and the server route. (Worth
  unifying one day — see Gotchas.)
- **Tokens/limits:** `src/lib/tokenService.ts` — `estimateTokens`, `getMonthlyLimit`,
  `TOKEN_LIMIT_EXCEEDED`. Usage is stored per user as `tokensUsedThisMonth` / `tokensUsedToday`.

## Data model (Firestore collections)
- **`users/{uid}`** — `email, displayName, isPro, dailyGenerations, lastGenerationDate,
  xp, level, streak, studyDays[], badges[], tokensUsedThisMonth, tokensUsedToday`.
- **`study_history`** — every saved study kit (`user_id, subject, mode, content, outputModes, created_at`).
- **`study_sessions`** — one row per generation for Analytics (`userId, date, duration, score, subject`).
- Security for all of this lives in **`firestore.rules`** (who can read/write what).

## Where each feature lives (so you can jump straight to it)
| Feature | File(s) |
|---|---|
| Main dashboard / generate flow | `src/App.tsx`, `src/views/DashboardView.tsx` |
| AI calls + provider fallback | `src/lib/aiService.ts` |
| Tokens / usage limits | `src/lib/tokenService.ts`, `src/components/TokenUsageBar.tsx` |
| Auth (Google/GitHub/email/phone) | `src/lib/firebase.ts`, `src/components/AuthWrapper.tsx` |
| Global state | `src/store/useUserStore.ts` |
| Flashcards (spaced repetition/SRS) | `src/App.tsx` (`handleSRS`) |
| Quiz | `src/App.tsx` (quiz prompt + parsing) |
| Mind-map (d3) | `src/components/MindMap.tsx` |
| AI tutor chat | `src/components/AITutorChat.tsx` |
| Library (saved kits) | `src/components/Library.tsx`, `src/views/LibraryView.tsx` |
| Analytics | `src/components/Analytics.tsx`, `src/views/AnalyticsView.tsx` |
| Leaderboard / XP / badges | `src/components/Leaderboard.tsx`, `src/views/LeaderboardView.tsx` |
| Focus timer (pomodoro) | `src/components/FocusTimer.tsx`, `src/components/TimerEngine.tsx` |
| Study music (ambient + radio) | `src/components/StudyMusic.tsx`, `src/pages/MusicPage.tsx` |
| Collaborative rooms (socket.io) | `src/components/CollaborativeRoom.tsx`, `server.ts` |
| Study planner | `src/components/StudyPlanner.tsx`, `src/views/StudyPlannerView.tsx` |
| Voice buddy | `src/components/VoiceBuddy.tsx` |
| PDF / photo input | `src/hooks/usePdfUpload.ts`, `src/components/SnapInput.tsx` |
| Upgrade / paywall | `src/components/UpgradePage.tsx` |
| Auto-update banner | `src/lib/updateChecker.ts`, `src/components/AutoUpdateBanner.tsx` |

## Monetization (already wired — the plumbing exists)
- Free vs **Pro** is the `isPro` boolean on `users/{uid}`. Pro = higher token limit + better
  model chain + 10 quiz questions instead of 5.
- **Stripe:** a successful checkout returns to the app with `?success=true`, which sets
  `isPro: true`. **LemonSqueezy** is also integrated as an alternative checkout.
- The gap to revenue is **users + a reason to upgrade**, not missing code.

## Gotchas / tech debt (good first jobs for JARVIS)
- **`src/App.tsx` is ~3,300 lines.** Almost everything lives in one component. Splitting out
  the auth screen, the generate logic, and each view would make it far easier (and safer) to change.
- **AI keys are `VITE_`-prefixed** (`VITE_GEMINI_API_KEY`, `VITE_GROQ_API_KEY`,
  `VITE_OPENROUTER_API_KEY`). Vite **inlines `VITE_` vars into the shipped browser bundle**, so
  anyone can open dev-tools and read them — and drain the quota. The safe pattern is to move
  those calls behind the `/api/generate` server route (which can hold the keys server-side) and
  stop calling providers directly from the browser. **This is the #1 thing worth fixing.**
- **Two AI paths** (`callAI` client-side and `/api/generate` server-side) do similar work —
  unifying on the server route fixes the key-exposure issue at the same time.

## Files JARVIS must NEVER touch or read out
- Secrets: **`.env`, `.env.local`, `.env.backup`** and any Firebase admin service-account JSON.
  (These hold the real API keys. JARVIS's `read_file` refuses them by design.)
- Security/billing/config that JARVIS won't auto-edit (it will *propose* changes instead):
  **`firestore.rules`, `firebase.json`, `.firebaserc`, `package.json`, `server.ts`,
  `functions/**`, `vite.config.ts`** — a wrong change here breaks auth, data security, or payments.
