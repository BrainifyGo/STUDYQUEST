# StudyQuest

GCSE revision, gamified. Built by **Brainify** and **ReviseGo** merged into one app under the
Pinnacle founders' agreement.

Paste your notes and get a study kit back. Answer questions, build combos, earn XP and level up.
Anything you get wrong lands in **My Mistakes** and stays there until you get it right.

---

## Where this came from

StudyQuest **is** Brainify's codebase, with ReviseGo's game layer being ported into it. That
isn't favouritism — the two projects weren't equal partners technically:

| | Brainify | ReviseGo |
|---|---|---|
| Stack | React 19 + TypeScript + Vite | plain HTML/CSS/JS, no build step |
| Backend | Firestore + Node server | none — browser storage only |
| Accounts | Firebase Auth | device-local |
| Payments | live | none |
| Real users | yes | no |

Rebuilding Firebase auth, Firestore, the server-side AI calls and billing in vanilla JavaScript
would have thrown away months of work and the only revenue either project had. Porting the game
layer the other way is a fraction of the work.

`Brainify_CHANGELOG.md` is kept as the history of the codebase this started from.
`STUDYQUEST_CHANGELOG.md` is where everything from here goes.

## Running it

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev               # http://localhost:3000
```

`npm run dev` runs `server.ts`, which serves the app **and** the API. The AI provider keys live
server-side and never reach the browser.

## Tests

```bash
npm test                  # everything that needs no credentials and no JDK
npm run test:rules        # Firestore rules — needs the emulator, and a JDK
```

`npm test` covers the level curve and XP maths, the question-id hash, and the structure of
`firestore.rules`. Keep it runnable on a fresh clone with no `.env`: logic that needs no
network or credentials shouldn't need them to be tested.

## Layout

```
src/lib/progress.ts     levels, XP, combos, streaks — pure functions, no Firestore
src/lib/mistakes.ts     the wrong-answer review loop
src/lib/questionId.ts   stable id for a question, derived from its text
src/lib/tokenService.ts AI usage limits — read the comment before changing the numbers
server.ts               API + AI calls + token budget enforcement
firestore.rules         who can read and write what. Deploy after every change.
```

## Things worth knowing before you change them

**The level curve** (`src/lib/progress.ts`) is 500 XP for level 2, and each level after costs
20% more. Changing it changes everybody's level retrospectively — check the impact against real
accounts before you touch it.

**The token limits** (`src/lib/tokenService.ts`) have the arithmetic written above them. They
were once set so low that two of three users were permanently locked out on their first day.
Work out what a generation actually costs before picking a number.

**`firestore.rules` is the whole business model.** Validating the *shape* of data is not the
same as deciding *who may change it*. Deploy with `firebase deploy --only firestore:rules` and
run `npm test` first.

**Past papers are copyright.** Exam boards own their questions and mark schemes, and StudyQuest
takes payments — so it can't redistribute them. Write original questions mapped to the
specification, or let a student upload their own paper and practise against it privately.
