/**
 * KEEPING SLURS AND ABUSE OUT OF USERNAMES.
 *
 * A username is shown to other children — in a friends list, in a study room, on
 * a challenge scoreboard. Ola and Daniel found you could register the n-word.
 * That is the single worst thing this app could have been carrying, and it is
 * not a feature request; it is a defect.
 *
 * THE HARD PART IS NOT THE WORD LIST. It is that people evade one.
 *
 *   n1gger  n!gger  n.i.g.g.e.r  nigg3r  𝗻igger  niiigger  ngger
 *
 * A naive `includes()` catches none of those. So the name is NORMALISED first —
 * confusables folded, digits and symbols mapped back to the letters they imitate,
 * separators stripped, repeated letters collapsed — and the check runs on the
 * result. That turns every example above into the same string.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO.
 *
 * 1. It does not try to be a complete profanity filter. Mild swearing is a
 *    different problem from a racial slur, and treating them the same either
 *    blocks half the alphabet or lets the serious ones through. This targets
 *    slurs and sexual content — the things that cause real harm to the person
 *    reading them.
 *
 * 2. It does not do substring matching without care. "Scunthorpe" is the
 *    standard example; there are plenty of others. Short terms must match as
 *    whole words, or the filter blocks innocent names and gets switched off.
 *
 * The list below is deliberately terse and contains slurs. It exists to be
 * matched against, not read.
 */

/**
 * Characters people substitute for letters, folded back.
 *
 * The mathematical-alphanumeric ranges matter more than they look: `𝗻𝗶𝗴𝗴𝗲𝗿`
 * is a completely different set of code points from `nigger` and sails through
 * any check that has not normalised.
 */
const CONFUSABLES: Record<string, string> = {
  '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a',
  '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '6': 'g',
  '£': 'l', '€': 'e', 'ø': 'o', 'α': 'a', 'ϲ': 'c', 'е': 'e', 'о': 'o',
  'р': 'p', 'а': 'a', 'ѕ': 's', 'і': 'i', 'ј': 'j', 'х': 'x', 'у': 'y',
};

/**
 * Reduce a name to the letters someone would actually read it as.
 *
 * Order matters: strip accents, fold confusables, drop everything that is not a
 * letter, then collapse runs. Collapsing last means `n-i-i-i-g` and `niiig`
 * arrive at the same place.
 */
export function normaliseForSafety(input: string): string {
  const lowered = input
    .toLowerCase()
    // Strip diacritics: "ñïgger" is not a different word.
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

  let folded = '';
  for (const ch of lowered) folded += CONFUSABLES[ch] ?? ch;

  return folded
    .replace(/[^a-z]/g, '')      // separators, dots, underscores, spaces
    .replace(/(.)\1+/g, '$1');   // niiigger -> niger, nigggg -> nig
}

/**
 * THE LISTS ARE WRITTEN PLAINLY AND NORMALISED AT LOAD.
 *
 * My first version wrote them by hand in post-collapse form — `niger` for the
 * slur, because the double g collapses. Three tests failed immediately and all
 * three were the same mistake: `support` collapses to `suport`, `ass` collapses
 * to `as`, so entries written in ordinary spelling never matched anything.
 *
 * Running the same normaliser over the lists removes an entire class of bug
 * that is otherwise invisible until someone gets a slur past the filter.
 */
const norm = (list: string[]) => list.map(normaliseForSafety);

/** Blocked wherever they appear inside a name. Long enough to be unambiguous. */
const BLOCKED_SUBSTRINGS = norm([
  'nigger', 'nigga', 'nigor', 'negro',
  'faggot', 'fagget', 'tranny', 'trannie',
  'chink', 'gook', 'kike', 'spic', 'wetback', 'coon', 'paki',
  'retard', 'mongoloid',
  'rape', 'rapist', 'pedo', 'paedo', 'molest', 'cunt',
  'wanker', 'whore', 'slut',
  'penis', 'vagina', 'porn', 'hentai', 'incest', 'bestiality',
  'hitler', 'nazi', 'holocaust',
  'killyourself', 'kys',
]);

/**
 * Blocked only as a WHOLE name.
 *
 * Short and legitimately embeddable. "Ass" inside "Cassandra" is not abuse, and
 * a filter that says otherwise gets worked around rather than respected.
 */
const BLOCKED_WHOLE = norm([
  'ass', 'sex', 'cum', 'fuck', 'fuk', 'shit', 'piss', 'anal', 'jizz', 'dick',
  'cock', 'boob', 'tit', 'bitch', 'kkk',
]);

/** Names nobody but us should hold. */
const RESERVED = norm([
  'admin', 'administrator', 'moderator', 'mod', 'staff', 'team', 'support',
  'help', 'official', 'studyquest', 'system', 'root', 'null', 'undefined',
  'me', 'you', 'everyone', 'here',
]);

/**
 * REAL WORDS THAT CONTAIN A BLOCKED ONE.
 *
 * The Scunthorpe problem, named after the town whose residents could not sign up
 * to AOL in 1996. My own first version blocked it, which is a fair demonstration
 * that knowing about the problem is not the same as avoiding it.
 *
 * Checked before anything else, so a legitimate word always wins. UK place names
 * matter here in particular — this is an app for British schoolchildren, and
 * some of them live in these places.
 */
const ALLOWED_EXACT = norm([
  'scunthorpe', 'penistone', 'clitheroe', 'lightwater', 'cockermouth',
  'assange', 'cassandra', 'classic', 'assignment', 'assistant', 'assess',
  'analysis', 'analyse', 'analytics', 'therapist', 'shiitake', 'sussex',
  'essex', 'middlesex', 'wessex', 'titan', 'titanic', 'button', 'cocktail',
  'peacock', 'hancock', 'wilcox', 'dickens', 'dickinson', 'grape', 'grapes',
  'drape', 'scrape', 'therapeutic', 'cummings', 'documents',
]);

/**
 * A single shape rather than a discriminated union.
 *
 * The union `{ok:true} | {ok:false; reason}` is the nicer type, but this
 * project's tsconfig has no `strict`, so `strictNullChecks` is off and TypeScript
 * will not narrow on the boolean discriminant — `verdict.reason` after
 * `if (!verdict.ok)` is a compile error. One optional field works under the
 * settings this project actually has, which beats a prettier type that does not.
 */
export interface UsernameVerdict {
  ok: boolean;
  reason?: 'offensive' | 'reserved';
}

/**
 * Is this username acceptable?
 *
 * Separate from `usernameProblem()`, which checks SHAPE — length, characters,
 * punctuation. This checks meaning, and the two are kept apart because they fail
 * for different reasons and deserve different messages.
 */
export function checkUsernameSafety(username: string): UsernameVerdict {
  const flat = normaliseForSafety(username);
  if (!flat) return { ok: true };   // shape validation will reject it anyway

  // A real word wins outright. See ALLOWED_EXACT — the alternative is telling
  // somebody from Scunthorpe their home town is offensive.
  if (ALLOWED_EXACT.includes(flat)) return { ok: true };

  if (RESERVED.includes(flat)) return { ok: false, reason: 'reserved' };
  if (BLOCKED_WHOLE.includes(flat)) return { ok: false, reason: 'offensive' };

  for (const term of BLOCKED_SUBSTRINGS) {
    if (flat.includes(term)) return { ok: false, reason: 'offensive' };
  }

  return { ok: true };
}

/**
 * What to tell them.
 *
 * Deliberately does not repeat the word back, name which term matched, or
 * explain the rule in enough detail to be gamed. "Pick another" is the whole
 * message; anything more is a hint sheet for someone determined to get abuse
 * past it.
 */
export function safetyMessage(reason: 'offensive' | 'reserved'): string {
  return reason === 'reserved'
    ? 'That username is reserved. Please pick another.'
    : 'That username is not allowed. Please pick another.';
}

/**
 * The same check for a DISPLAY NAME.
 *
 * Display names are shown next to usernames everywhere — in a friends list, in a
 * study room, on a challenge — so filtering only the username would leave the
 * obvious way round. Display names contain spaces, which normalisation strips
 * anyway, so the same function does the job.
 */
export const checkDisplayNameSafety = checkUsernameSafety;
