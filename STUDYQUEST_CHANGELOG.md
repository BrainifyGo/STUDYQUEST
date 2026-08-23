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

---

## [2026-08-16] — Second round of fixes

**Editor:** Claude Code (Opus 5)

Everything below was reported by Ola after testing the live site. From here on, every fix lands in this
file.

---

### The study kit only ever made summaries

The single biggest one. `generateStudyKit` built one prompt for every mode:

> *"Generate a `${studyMode}` from the following content. Format clearly using Markdown with sections
> and bullet points."*

followed by a fixed output format — **Key Concepts / Summary / Quick Facts / Exam Tips** — that
applied whatever you had picked. Two reported bugs fall straight out of that:

**Flashcards could never have worked.** The model was told to write Markdown, and the reply was then
handed to `JSON.parse`. It threw every single time. The flashcard tab was not slow or unreliable — it
was impossible.

**"Make it shorter", "Exam focused" and "Bullet points" did nothing.** They were passed to the model
as one line of trivia, `Options: Shorter: true, Exam Focused: false, ...`, with nothing anywhere
explaining what to do about it — while the output format directly beneath insisted on the same four
headings regardless. The format won. All three options, and all five modes, produced the same
summary, which is exactly what was reported.

There is now one prompt builder, `src/lib/studyPrompts.ts`, shared by both generate paths (there were
two, with different prompts, which is its own reason for things behaving differently depending on
where you started from):

- **Each mode states its own contract.** Flashcards and quizzes ask for JSON and say so about four
  different ways, because a model that adds a ```` ```json ```` fence breaks the parse and empties the
  tab. Explain is explicitly told *not* to open with "Key Concepts". Only summary asks for headings.
- **The options are instructions, placed last, and marked as overriding** what came before — because
  a model follows the most recent instruction when two conflict. "Shorter" halves the length and bans
  paragraphs over three sentences. "Exam focused" asks for command words, common mistakes and what
  earns the marks. "Bullet points" bans prose — and is *not* sent to the JSON modes, where "every line
  is a bullet" would be a broken parse.
- **Pro gets more**: 10 quiz questions and 20 flashcards, against 5 and 10.

Reading the reply back is no longer brittle either. `parseJsonReply` strips a code fence rather than
hoping there isn't one, and falls back to the outermost bracketed span so a stray *"Sure! Here are
your flashcards:"* does not cost you the whole deck. `normaliseFlashcards` accepts `front`/`back` and
`term`/`definition` as well as `question`/`answer`, since models return all three whatever the prompt
says. `normaliseQuiz` fixes the one that mattered most: a `correctAnswer` of `"B"` instead of
`"Paris"` would have marked **every answer wrong**, because marking compares against the option text.

### Delete Account always failed

Not an intermittent fault — it could never succeed. `firestore.rules` had `read`, `create` and
`update` rules for `/users/{userId}` and **no `allow delete` at all**, so the very first line of the
handler was rejected by the server every time and surfaced as "Something went wrong".

The rule now exists and is deployed. The handler was rebuilt around it, because the order was also
wrong: it deleted the Firestore profile **first** and the login second, so when the login step failed
with `requires-recent-login` — which it does for anyone signed in more than a few minutes, i.e. nearly
everyone — the profile was already gone, and you were left able to log in to an account with no data
and no way to finish deleting.

`deleteMyAccount` now re-authenticates **first** (password field for email accounts, popup for Google
and GitHub), and only starts destroying things once the last step is known to be possible. It also
clears `study_sessions`, `study_tasks`, `study_history`, `study_mistakes` and `exams` — deleting the
profile alone left all of that behind, which is not what "delete my account" means. Every failure now
has its own message instead of one catch-all.

### Password reset — the actual answer

Checked against the live Firebase project rather than guessed at, twice.

**One:** a reset request for `definitely-not-a-real-user@example.invalid` returns **HTTP 200**. Email
enumeration protection is on, so Firebase reports success for addresses that cannot exist. The API can
never tell us whether an email was really sent.

**Two, and this is the answer:** there are four accounts on the project. **Three of them, including
Ola's own, are `google.com` only.** They have no password. A Google account has nothing for Firebase
to reset, so it sends nothing — correctly. Only one account (`fer***`) has a password at all.

So the reset was not broken. It was being tested on accounts that have no password to reset. The app
now says so up front rather than showing "Email Sent!" and leaving you to search your inbox:

> *You sign in with Google, so there is no StudyQuest password to reset. Change it in your Google
> account.*

Alongside that: the Settings handler used to swallow every failure into `console.error`, so a failed
send and a successful one looked identical. Errors are named now, and the confirmation says where the
email went and that it often lands in spam.

### The ambient sounds were half a second long

"They all sound like clicks" — measured, and that is exactly what they were.

The four ambient layers were hotlinked from mixkit's sound-**effect** preview endpoint. The files are
**7 KB, 12 KB, 15 KB and 42 KB**: between roughly half a second and two and a half seconds of audio.
They are one-shot effects, not loops. Set to `loop: true`, a 0.45-second forest clip restarts twice a
second forever and every seam is a discontinuity — a click, permanently.

Longer files would have fixed the clicking and kept three other problems: they are someone else's
URLs (the Classical track had already died), they are a download on a phone data plan, and
`assets.mixkit.co` is blocked on plenty of school networks.

So the ambience is **generated in the browser** now — `src/lib/ambience.ts`, Web Audio, no files at
all:

| Layer | How it is made |
|---|---|
| **Rain** | Pink noise, high-passed at 900 Hz, with the top end drifting over ~30 s so it moves between heavier and lighter |
| **Waves** | Brown noise through a low-pass, with a 0.09 Hz swell — a wave about every eleven seconds |
| **Forest** | A quiet filtered wind bed, plus randomly-timed bird chirps built from short sine sweeps |
| **Static** | Flat white noise |

It never loops, because there is no loop point. It cannot 404. It uses no bandwidth and cannot be
blocked. Every start, stop and volume change is a ramp rather than a jump, since a gain that jumps
from 0 to full **is** a click — the thing we were fixing.

The volume slider is squared on its way to gain, because loudness is not linear in amplitude, and
each layer carries a trim: white noise at the same gain as rain is painfully brighter.

### The music player did not report failure

"Some of the music is unavailable" covered at least four different causes, all of which looked
identical: a black rectangle.

The iframe was dropped in with `autoplay=1` and nothing watching it. When YouTube refuses to play in
an embed — embedding disabled by the owner, video removed, a stream that ended, a network blocking
youtube.com, or a phone declining to autoplay — nothing was reported and there was no way out.

The player now uses `enablejsapi` with an origin and listens for YouTube's error events, so each cause
gets named: *"The owner does not allow it to play inside other sites"*, *"The video has been removed
from YouTube"*, *"Some school and office networks block YouTube"* — with a link to open the track on
YouTube directly.

Worth being straight about: all six video ids were re-checked and every one currently reports
`playableInEmbed: true` from here, so the failures cannot be reproduced from this machine. That is
precisely why the player now has to report for itself rather than us guessing which id died.

### Weekly / Monthly / All Time did nothing

Same class of bug as the View Badges button last round: three `<button>` elements with **no onClick,
no state and no second dataset**. They could not have worked.

And the chart behind them was wrong in its own right. It bucketed sessions by `date.getDay()` with no
date range at all — so a session from three months ago was drawn on *this* Tuesday. The "last 7 days"
chart was really "every session ever, stacked by weekday".

`src/lib/studyPeriods.ts` does it properly: seven real days for Weekly, four calendar weeks for
Monthly, twelve months for All Time. Empty buckets are kept, because dropping them draws a flat busy
week that never happened. The four headline cards recompute per period too — "12h" under both Weekly
and All Time would make the buttons a relabelling exercise. Scores are averaged rather than summed,
which is why the average score used to be able to read over 100%.

### Study rooms

- **The sidebar collapses on the way in** and is restored on the way out, so someone who keeps it
  collapsed does not find it expanded again.
- **The chat can be minimised.** On a phone it was `absolute bottom-0 h-96` with no control of any
  kind, permanently covering the shared notes — the thing you joined the room to write in. Minimised
  it becomes a bar with an unread count.
- **Typing indicators**, ported from GhostChat. Relayed through the socket rather than stored, since a
  "typing" that outlives the socket is worse than none.

### Smaller things

- **"Recent Sessions" removed from the sidebar.** It showed the newest five of exactly the list the
  Library shows in full — a worse copy of a screen one click away, and the reason the sidebar needed
  its own scrollbar.
- **The sidebar level bar was still on the old rules.** It read `xp % 100` out of 100, the flat
  100-XP-per-level scheme the app stopped using, so it disagreed with every other level bar on screen.
  It uses the shared curve now.
- **`npm test` only ran six named files.** The list was hardcoded in `package.json`, so a new test file
  was silently never run — the tests written this session would not have executed. It now runs
  everything except the emulator suite.

### Verification

- **119 tests passing** (31 new), across 8 files; `tsc` clean; `npm run build` clean; rules deployed.
- New tests pin: every mode produces a different prompt; flashcards ask for JSON and not for Markdown
  headings; each of the three options changes the prompt, and all four combinations differ; bullet
  points are never sent to a JSON mode; a fenced reply, a chatty preamble and an object reply all
  parse; `front`/`back` and `term`/`definition` are accepted; a `correctAnswer` of `"B"` resolves to
  the option text; an answer that is not among the options is rejected rather than shipped.
- And for periods: seven/four/twelve buckets per period; a session 84 days old does **not** land on
  this week's Thursday; each period counts a different number of sessions; scores average rather than
  sum; a broken date is ignored rather than crashing; Sunday belongs to the week that started the
  previous Monday.
- The ambient file sizes and the Firebase account providers were both measured against the real
  services, not assumed.

### Files

`src/lib/studyPrompts.ts` (new), `src/lib/studyPeriods.ts` (new), `src/lib/ambience.ts` (new),
`tests/studyPrompts.test.ts` (new), `tests/studyPeriods.test.ts` (new), `src/lib/firebase.ts`,
`src/components/Settings.tsx`, `src/components/Analytics.tsx`, `src/components/StudyMusic.tsx`,
`src/components/CollaborativeRoom.tsx`, `src/App.tsx`, `server.ts`, `firestore.rules`, `package.json`.

### Still to do

| Asked for | Standing |
|---|---|
| Reminders that actually send a notification and an email | Not started. Needs a scheduled sender; the free Firebase plan has no Cloud Functions, so this needs a decision about where the job runs. |
| Arcade games | The modes exist; there are still no questions to play them with. Blocked on the mistakes quiz generator. |
| More of GhostChat in study rooms | Typing indicators are in. Reactions, pinned messages and attachments are each their own piece of work. |

---

## [2026-08-16] — Third round: the Arcade gets games, and the dashboard gets its uploads back

**Editor:** Claude Code (Opus 5)

---

### The file upload was throwing the file away

The PDF was read correctly, every page of it — and then the text went nowhere.

`usePdfUpload` returns `extractedText`, and `App.tsx` destructured it as `pdfExtractedText`. Nothing
in the file ever read that variable again. The promise from `uploadPdf(file)` was ignored too. So the
spinner ran, the worker did the work, and the textarea stayed empty: an upload that appeared to do
nothing because it genuinely did nothing with the result.

Two more faults in the same twenty lines:

- **The progress bar could not move.** `progress` is an object — `{ progress, currentPage,
  totalPages }` — and it was interpolated whole. The label read *"Extracting PDF... [object
  Object]%"*, and the bar underneath was given `width: "[object Object]%"`, which is not a length, so
  it sat at zero for the entire extraction.
- **One failure killed the input.** The `<input type="file">` was never reset, so after a failed or
  cancelled pick, choosing *the same file* again fired no `onChange` at all.

All three fixed. The text now lands in the box, the page counter is real, failures say what went
wrong, and a PDF with no extractable text is told to use Snap instead of failing silently.

### The flashcard buttons were not inactive — they were invisible

Again / Hard / Good / Easy ran the entire spaced-repetition calculation and saved it to Firestore.
They just changed nothing you could see: same card, same face, no message, no movement. A button with
no visible effect is indistinguishable from a broken one, and there is no arguing with that.

Each rating now says when the card is next due, and the card carries its review date underneath.

### The Arcade had no games because it could not have any

The Arcade needed **four saved mistakes** to unlock, and the only way to earn a mistake was to sit a
quiz and get a question wrong — while quizzes themselves were broken until the last round of fixes.
The games were locked behind the exact thing the games existed to make appealing, so a new account
opened the Arcade and found an empty room with a note explaining that it was empty.

**Quick Play** breaks the circle. Type any topic — *photosynthesis*, *trig*, *Macbeth* — and it
writes a round on the spot through the same prompt builder as everything else. Your saved mistakes are
still the preferred pool whenever you have enough of them; they are better questions, because they are
questions you actually got wrong.

**And there are four games now, not two.** Both new ones are rows of rules in `gameModes.ts` rather
than new components, so they run through the same tested engine:

| Mode | The rule that makes it a different game |
|---|---|
| **Speed Run** | 60 seconds; a wrong answer costs time, not the run |
| **Boss Battle** | Three lives against a boss that enrages in its last third |
| **Sudden Death** | One life. One wrong answer ends it |
| **Marathon** | Twenty questions, no clock, no lives — accuracy is the whole score |

**Marathon shipped with three lives, and a test caught that this was broken.** Three lives across
twenty questions means you are ejected on the third mistake — so the worst accuracy you could
*finish* with was 18/20, or 90%, and every completed marathon paid the top rate while the 70% and
lower tiers were unreachable code. Marathon has no lives now. Going the distance and being judged on
how well is the mode; throwing you out after three mistakes is Sudden Death's job.

The health counter also only rendered when `bossHP > 0`, which hid the lives in Sudden Death — the one
mode where the single life *is* the tension.

### The daily study plan produced homework it could not help you with

The planner generated tasks like *"Revise photosynthesis"* and stopped there. A title, a subject, a
duration, and a tick box for work you had to go and do somewhere else. There was no way to revise from
inside the plan at all.

Every task now has **Practise** and **Help me**. Practise writes exam-focused questions for that task
and marks them inline, with the explanation shown after you answer. Help me writes a short revision
guide for it. Both go through the shared prompt builder, so a planner question is the same quality as
a dashboard one.

The planner also had its own hand-rolled `JSON.parse` with the same fragility the study kit used to
have — a ```` ```json ```` fence broke the whole plan. It uses the shared, fence-tolerant parser now.

### Study rooms can make their own quiz

The only route to a shared quiz was to leave the room, generate one on the dashboard, and come back.
A room with people in it and notes on the screen could not produce a single question.

**Quiz from notes** builds one from whatever the room has written together, and pushes it to everyone
over the socket — a "shared" quiz that exists only on the machine that made it is not shared.

### The chat sheet, again

Minimising worked; opening was still wrong. On a phone it came up as a 60%-tall panel welded to the
bottom of the screen with no backdrop, so it swallowed the bottom of the room and there was nothing
obvious to tap to get rid of it.

It is a proper sheet now: 45% tall, rounded, with a backdrop that dismisses it — and on a small screen
it **starts** minimised, because the room is the point and the chat is the accompaniment.

### The sidebar was covering every page

The sidebar is `position: fixed`, so it is out of the document flow, and `<main>` began at x = 0
directly underneath it. Only the **logo** had been pushed clear, with an `ml-64`. That is why the
header looked correct and every page below it was sitting under the sidebar.

`<main>` is padded by the sidebar's real width on desktop now — 64 open, 20 collapsed — and the logo's
compensating margin is gone. On mobile the sidebar stays an overlay with its backdrop, which is
correct there.

### The header no longer sits there forever

It was `sticky top-0` with nothing to move it, so it cost the same strip of every screen permanently —
about a fifth of the page on a phone. It now slides away as you read down and returns the instant you
scroll up, with an 8-pixel threshold so scroll jitter cannot make it flicker.

### Music

**The Focus tab no longer uses YouTube at all.** Deep Focus and Alpha Waves were embeds, and embeds
have now failed here for three separate reasons — a deleted video, refused autoplay, and networks that
block youtube.com — all of which look identical to a student. Focus audio is the one category that
does not need a video: it is defined by its frequencies. Four generated tracks now (Deep Focus, Alpha
Waves, Flow State, Deep Work), built from two detuned sine tones and a filtered noise bed, with a
volume slider. No network, no licence, nothing to break.

**On what they are called:** binaural beats are widely sold as making you concentrate. The evidence
for that is weak and contested, so nothing in the UI claims a cognitive effect — each track is
described by what it sounds like, and the panel says outright that we make no claim about
concentration. Inventing neuroscience to sell a study app to fourteen-year-olds is not something we
are going to do.

**Forest was playing all along, three times too quietly to hear.** Its trim was 0.5 and its wind bed
was attenuated a further 0.35 inside the graph, so at a half-way slider it came out around 0.04 —
against rain's 0.14. Trim raised to 0.8, bed to 0.85, and the birds are louder and more frequent,
since the birds are the only thing that separates a forest from rain with the treble rolled off.

### Delete account

Working, per Ola — the remaining fault was cosmetic: the error message rendered **twice at once**,
once on the Danger Zone panel and again inside the dialog covering it. The panel copy is now hidden
while the dialog is open, and cancelling clears the typed password and the stale error instead of
leaving both sitting there.

### Verification

- **127 tests passing** (8 new), 8 files; `tsc` clean; `npm run build` clean.
- The new mode tests pin: Sudden Death ends on the first mistake and pays nothing for a short run;
  Marathon stops at exactly 20 and pays 500 / 300 / 120 by accuracy; a Marathon abandoned early pays
  nothing; and — the one that matters most — **a wrong answer in Speed Run still costs time rather
  than a life**, because the lives rule added for the new modes runs through all four.

### Files

`src/lib/focusTones.ts` (new), `src/lib/gameModes.ts`, `src/lib/ambience.ts`,
`src/components/GameMode.tsx`, `src/components/StudyPlanner.tsx`, `src/components/StudyMusic.tsx`,
`src/components/CollaborativeRoom.tsx`, `src/components/Settings.tsx`, `src/App.tsx`, `server.ts`,
`tests/gameModes.test.ts`.

### Still outstanding

| Asked for | Standing |
|---|---|
| Reminders that send a notification and an email | Still blocked on a decision, not on code. There is no Blaze plan, so no Cloud Functions; the Render service is the only place a scheduled job could run, and Render's free tier sleeps. Needs Ola and Daniel to pick: pay for one of the two, or accept in-app reminders only. |
| Lo-Fi and Classical tracks | Still YouTube, and still subject to the same failures. The player names the cause now. Making these generated is not realistic — nobody wants synthesised lo-fi. |

---

## [2026-08-16] — Friends, and the study room stops fighting the app

**Editor:** Claude Code (Opus 5)

---

### The study room was fighting the app for the screen

Ola sent a screenshot, and it showed the problem better than any description: **"Room: W7TG0A"
printed straight through the StudyQuest wordmark**, the app's icon rail down the left of the room's
own participant panel, and the music player floating over the Shared Quiz card.

The cause is that the room was built as an overlay — `fixed inset-0 z-[100]` — laid on top of a
running app that still had a header, a sidebar and a music panel of its own, each with its own
z-index. Stacking two full interfaces and hoping the z-indexes sort it out is what produced that
picture, and no amount of adjusting the numbers makes it a good layout.

**A room is a screen, so it now gets the screen.** Inside a room the app header, the app sidebar and
the full music panel are not rendered at all. The room draws its own header, its own participant
list and its own way out. Nothing to collide with.

### The music keeps playing

This is the half of "everything collapses" that matters: collapsing must not mean stopping.

The audio engines are module singletons, so sound already survived the panel unmounting — except the
panel was killing it on the way out with a `stopAllAmbience` in its cleanup. That is gone. Closing the
player, or walking into a study room, now leaves your rain running.

Which creates the hazard that cleanup existed to prevent: audio playing with no control anywhere on
screen. So **`MusicBar`** — a slim bar showing what is playing, with a control to expand the player
and one to stop everything. It appears only when something is playing *and* the full panel is closed,
so it is never a second copy of a panel already open.

It replaces `MusicMiniPlayer.tsx`, which read from a `musicPlayerState` exported by
`pages/MusicPage.tsx`. Neither was imported by anything else in the app — a dead pair, wired to an
audio system that no longer exists. Both deleted.

### The room on a phone

`flex-col` on small screens stacked the participants panel **above** the workspace, so opening a
study room on a phone showed a room code and a list of names, with the shared notes below the fold.

The info panel is a slide-over drawer on phones now and the column it always was on desktop. The
workspace gets its own compact header — room code, how many people are online, a button for the
drawer, and a way out — because once you scrolled past the old stacked panel there were no controls
at all. Padding, headings and card heights all scale down rather than being desktop sizes squeezed
into 390 pixels.

### Friends

Ported from GhostChat as a **design**, not as code: GhostChat is Supabase with SQL row-level security
and `SECURITY DEFINER` functions; this is Firestore. Two decisions carried over, and both are load
bearing:

**A request is not a friendship.** Adding someone creates a pending request they have to accept.
Anything else lets a stranger put themselves in a child's friends list.

**A friendship is one document with a deducible id** — the two uids sorted and joined — rather than a
row each. `areFriends(a, b)` is one `get` with no query and no index, and two people cannot end up
half-friends because one of a pair of writes failed.

**The rules are the feature.** In particular:

    allow create: if ... && exists(/databases/$(database)/documents/friend_requests/$(...))

Without that `exists()` check, anyone could write a friendship document naming themselves and any uid
they liked, and appear in that person's list uninvited. Consent has to be *proved*, not asserted.
Requests can only be created with `fromUid == request.auth.uid`, their document id is pinned to
`{from}__{to}` so one person cannot flood another under many ids, and `allow update: if false` on
both collections — a friendship is made or ended, never edited.

**Search needed a new collection, not a relaxed rule.** Finding a friend means reading a stranger's
document, and the rule on `/users` correctly refuses that. The tempting shortcut — loosening `/users`
so search works — would have handed every signed-in account everyone else's email, plan, token spend
and full progress. Instead `public_profiles` holds a display name, a username and a lower-cased
email, and `hasOnly` in the rule stops anything else being mirrored in. Profiles are published on
every sign-in, so accounts that existed before friends did get one without doing anything.

Search is by **exact** username or email, and the "not found" message is identical whether or not the
account exists — a browsable directory of every child using the app is not something we are going to
build, and neither is an oracle for checking who has signed up.

From the friends list, **Study together** opens a room and copies the code to your clipboard, because
the step everyone forgets is telling the other person. The room is where shared notes, the shared
quiz and live chat already live, so studying with a friend is a room invite rather than a second
parallel system.

### On the music, honestly

The screenshot also caught the Lo-Fi track failing with *"This live stream recording is not
available"* — which is the player's new error reporting doing its job, and confirms the track is
dead. `jfKfPfyJRdk` is a 24/7 livestream, and an ended livestream has no recording to embed.

I could not replace it with confidence. Every method tried from this machine — oEmbed, the innertube
player API, and scraping the embed page for `lengthSeconds` — either reported all six videos fine or
reported all six broken, including ones known to work. **I cannot verify YouTube embeds from here**,
and picking a new id I cannot check is how the last three replacements were chosen. So it stays as it
is, reporting the failure honestly, and the recommendation below stands instead.

### Verification

- **137 tests passing** (10 new); `tsc` clean; `npm run build` clean; rules compiled and deployed.
- The new rules tests pin: a request can only be sent as yourself; the request id is pinned to the
  pair; requests are never editable; both sides can delete one; **a friendship cannot exist without a
  matching request**; a friendship is never rewritable; only the two people in it can read it;
  `public_profiles` is restricted to four fields by `hasOnly`; and — the regression that would matter
  most — **`/users` has not been opened up for searching**.

### Files

`src/lib/friends.ts` (new), `src/components/FriendsView.tsx` (new), `src/components/MusicBar.tsx`
(new), `src/components/MusicMiniPlayer.tsx` (deleted), `src/pages/MusicPage.tsx` (deleted),
`src/components/CollaborativeRoom.tsx`, `src/components/StudyMusic.tsx`, `src/lib/ambience.ts`,
`src/lib/focusTones.ts`, `src/App.tsx`, `firestore.rules`, `tests/rules-structure.test.ts`.

### What is NOT built yet

**Voice and video calls.** This is the largest single piece left and it is genuinely large: WebRTC
peer connections, an offer/answer/ICE signalling path through the Render socket server, device
pickers, ringing, and a call UI. GhostChat has all of it (`services/webrtc`, `components/call`) but
against Supabase realtime, so the signalling has to be rewritten for Socket.IO. It is a piece of work
in its own right, not a follow-on from this.

**Direct messages between friends.** Chat currently exists only inside a room. Worth doing after
calls, or instead of them.

---

## [2026-08-16] — Usernames, direct messages, and the end of YouTube

**Editor:** Claude Code (Opus 5)

---

### Usernames are claimed now, not guessed

The first version of friends *derived* a username from your display name:

    username: name.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32)

Which means every account called "Ola" produced the username `ola`, one of them won the write, and
the rest were unfindable — with nothing anywhere telling them why. A derived username is not an
identifier; it is a collision waiting for a second user with the same first name.

Usernames are now a document you own in `usernames/{name}`, and **the claim is atomic without a
transaction**: Firestore's `create` fails if the document already exists, and the rules forbid
`update`. Two people racing for the same name cannot both win, and nobody can take a name off
someone by overwriting it. Renaming secures the new name *before* releasing the old one, so a failure
halfway leaves you with the username you had rather than none at all.

What a username may be is deliberately tight — 3 to 20 characters, lower case, letters, numbers, dots
and underscores, no leading or trailing separator and no doubled ones. `_ola` and `o..la` read as
the same person at a glance, and impersonation by punctuation is a real problem on anything with a
friends list. Cheap to prevent here, painful to retrofit later.

### Finding people by name

Search now takes a **username, a display name, or an email**, and returns up to ten people rather
than a single lucky match.

Display names are not unique and cannot be, so that search is a prefix range on a lower-cased copy of
the name — `displayLower` exists purely because Firestore has no case-insensitive comparison, so the
lower-cased copy *is* the index. Three characters minimum and ten results maximum keeps it a lookup
rather than a browsable directory of every child using the app.

### Direct messages

Stored at `dms/{pairId}/messages/{id}`, where `pairId` is the **same sorted-pair id as the
friendship**. That single decision is the whole design: because the conversation and the friendship
share an id, the rule can be

    exists(/databases/$(database)/documents/friendships/$(pairId))

with no second copy of who is allowed to be here. There is no members list to drift out of step with
the friends list, and — because that `exists()` runs on **every read and every write, not once when
the chat opened** — removing someone closes the conversation for both sides immediately. On an app
used by children, that is what unfriending has to mean.

Firestore rather than the Socket.IO server the study rooms use: a room is ephemeral so relaying is
right for it, but a DM has to survive both people being offline, and that is a database.

Messages are written with `setDoc` and a generated id rather than `addDoc`, so every write is a
`create` — which lets the rules say `allow update: if false`. **A message is never edited.** Rewriting
what someone said after they have read it is not a feature we want and not one we are leaving open.
You can delete your own message; the rule refuses anyone else's.

Small things that matter in a chat: the composer clears the moment you hit send and puts the text
back if the write fails (leaving it in the box is how people send the same message twice); Enter
sends and Shift+Enter is a newline on a real keyboard, while a phone's return key still inserts a
line break; and day separators read "Today" and "Yesterday" rather than a date.

### YouTube is gone

Agreed with Ola, and overdue. The music tab was reported broken **four times across three rounds** for
four different reasons — a deleted video, a 24/7 livestream with no embeddable recording, a phone
refusing to autoplay, and school networks blocking youtube.com. All four look identical to a student:
a black rectangle. None is fixable by picking another video, because the next video can die the same
way.

And I could not verify a replacement. oEmbed, the innertube player API and scraping the embed page
each reported all six videos fine or all six broken, *including ones known to work*. Shipping an id I
cannot test is exactly how the previous three replacements were chosen.

So the music is generated: `src/lib/generativeMusic.ts`. Not synthesised lofi — nobody would enjoy
that. Generative ambient in the Music for Airports tradition: a slow chord pad, with notes drawn from
the chord currently sounding, arriving at gaps that vary by up to half the average so it never
settles into a pulse. Four pieces, each a mode and a tempo rather than a recording.

It never loops because it is never recorded. Notes are scheduled about four seconds ahead on a
repeating timer, because Web Audio's clock is sample-accurate and `setTimeout` is not — a note fired
from a delayed timer lands late and you can hear it.

Two details worth writing down. Melody notes are drawn from **the chord that is sounding**, not from
the scale at large: random scale notes would eventually hit a second against the pad, which is the one
thing that would make this grating rather than ignorable. And the reverb is generated as decaying
noise rather than loaded as an impulse response — indistinguishable at this length, and no download.

All three tabs are now generated. Nothing to 404, nothing to block, no data used, no licence, no id
to go stale.

**A test caught me contradicting myself.** The file states that every piece avoids the leading tone —
a semitone below the root — because that interval creates tension that wants resolving, which is what
pulls your attention off the page. The piece called Glass had `11` in its scale, which is exactly
that interval. The scale was wrong, not the principle; Glass gets its brightness from a high root and
an open filter instead.

### Verification

- **157 tests passing** (20 new), 10 files; `tsc` clean; `npm run build` clean; rules deployed.
- New tests pin: `pairId` is order-independent (the reason a friendship is one document) while
  `requestId` is directional (or you could "accept" your own request); usernames reject spaces,
  hyphens, leading and doubled separators, and are case-folded so `Ola` and `ola` cannot both exist;
  A440 lands on 440 Hz and octaves double and halve; a scale degree past the end of the scale wraps
  into the next octave; **a negative degree does not produce NaN** — JS `%` keeps the sign of the
  dividend, so `-1 % 5` is `-1` and indexes off the front of the array, which would have been silence
  with no error; and `musicGain` refuses NaN, because a NaN gain silences a Web Audio node
  permanently and logs nothing.

### Files

`src/lib/generativeMusic.ts` (new), `src/lib/dms.ts` (new), `src/components/DirectMessages.tsx`
(new), `tests/friends.test.ts` (new), `tests/generativeMusic.test.ts` (new), `src/lib/friends.ts`,
`src/components/FriendsView.tsx`, `src/components/StudyMusic.tsx`, `src/components/MusicBar.tsx`,
`firestore.rules`, `tests/rules-structure.test.ts`.

---

## [2026-08-17] — Daniel's second report

**Editor:** Claude Code (Opus 5)

---

### The image reader was summarising instead of reading

`/api/analyze-image` asked the model for *"a comprehensive and structured summary of everything you
can see"* — and on the free tier, just *"summarise the main points"*.

That reply then went into the study-kit generator **as the source material**. So a photo of a page of
notes became a summary, and the kit was a summary of a summary. Every detail the student
photographed *because it mattered* was thrown away before the kit was written. That is the whole of
"it doesn't read properly": the pipeline was lossy by design, one step too early.

The prompt is now a transcription task. Copy the text exactly, keep the structure and the order,
write equations in readable notation, describe a diagram only where it carries information, and mark
genuinely unreadable parts `[unclear]` rather than guessing. Summarising belongs in the kit step,
which already does it properly and knows which mode you asked for.

### Removing an exam now removes its plan

Deleting an exam left every task generated for it sitting in the schedule, with nothing marking which
entries those were.

The care is in the fallback, and it is why this rule moved out of the component into
`src/lib/schedule.ts` where it can be tested. Tasks were originally linked to an exam by **subject
alone**, which is not a link: two Maths exams produce indistinguishable tasks. So tasks generated
from now on are stamped with `examId` and deleted unambiguously — while an *unstamped* task is
matched by subject **only when no other exam still covers that subject**.

Deleting one of two Maths exams must not wipe the revision for the other. Keeping a task too long is
untidy; deleting one wrongly is lost work, so where the two are in tension the rule keeps.

The exam is deleted first and its tasks with `Promise.allSettled` after: a task that fails to delete
is a tidiness problem, whereas the exam is the thing that was actually asked for. Failures are
reported rather than silently rolled back.

### The room chat is in the corner

On desktop the chat was `md:relative` — a full-height column filling the right of the workspace. It
had the same visual weight as the shared notes and the shared quiz, and pushed both into the middle
of the screen, which is what "dead center" was describing.

It is a floating card in the bottom-right corner now — the shape people expect a chat to be — and the
workspace gets its width back. Minimised, it is a small pill in the same corner rather than a bar
across the whole bottom edge. On a phone it stays a bottom sheet with a backdrop, which is right
there.

### The Arcade is in study rooms

The games and the room's questions already existed; they were just in different places, so "let's
play" meant everyone leaving the room.

`GameMode` now takes an optional deck. Passed one, it plays those questions instead of your saved
mistakes — **the same questions for everyone**, which is the point: if each player were quizzed on
their own mistakes the scores would not compare. Passed nothing, the Arcade behaves exactly as
before.

When a round ends, the score and accuracy are posted into the room chat. That is what makes it a
competition rather than four people playing alone in the same tab. The announcement sits behind the
same once-only guard as the XP award, so a re-render after the round cannot post the score twice.
Room rounds pay no XP — they are for the scoreboard.

### Mobile

**The sidebar did open — as an 80px strip with every label hidden.** `sidebarCollapsed` was applied
at every screen width, and collapsing is a desktop idea: it is the trade you make when you want the
navigation *and* the content at once, which never applies on a phone. Worse, entering a study room
sets collapsed — so anyone who had opened a room once got that strip from then on, everywhere. The
sidebar now draws at full width on mobile whatever the stored preference says.

**The header was carrying six controls on a 390px screen** — Voice Buddy, Music, a theme toggle, a
token counter, AI Tutor and Upgrade — next to a 62px logo, which is most of a phone header's height
on its own. The app already has a bottom nav on mobile, so the header only needs what is *not*
navigation. Voice Buddy, Music, AI Tutor and the theme toggle moved into a sheet behind a single
button, where each gets a full-width row with its name next to it — readable, and a legal tap target,
which they were not as unlabelled 32px icons. The logo is the mark alone below `sm`.

### Add a friend

The gap was not the search — it was that **a sent request vanished**. It left the screen, there was
no way to tell whether it had arrived, no way to take it back, and nothing stopped you sending the
same person another one. `cancelRequest` had been written and nothing anywhere could call it.

There is now a "Sent, waiting for a reply" section with a Withdraw button, and a search result shows
`Withdraw` when you have already asked them, `Already asked you` when the request is the other way
round, and `Already friends` when it is done. All of it reads from the live Firestore query rather
than a local `Set`, so it survives a refresh and cannot disagree with what the server holds.

### Verification

- **165 tests passing** (8 new), 11 files; `tsc` clean; `npm run build` clean.
- The new tests pin the deletion rule specifically: a stamped task goes with its exam even when
  another exam shares the subject; an unstamped task is **kept** when another exam still covers that
  subject (the one that would otherwise destroy work); other subjects are untouched; case and stray
  spaces do not change the answer; a missing exam deletes nothing; and an exam with a blank subject
  cannot claim every unstamped task.

### Files

`src/lib/schedule.ts` (new), `tests/schedule.test.ts` (new), `src/components/StudyPlanner.tsx`,
`src/components/CollaborativeRoom.tsx`, `src/components/GameMode.tsx`,
`src/components/FriendsView.tsx`, `src/lib/friends.ts`, `src/App.tsx`, `server.ts`.

### Still open

| | |
|---|---|
| Voice and video calls | Not started. Signalling through the Render socket, then STUN, then TURN if the failure rate justifies the bandwidth cost. |
| The rest of the mobile pass | The header, sidebar and room are done. Dashboard, Arcade, Analytics and Settings still need going through on a real phone. |

---

## [2026-08-17] — Pro is actually Pro

**Editor:** Claude Code (Opus 5)

The upgrade page advertised six Pro features. **Five of them were available to every free account.**

The only gate in the app was `GuestGuard`, which separates guests from signed-in users — a different
question entirely. There was no paid check anywhere: not in the UI, not on the API, not on the socket.
Anyone who signed up for free got study rooms, multiplayer quizzes, the AI tutor, full analytics and
unlimited saved kits, all of which were being sold at £5 a month.

### Where each gate lives, and why

This is the part that matters, so it is written down in `src/lib/entitlements.ts` rather than left
implicit:

| Feature | Enforced | Why there |
|---|---|---|
| AI Tutor | **Server** (`/api/generate`) | It spends money with the provider. Anyone can post to that route with curl, so a check in the browser is a suggestion. |
| Study rooms & multiplayer | **Socket** (`join-room`) | Same reason, plus a worse one — see below. |
| Detailed analytics | **Client only** | Costs nothing to serve. Worst case of a bypass is somebody seeing their own data in more detail. |
| Saved-kit allowance | **Client only** | Same. Storage is free; the kits are the user's own notes. |

The last two are a deliberate choice and are labelled as one. Implying a security boundary that is not
there is worse than not having it.

### Joining a room needed no account at all

Gating rooms turned up something more serious than a billing hole.

`join-room` took a `userName` **string** and nothing else. No token, no account, no check of any
kind. Any six-character room code let anyone in — and room codes are six characters, generated from
`Math.random`, and shared over WhatsApp. The people in these rooms are schoolchildren.

That is a safeguarding problem, not a revenue one, and it is why the gate is on the socket rather
than in the interface. The client now sends the Firebase ID token it already holds; the server
verifies it against the project and reads the plan from **Firestore**, never from anything the client
claimed about itself. A Firestore error **fails closed** — a blip must not hand out the paid feature,
and it certainly must not hand out access to a room.

Participants now carry a verified uid alongside the display name, so someone in a room can be
identified rather than merely labelled.

### "Unlimited" was not true either

The claim on the page taking card details was **"Unlimited AI Study Kit Generation"**. Pro carries a
50,000-token daily cap — `PRO_DAILY_LIMIT`, which exists precisely so one account cannot run up an
unbounded provider bill. A cap that exists has to be described, and a test now fails if any Pro
selling point uses the word "unlimited".

The comparison table was inaccurate in both directions and has been corrected against the real
numbers: free is about 8 study kits a day (a 12,000-token budget), not "5 / day"; free history was
described as "Limited (10 items)" when there was no cap at all until this release.

### The free tier, deliberately

Free keeps its **20 most recent** study kits. Making a twenty-first retires the oldest rather than
refusing to generate — refusing would punish someone for using the app, which is the opposite of what
a free tier is for, and the kit they actually want is the new one. They are told what happened.

Twenty is roughly a term of one subject. A free tier nobody can get anything out of never produces a
Pro customer.

### Verification

- **176 tests passing** (19 new), 12 files; `tsc` clean; `npm run build` clean.
- The new tests pin: `planOf(undefined)` is free, so an older account without an `isPro` field cannot
  read as Pro; every feature in `PRO_FEATURES` is refused to free and granted to Pro; the four
  reported features are named **individually** as well as looped, so deleting one from the list
  cannot quietly make the suite pass; the saved-kit cap allows exactly up to the limit and never
  stops Pro; every gated feature has an explanation to show the person who hits it; and **no selling
  point claims anything is unlimited**.

### Files

`src/lib/entitlements.ts` (new), `src/components/ProGate.tsx` (new),
`tests/entitlements.test.ts` (new), `server.ts`, `src/lib/aiService.ts`,
`src/components/AITutorChat.tsx`, `src/components/CollaborativeRoom.tsx`,
`src/components/Analytics.tsx`, `src/components/UpgradePage.tsx`, `src/App.tsx`.

### Worth knowing before this goes live

There are four real accounts and none of them is Pro, so **everyone including Ola and Daniel loses
study rooms, the tutor and the analytics detail** the moment this deploys. That is correct behaviour
for a paid product, but it is not a surprise anyone should get from a deploy.

`localStorage.setItem('brainify_test_pro', 'true')` still unlocks everything client-side for testing,
and the two accounts that need real Pro can have `isPro: true` set on their user document in the
Firebase console.

---

## [2026-08-17] — Upgrade keys: two minted, and single-use actually proved

**Editor:** Claude Code (Opus 5)

Two annual Pro keys were minted for Ola and Daniel, and the single-use guarantee behind them was
tested — which turned up a way to spend the same key twice.

### `scripts/makeKeys.cjs` (new)

Keys are generated with `crypto.randomBytes`, not `Math.random`. A guessable upgrade key is a free
subscription for anybody willing to try a few, and `Math.random` is not built to resist that.

The alphabet excludes `I`, `O`, `0` and `1`. These get read off a screen and typed by hand, and those
four are the ones people get wrong. The key string is also the **document id**, which is what lets
redemption be a direct `getDoc` — and therefore lets the rules deny `list`, so nobody can go fishing
for an unused key.

Written with `create` rather than `set`, so a collision fails loudly instead of quietly resetting an
already-redeemed key back to unused.

### The hole: the same account could spend a key twice

Two accounts sharing one key was never possible — that is blocked on the key document itself, which
only permits `isUsed` false → true and which no client may create or delete.

The same account was a different matter:

1. Redeem key K. The account holds `isPro: true`, `redeemedKey: 'K'`.
2. The subscription lapses and the Lemon Squeezy webhook sets `isPro: false`. `redeemedKey` is left
   holding `'K'`.
3. Write `{ redeemedKey: '' }`. **This was allowed**, because `paidFieldsUnchanged()` only looks at
   `isPro` and `subscriptionType`, and neither of them moved.
4. Re-redeem K. The guard `k != resource.data.redeemedKey` now compares against `''` and passes; the
   key still exists, is still `isUsed`, and is still stamped with this uid. Pro granted again.

Step 3 is the whole bug. The guard against re-pointing at a key compared against a field the user was
free to clear first. `redeemedKey` is now pinned on every write that is not itself a redemption.

### Proved against the live rules, not the rules file

There is no JDK on this machine, so the Firestore emulator cannot run and the existing tests can only
read `firestore.rules` as text. That is worth something — the new structural test does fail when the
fix is removed and pass when it is restored, which was checked both ways — but reading a rules file
is not the same as exercising it.

So the deployed rules were tested directly: two throwaway accounts, one throwaway key, and every
bypass attempted through the Firestore REST API, which enforces exactly the same rules a browser
gets. The Admin SDK was used only for setup and cleanup, because it bypasses rules and would have
proved nothing.

| Attempt | Result |
|---|---|
| A claims the key | 200 — allowed |
| A grants itself Pro with it | 200 — allowed |
| B claims the already-used key | **403** |
| B grants itself Pro with A's key | **403** |
| A clears `redeemedKey` while free *(the hole)* | **403** |
| A re-redeems the same key | **403** |
| B simply writes `isPro: true` | **403** |

All seven as intended. Both throwaway accounts and the throwaway key were deleted afterwards, and the
deletion was verified rather than assumed.

### Verification

- **184 tests passing** (8 new); `tsc` clean; `npm run build` clean; rules deployed.
- The new structural tests pin all three layers separately: a key may only go unused → used; it is
  stamped with the claiming uid; clients may never create or delete one; the plan type cannot be
  swapped mid-redemption (a monthly key must not grant an annual plan); Pro is only granted for a key
  stamped with *your* uid; `redeemedKey` is pinned outside a redemption; and the collection cannot be
  listed.
- The `redeemedKey` test was confirmed to **fail** with the fix reverted, so it is testing the fix
  rather than passing by accident.

### Files

`scripts/makeKeys.cjs` (new), `firestore.rules`, `tests/rules-structure.test.ts`.

### Worth knowing

Production now holds **six accounts**, up from four — two people signed up on the 16th and 17th
without being asked to. That makes the Pro gating from the previous entry live for real users, so the
two keys should be redeemed before anyone demonstrates the app.

---

## [2026-08-17] — Generation was down because every model id had been retired

**Editor:** Claude Code (Opus 5)

Study kit generation stopped working entirely. The only symptom was
`All AI services are currently busy. Please try again.`

Nothing in the app had changed. **Every model in both fallback chains had been retired by its
provider**, and image input had been dead for exactly as long, from the same cause.

### What was actually wrong

Each one tested against the live API rather than inferred:

| Model | Where | Result |
|---|---|---|
| `gemini-2.0-flash` | free chain, first | **404** — "no longer available" |
| `gemini-1.5-flash` | pro chain + **all image analysis** | **404** — "not found for API version v1beta" |
| `llama-3.3-70b-versatile` | both chains | gone from Groq's model list |
| `mixtral-8x7b-32768` | pro chain | gone |
| `llama3-8b-8192` | pro chain | gone |
| `llama-3.1-8b-instruct:free` | both chains, last | "unavailable for free — the paid version is available now" |

Six models, three providers, nothing left standing. A fallback chain is only insurance if the
fallbacks are alive, and every link had rotted independently while the code sat still.

### The message was the reason it took so long

"All AI services are currently busy" is what you say when everything is **rate limited**. It is not
what you say when every model id you hold has been deleted. The one sentence the app could produce
pointed firmly at the wrong cause.

The chain now records each provider's actual error and logs all of them together, so a dead model id
reads as a dead model id. It also treats a **200 with an empty body as a failure** — a provider that
returns nothing has not succeeded, and taking it would hand the student a blank study kit and call it
done.

### Rolling aliases where they exist

`gemini-flash-latest` replaces the pinned versions and is first in both chains. It tracks whatever
the current flash model is, so it cannot retire out from under us the way `gemini-2.0-flash` did.

This is the third time this project has been broken by a pinned external id — dead YouTube video ids
twice, dead model ids now. Where a provider offers an alias, use it. Where it does not, the id is
pinned and `npm run check:ai` exists so the next retirement is something we check for rather than
something a user reports.

OpenRouter is **out of both chains**. Its free tier refuses the model we used, and every model still
listed as free returned a provider error when tested. A fallback that is always dead is worse than no
fallback: it adds a slow failure to every request before the real error surfaces.

### The trap inside the replacement

The new Groq models are **reasoning models**, and their reasoning is charged against `max_tokens`
before a single character of answer appears.

`npm run check:ai` found this out about its own first version: it asked for 30 tokens, the model
spent all thirty thinking, and it returned **empty content with `finish_reason: "length"`**. No error.
The script duly reported a perfectly healthy model as dead.

That is not a curiosity — a study kit is a long reply, and the old 2048-token budget was close enough
to the edge to truncate JSON mid-object and fail the parse. So:

- `reasoning_effort: 'low'`, which is right here rather than a compromise: the prompts in
  `studyPrompts.ts` state the format precisely, so there is nothing to deliberate about. Measured on
  a real quiz prompt it cut reasoning from 296 characters to 26 **and produced more usable output**.
- Budgets raised to 4096 (free) and 8192 (pro), because reasoning shares them.

### Verification

Not "the models respond" — the actual pipeline, end to end, through `generateWithAI` and the real
parsers:

| Mode | Plan | Result |
|---|---|---|
| summary | free | 1,671 characters |
| quiz | free | **5 questions parsed** — the free allowance exactly |
| flashcards | pro | **20 cards parsed** — the Pro allowance exactly |

Gemini happened to be returning 503 during that run, so all three were served by Groq — which is the
fallback chain doing precisely its job, and something it could not have done an hour earlier because
every fallback was dead.

- **184 tests passing**; `tsc` clean; `npm run build` clean.
- `npm run check:ai` reports 3/3 alive.

### Files

`scripts/checkProviders.cjs` (new), `src/lib/aiProviders.server.ts`, `package.json`.

### For next time

Run **`npm run check:ai`** the moment generation misbehaves. It tests the exact models the app uses
and, when everything is dead, prints the two commands that list what each provider currently offers.

---

## [2026-08-17] — A provider registry, so free capacity is a config line

**Editor:** Claude Code (Opus 5)

Ola asked whether we could hold several Google accounts and pool their free Gemini quotas.

**No — and the alternative is better.** Google, Groq, Mistral and the rest all prohibit extra
accounts created to get around rate limits, and they link accounts by phone number, payment method
and device, so it is not difficult for them to spot. The realistic outcome of being caught is *every
linked account closed*, including the one the live site runs on. It frequently does not even work,
because limits are often per payment identity rather than per account.

Six companies' free tiers, each under its own terms, is more capacity than six accounts at one
company would have given — and none of it can be withdrawn for cheating.

### The registry

Nearly every inference company speaks the OpenAI chat-completions shape, so there is now **one**
function that talks to all of them and a provider is a row in a list:

```ts
{ id, name, baseUrl, keyEnv, large, small, reasoning?, signup }
```

Six are pre-configured: Groq, Cerebras, Mistral, GitHub Models, Together and OpenRouter, alongside
Gemini, which keeps its own path because it is not OpenAI-shaped through its SDK and because image
analysis goes through it.

**A provider with no key set is skipped silently**, deliberately: the app has to run for anyone who
has cloned it with a single key, and a missing optional key is not an error. So adding capacity is
sign up → key into Render → redeploy. No code change, and the chain rebuilds itself.

The dedicated `callGroq` is gone, replaced by the generic caller. Its hard-won comment about
reasoning budgets moved onto the `reasoning` flag rather than being deleted with it.

### `npm run check:ai` now reports what is missing

It tests every configured model and then lists the providers with no key, each with its sign-up URL —
because each of those is a separate company's free tier going unused.

Run right now, it makes the case on its own:

```
  DEAD  Gemini gemini-flash-latest      503 currently experiencing high demand
  OK    Groq openai/gpt-oss-20b         OK
  DEAD  OpenRouter llama-3.3-70b:free   unavailable for free
  1 alive, 2 dead, 4 not set up.
```

Gemini is rate-limited at this moment and **Groq is the only thing keeping the app up**. One provider
away from the outage we had this morning. That is the argument for the other four.

### Verified

End to end through `generateWithAI` and the real parsers, not just that the models answer: a free
quiz generated and **5 questions parsed** — Gemini 503, Groq picked it up, exactly as designed.

- **184 tests passing**; `tsc` clean; `npm run build` clean.

### Files

`AI_PROVIDERS.md` (new), `src/lib/aiProviders.server.ts`, `scripts/checkProviders.cjs`,
`.env.example`.

### On paying, honestly

Worth saying plainly in the docs, so it is not discovered the expensive way: flash-class inference is
priced per *million* tokens and a study kit is a couple of thousand, so Pro at £5/month covers an
enormous number of generations. The free tiers exist to serve **free users** — that is a
customer-acquisition cost, not a problem to engineer around. If free usage ever gets expensive enough
to matter, that means the app is working.

---

## [2026-08-17] — Keys are permanent, and friends can see each other

**Editor:** Claude Code (Opus 5)

### A redeemed key now survives everything

Ola asked for founder keys to stay with the account permanently. They would not have.

The Lemon Squeezy webhook wrote `isPro` **unconditionally** on every
`subscription_created` / `subscription_updated` event. So an account that redeemed a key and later
took out — then cancelled — a subscription would be set back to free by an unrelated billing event.
And because a key can only be spent once, and `redeemedKey` is now pinned, **that account could
never get its Pro back**. Founder and comp accounts would have quietly lost access with no way to
restore it.

Redemption now stamps `proSource: 'key'`, and the webhook refuses to revoke Pro that came from a
key. A key is a permanent grant; a subscription is a rental, and only the rental is revocable.

`proSource` is pinned exactly as hard as `redeemedKey` — if it could be cleared, the protection it
grants could be cleared with it, which is the same shape of bug as the one closed this morning.

Note the webhook still stamps `proSource: 'subscription'` when *granting*, and deliberately does not
clear it when downgrading: clearing it would throw away the fact the check depends on.

### Joining a room was never free — but Daniel was right that something is broken

Daniel asked whether joining someone's room should be Pro, and Ola's answer was that the whole study
room is Pro, with friends free so people can challenge each other and compare progress.

Creating and joining go through the **same** socket event, `join-room`, which has verified the
account's plan server-side since this morning. So joining was already Pro and that part is not a bug.

The real one: **the free friends feature had nothing free to do.** A friend row offered "Message"
(free) and "Study together" (a Pro-gated room). Neither of the two things Ola named as free —
challenging each other, and seeing each other's progress — existed at all. A free user could add a
friend and then hit a paywall.

### Friends can see each other's progress

Level, XP and streak, visible to friends and nobody else.

**A separate collection, not more fields on `/users`.** The user document holds email, plan, token
spend and redeemed keys, and its rule correctly refuses to show any of that to anyone else.
Loosening that rule to expose a level number would have exposed everything sitting beside it. So
`user_stats` holds those four numbers and nothing else, enforced with `hasOnly` — without that it
becomes a second, unguarded profile that every friend can read.

Read access is granted through the **friendship document itself**, using the same sorted-pair id
`lib/friends.ts` builds. That means one `exists()` with no query, no second copy of who is allowed,
and — because the check runs on every read — **unfriending closes the window immediately**.

Stats load once per friend when the list arrives rather than being watched live; a level does not
change second to second, and a listener per friend is a listener per friend forever. A late reply is
discarded if the list changed underneath it, so removing someone cannot repopulate their row.

### Verification

Proved against the **deployed** rules, not the rules file — two throwaway accounts, a third as a
stranger, and a throwaway key, all through the Firestore REST API:

| Attempt | Result |
|---|---|
| A redeems the key, stamped `proSource: key` | 200 |
| A clears `proSource` to escape the protection | **403** |
| Webhook sees the key grant and leaves Pro alone | left alone, still Pro |
| A stranger reads B's stats | **403** |
| A **friend** reads B's stats | 200 |
| B reads their own | 200 |
| A stranger writes B's stats | **403** |
| A reads B's stats **after unfriending** | **403** |

All nine as intended, and everything created was deleted afterwards.

- **192 tests passing** (8 new); `tsc` clean; `npm run build` clean; rules deployed.

### Files

`firestore.rules`, `server.ts`, `src/components/UpgradePage.tsx`, `src/components/FriendsView.tsx`,
`src/lib/friends.ts`, `src/App.tsx`, `tests/rules-structure.test.ts`.

### Still to build

**Challenging a friend** — the other half of what Ola said should be free. `GameMode` already accepts
an injected deck (that is how the Arcade works inside a room), so the missing piece is a challenge
document holding the questions and both scores. That is the next thing.

---

## [2026-08-17] — Challenge a friend

**Editor:** Claude Code (Opus 5)

The other half of what Ola said should be free: friends can now race each other through the same
questions and see who won. Study rooms remain the paid feature.

### Two decisions do all the work

**The questions live on the challenge.** They are generated once, by the challenger, and stored.
Regenerating them for the second player — even from the identical topic — would give the two people
different questions, and two scores from different questions do not compare. A challenge whose
scores cannot be compared is not a challenge.

**Each score is its own document, written once.** `challenges/{id}/scores/{uid}`, where you may
create yours and nobody may update any. That single `allow update: if false` is what stops someone
replaying until they beat their friend — and because each score is separate, the rules never have to
reason about which keys of a shared map changed, which is where this sort of thing usually goes
wrong.

Creating a challenge requires an **existing friendship**, checked with the same sorted-pair id
`lib/friends.ts` builds. Without that, a challenge would be a way to push questions and a name into a
stranger's app; the friends list is the consent step, and this is where that consent is checked.

The round itself is `GameMode` with the challenge's questions injected — the same path the Arcade
already uses inside a study room, so there is no second game engine to keep in step. Challenges pay
no XP: they are for the scoreboard.

### Small things that matter

A challenge with one score has **no winner**, rather than showing the only player as having won —
which would otherwise be true for every challenge until the second person finished. A tied score is
broken on accuracy, and a genuine draw says so instead of picking someone. The winner is marked with
a trophy as well as a coloured border, so it does not depend on seeing that purple.

### Verified against the deployed rules

Two throwaway accounts, through the Firestore REST API:

| Attempt | Result |
|---|---|
| A challenges a **stranger** | **403** |
| A challenges a friend | 200 |
| A edits the questions afterwards | **403** |
| A records a score | 200 |
| A **replays to improve it** | **403** |
| A writes B's score | **403** |
| B records their own | 200 |

All seven as intended; everything created was deleted afterwards.

- **203 tests passing** (11 new); `tsc` clean; `npm run build` clean; rules deployed.
- The new unit tests pin the winner logic specifically: higher score wins; a tie breaks on accuracy;
  a real draw returns null rather than a name; and there is no winner until both have played.

### Files

`src/lib/challenges.ts` (new), `src/components/Challenges.tsx` (new),
`tests/challenges.test.ts` (new), `firestore.rules`, `src/components/FriendsView.tsx`,
`tests/rules-structure.test.ts`.

### Where the free/paid line now sits

| | |
|---|---|
| **Free** | Friends, direct messages, seeing a friend's level and streak, challenges, the Arcade |
| **Pro** | Study rooms (creating *and* joining), the AI Tutor, detailed analytics, unlimited saved kits |

That is Ola's stated policy, implemented and enforced — the paid gates on the server and the socket,
the free features genuinely free.

---

## [2026-08-17] — Mobile pass, part one: the defects findable without a device

**Editor:** Claude Code (Opus 5)

Daniel asked for the mobile pass once challenges were done. Challenges shipped in `c5f3727`, so this
is the part of the pass that can be done properly from the code — specific, checkable failure modes
rather than guesses about how a screen looks.

### `100vh` is not the height of a phone screen

`<main>` was `h-screen`. On iOS Safari `100vh` is the viewport height with the address bar
**hidden**, which is taller than what you can actually see while it is showing — so the bottom of the
app sat underneath the browser chrome, and it took the mobile bottom nav with it.

Now `h-dvh`, the dynamic viewport height, which follows the chrome as it moves. Same fix in the
direct-message view (whose composer sits at the bottom, so it was the worst affected) and the
dashboard skeleton.

### Four controls did not exist on a phone

`opacity-0 group-hover:opacity-100` is a normal desktop pattern, and on a touch screen the second
half never fires — there is no hover, so the element stays at `opacity: 0` permanently. Four real
controls were invisible and unreachable on mobile:

- deleting your own direct message
- deleting a study-planner task
- the Library's list-view actions
- changing your profile photo

All four now use a `.hover-reveal` class that only hides behind `@media (hover: hover) and (pointer:
fine)`. On a phone they are simply visible. It also reveals on `:focus-visible`, so keyboard users
can reach them, which the original could not do either.

Two other matches were left alone deliberately: a decorative gradient and a `pointer-events-none`
tooltip. Neither is a control.

### The Pro column was clipped off the page that sells Pro

The Free vs Pro comparison table sat in a wrapper with `overflow-hidden` and cells at `p-8`. Three
cells of 32px padding is 192px before a single word of text, so on a 360px phone the table is wider
than the screen — and `overflow-hidden` meant the excess was **clipped rather than scrollable**. The
column that fell off the right edge was Pro.

Wrapper is `overflow-x-auto` now, padding is `p-4 sm:p-8`, and the table has a sensible `min-w` so it
scrolls as one piece instead of squashing.

Also removed `min-w-fit` from the header's right-hand group, which combined with `flex-shrink-0` meant
that group could never shrink and would push the header wider than a narrow screen.

### Ten orphaned files deleted

The whole of `src/views/` — nine components — plus `src/components/Sidebar.tsx`. Nothing imports any
of them; `SettingsView` and the rest are aliases defined in `App.tsx` pointing at `components/`, not
these. Confirmed by deleting them and watching `tsc` and the production build stay clean.

That is the third orphan pair found in this project (`MusicPage`/`MusicMiniPlayer` were the first two).
Dead components matter more than usual here because they look like the real thing when you go
searching for where a bug lives.

### Verification

- **203 tests passing**; `tsc` clean; `npm run build` clean after the deletions, which is what proves
  they were unused.
- No `h-screen` or `100vh` left in any rendered layout.
- No `opacity-0 group-hover:` left on anything that is a control.

### Files

Deleted: `src/views/` (9 files), `src/components/Sidebar.tsx`.
Changed: `src/index.css`, `src/App.tsx`, `src/components/UpgradePage.tsx`,
`src/components/DirectMessages.tsx`, `src/components/StudyPlanner.tsx`,
`src/components/Library.tsx`, `src/components/Settings.tsx`,
`src/components/skeletons/DashboardSkeleton.tsx`.

### What part two needs

The rest is not findable from the code. Keyboards covering inputs, real tap-target sizes, and how
text actually wraps only show up on a device — and DevTools' device mode does not reproduce either of
the first two. Screenshots of the Dashboard, Arcade, Analytics and Settings from a real phone would
make short work of it; the last one Ola sent found three bugs faster than reasoning did.

---

## [2026-08-18] — Mobile pass, part two: from real device screenshots

**Editor:** Claude Code (Opus 5)

Nine screenshots from an actual phone. They found more in ten minutes than the code audit did, and
one of them was a broken feature rather than a layout problem.

### Adding a friend was impossible for everybody

The Friends screen showed **"Missing or insufficient permissions"** on every attempt.

Firestore evaluates a `get` on a document that **does not exist** with `resource` set to `null`. The
rule said `request.auth.uid in resource.data.uids`, which throws on null — so the read was **denied**
rather than returning "not found".

That is exactly the path `sendRequest()` takes. It calls `areFriends()` first, which reads the
friendship document *before a friendship exists*, and then checks whether the other person has
already asked you — another document that normally does not exist. Both reads were denied, so adding
a friend failed for everyone who was not already a friend. Which is everyone.

Both rules now check `resource == null` first. That leaks nothing: a missing document has no data.

Proved against the deployed rules — reading a missing friendship returns **404** rather than 403, the
friend request goes through with **200**, and a stranger still gets **403** reading it.

### Light mode was never checked

The bottom navigation used a hardcoded `text-white/40`. Measured against `--bg-main` (`#f8f7ff`) that
is **1.03:1** — white on near-white, which is why LIBRARY, STATS, FOCUS and SETTINGS were invisible in
two of the screenshots.

The theme tokens were no better, and they were measured rather than eyeballed:

| | contrast on `#f8f7ff` | |
|---|---|---|
| `--text-dim` was `0.4` | **2.47:1** | fails (4.5:1 required) |
| `--text-muted` was `0.6` | **4.41:1** | fails |
| `--text-dim` now `0.68` | **5.73:1** | passes |
| `--text-muted` now `0.8` | **8.64:1** | passes |

They had been copied from the dark theme, where pale ink on a dark ground behaves completely
differently, and never re-checked. Half the secondary text on the site was unreadable in daylight.

### Modals put dark text on a black backdrop

"Add New Exam" and "Ready to Focus?" were both barely legible. The panels use `glass`, which is
`rgba(0,0,0,0.03)` in light mode — effectively transparent — sitting on a `bg-black/80` backdrop. So
light mode's dark navy text was rendered onto near-black.

Every modal panel now uses `glass-panel`, which is opaque by design. Padding is responsive too, since
`p-8` on a 360px screen leaves very little room for the form.

### The bottom nav sat on top of things

It is `fixed` at `z-50`, and three places did not reserve room for it: the Focus Timer's play, reset
and settings buttons; the sidebar's level bar and account row; and the foot of every scrolling view.
All three now clear it on mobile and leave it alone on desktop, where the nav does not exist.

### The Pro gate covered the page title

`ProGate` in preview mode wrapped the weekly/monthly/all-time switcher — a row about 50px tall —
while the message it shows is an icon, a heading, a sentence and a button. Absolutely positioned
inside a 50px box, it spilled upwards over the page heading, printing "Detailed progress is part of
Pro" across "Your Progress". It now has a minimum height, so the gate stays inside the thing it gates.

### Emoji

Fourteen removed from user-facing text — toasts, headings, the onboarding steps, the sidebar timer,
the leaderboard, the browser tab title. The ones left behind are load-bearing: they match emoji in
*AI output* so the summary renderer can pick the right icon, and removing those would break the
parsing.

### Verification

- **204 tests passing** (1 new); `tsc` clean; `npm run build` clean; rules deployed.
- The friends rule was proved end to end against production, and the contrast numbers above were
  computed from the sRGB relative-luminance formula rather than judged by eye.
- The rules test for friendship reads was rewritten to check the *property* rather than the exact
  wording — it asserted a string that the fix legitimately changed, which is a test that would block
  a correct fix.

### Files

`firestore.rules`, `src/index.css`, `src/components/Navigation.tsx`, `src/components/ProGate.tsx`,
`src/components/FocusTimer.tsx`, `src/components/StudyPlanner.tsx`, `src/components/Settings.tsx`,
`src/components/CollaborativeRoom.tsx`, `src/components/ErrorBoundary.tsx`,
`src/components/Leaderboard.tsx`, `src/components/TimerEngine.tsx`, `src/App.tsx`,
`tests/rules-structure.test.ts`.

### Still open

The AI providers were checked while writing this: Gemini and Groq both answering, OpenRouter's free
model still refusing. The "Could not build that" in the planner screenshot was taken during
yesterday's outage, before the retired model ids were replaced — it should not recur, and
`npm run check:ai` is how to confirm.

---

## [2026-08-18] — Desktop pass, from a ten-minute screen recording

**Editor:** Claude Code (Opus 5)

Ola recorded himself testing on a laptop and typed notes into Notepad as he went, which the recording
captured. Six things, and one of them was mine.

### The level-up popup never went away — my regression

`setShowLevelUp(true)` was called and **nothing in the file ever set it back to false**. It sat on
screen for the rest of the session.

That was not always true. The dismissal was a `setTimeout` living inside the XP-on-generate blocks,
and those blocks were deleted when XP became Arcade-only — which took the only `setShowLevelUp(false)`
with them. Removing the caller removed the cleanup, and nothing failed loudly enough to notice.

The timer now lives with the popup rather than with whatever raised it, which is where it should
always have been. Tapping it dismisses it too, since four seconds is a while to stare at something
you have already read. It also sits above the mobile bottom nav instead of behind it.

### "Study" was invisible in light mode

The wordmark is `Study` in a plain span plus `Quest` in a gradient one — and the plain span was
`text-white`. In light mode that is white on near-white, so the logo read as just **"Quest"**, which
is exactly how it appears in the recording. It uses the theme token now.

### The header comes back on hover

Scrolling up to retrieve the header is reasonable on a phone, where scrolling is how you move around
anyway. On a desktop it means scrolling the page just to reach the Upgrade button.

A four-pixel strip along the top of the window now brings it back on hover. That strip is
`hidden md:block`, and the reveal is pointer-driven rather than breakpoint-driven, so a wide *touch*
device keeps the scroll behaviour — it has no hover to offer.

### A study room no longer takes the whole desktop

Hiding the app chrome inside a room was right for mobile: the room draws its own header and there is
no width to share. On a laptop it went too far — you lost the sidebar and the header, so leaving a
room meant hunting for the room's own close button instead of just clicking Dashboard.

`roomTakesScreen` is now `inRoom && !isDesktop`. The phone behaves as before; the desktop keeps its
navigation and can leave the way it arrived.

### The music bar can be put away

It sits across the bottom for as long as anything is playing, which is the point — but *"I want my
screen back"* and *"I want silence"* are different wishes, and the only control offered was the one
that stopped the sound. Minimised, it is a single round button in the corner with the track name as
its tooltip; the music carries on.

### Also seen in the recording

- The Pro gate on Study Rooms reads correctly, and the generated music tabs (Still, Drift, Dusk,
  Glass) all render and play.
- **A Boss Battle question was "Calculate 45 + 55."** That is not a GCSE question, and it is the same
  complaint Daniel opened with. The prompt does say GCSE; the model ignored it for an easy topic.
  Worth a proper look — noted rather than guessed at here.
- The search overlay returns an empty panel with no "no results" message.

Neither of those last two is fixed in this entry, because neither is a one-line change and both
deserve to be understood before being touched.

### Verification

- **204 tests passing**; `tsc` clean; `npm run build` clean.

### Files

`src/App.tsx`, `src/components/Logo.tsx`, `src/components/MusicBar.tsx`.

---

## [2026-08-18] — Library search

**Editor:** Claude Code (Opus 5)

### First, a correction

I reported a broken "search overlay" from the screen recording. **There is no such thing in
StudyQuest.** Zooming into the frame shows the Windows 11 search flyout — its multicoloured magnifier
glyph, and a panel sitting *above the browser's address bar*, outside the page entirely. Ola was
typing "note" to launch Notepad, which he then used for the very notes that recording captured.

I should have checked before listing it as a defect. Looking properly at the search the app *does*
have turned up a real bug, so the trip was not wasted.

### A search that found nothing claimed you had nothing

The Library rendered one empty state for two completely different situations. With thirty study kits
and a search matching none of them, it said:

> **No study kits yet — generate your first one**

and offered "Generate my first kit" and "Create manually". Both the diagnosis and the suggested
action were wrong: what you want there is to clear the search.

The two states are now distinguished — different heading, different explanation, a different icon,
and a single **Clear the search** button. The heading names what you searched for and the body says
how many kits you actually have, so the number contradicts the old message rather than repeating it.

### And a crash waiting to happen

The filter was:

```ts
item.subject.toLowerCase().includes(...) || item.content.toLowerCase().includes(...)
```

`content` is not present on every kit — items saved by older versions do not all carry it — and
`undefined.toLowerCase()` throws. That would have taken the whole Library down **mid-keystroke**, on
a page whose entire job is to be the place your work is safe.

Matching moved to `src/lib/librarySearch.ts` where it can be tested, every field is coalesced, the
query is trimmed, and the **mode** is now searchable too — "quiz" is a thing people look for and it
never appears in a title.

### Verification

- **215 tests passing** (11 new); `tsc` clean; `npm run build` clean.
- The tests pin: matching on title, on content, and on mode; case and surrounding spaces ignored; an
  empty query returns everything; **ragged items with missing fields do not throw**; and the three
  library states are told apart — including that a search with no results over an *empty* library
  still says "no kits" rather than blaming the search.

### Files

`src/lib/librarySearch.ts` (new), `tests/librarySearch.test.ts` (new), `src/components/Library.tsx`.

---

## [2026-08-18] — "Calculate 45 + 55" — question quality

**Editor:** Claude Code (Opus 5)

The Boss Battle question in the screen recording was `Calculate 45 + 55`. That is Daniel's original
complaint, and it turned out to be three separate faults rather than one.

Everything below was **measured** — the same prompts run against the live models before and after.

### 1. "GCSE" is not a difficulty

The word appeared once, buried in the content line, and calibrated nothing. Running the old prompt
across four topics produced, from the *same instructions*:

- **"Calculate 45 + 55"** — primary school
- **"What is the primary source of electrons that reduce NADP+?"** and the Calvin cycle by name —
  A-level

Neither is the exam these students sit. So the prompt now states a floor, a ceiling and a target,
each naming the failure it exists to prevent — including the two real questions above, quoted. It
also says what to do when the "topic" is a whole subject like `maths`: pick specific GCSE topics
and vary them, rather than retreating to the easiest thing in the subject.

Measured after, on the same vague topics:

| before | after |
|---|---|
| Calculate 45 + 55 | Value of 3(2x - 4) + 5x when x = 2 |
| | Solve for n: 2n - 5 = 3n + 7 |
| | A circle has diameter 14 cm — area to the nearest cm² |
| | 25% discount on an £80 jacket |
| NADP+, Calvin cycle | Function of the chloroplast; which phase of mitosis; prokaryote vs eukaryote |

### 2. Maths could not be generated at all

Two different JSON failures, both found by running it rather than by reading the code.

**LaTeX.** A backslash is only a valid JSON escape if what follows it happens to be one, so
`\(x^2\)` makes `JSON.parse` reject the **whole reply** — one bad question throws away the other
nine, and the student sees "could not build that".

There is a quieter version of the same fault that is worth knowing about: `\frac` begins with `\f`,
which *is* valid, so it parses silently into a formfeed followed by `rac`. No error, just corrupted
text. Nothing can distinguish that from an intended formfeed after the event, which is why the
prompt now bans backslashes at source rather than relying only on repair.

**Curly quotes.** A real maths generation came back as:

    "options": ["-9", “-1”, “7”, ...

The model opened the array with straight quotes and drifted into typographic ones, which are not JSON
delimiters. Whole reply rejected.

`parseJsonReply` now repairs both before giving up — invalid escapes lose their backslash and keep
their text (`\frac` → `frac`, readable rather than fatal), and curly **double** quotes are
straightened. Curly *apostrophes* are left alone: "Newton's" is valid JSON and rewriting it would
change what the question says.

Both topics that previously failed now parse and return ten questions each.

### 3. Groq's free tier is 8,000 tokens per minute

Not a bug, but it explains the "Could not build that" Daniel hit: one generation is about 4,400
tokens, so **two in a minute exhausts the limit**. The fallback chain handles it by moving to the next
provider — which is only useful if there is a next provider, and today there are two, one of which
(Gemini) returned 503 repeatedly during this session.

This is the concrete argument for the unused free tiers in `AI_PROVIDERS.md`: Cerebras and GitHub
Models are two keys and no code, and would take this from "one bad minute breaks generation" to
"barely noticeable".

### Verification

- **225 tests passing** (14 new); `tsc` clean; `npm run build` clean.
- The new tests pin: a LaTeX reply that `JSON.parse` genuinely rejects is recovered with its maths
  still readable and its answer still markable; valid escapes and unicode escapes are untouched; a
  reply that drifts into curly quotes is recovered with all four options intact; a curly apostrophe
  survives; the prompt names both a floor and a ceiling and quotes the actual bad question; and the
  notation rules are sent to the JSON modes but **not** to the prose ones, which have no parse to
  break.

### Files

`src/lib/studyPrompts.ts`, `tests/studyPrompts.test.ts`.

---

## [2026-08-18] — The boss fight is a game now, and Pro gets it in 3D

**Editor:** Claude Code (Opus 5)

The fight worked mechanically and looked like a form: a name, a percentage and a bar. This is the same
fight, drawn as a game.

### Sound

`src/lib/arcadeSound.ts` — generated, like the music and the ambience. Nothing to 404, nothing a
school network can block, no download, no licence.

Seven sounds: hit, miss, combo, enrage, victory, defeat, and a clock tick under ten seconds. Each is
short, quiet and mixed well below the music — they play dozens of times a round, and anything with a
tail becomes a drone.

Two decisions worth recording:

- **The sound fires on the tap, not on the state change.** There is a deliberate 650ms pause after
  answering so you can see which option was right. Waiting for it would put the hit most of a second
  after the tap, at which point it stops feeling like a consequence of the tap.
- **The combo sound rises with the streak.** A major arpeggio that starts higher the longer the run,
  so the sound itself tells you the streak is building — faster than reading a number.
- **Wrong is a falling muffled tone, not a buzzer.** It plays right after a mistake, and a harsh sound
  there is a reason to stop playing.

Muting is one tap and is remembered, because someone revising in a library meant it.

### The 2D arena

`BossArena2D.tsx`. Everything drawn — SVG and CSS, no sprites — partly out of habit by now and partly
because a boss that reacts has to be made of parts that move independently. **An image cannot flinch.**

What actually makes it read as a game, in order of how much each contributes:

1. **Reaction.** The boss flinches when hit, lunges when it hits you, and its face changes with the
   phase — eyes angling down, mouth going from level to a grimace to bared teeth, horns appearing at
   phase 3. The silhouette changes, which reads faster than a colour does. You can tell how the fight
   is going without reading the percentage.
2. **Impact.** Damage numbers fly off, twelve particles burst from the centre, the arena shakes. These
   tell you the hit landed before you have read anything.
3. **Anticipation.** An idle bob and a breathing floor glow, faster at phase 3, so the thing is alive
   between questions rather than frozen while you think.

Health is **segmented**: a smooth bar hides how much a hit was worth, and with notches you can see the
chunk come off. Lives are hearts rather than a number.

All of it respects `prefers-reduced-motion` — the shake and the float stop, the information does not.

The arena animates from **one bumped event id** rather than from game state. Deriving animation from
state means any re-render replays the hit; an explicit event fires exactly once, when something
actually happened.

### The 3D arena — Pro

`BossArena3D.tsx`. **Raw WebGL, not three.js.**

three.js is around 600 KB and the main bundle is already 2.2 MB. Even lazy-loaded that is a real
download on a phone for one screen. This is **6.8 KB**, verified as its own chunk in the build — so a
free player never downloads a byte of it — and it does everything the scene needs: a perspective
camera, a lit subdivided icosahedron that rotates and pulses with the phase, and a grid floor
receding to a horizon.

The lighting has a rim term as well as a lambert one, which is what stops it reading as a flat
silhouette against a dark background. The solid shrinks as its health drops, so the state of the
fight is legible from the shape alone.

Three things it does deliberately:

- **Falls back to 2D if WebGL is unavailable.** A Pro user on an old phone gets the fight, not a black
  rectangle.
- **Keeps the numbers in HTML.** Text drawn into a canvas is invisible to a screen reader and blurry
  when the browser zooms, so health, lives and the boss's line stay as DOM on top of the canvas.
- **Releases the GL context on unmount.** Browsers cap how many exist; leaking one per round would
  eventually refuse to make more.

### Where the gate sits

**On the spectacle, never on the mechanics.** A free player gets the same boss, the same phases, the
same damage, the same questions — drawn in 2D. Pro gets it in a WebGL arena.

Gating how a fight *looks* is a fair upsell. Gating whether you can *win* it would not be, and there
is deliberately no feature flag that could express the latter — there is a test asserting that
`PRO_FEATURES` contains no such thing.

### Verification

- **226 tests passing** (1 new); `tsc` clean; `npm run build` clean.
- `BossArena3D` confirmed as a separate 6.8 KB chunk in `dist/assets`, which is the whole argument for
  not using three.js.

### Files

`src/lib/arcadeSound.ts` (new), `src/components/BossArena2D.tsx` (new),
`src/components/BossArena3D.tsx` (new), `src/components/GameMode.tsx`, `src/lib/entitlements.ts`,
`tests/entitlements.test.ts`.

---

## [2026-08-18] — Slur filter, complete account erasure, rounder limits

**Editor:** Claude Code (Opus 5)

### First: nothing was broken by the Firestore clear-out

Ola and Daniel emptied several collections while resetting to clean data, and worried they had broken
something. They had not, and it is worth writing down why: **Firestore has no such thing as an empty
collection.** A collection exists only while it holds a document, so the "missing" ones will reappear
the moment anything writes to them. Rules and indexes live in this repository and were already
deployed.

What the clear-out *did* leave was the opposite problem — **three documents belonging to accounts that
no longer existed**, one of them holding an email address. That is the account-deletion bug below,
demonstrated on live data.

### Usernames could contain slurs

Ola and Daniel found the n-word could be registered. On an app where a username appears in a friends
list, a study room and a challenge scoreboard, in front of other children, that is the worst thing
this codebase was carrying.

**The hard part is not the word list — it is that people evade one.** `n1gger`, `n!gger`,
`n.i.g.g.e.r`, `nigg3r`, `niiigger` and `ñïgger` are one word to a reader and six different strings
to `includes()`. So a name is normalised before it is checked: accents stripped, confusable digits
and symbols folded back to letters, separators removed, repeated letters collapsed. All six examples
arrive at the same string.

**My first version had a bug the tests caught immediately, and it is instructive.** I wrote the word
lists by hand in post-collapse form — and got it wrong three times over, because `support` collapses
to `suport` and `ass` collapses to `as`, so entries written in ordinary spelling matched nothing. The
lists are now run through the same normaliser at load. That removes a whole class of failure which is
otherwise invisible until somebody gets a slur past the filter.

**It also blocked Scunthorpe**, in a file whose own comments named the Scunthorpe problem. Knowing
about a trap is not the same as avoiding it. There is an allowlist now, checked first, with UK place
names in it — this is an app for British schoolchildren and some of them live in those places.

Display names get the same treatment, because a filtered username beside an unfiltered display name
is not a filter.

The rejection message deliberately does not repeat the word, name the matched term, or explain the
rule. Anything more detailed is a hint sheet.

### Account deletion is now actually complete

The client version could never finish, for three reasons no amount of client code can fix: it can
only delete what the security rules let it query; it must delete the Auth user **last**, since it
needs to be signed in for everything before that, so any failure in between strands a half-erased
account; and it does not run at all when an account is removed from the Firebase console — which is
exactly how those three orphans appeared.

Erasure now runs on the server with the Admin SDK, across **13 collections**: sessions, tasks, exams,
history, mistakes, the username claim, friendships, friend requests, DM threads, challenges and their
scores, the profile, the public profile, the stats — and then the login, last, so a failure leaves a
working account to retry rather than a stranded one.

Two details worth keeping:

- **The username claim is released only if it is still yours.** After a rename someone else may hold
  that name, and deleting an account must not free a stranger's username.
- **It requires a sign-in from the last ten minutes.** Erasure is irreversible, so a token that has
  been sitting in someone's pocket since yesterday must not be able to destroy a term's revision.

Proved on production: an account seeded with a document in every collection, erased, then every
collection re-checked. Fourteen deletions, no failures, **nothing left behind**.

### Token limits: round, and with the hidden wall removed

Two problems, and the second was the real one.

**The monthly cap was the actual limit and nobody could see it.** Free was 12,000 a day against
120,000 a month — *exactly ten full days*. Somebody revising properly hit an invisible monthly wall on
the 10th, having been told all along about a daily limit that reset tomorrow. It did reset. It just
did not help. Both plans now have twenty full days of monthly headroom, so the daily limit is the one
people actually meet — which is the one the interface talks about.

**And the numbers are round**: free 10,000 a day (8 study kits), Pro 50,000 (40).

The header said **"10,968 tokens left today"**. A token is a unit from our billing arithmetic; nobody
revising for a GCSE can plan around one. It says **"8 study kits left today"** now, and the
limit-reached messages count in kits too.

### The Pro advert in Your Progress

It was `preview` mode — blur the control, float a full upsell card over it. That card is an icon, a
heading, a sentence and a button, over a switcher about 50px tall, so on a phone it spilled over the
page title and even on a desktop it read as an advert dropped into the middle of somebody's own
progress page.

There is a `compact` mode now: a single lock chip sized like the controls beside it. The pitch belongs
on the upgrade page, which is one tap away.

### Verification

- **240 tests passing** (16 new); `tsc` clean; `npm run build` clean.
- The username tests pin every evasion listed above, the Scunthorpe cases (`cassandra`, `analysis`,
  `sussex`, `scunthorpe` itself), reserved names, and that the rejection message never repeats the
  word.
- The token tests pin 8 and 40 kits, the countdown, that it never goes negative when a generation
  overshoots the cap, and that the monthly allowance is at least twenty days of the daily one — the
  test that would have caught the original design.
- Erasure was proved against production, not reasoned about.

### Files

`src/lib/usernameSafety.ts` (new), `tests/usernameSafety.test.ts` (new),
`src/lib/accountData.server.ts` (new), `server.ts`, `src/lib/firebase.ts`, `src/lib/friends.ts`,
`src/lib/tokenService.ts`, `src/components/Settings.tsx`, `src/components/ProGate.tsx`,
`src/components/Analytics.tsx`, `src/App.tsx`, `tests/progress.test.ts`.

---

## [2026-08-18] — Five provider keys added, and the chain reordered by what they actually give

**Editor:** Claude Code (Opus 5)

Ola supplied keys for Gemini, Groq, Mistral, GitHub Models, Together and OpenRouter. Each was tested
against its live API rather than assumed, and the results changed the design.

| Provider | Result |
|---|---|
| **Groq** | Works |
| **Mistral** | Works — a new third provider |
| **OpenRouter** | Works on **paid** models; every `:free` id still refuses |
| **Gemini** | Key valid, but see below |
| **Together** | Key valid, account has **no credit** |
| **GitHub Models** | *"scheduled retirement brownout"* — GitHub is retiring the service |

### Gemini cannot lead the chain — 20 requests a day

The number that changed the design. Gemini's free tier is **twenty requests per day, per model** —
for the whole project, not per user. The API said so directly once a morning's testing exhausted it:

    Quota exceeded ... limit: 20, model: gemini-3.7-flash

Twenty requests does not survive a single classroom. Leading with Gemini meant nearly every real
request paid for a failed call before reaching a provider that could answer. It now sits at the end
of the chain — still worth having, because twenty free requests is twenty more than none, just not as
the front door.

### The chain, ordered by measured allowance

    Groq -> Mistral -> Cerebras -> Together -> OpenRouter -> Gemini

Generous free tiers first; **OpenRouter last because it spends real money**. It holds prepaid credit
rather than a free tier, so it should only ever answer when everything free has failed. At roughly
$0.0005 a study kit, $5 is several thousand of them — far more useful than a free tier that will not
serve a request, but not something to burn on the first call.

Together sits just before it: the key is valid and the account simply has no credit, so it fails fast
today and starts working the moment any is added.

### GitHub Models removed

Not a transient failure and not a key problem — GitHub is retiring the service. The entry is left in
place as a comment so nobody spends an afternoon wondering why a valid token does not work.

### Verified

- Generation proved end to end through the new chain: 10 GCSE questions and 10 flashcards, served by
  Groq, with the fallback visibly stepping past a rate-limited Gemini in the logs.
- **240 tests passing**; `tsc` clean; `npm run build` clean.
- The diff was scanned for key material before committing — `.env` is gitignored and no key appears in
  any tracked file.

### The keys themselves

They were pasted into a chat, so **all six should be treated as compromised and rotated**. They also
have to be added to Render's environment before any of this helps in production — the app reads them
at runtime on the server, and a provider with no key is skipped silently.

### Files

`src/lib/aiProviders.server.ts`, `scripts/checkProviders.cjs`.

---

## [2026-08-19] — Mobile test: the bottom of the screen has more than one owner

**Editor:** Claude Code (Opus 5)

From RED's `mobile test.mov` — the latest mobile pass, recorded on an iPhone in Safari
against the live Render deploy. Everything below is something the video shows happening,
not something inferred from reading the code.

### The upgrade key was fighting the person typing it

One frame is RED entering a real key, and three separate things are wrong in it at once:

- The field reads `-MOIT-QOIB-ROIF` (masked). The `SQ` prefix and the final group have scrolled out
  of view, because 23 characters at `text-2xl` with `tracking-widest` is wider than a phone.
- iOS is offering to autocorrect it to **BEDTIME**, with a lowercase keyboard.
- The placeholder said `PRO-XXXX-XXXX`. Every key ever issued looks like
  `SQ-MOIT-QOIB-ROIF-KOIN` — wrong prefix, and two groups short. Anyone typing to the shape
  shown would stop less than halfway and be told their key was invalid.

Fixed all three. The placeholder is now the real format; the type size steps up with the
screen instead of starting at `text-2xl`; and the field is `autoCapitalize="characters"`,
`autoCorrect="off"`, `spellCheck={false}`.

The submit handler now also normalises what it gets:

```ts
const key = upgradeKey.replace(/\s+/g, '').toUpperCase();
```

The key **is** the Firestore document id, and every key is minted uppercase from a
32-character alphabet with no lowercase in it. So a key typed in lowercase, or pasted with a
stray space out of a chat message, was a lookup miss — and the deliberately vague "invalid or
already used" message then read as a broken key rather than a typo. This cannot turn a wrong
key into a right one, because no two valid keys differ only by case or spacing.

### Five scroll areas, five different guesses at the same number

The music bar covers the bottom of the screen whenever something is playing, sitting above
the nav. Every scroll area had its own hardcoded reservation for that space — `pb-32` on the
dashboard, `pb-28` in rooms and the focus timer, `pb-24` in the sidebar — and every one of
them was written when the nav was the only thing down there. Once the music bar arrived they
were all short by exactly one music bar.

The video shows it four separate times: a topic chip cut in half on the dashboard,
`Quiz Master: +100 XP` covered on the leaderboard, `YOUR FRIENDS (0)` covered on Friends, and
the level bar and account row half-hidden at the bottom of the sidebar. The last one had
already been "fixed" once for the nav alone.

The heights now live in `index.css` as `--app-nav-h` and `--app-music-h`, and one utility
reserves them:

```css
.pb-chrome { padding-bottom: calc(var(--app-nav-h) + var(--app-music-h) + 1.5rem); }
```

`--app-music-h` is `0px` until `MusicBar` sets `data-music-bar` on the body — it is the only
thing that knows whether it is on screen, and minimised it is a corner button that covers
nothing and so reserves nothing.

The study music panel was anchored the same way. It was `bottom-24 md:bottom-8`, which
cleared an iPhone by about six pixels; and on a tablet, where the `md:` rules apply but the
nav is still on screen (it is `lg:hidden`), the panel sat behind the nav completely. Both
offsets are variables now, so the desktop gap is unchanged and the tablet case is covered.

### Get out of the way while the keyboard is up

The Friends frame with the keyboard open is the worst thing in the video. The keyboard takes
roughly two thirds of the screen, and of the sliver left, the nav and the music bar cover the
friends list the person is typing into the box to find. iOS Safari pins fixed elements to the
*visual* viewport, so both ride up with the keyboard and land on top of the page.

Neither is any use mid-sentence. `src/lib/keyboardInset.ts` watches `visualViewport` and
marks the body while the keyboard is up; the nav and the music bar hide, and the space they
were reserving goes back to the page.

It measures rather than watching focus events, because focus is wrong in both directions: a
focused input does not always mean a keyboard (hardware keyboard, iPad case, date picker),
and a keyboard can close while the field keeps focus. The threshold is 160px — well above the
~60–100px Safari's collapsing address bar moves, and well below the ~300px a keyboard takes,
so neither case is near the line. Browsers without `visualViewport` never fire it and the
layout is exactly as it was.

### "No Data — 100%"

The subject donut carries a single grey placeholder slice when there is nothing to show, so
the chart is a ring rather than an empty box. That same array was also feeding the legend, so
Analytics printed **No Data · 100%** as though it were a subject someone had studied — the one
reading of an empty chart that is actively wrong. The ring keeps its placeholder; the legend
now says what is true.

### Confirmed working in this video

Worth recording, because these were all defects in earlier passes: the sidebar opens
full-width with every label; ambient layers stack and the Focus tones list correctly; the
generative music plays and the bar's minimise / expand / stop all work; friend search runs
without the permissions error and returns the honest "Nobody found" message; password reset,
data export and delete account are all present in Settings.

---

## [2026-08-20] — "All AI services are busy" was the wrong diagnosis

**Editor:** Claude Code (Opus 5)

Three reports from RED and Daniel that turned out to share one cause, plus one that turned out
not to be a bug at all.

### Study kits and the Arcade were the same failure

Reproduced against the live site with a throwaway account:

```
POST /api/generate -> HTTP 500 in 1.1s
{"error":"All AI services are currently busy. Please try again."}
```

**1.1 seconds.** Too fast to have tried five providers. The keys were rotated and the new ones
were never added to Render, so every call failed instantly on auth — and the site reported it as
the service being busy, which tells you to wait for something that waiting cannot fix.

The Arcade's *"Could not make questions for that. Try a simpler topic."* is the same failure
wearing a worse hat: it is the catch-all for **every** exception in `generateRound`, so a dead API
key is reported as the topic being too hard. That is why easier topics did not help — the topic
was never the problem.

`runFallbackChain` now classifies what actually happened instead of assuming rate limiting:

| Cause | What it says |
|---|---|
| No provider has a key | "No AI provider is configured on the server." |
| Every failure is 401/403/invalid key | "The server's AI keys are being rejected — they are missing, expired or mistyped. Waiting will not fix this one." |
| Every failure is 429/quota | "Every AI service has hit its limit for now." |
| A mix | The original "busy" message, which is now only used when it is true. |

`err.kind` carries the same distinction as a value, so a route can tell "the configuration is
broken" from "come back later" without matching on message text.

### The friend picker was invisible, and that is why challenges "didn't work"

The Challenges screen renders a native `<select>` with `text-text-main` — near-white in dark
mode. The `<option>` rows inside it are drawn by the **operating system**, on the OS's own white
background, while still inheriting that near-white text. White on white: the list looked empty.

With no friend selectable, `disabled={... || !target}` kept the Challenge button dead. The
feature was working; nobody could reach it.

Fixed globally rather than on this one control, since the app has a second `<select>` and the
next one added would have had the same bug. Options accept very few CSS properties, but `color`
and `background-color` are two of them, so both are now stated explicitly instead of inherited.

### The key that worked on three accounts was not a security hole

RED reported a redeem key working on two accounts. It was worse than reported — three accounts
carried `redeemedKey: SQ-YAUU-…`. The second key was also in an impossible state: `isUsed: false`
while still stamped with a `usedBy`.

That state cannot be produced by the app, only by an admin edit. Verified against the **deployed**
rules with two throwaway accounts and a throwaway key:

```
A claims unused key      -> HTTP 200  ALLOWED (correct)
B claims the SAME key    -> HTTP 403  DENIED  (correct)
key now: isUsed=true usedBy=A
```

Single-use holds. The key had been reset to `isUsed: false` in the Firebase console between
redemptions — which an admin account can do, and RED is an admin. **Mint a fresh key for testing
(`npm run keys`) rather than resetting a spent one**; resetting is what produced three accounts
sharing one key.

Test key and both test accounts were deleted afterwards, and the deletion verified.

### Files
- `src/lib/aiProviders.server.ts` — failure classification and `err.kind`.
- `src/index.css` — explicit `select` / `select option` colours.

### Still open, in priority order
1. **The rotated AI keys are still not on Render.** Nothing above fixes generation; only adding
   them does. This is the blocker for study kits, the Arcade and shared quizzes.
2. Challenges screen styling does not match the rest of the app.
3. The username filter can still be worked around.
4. Settings → Subscription is cut off on mobile.
5. Tapping your profile should open Settings.
6. Password reset by pasted code rather than an emailed link.
7. Study rooms: shared notes and shared quiz; public/private rooms; reporting and blocking.
8. Mic and video calls (port from GhostChat).

---

## [2026-08-20] — The username filter was never a gate

**Editor:** Claude Code (Opus 5)

RED: *"you could make inappropriate usernames … you can find a way around it."*

### Proved before fixing

The slur filter in `lib/usernameSafety.ts` is good — confusables folded, separators stripped,
repeated letters collapsed, so `n1gger`, `n.i.g.g.e.r` and `niiigger` all normalise to the same
string. None of that mattered, because **it only ever ran in the browser.** The Firestore rules
for `usernames/{name}` checked length and `^[a-z0-9._]+$` and nothing else.

Tested against the deployed rules with a throwaway account, POSTing straight to the Firestore
REST API:

```
claim "<slur>" straight to Firestore -> HTTP 200
** BYPASS CONFIRMED ** the filter is client-side only.
```

It had never been a gate. It was a suggestion the sign-up form made to people who used the
sign-up form. The same was true of `public_profiles.displayName`, which is the string people
actually read in a friends list.

### The gate moved to the server

Rules cannot run that filter — it needs confusable folding, separator stripping and run
collapsing, none of which exist in the rules language. So `usernames` and `public_profiles` now
refuse client writes entirely (`allow create: if false`), and `POST /api/identity` is the only way
in. It verifies the token, runs the same shape and safety checks the form runs, and writes with
admin credentials, which bypass rules by design.

**Atomicity was preserved.** The old client flow relied on Firestore `create` failing when the
document exists, with `update` forbidden, so two people racing for one name could not both win.
The Admin SDK's `.create()` fails the same way, so the race is still decided by the database
rather than by checking first and hoping.

`usernameShapeProblem()` moved from `friends.ts` into `usernameSafety.ts`, because `friends.ts`
imports the Firebase **client** SDK and the server cannot reach it without pulling a browser
library into Node. A shape check the server cannot run is one the server has to duplicate, and a
duplicated validator drifts.

### Verified after deploying the rules

Bypass routes, all against the live deployed rules:

```
1. slur, direct to Firestore   -> HTTP 403  DENIED
2. clean name, direct          -> HTTP 403  DENIED (server-only, correct)
3. slur as displayName, direct -> HTTP 403  DENIED
```

And the legitimate path, against the real endpoint — because a filter that also breaks sign-up is
not a fix:

```
1. claim a clean name        -> 200  {"ok":true,"username":"testuser88223"}
2. B claims the SAME name    -> 409  "That username is taken."
3. B claims a slur           -> 400  "That username is not allowed."
4. B sets slur as display    -> 200  displayName="Student"   (scrubbed)
5. A renames                 -> 200  old name released: yes
```

All test accounts and names were deleted afterwards, and the deletion verified.

### Files
- `server.ts` — `POST /api/identity`.
- `firestore.rules` — `usernames` and `public_profiles` writes denied to clients.
- `src/lib/usernameSafety.ts` — `usernameShapeProblem()`.
- `src/lib/friends.ts` — `claimUsername` and `publishProfile` go through the server.

### Note
The client still runs both checks, so the form can say what is wrong as you type rather than
after a round trip. The server repeats both, and the server's answer is the one that counts.

---

## [2026-08-20] — Three small ones from the test pass

**Editor:** Claude Code (Opus 5)

### Settings → Subscription was off the edge of the screen

All three Settings tabs were laid out with `flex-1`, which asks each for an equal third of the
row, while `whitespace-nowrap` stops the text giving any of it back. On a 390px screen "Privacy &
Security" alone is wider than its third, so the row overflowed and Subscription was pushed off
the right — reachable only by a horizontal scroll with nothing to suggest it was there. Daniel
reported it, reasonably, as the tab being missing.

Each tab now carries a `short` label for phones (`Alerts` / `Privacy` / `Plan`) with the full
label from `sm:` up, plus tighter padding and smaller text on mobile. All three fit without
scrolling, which is what "not cut off" has to mean.

### Tapping your profile does nothing

The account row in the sidebar already had `cursor-pointer` and a hover background — it looked
tappable and had no click handler. The only way through was a 16px gear icon beside it, well
under the 44px a finger reliably hits.

The whole row now opens Settings, with a keyboard handler and a focus ring since it is a control
now. The gear was removed as a second control doing what its own container does, and the sign-out
button inside the row got `stopPropagation` — without it, signing out would open Settings on the
way past.

### The challenge screen's odd control

RED said the Challenges UI "doesn't match the app". Its classes are in fact identical to the ones
`FriendsView` uses — the odd one out was the native `<select>`, which draws the OS chevron and OS
control chrome next to a custom-styled input and button.

`appearance-none` plus a matching `ChevronDown` fixes it. The option ROWS are still drawn by the
OS and cannot be styled beyond colour; that is handled globally in `index.css` and was the
separate bug that made the list invisible in dark mode.

The country-code picker on the sign-in form has the same OS chrome and was left alone: its
options are already covered by the global colour rule, and removing the arrow without drawing a
replacement would be worse than leaving it.

### Files
`src/components/Settings.tsx`, `src/App.tsx`, `src/components/Challenges.tsx`.

---

## [2026-08-20] — Study rooms: state, public rooms, reporting and blocking

**Editor:** Claude Code (Opus 5)

### Why shared notes "didn't work"

`notes-update` and `room-quiz` were pure relays. Whatever you typed was forwarded to everyone
currently connected and then forgotten — the room held no state at all. Two failures fall straight
out of that, and both were reported as the same thing:

1. Join a room that already has notes and you see an **empty box**. Nothing replays what you missed.
2. Then type one character. Your near-empty box is relayed to everyone else and **overwrites what
   they wrote.**

The room now holds its own notes and quiz. A joiner is sent `room-state` on arrival, and updates
mutate that state rather than flying past it. Still in memory on purpose: a study room is
ephemeral, dies with its last member, and persisting it would mean a retention policy for
children's writing that nobody has agreed to.

`notes-update` and `room-quiz` also now check that the sender is actually **in** the room. Without
that, a socket could type into any room whose six-character code it could guess.

### Public and private rooms

Private is the default and the only kind that existed — a code somebody had to send you. That
works if you already have friends on the app and is a dead end if you do not.

The first person through the door owns the room and chooses whether it is listed. `GET /api/rooms`
reads the same in-memory map the sockets use, so a room appears when it opens and vanishes when
the last person leaves. **Private rooms are never listed** — that is the entire difference. The
"List publicly" box is unticked by default, because being findable by strangers has to be
something a child chooses, never something that happens to them.

### Reporting and blocking

They solve different problems and both were needed:

- **Blocking** is the owner's, immediate and local: get this person out of my room now. The
  blocked uid is checked on join, so it is a bar and not a nudge.
- **Reporting** is everyone's, slower and global. Three reports from **different** people suspend
  the account from all rooms for 24 hours.

Distinct reporters is the part that matters. Counting raw reports would let one child suspend
anyone they had fallen out with by pressing the button three times, so reports are stored one
document per reporter/target pair.

A report button that files a ticket nobody reads is worse than no button — it tells a child they
have been helped when they have not. This one has a consequence attached.

**The suspension is pinned in the rules.** `roomsSuspendedUntil` lives on the user's own document,
every other field of which the owner may write, and nothing used `hasOnly` — so dropping the field
from a normal profile write would have cleared the suspension, from the browser console, by the
person serving it. It is now pinned like the paid fields, and only the server can set or clear it.

`reports` is closed to clients completely: a child reporting harassment must not be discoverable
by the person they reported.

### The refusal screen that was never drawn

`denied` was being set by the `join-denied` handler and rendered **nowhere**, so every refusal —
wrong plan, signed out, suspended, blocked — looked identical to the room simply never loading.
That is its own bug report ("study rooms don't work"). There is now a screen for each reason.

The member menu is always visible rather than `opacity-0 group-hover:opacity-100`: hover does not
exist on a phone, and a child who needs the report button is on a phone.

### Verified

Fourteen checks against two real socket clients and real accounts:

```
1. owner joins, is owner              PASS      5. private room is NOT listed        PASS
   room is public                     PASS      6. non-owner cannot list the room    PASS
2. late joiner gets existing notes    PASS      7. blocked user is told why          PASS
   late joiner is NOT owner           PASS         blocked user cannot rejoin        PASS
3. owner sees the appended text       PASS      8. one reporter twice = not suspended PASS
4. public room is listed              PASS         three distinct reporters suspend  PASS
                                                   target was ejected                PASS
                                                   suspended user cannot join at all PASS
```

All four test accounts and every report they generated were deleted afterwards, and the deletion
verified.

### Files
`server.ts`, `src/components/CollaborativeRoom.tsx`, `firestore.rules`.

### Note
The shared **quiz** now persists and replays like the notes, but making one still calls the AI —
so it stays broken until the rotated provider keys are on Render. The relay half is fixed and
tested; the generation half is the same blocker as study kits.

---

## [2026-08-20] — Voice and video calls, ported from GhostChat

**Editor:** Claude Code (Opus 5)

RED: *"the mic and video call feature for the study room doesnt work we can get those features from ghostchat"*.

### What was there

Two `useState` booleans, `isMuted` and `isVideoOff`, wired to two icons that changed colour. There
was no call to be muted on. Both are gone.

### What was ported, and why it ported cleanly

GhostChat's `services/webrtc/` is good code and its `Peer` class is **transport-agnostic** —
everything it needs to say goes out through callbacks, so it does not know whether signalling
rides Supabase's broadcast channel (GhostChat) or a Socket.IO room (here). That is why this was a
port rather than a rewrite.

The piece worth not reinventing is **perfect negotiation**. When two people press Join at the same
moment, both fire an offer; a naive implementation deadlocks or drops the call. Exactly one side
of each pair is designated *polite* by comparing ids, and the polite side yields. Deterministic,
no timers, no retry loop. The ICE-candidate queueing matters just as much: candidates routinely
arrive before the description they belong to, and queueing them is the difference between a call
that connects and one that sometimes does.

New files: `src/lib/call/peer.ts`, `media.ts`, `session.ts`.

### The server relays sealed envelopes

Audio and video are peer-to-peer and never touch the server; it forwards SDP and ICE between two
members of the same room and cannot read either.

**The membership check is the security.** Without it, anyone who guessed a six-character room code
could offer a peer connection to a child inside it. Both ends must be in the room the sending
socket is in, and a socket id from anywhere else is dropped.

A socket vanishing also emits `call-leave`, because closing the tab is the commonest way a call
ends and the peers need telling.

### STUN only — a real, documented limitation

STUN tells each side what its own public address looks like and the media then flows directly,
which is what makes this free to run. It works on most home and mobile networks.

It does **not** work behind a symmetric NAT or a firewall that blocks UDP, and plenty of schools
block exactly that. Those calls need a TURN server, which relays the actual media and costs real
money per gigabyte; there is no free TURN worth depending on. So a peer link that fails says so —
*"this usually means a school or office network is blocking it"* — rather than showing
"Connecting…" forever.

Mesh, not a server-side mix: N people means N−1 connections each. Fine for three or four, wrong
for thirty, so `MAX_CALL_PEERS` is 6 and the reason is the upload cost on a phone.

### Verified

Ten checks against three live socket clients and real accounts:

```
1. call-join reaches the other member  PASS   3. outsider cannot offer into room  PASS
   sender does not hear itself         PASS   4. ice reaches its target           PASS
   a different room hears nothing      PASS   5. explicit hang-up is broadcast    PASS
2. offer reaches its target            PASS      closing the tab ends the call    PASS
   stamped with sender's socket id     PASS
   server adds the verified name       PASS
```

**What this does not prove.** The signalling layer is tested end to end; the media path — actual
audio and video between two `RTCPeerConnection`s — cannot be exercised from Node and needs two
real browsers. The `Peer` class is a near-verbatim port of code already working in GhostChat, but
"already worked there" is not the same as "tested here". Two people on two devices should try it.

### Files
`server.ts`, `src/lib/call/*`, `src/components/CollaborativeRoom.tsx`.

---

## [2026-08-20] — Password reset by code, and the email sender both it and reminders needed

**Editor:** Claude Code (Opus 5)

RED: *"i thought it would be better with a version where they send you a code and you paste the
code in the app and from there you change the password"*.

### Why a code beats a link here

Firebase's reset emails a **link**, and that is not a setting you can flip — a link and a code are
different flows. The link is also a poor fit for how this gets used: the email usually arrives on a
phone while you are sat at the laptop you are locked out of, and tapping it signs you in on the
wrong device. A six-digit code you read off one screen and type into another does not care which
device it landed on.

### One email sender, because two features were waiting on it

Reset-by-code and the study-planner reminders — which have been saving reminders nobody ever
receives — both needed the same missing thing. `src/lib/email.server.ts` is that, via Resend: one
HTTPS POST with an API key, no SMTP, no new dependency, 3,000 emails a month free.

**It is optional and fails loudly.** With no key set, `sendEmail` throws rather than pretending, and
the reset route answers *"not switched on yet — use Send reset link instead"*. A reset that
silently sends nothing is worse than one that admits it is unavailable: the person sits waiting for
an email that was never coming.

### Five properties, each a real attack if missed

| | Why |
|---|---|
| The response never reveals whether an account exists | Otherwise this is a free tool for checking which of your classmates has an account. `request-code` returns the same 200 either way. |
| The code is stored **hashed** | A Firestore read — leaked service account, mis-set rule — must not hand over live reset codes for every account mid-reset. |
| It expires | Ten minutes. |
| Attempts are capped | Six digits is a million combinations, which sounds plenty until you try them all in a loop. Five wrong guesses burns the code. |
| Verifying returns a **one-use ticket** | Without it the final step would have to trust an email address it was handed. |

`crypto.randomInt` generates the code, not `Math.random() * 900000` — the latter is not uniform, and
a reset code is the wrong place to be lazy about that. `password_resets` is closed to every client
in the rules; only the server touches it.

A successful reset **revokes every refresh token**. Someone resetting a password may be doing it
*because* another person is in their account, and leaving that person signed in defeats the point.

### Verified

```
1. real vs unknown email look the same  PASS      6. a forged ticket is refused        PASS
2. wrong code rejected                  PASS      7. valid ticket changes password     PASS
   the attempt was counted              PASS         the new password signs in         PASS
3. correct code refused once capped     PASS         the old password stops working    PASS
4. expired code refused                 PASS      8. reset record deleted afterwards   PASS
5. correct code returns a ticket        PASS         the ticket cannot be reused       PASS
   code hash cleared after use          PASS
```

Sign-in was checked against the real Firebase auth API, both ways round.

**Where that test is weaker than it looks:** check 1 passed because *both* requests hit the
"email not configured" path, so it proves the two responses match without exercising the
enumeration guard itself. That guard is written and reviewed but genuinely untested until
`RESEND_API_KEY` exists. Worth re-running then.

### To switch it on
Add `RESEND_API_KEY` to Render (and `.env` locally). Both are documented in `.env.example`. Until
then the emailed reset link still works and is offered underneath the code flow.

### Files
`src/lib/email.server.ts`, `src/components/PasswordResetDialog.tsx`, `server.ts`,
`src/components/Settings.tsx`, `firestore.rules`, `.env.example`.

---

## [2026-08-22] — Duel: the Arcade's 3D game, built so a real opponent drops straight in

**Editor:** Claude Code (Opus 5)

RED sent a screenshot of a 1v1 quiz battle — two fighters on lit podiums, health bars with both
names, ROUND 1/7, a countdown, a 2×2 answer grid — and said *"this is how the 3dgame should go for
the arcade something like this"*.

The 3D arena that existed was a single rotating icosahedron with no player character, no rounds and
no opponent. This is the duel.

### The one decision everything else follows from

He wanted the boss now and real friends later. So a round is resolved from **two committed answers**:

```ts
resolveRound(state, yours, theirs) -> next state
```

`theirs` comes from a bot today, decided the moment the round **starts** — before the player has
seen the question. Tomorrow it arrives over a socket. **The engine cannot tell the difference**, and
`test_duel` asserts exactly that: the same round resolved against `bot: null` produces identical
health, damage and winner.

Committing up front also rules out the obvious cheat by construction. A bot that chose its answer
*after* seeing yours could be made to always win by a round, and no amount of care in the UI would
fix that.

### The numbers, and why they are those numbers

100 HP each, 7 rounds, 10 seconds a round. A clean hit is 12 damage plus up to 12 more for speed.

- Winning all seven rounds **slowly** deals 84 — *not* a knockout. You still win, on health, at the
  end of round 7.
- Winning all seven **fast** deals up to 168, so a knockout lands around round 5.

That gap is the whole design: **speed decides how fast you win, accuracy decides whether you do.**
If a slow correct player could be knocked out, this would be a reflex test with quiz questions stuck
on top. Both halves are pinned as tests.

Two more rules earn their place:

- **Both right is a trade**, worth 5 rather than 12, won by whoever was quicker. Beating someone who
  also knew the answer has to be worth less than beating someone who did not, or tapping fast
  quietly replaces knowing the material.
- **Both wrong is a dead round.** No chip damage. Punishing both players for a hard question invents
  damage neither of them can attribute to anything they did.

XP pays for correct answers whether you win or lose, because a close loss in a revision app has to
be worth something.

### Two arenas, one gate

`DuelArena3D` is **raw WebGL, not three.js** — the same call as the boss arena, for the same reason:
three.js is ~600 KB against a 2.2 MB bundle. This is **7.7 KB**, confirmed as its own chunk.

Each fighter is six boxes — head, torso, two arms, two legs — sharing one 36-vertex cube with a
different model matrix each. A jointed figure can lunge, flinch and fall over. That is precisely why
the icosahedron could never read as a person.

`DuelArena2D` takes the **same props**, deliberately. It is what a free account sees, what WebGL
failure falls back to, and what reduced-motion gets — and if the two drifted apart, the fallback
would become the buggy one, because nobody testing on a Pro desktop would ever see it.

The gate is on the spectacle, never the mechanics: same duel, same questions, same damage, same
opponent. Pro gets it in WebGL.

### Three bugs found by rendering it, none of them findable by reading it

This was built, then actually opened in a browser and photographed. All three of these looked
perfectly correct in the source.

**1. The arena rebuilt its WebGL context ten times a second.** It fell back to 2D on a machine where
WebGL demonstrably worked. `onUnsupported` was in the effect's dependency array and the parent
passes it as an inline arrow — a new function identity on every render — and the round clock
re-renders 10×/sec. So the effect tore the context down and made a new one every 100 ms. Browsers
cap live GL contexts; past the cap, creation quietly starts failing and shaders refuse to compile.
On a phone this would have read as *"3D doesn't work on my device"*.

Diagnosed by a control experiment rather than a guess: the **already-shipped** `BossArena3D` was
rendered in the same headless browser and compiled fine, which ruled out the environment and pointed
at the new component. The callback now lives in a ref and the GL effect depends on nothing.

**2. The camera framed the fighters against the bottom edge** with dead space above them. The
original view matrix was a hand-rolled "pitch about X and translate", which is *approximately* a
camera right up until you care where the subject sits in frame. Replaced with a real `lookAt(eye,
target)`, so framing is now two editable vectors.

**3. And that `lookAt` rendered the scene upside down with left and right swapped.**
`cross(forward, +Y)` is `(-f.z, 0, f.x)`; it had been written `(f.z, 0, -f.x)`. One sign, and it
flips the right vector, which flips the derived up vector with it. Caught in a screenshot in
seconds; it would have survived any amount of code review.

### Verified

```
tests/duel.test.ts        30/30  (new)
npm test                 271/271
tsc --noEmit             clean
eslint (new files)       clean
npm run build            clean — DuelArena3D 7.71 KB as its own chunk
```

Rendered in headless Edge and inspected: the picker, the 2D arena, and the 3D arena. Confirmed by
DOM probe rather than by eye that the 3D path renders a `<canvas>` with **no** 2D fallback and no
console warnings, and that the page has **zero horizontally overflowing elements** at phone width —
an earlier screenshot looked clipped and that turned out to be a headless scaling artefact, not a
layout bug.

### Two stale tests, fixed while here

`rules-structure.test.ts` had been failing since the username work: it still asserted the old
client-write rules for `public_profiles`, which are now `allow create, update: if false` because
writes moved to `POST /api/identity`. Updated to assert the **stronger** current rule, plus a new
check that the one server writer still publishes only the searchable fields and uses `set()` rather
than a merge — the field guarantee did not disappear with `hasOnly`, it moved, and "the rules no
longer restrict fields" is only safe while something else does.

### What is deliberately not built

Live PvP. The screen says so rather than hiding it: *"Duelling a friend live is next. The arena and
the rules are already built for it — only the matchmaking is missing."* That is true, and it is the
honest version of a coming-soon note.

### Files
`src/lib/duel.ts` (new), `src/components/DuelMode.tsx` (new), `src/components/DuelArena3D.tsx`
(new), `src/components/DuelArena2D.tsx` (new), `src/lib/gameModes.ts`, `src/components/GameMode.tsx`,
`src/index.css`, `tests/duel.test.ts` (new), `tests/rules-structure.test.ts`.

---

## [2026-08-22] — The calls work. Now there is a test that says so.

**Editor:** Claude Code (Opus 5)

StudyQuest had 271 unit tests and **zero** that opened a browser. So everything that only breaks in a
real browser was unproven — and the worst of those was the study-room call, ported from GhostChat,
wired up, shipped, and **never once run between two browsers**. "Do the calls work?" was an open
question about a feature people are about to be asked to pay for.

They work. Two real browsers, real Firebase auth, the real Pro gate, the real `server.ts` relay, real
peer connections, and **real audio bytes crossing between them**.

### What the test actually proves, and what it refuses to accept as proof

Three things could make a green call test meaningless, so each is closed:

| Cheap "proof" | Why it is not enough | What is asserted instead |
|---|---|---|
| Two pages loaded without errors | Proves nothing about negotiation | The **live** `RTCPeerConnection.connectionState` |
| `connectionState === 'connected'` | A peer can sit there with nothing crossing it | `getStats()` → `bytesReceived > 0` |
| "media arrived" on a video call | A video call degrading to audio still passes | The **kinds** of live track: `['audio','video']` |

And it runs the real server rather than a stand-in, because the room-membership check and the auth
gate are exactly the parts that break quietly.

**Proven to fail:** dropping `call-offer` from the server's relay turns it red with
*"alice never connected to &lt;id&gt;"*. A test that has never been seen to fail is a guess.

### Getting there took three wrong turns, all worth recording

**1. Zero ICE candidates.** The call negotiated perfectly — `signalingState: stable`, an audio
receiver on both sides — and then ICE sat in `gathering` forever. Every symptom pointed at the
product. Reading `localDescription.sdp` settled it: **not one candidate**, not even a host candidate.
`--force-webrtc-ip-handling-policy=default` fixed it, and the candidate list is now host + srflx —
which incidentally proves **STUN reaches Google's server from here**, good news for the STUN-only
config.

The first theory was mDNS `.local` candidates being unresolvable in headless.
`--disable-features=WebRtcHideLocalIpsWithMdns` did **not** fix it. The flag is kept because it makes
candidates readable while diagnosing, and the config says plainly that it was not the cause.

**2. The app's own state cannot be trusted as a test oracle.** `CallSession.emit()` reports
`this.states.get(id) || 'new'`, so `'new'` means both *"never started"* and *"no event recorded
yet"*. Asserting on it cannot tell a stalled call from an unobserved one. The test now reads the live
`RTCPeerConnection`, and separately asserts the app's reported state **catches up** — because a call
that works while the tile sits on "Connecting…" is its own user-facing bug.

**3. Two flakes that were mine, not the app's.**
- Browser contexts were kept open until the end of the file, so the first test's live calls were
  still holding fake media devices while the second ran. Each test now owns and closes its own.
- `cleanup()` deleted the test users' Pro flag in `afterAll`, which under `--repeat-each` ran while
  later repeats were still going. One browser was refused with `PRO_REQUIRED`; the other, which had
  joined fine, reported only *"never connected"*. Two unrelated-looking failures, one cause. The two
  fixed `e2e-` accounts are now left in place.

### A flake that is NOT yet explained, and is not being hidden

About **one run in three** still fails with the live connection stuck at `new` — SDP stable on both
sides, no candidate pair. It is worse under `--repeat-each`, where the first repeat passes and later
ones fail, which points at something degrading inside the reused Chromium process rather than at test
order.

Ruled out: the auth gate, context leakage, and candidate generation. **Not** ruled out: a genuine
race between `CallSession.join()` and the `call-join` handler, or plain resource exhaustion — this
laptop runs these with about 1.5 GB free.

Retries are deliberately **not** switched on locally to paper over it. A flake you cannot see is a
flake nobody fixes. It is written at the top of the spec so the next person starts from the evidence
rather than from scratch.

### The harness, and why it is not a UI test

`e2e/fixtures/call-harness.html` mounts the **real** `src/lib/call/session.ts` against the **real**
socket server and publishes state on `window.__call`. Reaching the in-app call button needs a sign-in,
a Pro plan, a room and an invitation — none of which is the thing that was untested. It lives under
`e2e/`, so Vite's dev server serves it and `npm run build` (which bundles from `index.html`) does
**not** ship it.

Auth is real: the Admin SDK mints custom tokens for two fixed `e2e-` uids and writes their Pro flag
before handing the token over, because `join-room` reads the plan the moment the socket connects. The
whole suite **skips itself cleanly** when admin credentials are absent, so a fresh clone gets an
honest "skipped" rather than a wall of red.

### Also fixed while here
`npm test` was collecting the Playwright spec into Vitest and reporting a failing file. Excluded.

### Verified
```
npx playwright test     3/3 on a clean run (flaky ~1 in 3 — see above)
npm test              271/271
tsc --noEmit          clean
```

### Files
`playwright.config.ts` (new), `e2e/call.spec.ts` (new), `e2e/pages/CallHarnessPage.ts` (new),
`e2e/fixtures/call-harness.{html,ts}` (new), `e2e/fixtures/testUsers.ts` (new), `package.json`,
`.gitignore`.

---

## [2026-08-22] — The flaky call test was right: calls really did fail one time in three

**Editor:** Claude Code (Opus 5)

Yesterday's entry shipped the two-browser call suite and admitted it was flaky at about one run in
three, with the live `RTCPeerConnection` stuck at `new`, cause unknown. It was not the test.

**Two people joining a call within about 100ms of each other could produce a call that never
connects, silently, with nothing in the UI to explain it.** That is the normal case, not an edge
case: both people are looking at the room and both tap Join.

### The tape

Guessing from the end state was hopeless — `new` with `signalingState: stable` looks identical
whether an offer was never made, never sent, never arrived, or arrived and was ignored. So the
harness was made to record every `call-*` message, in order, both directions. One stalled run:

```
ALICE   t=436  in   call-offer          BOB   t=343  out  call-offer
        t=439  out  call-offer                t=344  in   call-offer
        t=443  out  call-answer               t=349  out  call-answer
        ...    in   call-ice  x7              ...    in   call-ice  x0
        ...    out  call-ice  x0              ...    out  call-ice  x7
```

Both sides offered. One rolled back and answered, exactly as perfect negotiation intends. SDP settled
to `stable` on both ends with senders and receivers in place — everything looked healthy.

**And the side that rolled back sent zero ICE candidates for the rest of the call.** It received all
seven of the other side's and emitted none, sitting at `iceGatheringState: 'gathering'` forever.

### Two fixes, and why the first was not enough

**1. Signalling operations are now serialised.** `onnegotiationneeded` and `handleDescription` both
call `setLocalDescription` on the same connection, both are async, and the `makingOffer` guard meant
to keep them apart is read *before* the first `await` and set *inside* the other handler. So they
interleaved: one side produced an offer AND an answer for the same peer, three milliseconds apart.
Every SDP operation now goes through a promise chain, which makes the interleave impossible rather
than unlikely.

That was a real defect and worth fixing. **It did not fix the stall** — it only changed which side
rolled back. Recorded here because "the obvious fix did not work" is the useful part.

**2. The collision is now avoided rather than survived.** Before a pair has completed one
negotiation, only one side opens it: the polite side creates its peer, adds its tracks, and waits to
be called. Which side is which is already decided by comparing socket ids, so no agreement is needed
and exactly one offer is ever made.

After the first negotiation succeeds, either side may renegotiate freely — turning a camera on has to
work from both ends — and by then a collision is survivable, because an established connection keeps
its ICE.

### The honest reading

Perfect negotiation is correct, and this is not a claim that it is broken. What is true is narrower:
in Chromium, a rollback during the **first** negotiation of a connection cost that side its ICE
gathering entirely. Avoiding the collision is cheap, needs no coordination, and removes a whole class
of "it just doesn't connect" that nobody could have debugged from the UI.

### Verified

```
playwright --repeat-each=5     15/15   (was ~10/15)
                                       and 21s, down from 57s — the connections
                                       now come up immediately instead of limping
hunt loop, 8 consecutive calls   8/8   (previously stalled by attempt 2 or 3)
npm test                     271/271
tsc --noEmit                   clean
npm run build                  clean
```

### What this means for the live app
Anyone who tried a call and found it dead may simply have lost the coin flip. Worth telling Daniel it
is fixed and asking him to try again — including the case that triggers it, both people joining at
once.

Still outstanding, and unchanged by this: there is **no TURN server**, so calls remain STUN-only and
will fail on networks that block peer-to-peer — which is most school networks.

### Files
`src/lib/call/peer.ts`, `e2e/call.spec.ts`, `e2e/fixtures/call-harness.ts`,
`e2e/pages/CallHarnessPage.ts`.

---

## [2026-08-22] — TURN wired: calls can now work on school networks

**Editor:** Claude Code (Opus 5)

Calls have been STUN-only since they shipped, which the code was honest about: *"calls will work
between two people at home and may well fail on a school network."* That is a bad place to leave a
feature in an app for students, and the previous entry's fix — which made calls connect reliably —
only made the remaining gap more obvious.

TURN is now wired. It is **inert until credentials exist**, so this ships safely before anyone has
created an account.

### How it is arranged, and the one thing that matters

The Cloudflare TURN API token is a **long-term secret**: anyone holding it can relay traffic on the
account and spend the bandwidth. So it never leaves the server.

```
browser  ──GET /api/turn-credentials──▶  server  ──POST (secret)──▶  Cloudflare
         ◀──short-lived iceServers───           ◀──ttl'd creds────
```

The browser only ever sees credentials that expire. Putting the key in the client bundle would be
handing it to everyone who opens the site.

Credentials are issued with a two-hour TTL and cached server-side until five minutes before expiry —
long enough that one set covers any realistic study session, short enough that a leaked set is worth
little, and cached so that everyone joining every call is not a round trip to Cloudflare for
identical credentials.

### Unconfigured is a supported state, not an error

Three ways this can fail, and all three land in the same place — the STUN-only list the app has
always used:

| Situation | Response | Calls |
|---|---|---|
| No keys set | `{turn: false, reason: 'not-configured'}` | exactly as before |
| Bad keys | `{turn: false, reason: 'upstream-error'}` | exactly as before |
| Cloudflare unreachable | `{turn: false, reason: 'unreachable'}` | exactly as before |

**All three verified by running them**, not by reading the code: unconfigured returns STUN and
`not-configured`; fake credentials produce a logged `404` from Cloudflare and still return usable
STUN with HTTP 200. A credential service that can take calls down is worse than no credential
service.

The client has the same posture: a 4-second timeout on the fetch, because joining a call must not
wait on it. If credentials are slow, going ahead on STUN beats a button that does nothing. A failed
fetch is deliberately **not** cached — one bad request should not strand a whole session on STUN.

### The bit that needed a small refactor

`Peer` took its ICE servers from a module constant. TURN credentials expire, so they cannot be a
constant. `Peer` now accepts them, defaulting to the old STUN list so every existing caller and test
is unaffected, and `CallSession` resolves them **once** when the call is joined — fetching per peer
would mean a round trip whenever somebody new arrives, and could hand different people in the same
call different credentials.

### What RED still has to do
Create a TURN key at `dash.cloudflare.com` → Calls, and set `CLOUDFLARE_TURN_KEY_ID` and
`CLOUDFLARE_TURN_API_TOKEN` on Render. Nothing else. The free tier is 1,000 GB/month — roughly 27,000
audio call-hours — and only calls that **cannot** go peer-to-peer consume any of it.

### Verified
```
/api/turn-credentials   unconfigured / bad keys / cached — all return usable STUN, HTTP 200
playwright --repeat-each=3   9/9   (calls still connect; the wiring changed nothing on STUN)
npm test                   271/271
tsc --noEmit                 clean
```

### Files
`server.ts` (`/api/turn-credentials`), `src/lib/call/ice.ts` (new), `src/lib/call/peer.ts`,
`src/lib/call/session.ts`, `.env.example`.

---

## [2026-08-22] — Duelling a friend, live

**Editor:** Claude Code (Opus 5)

The bot duel shipped with a note on its own opponent-picker: *"Duelling a friend live is next. The
arena and the rules are already built for it — only the matchmaking is missing."* That turned out to
be exactly true. The scoring engine is **unchanged**; the opponent's answer now arrives over a socket
instead of from `botAnswer()`, and nothing downstream can tell the difference.

That was the whole point of building `resolveRound(state, yours, theirs)` in the first place.

### The server referees two facts, and only two

Against a bot, cheating is pointless. Against a friend it is the entire game, so the server owns the
two things a client must not decide:

1. **Whether an answer is correct.** The correct option is **never sent** until the round closes.
   Otherwise it is sitting in the network tab, and beating your friend is a matter of opening
   devtools. The prompt carries the four options and nothing that marks one of them — asserted by
   comparing the payload's exact key set, so a later addition cannot quietly leak it.
2. **How long it took.** Damage scales with speed. A client reporting its own timing would claim 0.0s
   every round and out-damage an honest player forever. The server stamps the elapsed time from when
   **it** sent the question, clamps it to the buzzer, and floors it at zero so clock skew cannot
   produce a negative.

Everything after those two facts is arithmetic both browsers can do. So the server does **not**
re-implement scoring — that would be a second copy of the rules and the first thing to drift.
`resolveRound` is deterministic, both sides run it on identical inputs, and the E2E test asserts they
agree: Alice's health must equal Bob's opponent's health. If they ever disagree, one of them is
showing a lie.

A few smaller refusals, each its own test: only the first answer counts (otherwise you answer, watch
their face, and change your mind); an answer for the wrong round, from a stranger, or after the round
closed is ignored; and an option that is not on the list is treated as **simply wrong** rather than an
error, because that is the shape a tampered payload takes and it should lose the round, not crash the
match for the honest player.

### A deadline, not a duration

The prompt carries `endsAt` — a server timestamp — rather than "you have ten seconds". Two people on
different connections then count down to the same instant. Counting locally would hand whoever
received the packet first a real advantage in a mode where speed is damage.

### One screen, not two

The bot duel and the live duel now render the same `DuelStage`: same arena, same health bars, same
answer grid. They were going to be two components drawing "the same" thing, which is how two things
stop being the same — one gets a fix, the other keeps the bug, and it surfaces as *"it looks
different online"*.

`DuelMode` lost about 100 lines to the extraction and gained nothing else.

### Walking out

Closing the tab is the commonest way to quit anything, so a forfeit is handled on `disconnecting` as
well as on an explicit leave — the same lesson the call code learned. Without it the other person
sits watching a clock that never moves. There is an E2E test that closes a browser mid-duel and
asserts the survivor is told.

### Verified

```
tests/duelMatch.test.ts       24/24  (new — the refereeing, and what it refuses)
npm test                    295/295
e2e (call + duel)            10/10 over two full repeats
tsc, eslint, build            clean
```

The live test is two real browsers on the real server: one creates a duel, the other accepts, they
play all seven rounds, and both are asserted to agree on the winner **and** the exact health on both
sides. The harness picks its answers by a prefix in the option text, never by asking which is correct
— because the server never says. If that ever changed, this test would keep passing while the game
became cheatable, which is why `duelMatch.test.ts` guards the secrecy separately.

### Where it lives
Inside a study room, on the room's own quiz — a duel needs a room, a deck and somebody to duel, and
the Arcade has none of those. "Duel someone" sits beside "Play together"; the offer goes to the whole
room rather than to one person, so anyone studying with you can take it.

### Files
`src/lib/duelMatch.ts` (new), `src/lib/liveDuel.ts` (new), `src/components/DuelStage.tsx` (new),
`src/components/LiveDuelPanel.tsx` (new), `server.ts`, `src/components/DuelMode.tsx`,
`src/components/CollaborativeRoom.tsx`, `tests/duelMatch.test.ts` (new), `e2e/duel.spec.ts` (new),
`e2e/fixtures/duel-harness.{html,ts}` (new).
