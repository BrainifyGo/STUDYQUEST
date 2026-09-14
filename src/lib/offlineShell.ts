/**
 * Registering the service worker, so StudyQuest opens while the server is waking up.
 *
 * WHY THIS EXISTS
 * StudyQuest's server hosts the API *and* the page, and on Render's free tier it spins down
 * when idle. Measured 2026-09-14: the live site did not answer within twelve seconds, and the
 * request after it — having woken the thing — answered in 0.13s. So the first visitor after a
 * quiet spell waited up to a minute at a blank page.
 *
 * Worse for the people who took us up on installing it: there was a manifest and an install
 * prompt but no service worker at all, so an installed StudyQuest whose server was asleep
 * opened on a browser error page. Installed apps are held to a phone-app standard — opening
 * to an error looks broken, not slow.
 *
 * See public/sw.js for the caching rules (short version: never /api, network-first for pages).
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO:
 *  - It does not register in dev. A service worker caching a dev server is a famously
 *    confusing way to spend an afternoon.
 *  - It does not reload the page more than once. A "new version — reload" handler that fires
 *    on every controller change is the classic way to build an infinite refresh loop.
 */

/** Set once we have already reloaded for a new worker, so we never do it twice. */
let reloadedForUpdate = false;

export function registerOfflineShell(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  // Dev servers and previews stay uncached — see the note above.
  if (!import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Nothing here is load-bearing: without it the app simply behaves as it did before.
      console.warn('[offline] service worker did not register:', err);
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
}

/**
 * Is the app running from the cached shell rather than a live answer from the server?
 *
 * Exposed so a screen can say "waking up" honestly instead of showing empty data as though
 * that were the truth.
 */
export function isServedByWorker(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    !!navigator.serviceWorker.controller
  );
}
