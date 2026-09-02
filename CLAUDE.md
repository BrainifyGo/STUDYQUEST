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

## How StudyQuest teaches (from a real teacher, via RED)

This is a product requirement, not a preference. RED relayed it from a
practising teacher as the fastest way students actually learn.

- **You do not drop the subject on the whole. You drop it bit by bit.** A lesson
  is small steps shown one at a time. Handing over everything at once is the old
  study-kit behaviour, and it is what this replaces.
- **About five lines, then questions on exactly that.** Never more than six. A
  step that teaches and never checks is a paragraph, not a step.
- **Explain like a teacher explaining to a baby.** The simplest possible words.
- **The next bit waits for the last one.** If a student can scroll ahead, it is a
  document again. The gate IS the method.
- **A game must come out of the lesson.** XP, bosses, duels and the Arcade are
  points bolted onto anything — that is NOT what the teacher meant. A game here
  must be impossible to play without having read the step above it.
- **Name the number you want, not the ceiling.** Asking a model for "at most 6
  lines" reliably produced exactly 6; asking for "about 4-5, never more than 6"
  produced 4. Measured against a real model, twice.

- **Simplest first, hardest last.** Step 1 is something almost anyone could
  follow; the final step is the real thing they came to learn.
- **The student can ask, and is welcomed.** A lesson where the only permitted
  questions are the app's own is a worksheet.
- **Students are not interchangeable.** `learningStyle` is the student's OWN
  choice — gentle, challenge or rewards — never inferred from their scores.

### Tone is safeguarding, not style

The users are schoolchildren, and RED's teacher warned that a method which is
too harsh can condemn a child, make them sad, and make them stop wanting to
study. So:

- Never imply a student is slow, stupid, careless or lazy. Never be sarcastic.
  Never compare them to another student.
- **Never say "wrong".** `encourage()` has no wording that does.
- Never use **"obviously", "simply", "just", "clearly", "easy", "of course"** of
  the work — to a stuck child every one means "you should already know this".
- If a student says something unkind about themselves, answer that FIRST, before
  the subject, and never let it stand. Found by testing: the tone rules said so
  but the ask prompt said "answer what they asked and nothing else", and the
  model obeyed the narrower one.

See `src/lib/lesson.ts` and `src/components/LessonPlayer.tsx`.

## Open items

- Study reminders work but Resend can only email RED until a domain is bought.
- `analyze-image` runs the crisis check on the caption only, not the photo.
- TURN servers are unverified on a real school network.
