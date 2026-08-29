/**
 * Crisis detection for anything typed into the AI.
 *
 * WHY THIS EXISTS. During a mobile test RED typed *"why do people kill themself
 * and why do they think about that"*. StudyQuest generated a study kit titled
 * "Suicide" with a **Quick Facts** section and **Exam Tips** on "answering
 * questions about suicidal thoughts and behaviors". No helpline, no pause,
 * nothing. Just revision material.
 *
 * He was testing. The problem is everyone else. This app is used by teenagers,
 * and a 14-year-old typing that sentence at 3am is not reliably doing psychology
 * coursework. Answering with flashcards is the wrong response to the one message
 * where getting it wrong matters most.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TWO LEVELS, BECAUSE ONE WOULD BREAK THE PRODUCT
 * ────────────────────────────────────────────────────────────────────────────
 * The lazy version blocks every mention of suicide. That fails real students:
 * Durkheim is on the A-level Sociology syllabus, self-harm is in Health and
 * Social Care, and the Samaritans themselves publish material people revise
 * from. An app that refuses to help with the syllabus is broken, and a student
 * who hits a wall just asks ChatGPT instead — where nobody is watching at all.
 *
 *   'crisis'  — intent or method. Someone asking about THEMSELVES, or asking
 *               HOW. Nothing is generated. Help is offered instead.
 *   'support' — the topic is present without intent. The kit is still made,
 *               with support resources attached ahead of it.
 *   'none'    — everything else, untouched.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY IT LIVES HERE AND RUNS ON THE SERVER
 * ────────────────────────────────────────────────────────────────────────────
 * Same lesson as the username filter, which was a client-side check until a
 * plain REST call walked straight past it. A safety check in the browser is a
 * suggestion, so this one runs on the server.
 *
 * ON ALL THREE ROUTES THAT REACH A MODEL, not one. The first version guarded
 * `/api/generate` only, and this comment claimed that was "the single call that
 * reaches a model". It was not: `/api/expand-chat` and `/api/analyze-image` are
 * two more, and expand-chat — the "Go Deeper" conversation — is the surface
 * where somebody is MOST likely to say something about themselves rather than
 * about a syllabus. A safety check with a hole in it is worse than none,
 * because it is believed.
 */

export type CrisisLevel = 'none' | 'support' | 'crisis';

export interface CrisisAssessment {
  level: CrisisLevel;
  /** Which rule fired, for the server log. Never shown to the user. */
  matched: string | null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Patterns                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/*
  FIRST PERSON, OR ASKING HOW. These are the two shapes that are not revision.

  "kill myself", "end my life", "want to die" — the person is the subject.
  "how to kill yourself", "ways to end it" — method-seeking, whoever it is for.

  Deliberately tolerant of how people actually type: no apostrophes, "myself"
  written "my self", "wanna", "dont". A filter that only catches correct
  spelling catches the calm and misses the distressed.
*/
const CRISIS_PATTERNS: Array<[string, RegExp]> = [
  ['first-person suicide',
    /\b(i|i'?m|im|i\s*am)\b[^.?!]{0,40}\b(want|wanna|going|gonna|plan|think|thought|tried|trying|about)\b[^.?!]{0,40}\b(kill(ing)?\s+my\s*self|end(ing)?\s+(my|it)\s*(life|all)?|commit\s+suicide|suicide|die|not\s+be\s+here|unalive)\b/i],

  ['direct statement of intent',
    /\b(kill(ing)?\s+my\s*self|end(ing)?\s+my\s+(own\s+)?life|take\s+my\s+own\s+life|commit(ting)?\s+suicide|unalive\s+my\s*self)\b/i],

  // "ending it all" carries no possessive and names nothing, so every pattern
  // above walked straight past it. It is also one of the commonest ways people
  // actually say it.
  ['ending it all',
    /\b(end(ing)?|finish(ing)?)\s+it\s+all\b/i],

  ['method seeking',
    /\b(how|ways?|best\s+way|easiest\s+way|painless|quickest)\b[^.?!]{0,30}\b(to\s+)?(kill\s+(my\s*self|your\s*self|someone|yourself)|commit\s+suicide|end\s+(my|your|it)\s*(life)?|die|overdose|hang\s+my\s*self)\b/i],

  ['self harm intent',
    /\b(i|i'?m|im)\b[^.?!]{0,30}\b(want|wanna|need|going|gonna|like|keep)\b[^.?!]{0,30}\b(cut(ting)?\s+my\s*self|hurt(ing)?\s+my\s*self|harm(ing)?\s+my\s*self|self\s*harm)\b/i,
  ],
  ['self harm method',
    /\b(how|ways?)\b[^.?!]{0,25}\b(to\s+)?(cut|hurt|harm)\s+(my\s*self|your\s*self)\b/i],

  ['hopelessness with intent',
    /\b(i\s+(don'?t|dont|do\s+not)\s+want\s+to\s+(be\s+here|live|exist|wake\s+up))\b/i],

  ['no reason to live',
    /\b(no\s+(reason|point)\s+(to|in)\s+(liv(e|ing)|going\s+on|being\s+here))\b/i],
];

/*
  The topic is present, but nobody has said it is about them and nobody has
  asked how. This is where Sociology, Psychology and Health & Social Care live,
  so the kit is still made — with help attached, because being wrong in this
  direction costs a banner and being wrong the other way costs much more.
*/
const SUPPORT_PATTERNS: Array<[string, RegExp]> = [
  ['suicide mentioned', /\bsuicid(e|al)\b/i],
  ['self harm mentioned', /\bself[\s-]?harm(ing)?\b/i],
  ['kill themselves', /\bkill(s|ing)?\s+(them\s?sel(f|ves)|him\s?self|her\s?self)\b/i],
  ['ending their life', /\bend(s|ing|ed)?\s+(their|his|her)\s+(own\s+)?li(fe|ves)\b/i],
  ['eating disorder', /\b(anorexi(a|c)|bulimi(a|c)|purging|starve\s+my\s*self)\b/i],
  ['overdose', /\boverdos(e|ing)\b/i],
];

/*
  FALSE FRIENDS. Checked before anything else, because these are ordinary
  English and ordinary schoolwork, and stopping a student mid-revision to hand
  them a helpline is its own kind of failure.

  "Suicide Squad" is a film. "Suicide mission" is a figure of speech. "Kill a
  process" is what this very repo does to a stale port. "Killing time",
  "dying to know", "this homework is killing me" — all normal.
*/
const FALSE_FRIENDS: RegExp[] = [
  /\bsuicide\s+squad\b/i,
  /\bsuicide\s+(mission|pass|squeeze|door|bomber)\b/i,
  /\bkill(ing)?\s+(a\s+)?(process|port|server|task|the\s+engine|time|the\s+lights)\b/i,
  /\bdying\s+to\s+(know|see|hear|meet|try)\b/i,
  /\b(killing|murdering)\s+(me|it)\b(?!\s*self)/i,   // "this exam is killing me"
  /\bdead(line|lock|weight|pan)\b/i,
  /\bkill\s+(bill|switch)\b/i,
];

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Assess a piece of user text.
 *
 * Order matters: false friends first, then crisis, then support. Checking
 * `support` before `crisis` would label "I want to kill myself" as a topic
 * mention and hand the person a study kit.
 */
export function assessCrisis(input: unknown): CrisisAssessment {
  const text = typeof input === 'string' ? input : '';
  if (!text.trim()) return { level: 'none', matched: null };

  // Only strip the false friends, rather than returning early: "Suicide Squad
  // is great but i want to kill myself" must still reach the crisis rules.
  let scrubbed = text;
  for (const rx of FALSE_FRIENDS) scrubbed = scrubbed.replace(rx, ' ');

  for (const [name, rx] of CRISIS_PATTERNS) {
    if (rx.test(scrubbed)) return { level: 'crisis', matched: name };
  }
  for (const [name, rx] of SUPPORT_PATTERNS) {
    if (rx.test(scrubbed)) return { level: 'support', matched: name };
  }
  return { level: 'none', matched: null };
}

/**
 * What someone in crisis is shown instead of a study kit.
 *
 * UK-first because that is where the users are, with Childline named because
 * they are the right service for most of them and a teenager will not think of
 * it themselves.
 *
 * Deliberately short, and it does not diagnose, lecture or ask questions it
 * cannot handle the answer to. It says: you are not in trouble, here is someone
 * who can actually help, they are free and open now.
 */
export const CRISIS_MESSAGE = [
  "It sounds like you might be going through something really hard right now, so I'm not going to make a study kit for this.",
  '',
  'Please talk to someone who can actually help:',
  '',
  '  • **Samaritans** — call **116 123**, free, any time, day or night',
  '  • **Shout** — text **SHOUT** to **85258**, free, if you would rather not talk',
  '  • **Childline** — call **0800 1111**, free, if you are under 19',
  '  • If you are in immediate danger, call **999**',
  '',
  "You are not in trouble and you have not done anything wrong. Talking to someone is the bravest thing on this list, and it is what these people are there for.",
].join('\n');

/** Attached above a kit when the topic came up without any sign of intent. */
export const SUPPORT_BANNER = [
  '> **Before you read on** — this topic can be heavy, and if any of it is close to home,',
  '> **Samaritans** are on **116 123** (free, any time) and **Childline** on **0800 1111**.',
  '',
].join('\n');
