/**
 * SEARCHING THE LIBRARY.
 *
 * Pulled out of the component so the matching can be tested, and because the
 * component conflated two different empty states: "you have no study kits" and
 * "your search matched none of your study kits" were the same screen, saying
 * "No study kits yet — generate your first one" to somebody with thirty of
 * them. The suggested action was wrong too: what they want is to clear the
 * search, not to generate another kit.
 */

export interface LibraryItem {
  id: string;
  subject?: string;
  content?: string;
  mode?: string;
}

/** What the library is currently showing, and why it might be empty. */
export type LibraryState = 'has-results' | 'no-kits' | 'no-matches';

/**
 * Filter the library.
 *
 * Fields are optional in practice — items saved by older versions of the app do
 * not all carry `content` — and `undefined.toLowerCase()` throws, which would
 * take the whole page down mid-keystroke. Hence the `?? ''` on every field
 * rather than only on the ones that look risky today.
 */
export function searchLibrary<T extends LibraryItem>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items.filter((item) => {
    const haystack = [
      item.subject ?? '',
      item.content ?? '',
      // The mode is worth matching: "quiz" is a thing people look for, and it
      // is never in the title.
      item.mode ?? '',
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/** Which of the three states the library is in. */
export function libraryState(totalItems: number, matchCount: number, query: string): LibraryState {
  if (matchCount > 0) return 'has-results';
  return totalItems === 0 || !query.trim() ? 'no-kits' : 'no-matches';
}
