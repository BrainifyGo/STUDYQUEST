/**
 * Challenges — the pure parts.
 *
 * Deciding a winner is the whole point of the feature, so the tie-breaking is
 * pinned here rather than trusted.
 */
import { describe, expect, it } from 'vitest';
import { winnerOf, friendshipFor, CHALLENGE_QUESTIONS, type Score } from '../src/lib/challenges';
import { pairId } from '../src/lib/friends';

const score = (uid: string, s: number, acc: number): Score => ({
  uid, score: s, accuracy: acc, correct: s, answered: 10, at: '2026-08-17T00:00:00.000Z',
});

describe('deciding a winner', () => {

  it('gives it to the higher score', () => {
    expect(winnerOf([score('a', 8, 80), score('b', 6, 90)])).toBe('a');
    expect(winnerOf([score('b', 6, 90), score('a', 8, 80)])).toBe('a');
  });

  it('breaks a tied score on accuracy', () => {
    // Same number right, fewer wrong along the way, so accuracy is the fair
    // tiebreak rather than whoever's score document landed first.
    expect(winnerOf([score('a', 7, 70), score('b', 7, 95)])).toBe('b');
  });

  it('returns null for a genuine draw rather than picking someone', () => {
    expect(winnerOf([score('a', 7, 80), score('b', 7, 80)])).toBeNull();
  });

  it('has no winner until both have played', () => {
    // A challenge with one score is not won; showing the only player as the
    // winner would be wrong every time until the other person finishes.
    expect(winnerOf([score('a', 9, 90)])).toBeNull();
    expect(winnerOf([])).toBeNull();
  });
});

describe('the friendship a challenge sits under', () => {

  it('is the same id lib/friends builds', () => {
    // The rules check exactly this document, so a mismatch here would mean
    // every challenge is refused.
    const uids = ['abc', 'xyz'];
    expect(friendshipFor({ uids })).toBe(pairId('abc', 'xyz'));
    expect(friendshipFor({ uids })).toBe('abc__xyz');
  });
});

describe('the deck', () => {

  it('is long enough to be a race and short enough to finish', () => {
    expect(CHALLENGE_QUESTIONS).toBeGreaterThanOrEqual(5);
    expect(CHALLENGE_QUESTIONS).toBeLessThanOrEqual(20);
  });
});
