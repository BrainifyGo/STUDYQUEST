/**
 * Library search.
 *
 * The bug this exists for: a search that matched nothing showed "No study kits
 * yet — generate your first one", to somebody who might have thirty. Two
 * different empty states were sharing one screen.
 */
import { describe, expect, it } from 'vitest';
import { searchLibrary, libraryState } from '../src/lib/librarySearch';

const items = [
  { id: '1', subject: 'Photosynthesis', content: 'Chloroplast and chlorophyll', mode: 'summary' },
  { id: '2', subject: 'Quadratic equations', content: 'Completing the square', mode: 'quiz' },
  { id: '3', subject: 'Macbeth', content: 'Act 1 Scene 5 analysis', mode: 'flashcards' },
];

describe('matching', () => {

  it('matches the title', () => {
    expect(searchLibrary(items, 'macbeth').map(i => i.id)).toEqual(['3']);
  });

  it('matches inside the content, not just the title', () => {
    expect(searchLibrary(items, 'chlorophyll').map(i => i.id)).toEqual(['1']);
  });

  it('matches the mode, which is never in the title', () => {
    expect(searchLibrary(items, 'quiz').map(i => i.id)).toEqual(['2']);
  });

  it('ignores case and surrounding spaces', () => {
    expect(searchLibrary(items, '  MACBETH  ').map(i => i.id)).toEqual(['3']);
  });

  it('returns everything for an empty query', () => {
    expect(searchLibrary(items, '')).toHaveLength(3);
    expect(searchLibrary(items, '   ')).toHaveLength(3);
  });

  it('survives items with missing fields', () => {
    // Items saved by older versions do not all carry `content`, and
    // undefined.toLowerCase() would take the page down mid-keystroke.
    const ragged = [{ id: 'x' }, { id: 'y', subject: 'Biology' }] as any[];
    expect(() => searchLibrary(ragged, 'bio')).not.toThrow();
    expect(searchLibrary(ragged, 'bio').map(i => i.id)).toEqual(['y']);
  });
});

describe('telling the two empty states apart', () => {

  it('says "no kits" when there are genuinely none', () => {
    expect(libraryState(0, 0, '')).toBe('no-kits');
  });

  it('says "no matches" when a search found nothing', () => {
    // THE BUG. Thirty kits and a search for "zzz" is not an empty library, and
    // "generate your first one" is not the action you want offered.
    expect(libraryState(30, 0, 'zzz')).toBe('no-matches');
  });

  it('does not blame the search when there is nothing to search', () => {
    expect(libraryState(0, 0, 'zzz')).toBe('no-kits');
  });

  it('treats a whitespace-only query as no query at all', () => {
    expect(libraryState(30, 0, '   ')).toBe('no-kits');
  });

  it('reports results when there are some', () => {
    expect(libraryState(30, 4, 'bio')).toBe('has-results');
  });
});
