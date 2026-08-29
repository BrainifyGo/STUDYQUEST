import { addDoc, collection } from 'firebase/firestore';
import { auth, db } from './firebase';

/**
 * Writing a study session — the row Analytics is built from.
 *
 * WHY THIS EXISTS. Analytics showed **0 hours this week** and **80% mastery
 * this month** on a phone that had just spent ten minutes playing the Arcade,
 * winning a duel and answering twenty questions. Both numbers were wrong, in
 * different ways, and only one of them was a window bug — it wasn't a window
 * bug at all:
 *
 *   1. A session was written in exactly ONE place: after generating a study
 *      kit. Playing the Arcade, finishing a duel, beating a boss — none of it
 *      was recorded. Hence 0 hours after actually studying.
 *
 *   2. The numbers were invented. Every generation wrote `duration: 0.5` and
 *      `score: 80`, with the comments "Default estimate per generation" and
 *      "Default starting score". So the "80% mastery" on the dashboard was not
 *      a measurement of anything — it was a constant, and it would read 80%
 *      for a user who had never answered a question correctly.
 *
 * That second one matters more than it looks: advanced analytics is a **Pro
 * feature**. Charging for a number that is hardcoded is the kind of thing that
 * is very hard to explain afterwards.
 *
 * SO: one function writes sessions, and it only ever writes what actually
 * happened. A round that was not scored records no score rather than a
 * flattering guess — `summarise()` already skips non-numeric scores, so an
 * unscored session counts toward time and is simply absent from mastery.
 */

export interface StudySessionInput {
  /** Hours. Real elapsed time, not an estimate. */
  duration: number;
  /**
   * Percentage 0-100, or null when the activity had no score.
   *
   * null is deliberately different from 0: "no score" and "scored zero" mean
   * completely different things to an average, and conflating them is how a
   * mastery figure starts lying.
   */
  score: number | null;
  /** What was studied, for the subject breakdown. */
  subject: string;
  /** What produced this — 'arcade', 'duel', 'kit', 'room'. For future filtering. */
  source: string;
}

/**
 * Record one session. Never throws.
 *
 * Analytics is not worth failing a finished quiz over: the player has already
 * seen their result, and an exception here would surface as an error toast on
 * a screen that just said "You win".
 */
export async function logStudySession(input: StudySessionInput): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await addDoc(collection(db, 'study_sessions'), {
      userId: user.uid,
      date: new Date().toISOString(),
      // Rounded to the nearest tenth of an hour. Storing 0.03716666 helps
      // nobody and makes the totals look like a rounding error.
      duration: Math.max(0, Math.round(input.duration * 10) / 10),
      ...(typeof input.score === 'number' && Number.isFinite(input.score)
        ? { score: Math.max(0, Math.min(100, Math.round(input.score))) }
        : {}),
      subject: input.subject || 'General',
      source: input.source,
    });
  } catch {
    /* analytics must never break the thing the person was actually doing */
  }
}

/** Seconds of wall-clock play, as hours. */
export function hoursFrom(startedAtMs: number, now = Date.now()): number {
  const hours = (now - startedAtMs) / 3_600_000;
  // A negative or absurd value means the clock moved, not that somebody studied
  // for nine hours. Clamp rather than record a number that skews every average.
  if (!Number.isFinite(hours) || hours < 0) return 0;
  return Math.min(hours, 4);
}
