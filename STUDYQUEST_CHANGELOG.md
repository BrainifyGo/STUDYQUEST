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

---

## [2026-08-15] — Why sign-in worked for one founder and not the other

**Editor:** Claude Code (Opus 5)

Live on Render. Ola could neither sign in nor sign up; Daniel could. Two separate causes, found
by querying the live Firebase config rather than guessing.

### Cause 1 — the Render domain was never authorised (Google sign-in)

Queried the Identity Toolkit admin API for the project's authorised domains:

    localhost
    brainify-app-5f96d.firebaseapp.com
    brainify-app-5f96d.web.app

`studyquest-ruuq.onrender.com` is absent, so `signInWithPopup` fails with
`auth/unauthorized-domain` for **everyone on the live site**. It worked for Daniel because he
was testing on `localhost`, which is authorised — which is exactly how this class of fault
reaches real users: whoever tests locally never sees it.

**Attempting to add the domain from here was blocked by a permission guard**, correctly — it is
a config change to a live project. It has to be added in the Firebase console.

### Cause 2 — the rules refused the new user document (email sign-up)

Sign-up with email/password creates the Firebase Auth account and then writes
`users/{uid}`. All three of those write paths in `App.tsx` built the document **without a `uid`
field**, while `isValidUser()` in `firestore.rules` requires `hasAll(['uid', 'email'])`.

So the account was created, the profile write was refused, and sign-up looked like it failed —
leaving a real Auth account behind with no profile. Introduced when the rules were hardened;
`AuthWrapper.tsx` had the field, these three did not. All three now set it.

### Why neither cause was visible

`handleGoogleLogin` was:

    catch (err) { console.error("Login failed", err); }

The error went to a console nobody had open, and the button looked dead. The email path did show
toasts, but from a hand-written if/else over six error codes — and everything unlisted fell
through to *"Sign in failed. Please try again."*, so a misconfigured deployment was
indistinguishable from a typo in a password.

`src/lib/authErrors.ts` (new) maps codes to messages and flags which are **setup faults** rather
than user mistakes. Setup faults name the actual host and the exact console page to fix, and
stay on screen for 12 seconds instead of 5, because they need reading rather than glancing at.
A `permission-denied` from Firestore now says the account exists but the profile did not save,
rather than blaming the password.

One property is preserved deliberately: wrong password, unknown account and invalid credential
all return the **same** message. Firebase returns one code for them on purpose — splitting them
would turn the login form into a tool for finding out which email addresses have accounts.

### Verification

- **67 tests passing** (8 new in `authErrors.test.ts`), `tsc` clean, `npm run build` clean.
- The tests cover: the domain message names the current host; setup faults are flagged
  separately from user mistakes; wrong-password, user-not-found and invalid-credential produce
  identical text; and `describeAuthError` returns something sayable when handed `null`,
  `undefined`, a string, a bare `Error` or a number — never "undefined" or "[object Object]".

### Still to do, by hand

- **Firebase console → Authentication → Settings → Authorised domains → add
  `studyquest-ruuq.onrender.com`.** Google sign-in cannot work until this is done.
- Set `VITE_SITE_URL=https://studyquest-ruuq.onrender.com` in Render and redeploy — the build
  log shows five warnings about it, and without it the canonical link and social share images
  point nowhere.

### Files

`src/lib/authErrors.ts` (new), `tests/authErrors.test.ts` (new), `src/App.tsx`, `package.json`.

---

## [2026-08-15] — The bosses

**Editor:** Claude Code (Opus 5)

Boss Battle shipped as a bar labelled "Boss". Mechanically it worked, but there was nothing to
beat: no name, no reaction, and a bar draining at a constant rate is the same fight for its
whole length. A boss is a character you are trying to shut up.

### `src/lib/bosses.ts` (new)

Four bosses, as data. Adding one is adding a row, not editing a component.

| Boss | Title | Guards |
|---|---|---|
| **Pythagorus Rex** | Devourer of Decimals | Maths |
| **Lord Mitochondria** | The Actual Powerhouse | Science |
| **The Bardolith** | Keeper of the Quotation | English |
| **The Examiner** | Reader of Papers | anything |

Each carries lines for six moments — intro, landing a hit, hitting you, enraging, dying, and
winning — so the fight talks back. `lineFor()` is **seeded on the number answered** rather than
random: with `Math.random()` the taunt would change on every re-render, which reads as noise
instead of a reaction to what you just did.

**Which boss turns up is decided by your mistakes.** `dominantSubject` only commits to a
subject boss when that subject is over half the pool; otherwise The Examiner takes the fight.
The fallback is chosen explicitly rather than "first match wins", so a mixed round is not
guarded by the maths boss purely because it sits first in the list.

### Phases

`phaseFor()` splits the fight in three: above two thirds, above one third, below it. Phase 3 is
**enraged**, and a wrong answer then costs **two** health instead of one.

That puts the danger where the fight was previously flattest — the last third, when you are
closest to winning — and it gives a combo something to protect.

One deliberate detail: the damage you take is read from the phase **before** your answer is
applied. Being hit twice by an enrage that your own answer triggered on the same turn would
feel arbitrary, and there is a test pinning it.

### `won` is now recorded, not re-derived

`completionBonus` used to pay 400 XP for `bossHP <= 0`. A fight that ended because the questions
ran out with the boss on 1 HP is not a victory, and paying for it would make running out of
questions the cheapest way to farm XP. The state now records `won` at the moment the fight ends.

### The face

`BossFace` is drawn as inline SVG rather than shipped as an image — an image is another asset
and cannot react. The eyes angle further down and the mouth goes from level, to a grimace, to
bared teeth as the phases pass, and the colour moves violet → orange → red. The phase is
readable without reading the percentage. It flinches on a hit and lurches on an enrage.

The mode picker now names who you are about to face, which is what turns a mode into a fight.

### Verification

- **84 tests passing** (17 new in `bosses.test.ts`); `tsc` clean; `npm run build` clean.
- Tests cover: each subject gets its own boss; a mixed pool gets The Examiner rather than the
  first list entry; every boss has all six line sets; lines are deterministic and never empty
  for any seed, including negative and huge ones; phase boundaries at 66% and 33%; enraged
  mistakes cost two health; the enrage that your own answer triggered does **not** also punish
  you that turn; a win pays 400 and a loss pays nothing; running out of questions with the boss
  alive pays **nothing**; and state is still never mutated.
- `phaseFor(0, 0)` is covered so a zero-health boss cannot divide by zero.

### Files

`src/lib/bosses.ts` (new), `tests/bosses.test.ts` (new), `src/lib/gameModes.ts`,
`src/components/GameMode.tsx`, `package.json`.

---

## [2026-08-15] — Daniel's test report, first batch

**Editor:** Claude Code (Opus 5)

Daniel tested the live site properly and sent sixteen things. This entry covers the eight that were
real, findable defects. The rest are features rather than bugs and are triaged at the bottom.

### The tutor could not be closed

The tutor panel is full-width on a phone, and its only exit was a single X at the very top — which
sits under the status bar or a notch on plenty of handsets. If you cannot reach it, you are stuck
inside the tutor with the whole app behind it.

It now has **three** ways out: Escape, a tap on the backdrop, and the X — and the header is padded
by `env(safe-area-inset-top)` so the X is not under the notch in the first place. It also announces
itself as `role="dialog"`.

### "View Badges" did nothing, and the XP beside it was invented

Two separate defects in the same block of the Analytics screen.

The button had **no `onClick`**. Not a broken handler — no handler at all. It now opens a panel of
six badges. Locked ones stay visible with what earns them, because a badge you cannot see is not a
goal.

The block beside it was worse. `850 XP`, `1000 XP to next level`, a bar hardcoded to `85%`, and
"You're in the top 5% of students" — none of it came from anywhere. It was the same for every
account, including a brand new one. It now reads the player's real XP from Firestore and runs it
through the same level curve as the rest of the app, and an account with no XP is told to go and
earn some in the Arcade rather than being congratulated for nothing.

While in that area: the upgrade page claimed **"Join 10,000+ students already using Pro"**. There are
not 10,000 students. On a page that takes card details, an invented number is not marketing.

### The password reset email that never arrived

Not a bug in the sending — a bug in what we promised. Firebase has email-enumeration protection on
by default, which means `sendPasswordResetEmail` **succeeds even when no account exists** for that
address; that is the whole point of the feature, it stops people probing for who has an account. It
also sends nothing to an account created with Google sign-in, because there is no password to reset.

Both cases showed a confident *"Password reset email sent! Check your inbox."* and then nothing
arrived. The message now says what is actually true and names the two reasons an email would not
turn up, the address is trimmed and lowercased (a trailing space from a phone keyboard was a silent
"no such account"), the real error code is surfaced instead of a generic failure, and the link now
carries a continue URL so the reader lands back on StudyQuest rather than on a bare Firebase page.

**Still worth checking on Daniel's side:** the spam folder, and whether the account he tested with
was created with Google.

### Level cap: 500 → 2000

Daniel asked for a cap of 2000 with each level costing more than the last. The second half was
already true — 20% per level — and it is exactly why the first half could not simply be typed in.

`1.2 ^ 1999` is not a large number. It is `Infinity` in a double. Every level past roughly 480 was
**already** returning `Infinity` under the old cap of 500, and the progress bar would have shown
`NaN%`. Raising the cap without touching the curve would have shipped a broken screen, not a longer
game.

So the per-level cost now stops rising at **25,000 XP** (`LEVEL_COST_CAP`). Levels get 20% dearer
until they hit that ceiling — around level 22 — and hold there. This keeps the arithmetic finite and,
just as important, keeps the number readable: *"25,000 XP to level 43"* is a goal, *"3.4 trillion XP
to level 43"* is a wall, and a wall is where people stop playing.

### XP now comes from the Arcade only

Generating a study kit paid 20 XP, on two separate code paths. That made the fastest route to a high
level "paste text, never read it" — levelling for *using* the app rather than for learning anything,
which makes the level number worthless as a measure of anything.

Both awards are gone. XP is earned by answering questions in the Arcade, where being right is the
only thing that pays. Streaks, study days and the daily generation count still record — turning up
is still worth recording, it just is not worth XP.

### The music

The Classical tab had exactly one track, and that track was a **dead frame** — video `__eq8T5b4-w`
has been removed from YouTube. Every id in the list was checked against YouTube's oEmbed endpoint;
that was the only dead one, and it has been replaced with a verified-live recording. The four ambient
sounds all returned 200, so they were never the problem.

The bigger issue was the ambient toggle: it lit up **whether or not a single byte arrived**. A
blocked school network, an offline phone and a missing file all produced the same thing — an "on"
button and silence, which reads as "the music is broken" rather than "the music is unavailable".
Howler reports both the load failure and the play failure; both now switch the toggle back off and
say what happened.

### The transparency

The floating panels — tutor, music player, sidebar — were painted at **4% white** over the page. You
could read the article through the music player, which is what Daniel meant by distracting.

Panels that float over the page now use a new `.glass-panel` surface at 94% opacity (96% in light
mode); cards that sit *in* the page keep the translucent `.glass`. Same frame, readable floor.

### The name

`Brainify AI` → `StudyQuest` across everything a user can see: 51 mentions across 13 files, the two
split wordmarks in the logo and the sidebar, the browser tab title, the 404 page, the legal pages,
the AI's own system prompts (it was introducing itself as Brainify), and the OpenRouter request
header. Comments that describe what *Brainify* used to do are left alone — they are history, and
they are accurate.

### Verification

- **88 tests passing** (4 new on the level curve); `tsc` clean; `npm run build` clean.
- New tests pin: a single level never costs more than the cap; `xpForLevel` and `xpToReachLevel` stay
  finite at level 2000; cost rises every level until the plateau; `levelFromXP(MAX_SAFE_INTEGER)`
  returns exactly 2000; and `levelProgress` returns a percentage between 0 and 100 at every XP value
  tested, including `1e12`.
- The music was verified by request, not by reading: four ambient files (200) and six video ids
  (five live, one 404).

### Files

`src/components/AITutorChat.tsx`, `src/components/Analytics.tsx`, `src/components/StudyMusic.tsx`,
`src/components/Logo.tsx`, `src/components/Sidebar.tsx`, `src/components/UpgradePage.tsx`,
`src/components/Leaderboard.tsx`, `src/components/LegalPage.tsx`, `src/components/Settings.tsx`,
`src/components/TimerEngine.tsx`, `src/hooks/useDocumentTitle.ts`, `src/lib/firebase.ts`,
`src/lib/progress.ts`, `src/lib/aiProviders.server.ts`, `src/App.tsx`, `src/index.css`,
`tests/progress.test.ts`, `index.html`, `public/404.html`.

### Not fixed yet, and why

These are from the same report but are features, not defects:

| Daniel's point | Standing |
|---|---|
| Quiz generator for the mistakes session | **The keystone.** The Arcade is empty because nothing writes mistakes into it yet. Next. |
| "The arcade is missing the games" | Same root cause as above — the modes exist, the questions do not. |
| Doesn't run on mobile | Needs a device-by-device pass, not a guess. Separate piece of work. |
| AI "jumbles it all up" | A prompt and formatting job. Real, and worth doing properly rather than quickly. |
| Colour scheme | Design decision, wants Ola and Daniel to agree a direction first. |
| Tailored questions from wrong answers | Depends on the mistakes store existing. After the quiz generator. |
| Daily progress test | Depends on the same. After the quiz generator. |
