/**
 * The service worker's rules — checked by reading the worker itself.
 *
 * WHY THIS FILE EXISTS
 * StudyQuest's server hosts the API and the page, and on Render's free tier it sleeps. Measured
 * 2026-09-14: the live site did not answer within twelve seconds; the next request, having
 * woken it, answered in 0.13s. Meanwhile the app has a manifest and an install prompt and had
 * NO service worker, so an installed StudyQuest whose server was asleep opened on a browser
 * error page.
 *
 * A service worker on a live app with paying users is the kind of thing that goes wrong
 * quietly and stays wrong — a cached index.html can strand everyone on an old build, and a
 * cached /api response can hand someone another person's answer. So the rules that must never
 * change are pinned here.
 *
 * Read as source rather than executed: running it needs a real ServiceWorkerGlobalScope, and
 * a fake one proves only that the fake behaves.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sw = readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');

describe('what the service worker must never do', () => {
  it('never caches the API', () => {
    // AI answers, token budgets and sign-in checks. A stale one is worse than a failure.
    expect(sw).toMatch(/pathname\.startsWith\('\/api\/'\)/);
    // and it must bail out rather than fall through to a caching branch
    const apiGuard = sw.indexOf('if (isApi(url)) return;');
    expect(apiGuard).toBeGreaterThan(-1);
    expect(sw.indexOf('request.mode === \'navigate\'')).toBeGreaterThan(apiGuard);
  });

  it('leaves other origins alone entirely', () => {
    // Firebase, fonts, the AI provider — not ours to cache.
    expect(sw).toMatch(/url\.origin !== self\.location\.origin[\s\S]{0,20}return/);
  });

  it('only ever handles GET', () => {
    expect(sw).toMatch(/request\.method !== 'GET'[\s\S]{0,20}return/);
  });
});

describe('what it must do', () => {
  it('asks the network FIRST for pages, so nobody is stranded on an old build', () => {
    // Cache-first on HTML is the classic way to trap users on a stale version forever.
    expect(sw).toContain('networkWithTimeout(request, NAVIGATION_TIMEOUT_MS)');
    const timeout = Number(/NAVIGATION_TIMEOUT_MS = (\d+)/.exec(sw)?.[1]);
    expect(timeout).toBeGreaterThan(1000); // don't rob a merely slow phone of the fresh page
    expect(timeout).toBeLessThan(10000); // but don't stare at nothing while the server wakes
  });

  it('falls back to the cached shell when the server is asleep', () => {
    expect(sw).toMatch(/catch[\s\S]{0,200}caches\.match\('\/index\.html'\)/);
  });

  it('pre-caches enough to render something', () => {
    for (const must of ['/index.html', '/manifest.webmanifest']) {
      expect(sw).toContain(must);
    }
  });

  it('survives one shell file being missing at install', () => {
    // addAll rejects the whole install if any single file 404s, which would leave every user
    // with no offline shell at all.
    expect(sw).not.toContain('cache.addAll');
    expect(sw).toMatch(/cache\.add\(url\)\.catch/);
  });

  it('deletes older caches when a new version activates', () => {
    expect(sw).toMatch(/keys\.filter\(\(k\) => k !== VERSION\)/);
  });
});

describe('registration', () => {
  const reg = readFileSync(path.join(process.cwd(), 'src', 'lib', 'offlineShell.ts'), 'utf8');

  it('does not register in dev', () => {
    expect(reg).toMatch(/if \(!import\.meta\.env\.PROD\) return;/);
  });

  it('cannot reload in a loop', () => {
    // A controllerchange handler that always reloads is how infinite refresh loops are born.
    expect(reg).toContain('if (reloadedForUpdate) return;');
  });
});
