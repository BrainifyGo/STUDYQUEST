# StudyQuest — working rules

This file is loaded into context at the start of every session and re-injected
after a context compaction, so anything written here survives. That is the point
of it: put rules here rather than saying them in chat, where they are lost the
moment the conversation is compacted.

## What this is

StudyQuest is the combined venture of **Brainify** and **ReviseGo**, built by
**RED (Ola)** with business partner **Daniel**. React 19 + TypeScript + Vite +
Firebase + Socket.IO. Live at https://studyquest-ruuq.onrender.com, remote
`BrainifyGo/STUDYQUEST`. The users are UK secondary students, Years 7–13.

## Rules that do not move

1. **Secret-scan before every push.** This repository has a leak history. Scan
   the diff for API keys, private keys and passwords before committing. `.env` is
   gitignored and stays that way.
2. **Never commit RED's password**, or any credential, in any form.
3. **Every fix goes in `STUDYQUEST_CHANGELOG.md` before the commit**, with the
   reasoning, not just the change.
4. **Commit straight to `main` and push when RED asks.** Do not push unasked.
5. **Do not host exam board content.** GCSE past papers and mark schemes belong
   to AQA, Pearson/Edexcel, OCR and WJEC. StudyQuest may parse a paper the
   student uploaded themselves, and must never store or redistribute one. See
   `src/lib/examPaper.ts`.

## How RED wants to be talked to

- **Short replies.** Detail belongs in the changelog, not in chat.
- Lead with what happened, then the caveat. Do not bury the answer.
- If something is broken or risky, say so plainly and early.

## How to work on this codebase

- **Measure, do not assume.** Run the thing, read the real output, check the real
  file. Claims in a `task.md`, a comment, or a previous session are unverified
  until re-checked.
- **Prove a test catches its bug.** Re-plant the bug, watch the test fail, then
  restore. A test that passes against a broken implementation is worse than none.
  When re-planting, confirm the edit actually applied — a `sed` that silently
  matches nothing proves nothing.
- **Test against realistic input, not tidy fixtures.** The cover-page bug in
  `examPaper.ts` passed every unit fixture and failed on the first real paper.
- **Comments explain why, not what.** The reason a line exists, and what breaks
  without it.
- **Bash heredocs in this environment eat backslashes.** Use the Write tool, or
  `chr(92)`, when a string contains them. This has bitten repeatedly.

## Verification before saying something is done

`npx tsc --noEmit` clean · `npm test` all green · `npx eslint src server.ts` with
**0 errors** · and for anything user-facing, driven in a real browser.

## Facts about the app that are easy to get wrong

- **Sets are per subject, not per student.** Set 1 for Maths and set 4 for French
  is an ordinary timetable. A subject can also have no sets at all, which is a
  real answer rather than missing data. See `src/lib/studyLevel.ts`.
- **A set number is meaningless without how many sets that subject runs.** Set 3
  of 4 is near the bottom; set 3 of 7 is above the middle.
- **Foundation tier caps at grade 5.** Never show a Foundation student a target
  above it.
- **The user-facing limit is study kits, not tokens.** Tokens are tracked
  underneath because that is what costs money; the header says "8 study kits left
  today". `src/lib/tokenService.ts`.
- **`users/{uid}` is created in exactly one place** — the snapshot listener in
  `App.tsx`. Adding a second creator re-introduces a race the rules reject.
- **`displayName` must be a string.** `firestore.rules` refuses `null`, which is
  what a fresh email/password account has. `src/lib/newUserProfile.ts`.
- The crisis check runs on **all three** AI routes, not just `/api/generate`.

## Open items

- Study reminders work but Resend can only email RED until a domain is bought.
- `analyze-image` runs the crisis check on the caption only, not the photo.
- TURN servers are unverified on a real school network.
