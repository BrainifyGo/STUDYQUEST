import { useEffect } from 'react';
import { trackView } from '../lib/analytics';

/**
 * Keep <title> in step with whatever the user is actually looking at.
 *
 * StudyQuest is a single state-driven page — there is no router, so every view shared the one
 * title baked into index.html. That costs three real things: the browser tab is unreadable
 * once a few are open, history and bookmarks all read "StudyQuest", and any analytics that
 * groups by page title sees one undifferentiated blob.
 *
 * The title is restored on unmount so a view cannot leave its title behind after it closes.
 */

const SUFFIX = 'StudyQuest';

export const VIEW_TITLES: Record<string, string> = {
  dashboard:   'Dashboard',
  library:     'My Library',
  mistakes:    'My Mistakes',
  paper:       'Past Papers',
  insights:    'What Examiners Say',
  arcade:      'Arcade',
  friends:     'Friends',
  report:      'Report an Issue',
  analytics:   'Progress & Analytics',
  planner:     'Study Planner',
  leaderboard: 'Leaderboard',
  focus:       'Focus Timer',
  collab:      'Study Together',
  settings:    'Settings',
  upgrade:     'Go Pro',
  privacy:     'Privacy Policy',
  terms:       'Terms of Service',
  contact:     'Contact',
};

/** The full document title for a view id, falling back to the marketing title for home. */
export function titleForView(view: string | undefined): string {
  if (!view || view === 'home') {
    return `${SUFFIX} | GCSE Study Kits, Flashcards & Past Papers`;
  }
  const name = VIEW_TITLES[view];
  return name ? `${name} | ${SUFFIX}` : SUFFIX;
}

export function useDocumentTitle(view: string | undefined): void {
  useEffect(() => {
    const previous = document.title;
    const title = titleForView(view);
    document.title = title;
    // The same signal serves both purposes: without a router, analytics would otherwise see
    // one page view per session and learn nothing about which views people actually use.
    trackView(view || 'home', title);
    return () => { document.title = previous; };
  }, [view]);
}

export default useDocumentTitle;
