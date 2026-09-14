/* StudyQuest service worker — so the app opens even while the server is waking up.
 *
 * WHY THIS EXISTS
 * ---------------
 * StudyQuest is a Node app (server.ts serves the API *and* the page), and it is hosted on
 * Render's free tier, which spins the service down after it goes idle. Measured 2026-09-14:
 * a request to the live site did not answer within twelve seconds, and the very next one —
 * after that request had woken it — answered in 0.13s. So the first person to open StudyQuest
 * after a quiet spell waits up to a minute.
 *
 * Until now they waited looking at NOTHING. There was a web manifest and an install prompt,
 * so people are actively invited to install StudyQuest on their phone — and an installed app
 * whose server is asleep opened on a browser error page. It looked broken, not slow.
 *
 * With this, the shell is on the device: the app opens instantly from cache, and the wait
 * moves to the data instead of the whole page.
 *
 * THE RULES, in the order that matters:
 *
 *  1. NEVER cache /api. Those are AI calls, token budgets and sign-in checks; a stale answer
 *     from cache would be worse than an honest failure.
 *  2. Navigations are network-FIRST with a short timeout, cache second. Cache-first on HTML is
 *     the classic way to trap users on an old build forever; this way a healthy server always
 *     wins and the cache is only there for the cold start.
 *  3. Hashed build assets are cache-first. Their names change on every build, so a cached one
 *     can never be stale.
 *  4. One cache, versioned. Everything older is deleted on activate.
 */

const VERSION = 'studyquest-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-brain-transparent.png',
];

// How long to wait for the real server on a page load before falling back to the cached shell.
// Long enough not to rob a merely slow phone connection of the fresh page; short enough that a
// sleeping server does not mean staring at nothing.
const NAVIGATION_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // Individually, not addAll: addAll rejects the whole install if any ONE file 404s, and
      // a service worker that fails to install leaves every user with no offline shell at all.
      .then((cache) =>
        Promise.all(
          SHELL.map((url) => cache.add(url).catch(() => undefined))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.startsWith('/api/') || url.pathname === '/api';
}

function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/');
}

/** The real server, but only for so long. */
function networkWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('slow')), ms);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Someone else's domain (Firebase, fonts, the AI provider) — leave it entirely alone.
  if (url.origin !== self.location.origin) return;
  if (isApi(url)) return; // rule 1

  // Rule 2 — the cold-start fix.
  if (request.mode === 'navigate') {
    event.respondWith(
      networkWithTimeout(request, NAVIGATION_TIMEOUT_MS)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match('/index.html')) || (await caches.match('/'));
          if (cached) return cached;
          // Nothing cached yet (first ever visit, server asleep). Wait it out rather than
          // inventing an error page — the honest answer is that it is still loading.
          return fetch(request);
        })
    );
    return;
  }

  // Rule 3 — hashed assets can never go stale.
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else on our own origin: try the network, fall back to whatever we have.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
