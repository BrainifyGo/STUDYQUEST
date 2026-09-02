/**
 * Confidence calibration.
 *
 * The feature exists for one box: confidently wrong. Everything else here is
 * arithmetic around it. The two properties worth guarding are that the blind
 * spot never gets buried under ordinary wrong answers, and that the app keeps
 * its mouth shut until it has enough evidence to say something true.
 */
import { describe, expect, it } from 'vitest';
import {
  BOX_BLURBS, BOX_LABELS, EMPTY_COUNTS, MIN_FOR_VERDICT,
  blindSpotRate, boxFor, calibration, riskiestTopics, tally, verdict,
  type Attempt,
} from '../src/lib/confidence';

const a = (topic: string, confidence: 'sure' | 'unsure', correct: boolean): Attempt =>
  ({ topic, confidence, correct });

/** n attempts in one box. */
const many = (n: number, topic: string, c: 'sure' | 'unsure', ok: boolean) =>
  Array.from({ length: n }, () => a(topic, c, ok));

describe('the four boxes', () => {
  it('sorts an attempt by both answers, not just whether it was right', () => {
    expect(boxFor('sure', true)).toBe('solid');
    expect(boxFor('unsure', true)).toBe('lucky');
    expect(boxFor('sure', false)).toBe('blind-spot');
    expect(boxFor('unsure', false)).toBe('known-gap');
  });

  it('separates two right answers that are not the same at all', () => {
    // Every other app records both of these as simply "correct".
    expect(boxFor('sure', true)).not.toBe(boxFor('unsure', true));
  });

  it('counts a mixed run', () => {
    const counts = tally([
      a('osmosis', 'sure', true),
      a('osmosis', 'sure', false),
      a('osmosis', 'unsure', true),
      a('osmosis', 'unsure', false),
      a('osmosis', 'sure', false),
    ]);
    expect(counts).toEqual({ solid: 1, lucky: 1, 'blind-spot': 2, 'known-gap': 1 });
  });

  it('ignores junk instead of crashing on it', () => {
    expect(tally([])).toEqual(EMPTY_COUNTS);
    expect(tally(null as unknown as Attempt[])).toEqual(EMPTY_COUNTS);
    expect(tally([{ topic: 'x' } as Attempt])).toEqual(EMPTY_COUNTS);
  });

  it('treats an unrecognised confidence value as unsure', () => {
    // Never silently upgrade someone to "sure" — that would invent blind spots.
    const counts = tally([{ topic: 'x', confidence: 'maybe' as never, correct: false }]);
    expect(counts['known-gap']).toBe(1);
    expect(counts['blind-spot']).toBe(0);
  });
});

describe('calibration', () => {
  it('is 1 when confidence perfectly predicts accuracy', () => {
    expect(calibration(tally([
      ...many(5, 't', 'sure', true),
      ...many(5, 't', 'unsure', false),
    ]))).toBe(1);
  });

  it('is -1 when someone is confident exactly when they are wrong', () => {
    expect(calibration(tally([
      ...many(5, 't', 'sure', false),
      ...many(5, 't', 'unsure', true),
    ]))).toBe(-1);
  });

  it('is 0 when their confidence carries no information', () => {
    expect(calibration(tally([
      ...many(3, 't', 'sure', true),
      ...many(3, 't', 'sure', false),
      ...many(3, 't', 'unsure', true),
      ...many(3, 't', 'unsure', false),
    ]))).toBe(0);
  });

  it('says nothing rather than 0 when there is nothing to go on', () => {
    // Zero is a real, alarming reading. Absence of data is not that.
    expect(calibration(EMPTY_COUNTS)).toBeNull();
    expect(blindSpotRate(EMPTY_COUNTS)).toBeNull();
  });

  it('reports the confidently-wrong share', () => {
    expect(blindSpotRate(tally([
      ...many(3, 't', 'sure', false),
      ...many(7, 't', 'sure', true),
    ]))).toBe(0.3);
  });
});

describe('which topics to revise first', () => {
  it('ranks by confidently wrong, not by wrong', () => {
    /*
      THE WHOLE POINT. "Trigonometry" is missed more often, but the student
      already knows they find it hard — they are revising it. "Osmosis" is the
      one they are not revising, because they think they can do it.
    */
    const attempts = [
      ...many(6, 'Trigonometry', 'unsure', false),
      ...many(3, 'Osmosis', 'sure', false),
      ...many(1, 'Osmosis', 'sure', true),
    ];
    const ranked = riskiestTopics(attempts);
    expect(ranked[0].topic).toBe('Osmosis');
    expect(ranked.map((r) => r.topic)).not.toContain('Trigonometry');
  });

  it('will not brand a topic on a single unlucky answer', () => {
    const ranked = riskiestTopics([a('Enzymes', 'sure', false)], { minAttempts: 2 });
    expect(ranked).toEqual([]);
  });

  it('leaves out topics with no blind spots at all', () => {
    const ranked = riskiestTopics([
      ...many(4, 'Photosynthesis', 'unsure', false),
      ...many(4, 'Respiration', 'sure', true),
    ]);
    expect(ranked).toEqual([]);
  });

  it('orders worst first and honours the limit', () => {
    const ranked = riskiestTopics([
      ...many(2, 'A', 'sure', false),
      ...many(5, 'B', 'sure', false),
      ...many(3, 'C', 'sure', false),
    ], { limit: 2 });
    expect(ranked.map((r) => r.topic)).toEqual(['B', 'C']);
  });

  it('ignores attempts with no topic on them', () => {
    expect(riskiestTopics([
      { topic: '', confidence: 'sure', correct: false },
      { topic: '   ', confidence: 'sure', correct: false },
    ])).toEqual([]);
  });
});

describe('what it tells the student', () => {
  it('says nothing at all until there is enough to be sure of', () => {
    /*
      Returning null here matters as much as any sentence. A confident verdict
      drawn from four answers is how you teach someone to ignore a feature.
    */
    const few = tally(many(MIN_FOR_VERDICT - 1, 't', 'sure', false));
    expect(verdict(few)).toBeNull();
    expect(verdict(EMPTY_COUNTS)).toBeNull();
  });

  it('leads with the blind spot when there is a serious one', () => {
    const counts = tally([
      ...many(6, 't', 'sure', false),
      ...many(14, 't', 'sure', true),
    ]);
    expect(verdict(counts)).toMatch(/sure/i);
    expect(verdict(counts)).toMatch(/do not think you need to|ones to look at/i);
  });

  it('names fragile knowledge when a lot was right but unsure', () => {
    const counts = tally([
      ...many(8, 't', 'unsure', true),
      ...many(8, 't', 'sure', true),
    ]);
    expect(verdict(counts)).toMatch(/fragile|know more than you think/i);
  });

  it('tells a well-calibrated student so, because that is the hard part', () => {
    const counts = tally([
      ...many(15, 't', 'sure', true),
      ...many(3, 't', 'unsure', false),
    ]);
    expect(verdict(counts)).toMatch(/matches your accuracy/i);
  });

  it('never leaves a box unlabelled', () => {
    for (const box of ['solid', 'lucky', 'blind-spot', 'known-gap'] as const) {
      expect(BOX_LABELS[box]).toBeTruthy();
      expect(BOX_BLURBS[box]).toBeTruthy();
    }
  });
});
