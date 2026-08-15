# StudyQuest Changelog

StudyQuest is the combined venture formed from **Brainify** and **ReviseGo**, under the
Pinnacle founders' agreement.

Every change goes in this file. `Brainify_CHANGELOG.md` is kept alongside it as the history of
the codebase this one started from.

---

## [2026-08-15] — Base established: Brainify in, ReviseGo's level curve ported

**Editor:** Claude Code (Opus 5)

### Why Brainify is the base rather than a fresh start

The two projects are not equal partners technically:

| | Brainify | ReviseGo |
|---|---|---|
| Stack | React 19 + TypeScript + Vite | plain HTML/CSS/JS, no build |
| Backend | Firestore + Node server | none — localStorage |
| Auth | Firebase Auth | device-local, no server |
| Payments | Lemon Squeezy, live | none |
| Real users | yes | no |

Rebuilding Firebase auth, Firestore, the server-side AI calls and live billing in vanilla JS
would throw away months of work and the only revenue either project has. So StudyQuest **is**
Brainify's codebase, and ReviseGo's game layer is being ported into it piece by piece.

### The history was deliberately NOT imported

`git fetch` from Brainify would have preserved 27 commits of history. It was not done, because
that history contains a Firebase web API key committed in `firebase-applet-config.json` (found
by scanning every commit with `git log --all -p`).

That specific key is not a dangerous leak — Firebase **web** API keys are designed to be public
and ship in every client bundle; security comes from Firestore rules and authorised domains,
not from hiding it. But copying an old key trail into a brand-new repository on a different
account, for a venture that will have more contributors, is a needless thing to do. StudyQuest
starts from one clean commit of the current working tree.

`.env`, `.env.local` and `.env.backup` were excluded from the copy. `.gitignore` already covers
`.env*`, and only `.env.example` is present.

### Ported: the level curve

Brainify awarded a level per 100 XP (`Math.floor(xp / 100) + 1`), which makes level 40 exactly
as hard to reach as level 4 — at which point the number stops meaning anything. ReviseGo used a
real curve: **500 XP for level 2, and each level after costs 20% more than the last.**

`src/lib/progress.ts` (new) holds it as pure functions with no Firestore and no React:
`levelFromXP`, `levelProgress`, `xpForLevel`, `xpToReachLevel`, `xpForCorrectAnswer`,
`endOfQuizBonus`, `nextStreak`, `localDayKey`. Both XP-award sites in `App.tsx` now use it.

**The migration was checked against production before switching**, because a new curve lowers
everybody's level. The highest account holds 100 XP, so exactly one user moves from level 2 to
level 1 and nobody else changes. This is free to do now and expensive later — which is the
reason to do it now.

Two rules carried over deliberately:

- **The combo bonus is capped.** Uncapped, a long streak makes each later answer worth more
  than the whole quiz before it, and the fastest route to a level is grinding one easy topic —
  the opposite of what a revision app should reward.
- **Streaks use the local date, not UTC.** Studying at 23:30 in the UK must not count as
  tomorrow.

### A bug this found in ReviseGo

Comparing the two curves side by side exposed a defect in ReviseGo's own level-up popup:
`levelBounds()` assumed a flat **+250** per level while `getLevelFromXP()` multiplies by
**1.2**. They agree at level 2 and drift from level 3 onwards, so the XP bar in the level-up
moment showed the wrong progress to anyone past their second level. Fixed in ReviseGo, with a
regression test pinning level 4 at 1,820 XP (500 + 600 + 720), not 2,250.

### Also fixed: a pure function that needed credentials to test

`tests/mistakes.test.ts` only exercises the question-id hash, but importing `mistakes.ts` pulls
in `firebase.ts`, which initialises Firebase on import — so the test failed with
`auth/invalid-api-key` in any checkout without a `.env`. The hash moved to
`src/lib/questionId.ts`, which imports nothing. Logic that needs no I/O should not drag I/O
behind it.

### Verification

- `npx tsc --noEmit` clean, `npm run build` clean.
- **38 tests passing** across `progress.test.ts` (19, new), `mistakes.test.ts` (6) and
  `rules-structure.test.ts` (13).
- `npm test` now runs everything that needs no credentials and no JDK; the emulator rules tests
  stay behind their own script.
- ReviseGo's suite: **197 passing** after the curve fix.

### Not done yet

Speed Run, Boss Battle, combo UI, streak display and the arcade styling are still to port. The
level curve was taken first because everything else depends on it.

### Files

`src/lib/progress.ts` (new), `src/lib/questionId.ts` (new), `tests/progress.test.ts` (new),
`src/lib/mistakes.ts`, `tests/mistakes.test.ts`, `src/App.tsx`, `index.html`, `package.json`.

---

## [2026-08-15] — Startup and white-page fixes; Speed Run and Boss Battle ported

**Editor:** Claude Code (Opus 5)

### 1. `npm run dev` died on a stack trace

Copying `.env.example` to `.env` and running the server crashed with
`Failed to parse private key: Invalid PEM formatted message` and a trace through
firebase-admin internals — which says nothing about the actual cause: **the file still held the
example's placeholders.** `.env.example` gives you the KEYS, not the VALUES.

`server.ts` now checks before handing anything to Firebase, and names the problem:

    StudyQuest cannot start: the server credentials are not set up.
    FIREBASE_PRIVATE_KEY is still the placeholder from .env.example.
    Copying .env.example gives you the KEYS, not the VALUES. Fill them in: ...

The placeholder is a real PEM header wrapped around three dots, so it looks plausible and
survives an emptiness check — it is caught by name rather than by being blank. Verified by
running the server against `.env.example` and getting the message instead of the trace.

### 2. The deployment was a white blank page — same root cause

The Firebase **client** config is baked in at BUILD time from the `VITE_FIREBASE_*` variables.
Build without them — which is what happens on a host with no environment variables set — and
every value is `undefined`. Firebase throws on the first auth call, React never mounts, and the
site is a white rectangle with the reason buried in the browser console.

`src/main.tsx` now checks the four required client variables before rendering, and shows a page
naming the missing ones. It also says they are read at **build** time, so setting them means
rebuilding rather than restarting — the part that would otherwise cost an hour.

Confirmed against a real production build: 200 response, correct title, the Firebase project id
present in the bundle, and the guard text shipped with it.

### 3. Speed Run and Boss Battle

**`src/lib/gameModes.ts`** (new) — the rules as pure functions, no React and no Firestore. In
ReviseGo these lived inside the component, so the only way to check them was to play the game.

- **Speed Run** — 60 seconds. A right answer adds a second, a wrong one costs three. It does
  **not** end the run: sudden death would make the safe play "answer slowly", which is the
  opposite of a speed mode.
- **Boss Battle** — 100 boss health, 3 lives. Combo raises the damage, capped; uncapped, one
  lucky streak ends the fight in three questions.

Every function returns a new state rather than mutating one. React only re-renders on a new
object, and mutating in place is how a HUD silently stops updating — there is a test for exactly
that.

**`src/components/GameMode.tsx`** (new) — draws the modes and owns the clock. The interval is
cleared on unmount and when the round ends, or it keeps counting after the player has left. XP
is banked once behind a guard, or a re-render after the round would award it twice.

**Questions come from your saved mistakes.** Deliberate: it costs no AI call, works offline, and
points the fun part of the app at the questions you actually got wrong. Generating fresh
questions would burn tokens to quiz you on things you already know. A wrong answer in the arcade
still lands in My Mistakes and a right one still retires it — same recorder, same loop.

Arcade XP goes through the same level curve as everything else. A separate currency would make
it feel like a different app bolted on.

Reachable from a new **Arcade** entry in the sidebar.

### Verification

- **59 tests passing** (21 new in `gameModes.test.ts`); `tsc` clean; `npm run build` clean.
- Production build served and probed by hand for the results above.
- The new tests cover: the clock cannot go below zero, a wrong answer does not end a Speed Run,
  the boss dies at zero health, three wrong answers end a Boss Battle, combo damage is capped,
  state is never mutated, answers after the round ends are ignored, best-combo is tracked
  separately from the current combo, and the round ends rather than looping when the question
  pool runs out.

### Files

`server.ts`, `src/main.tsx`, `src/lib/gameModes.ts` (new), `src/components/GameMode.tsx` (new),
`tests/gameModes.test.ts` (new), `src/App.tsx`, `package.json`.
