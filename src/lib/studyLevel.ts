/**
 * Who the student is, so questions can be pitched at them.
 *
 * StudyQuest generated the same question for everybody. A Year 7 in the bottom
 * set and a Year 11 in set 1 got identical work, which is useless to both: one
 * is demoralised, the other is bored, and neither is being stretched.
 *
 * THREE THINGS DECIDE DIFFICULTY, AND TWO OF THEM ARE EASY TO GET WRONG.
 *
 * 1. Year. The obvious one, and the only one that is school-wide.
 *
 * 2. Set — WHICH IS PER SUBJECT, NOT PER STUDENT. Set 1 for Maths and set 4 for
 *    French is an ordinary timetable, not an edge case. A single school-wide set
 *    would pitch that student's French at their Maths level and quietly make the
 *    app useless in every subject except their best one. Plenty of subjects are
 *    not setted at all, so "no sets here" has to be sayable.
 *
 * 3. How many sets that subject runs. A set number means nothing without it.
 *    Set 3 of 4 is near the bottom. Set 3 of 7 is comfortably above the middle.
 *    Most schools run four; some run up to seven.
 *
 * Set 1 is always the top set.
 */

export const MIN_YEAR = 7;
export const MAX_YEAR = 13;
export const MAX_SETS = 7;

/** GCSE papers are sat at one of two tiers, and the set usually decides which. */
export type Tier = 'Foundation' | 'Higher';

/** Where a student sits in ONE subject. */
export interface SubjectSet {
  /** 1 is the top set. */
  set: number;
  /** How many sets this subject runs. */
  of: number;
}

export interface StudyLevel {
  /** UK school year, 7–13. School-wide. */
  year: number;
  /**
   * Set per subject, keyed by lower-cased subject name. A subject that is
   * absent is not setted — which is a real answer, not missing data.
   */
  sets: Record<string, SubjectSet>;
}

export const subjectKey = (subject: string | null | undefined): string =>
  String(subject ?? '').trim().toLowerCase();

/** Never trust what came out of a dropdown, a URL, or a document written months ago. */
export function normaliseLevel(input: Partial<StudyLevel> | null | undefined): StudyLevel {
  const year = clamp(Math.round(Number(input?.year)) || MIN_YEAR, MIN_YEAR, MAX_YEAR);
  const sets: Record<string, SubjectSet> = {};

  for (const [rawSubject, rawValue] of Object.entries(input?.sets ?? {})) {
    const key = subjectKey(rawSubject);
    if (!key) continue;

    const set = Math.round(Number((rawValue as SubjectSet | null)?.set));
    if (!Number.isFinite(set) || set < 1) continue;      // "not setted" — keep it that way

    const rawOf = Math.round(Number((rawValue as SubjectSet | null)?.of));
    // A set without a subject size cannot be read, so assume the common four
    // rather than silently discarding what the student told us.
    const of = clamp(Number.isFinite(rawOf) && rawOf >= 2 ? rawOf : 4, 2, MAX_SETS);
    sets[key] = { set: clamp(set, 1, of), of };
  }

  return { year, sets };
}

/** The student's set in one subject, or null when that subject is not setted. */
export function setFor(level: StudyLevel, subject: string): SubjectSet | null {
  return level.sets[subjectKey(subject)] ?? null;
}

/**
 * Where the student sits within this subject, 1 (top set) to 0 (bottom set).
 *
 * This is the number that makes set 3 of 4 and set 3 of 7 different: 0.33
 * against 0.67. An unsetted subject sits at 0.5 — no claim either way.
 */
export function setStanding(level: StudyLevel, subject: string): number {
  const s = setFor(level, subject);
  if (!s || s.of < 2) return 0.5;
  return (s.of - s.set) / (s.of - 1);
}

/**
 * Difficulty to aim at in this subject, 1–10.
 *
 * Year leads, because a top-set Year 7 has still not met most of what a Year 11
 * is examined on — being quick does not substitute for not having been taught it
 * yet. The set then moves it up or down by up to 1.5.
 */
export function difficultyFor(level: StudyLevel, subject: string): number {
  const byYear = 2 + (level.year - MIN_YEAR) * 1.25;      // Y7 → 2, Y11 → 7, Y13 → 9.5
  const bySet = (setStanding(level, subject) - 0.5) * 3;  // top +1.5, bottom −1.5
  return Number(clamp(byYear + bySet, 1, 10).toFixed(1));
}

/**
 * The GCSE tier this student is most likely entered for in this subject.
 *
 * Only years 10 and 11 sit GCSEs, and only some subjects are tiered at all, so
 * everything else is null rather than a guess. Foundation caps at grade 5, which
 * is why entering the wrong tier matters far more than a slightly hard question.
 */
export function tierFor(level: StudyLevel, subject: string): Tier | null {
  if (level.year < 10 || level.year > 11) return null;
  if (!setFor(level, subject)) return null;
  return setStanding(level, subject) >= 0.5 ? 'Higher' : 'Foundation';
}

/**
 * Grade band to aim at on the GCSE 9–1 scale.
 *
 * Null outside years 9–11, in both directions and for different reasons: before
 * Year 9 there is no grade to project yet, and after Year 11 the student is on
 * A-levels, which are graded A*–E. Returning a 9–1 grade to a Year 13 was
 * confidently reporting a scale they are no longer sitting.
 */
export function targetGradeBand(
  level: StudyLevel,
  subject: string,
): { low: number; high: number } | null {
  if (level.year < 9 || level.year > 11) return null;

  const centre = difficultyFor(level, subject) * 0.95;
  const low = clamp(Math.round(centre) - 1, 1, 9);
  const high = clamp(Math.round(centre) + 1, 1, 9);

  const tier = tierFor(level, subject);
  // Foundation cannot award above a 5, so promising a 7 would be a lie.
  if (tier === 'Foundation') return { low: Math.min(low, 4), high: Math.min(high, 5) };
  // Higher starts at 4; below that a student would have been entered elsewhere.
  if (tier === 'Higher') return { low: Math.max(low, 4), high: Math.max(high, 5) };
  return { low, high };
}

/** "Year 10, set 2 of 4 for Maths" — for the UI, and so the student can correct it. */
export function describeLevel(level: StudyLevel, subject?: string): string {
  const year = `Year ${level.year}`;
  if (!subject) return year;
  const s = setFor(level, subject);
  if (!s) return `${year}, ${subject} (not setted)`;
  return `${year}, set ${s.set} of ${s.of} for ${subject}`;
}

/**
 * The instruction handed to the model, so the setting actually changes the work.
 *
 * A stored year and set that never reach the prompt are decoration. This is the
 * line that makes them do something.
 */
export function promptFor(level: StudyLevel, subject: string): string {
  const difficulty = difficultyFor(level, subject);
  const tier = tierFor(level, subject);
  const band = targetGradeBand(level, subject);
  const standing = setStanding(level, subject);

  const parts = [
    `The student is in ${describeLevel(level, subject)} at a UK school.`,
    `Pitch the material at difficulty ${difficulty} out of 10.`,
  ];

  if (tier) parts.push(`They are working towards GCSE ${tier} tier.`);
  if (band) {
    parts.push(
      band.low === band.high
        ? `Aim at grade ${band.low}.`
        : `Aim at grades ${band.low}–${band.high}.`,
    );
  }
  if (level.year <= 9) {
    parts.push('This is Key Stage 3, so do not assume GCSE content has been taught.');
  }
  if (standing >= 0.8) {
    parts.push('Stretch them: include one question that goes beyond the obvious method.');
  } else if (standing <= 0.2) {
    parts.push(
      'Build confidence: short steps, plain wording, and no more than one idea per question.',
    );
  }

  return parts.join(' ');
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
