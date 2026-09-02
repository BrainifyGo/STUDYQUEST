/**
 * How sure were you, and were you right?
 *
 * Every study app records correct and incorrect. That misses the thing that
 * actually costs grades, which is not forgetting — it is **believing you know
 * something you don't**. A student who revises by re-reading feels fluent,
 * recognises everything, and walks into the exam confident about the four topics
 * they cannot actually do. Nothing tells them, because nothing asked.
 *
 * So: ask before revealing, then sort into four boxes.
 *
 *              │ said they were sure │ said they were unsure │
 *   ───────────┼─────────────────────┼───────────────────────┤
 *   got it     │ SOLID               │ LUCKY                 │
 *   missed it  │ BLIND SPOT          │ KNOWN GAP             │
 *
 * The two on the diagonal are the ones worth acting on, and they are opposites:
 *
 *   BLIND SPOT — sure and wrong. Where grades die. The student is not going to
 *   revise these, because they do not believe there is anything to revise.
 *   Surfacing them is the single most useful thing this file does.
 *
 *   LUCKY — unsure and right. Fragile: guessed, half-remembered, or reasoned out
 *   slowly in a way that will not survive time pressure. It reads as a pass in
 *   every other app.
 *
 * Everything here is pure. Storage and UI live elsewhere so the classification
 * can be reasoned about, and tested, on its own.
 */

/** What the student said before seeing the answer. */
export type Confidence = 'sure' | 'unsure';

export type Box = 'solid' | 'lucky' | 'blind-spot' | 'known-gap';

export interface Attempt {
  /** Topic, subject or spec point — whatever the caller groups by. */
  topic: string;
  confidence: Confidence;
  correct: boolean;
}

export interface BoxCounts {
  solid: number;
  lucky: number;
  'blind-spot': number;
  'known-gap': number;
}

export const EMPTY_COUNTS: BoxCounts = {
  solid: 0, lucky: 0, 'blind-spot': 0, 'known-gap': 0,
};

/** Which box one attempt falls in. */
export function boxFor(confidence: Confidence, correct: boolean): Box {
  if (correct) return confidence === 'sure' ? 'solid' : 'lucky';
  return confidence === 'sure' ? 'blind-spot' : 'known-gap';
}

export function tally(attempts: Attempt[]): BoxCounts {
  const counts: BoxCounts = { ...EMPTY_COUNTS };
  for (const a of attempts ?? []) {
    if (!a || typeof a.correct !== 'boolean') continue;
    counts[boxFor(a.confidence === 'sure' ? 'sure' : 'unsure', a.correct)]++;
  }
  return counts;
}

/**
 * How well the student's confidence tracks their accuracy, −1 to 1.
 *
 *    1  perfectly calibrated: sure when right, unsure when wrong
 *    0  their confidence carries no information at all
 *   −1  inverted: confident exactly when they are wrong
 *
 * This is the number that improves as someone learns to judge themselves, which
 * is a skill worth more in an exam hall than any single fact.
 */
export function calibration(counts: BoxCounts): number | null {
  const total = counts.solid + counts.lucky + counts['blind-spot'] + counts['known-gap'];
  if (total === 0) return null;
  const agreeing = counts.solid + counts['known-gap'];
  return Number((((agreeing / total) * 2) - 1).toFixed(3));
}

/** Share of attempts that were confidently wrong, 0–1. */
export function blindSpotRate(counts: BoxCounts): number | null {
  const total = counts.solid + counts.lucky + counts['blind-spot'] + counts['known-gap'];
  if (total === 0) return null;
  return Number((counts['blind-spot'] / total).toFixed(3));
}

export interface TopicRisk {
  topic: string;
  counts: BoxCounts;
  attempts: number;
  blindSpots: number;
}

/**
 * Topics to revise first: most confidently-wrong answers, worst first.
 *
 * Deliberately NOT sorted by how often the student got something wrong. They
 * already know about those. This ranks by what they are wrong about *and do not
 * realise* — which is the only list that tells them something new.
 *
 * `minAttempts` guards against one unlucky answer branding a topic a blind spot.
 */
export function riskiestTopics(
  attempts: Attempt[],
  { limit = 5, minAttempts = 2 }: { limit?: number; minAttempts?: number } = {},
): TopicRisk[] {
  const byTopic = new Map<string, Attempt[]>();
  for (const a of attempts ?? []) {
    if (!a?.topic) continue;
    const key = a.topic.trim();
    if (!key) continue;
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key)!.push(a);
  }

  return [...byTopic.entries()]
    .map(([topic, list]) => {
      const counts = tally(list);
      return { topic, counts, attempts: list.length, blindSpots: counts['blind-spot'] };
    })
    .filter((t) => t.attempts >= minAttempts && t.blindSpots > 0)
    // Most blind spots first; on a tie, the smaller sample is the sharper signal.
    .sort((a, b) => b.blindSpots - a.blindSpots || a.attempts - b.attempts)
    .slice(0, limit);
}

/**
 * One sentence the student can act on today, or null when there is nothing
 * honest to say yet.
 *
 * Returning null matters as much as the sentences do. Four attempts is not
 * evidence of anything, and a confident verdict drawn from it teaches people to
 * ignore the feature.
 */
export const MIN_FOR_VERDICT = 12;

export function verdict(counts: BoxCounts): string | null {
  const total = counts.solid + counts.lucky + counts['blind-spot'] + counts['known-gap'];
  if (total < MIN_FOR_VERDICT) return null;

  const blind = counts['blind-spot'] / total;
  const lucky = counts.lucky / total;

  if (blind >= 0.25) {
    return `A quarter of your answers were wrong when you felt sure. That is the gap ` +
      `worth closing first — you are not revising those topics, because you do not ` +
      `think you need to.`;
  }
  if (blind >= 0.12) {
    return `You were confidently wrong on ${counts['blind-spot']} of ${total}. Those are ` +
      `the ones to look at, not the ones you already knew you found hard.`;
  }
  if (lucky >= 0.3) {
    return `You got a lot right while unsure. You know more than you think, but it is ` +
      `fragile — under exam pressure, "probably" tends to become "blank".`;
  }
  if (counts.solid / total >= 0.7) {
    return `Your confidence matches your accuracy. That is the hard part, and you have it.`;
  }
  return `Your sense of what you know is roughly reliable. Keep checking it.`;
}

export const BOX_LABELS: Record<Box, string> = {
  solid: 'Knew it',
  lucky: 'Got lucky',
  'blind-spot': 'Thought you knew it',
  'known-gap': 'Knew you didn\'t',
};

export const BOX_BLURBS: Record<Box, string> = {
  solid: 'Right, and you were sure. Nothing to do here.',
  lucky: 'Right, but you were not sure — this one is fragile.',
  'blind-spot': 'Wrong, and you were sure. Start here.',
  'known-gap': 'Wrong, and you knew it. At least it is on your radar.',
};
