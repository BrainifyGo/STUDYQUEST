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
