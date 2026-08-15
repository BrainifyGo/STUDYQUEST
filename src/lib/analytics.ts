/**
 * Google Analytics — off unless VITE_GA_ID is set, and cookieless until consent is given.
 *
 * TWO DELIBERATE CHOICES HERE.
 *
 * 1. NO ID, NO SCRIPT. With `VITE_GA_ID` empty this loads nothing at all — no request to
 *    Google, no cookie, no performance cost. A hardcoded placeholder ID would silently send
 *    Brainify's traffic to a property nobody owns, so there isn't one.
 *
 * 2. CONSENT DEFAULTS TO DENIED. Most Brainify users are GCSE students in the UK, which means
 *    minors under UK GDPR and PECR: analytics cookies need consent BEFORE they are set, and
 *    the bar for children's data is higher, not lower. Google Consent Mode v2 is initialised
 *    with everything denied, so GA runs in cookieless mode and sends pings with no identifier
 *    until `grantAnalyticsConsent()` is called from a consent banner.
 *
 *    That banner does not exist yet. Until it does, turning GA on gives aggregate traffic
 *    counts without storing anything on a student's device — which is the legal position, not
 *    a limitation to work around.
 */

const GA_ID = (import.meta.env.VITE_GA_ID || '').trim();

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let started = false;

export function isAnalyticsEnabled(): boolean {
  return Boolean(GA_ID);
}

export function initAnalytics(): void {
  if (started || !GA_ID) return;
  // Never measure the developer's own page loads as if they were students.
  if (typeof window === 'undefined' || import.meta.env.DEV) return;
  started = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };

  // Consent must be set BEFORE the config call, or the first hit is sent under the default
  // (granted) state and a cookie is written — the exact thing this is meant to prevent.
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);

  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { anonymize_ip: true });
}

/** Call from a cookie banner once the user has actively agreed. */
export function grantAnalyticsConsent(): void {
  window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
}

/**
 * Record a view change. The app is a single page with no router, so GA would otherwise see
 * one page view per session and nothing about what people actually use.
 */
export function trackView(view: string, title: string): void {
  if (!started) return;
  window.gtag?.('event', 'page_view', {
    page_title: title,
    page_path: `/${view}`,
  });
}
