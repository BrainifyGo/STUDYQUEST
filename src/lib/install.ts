/**
 * Installing StudyQuest to a phone or desktop.
 *
 * THE RULE THAT SHAPES ALL OF THIS: a site can only install ITS OWN app.
 * `beforeinstallprompt` is same-origin, so the marketing site at (say)
 * studyquest.co.uk cannot install the app at app.studyquest.co.uk — browsers
 * refuse it deliberately, or any page could push an app onto you from a domain
 * you never visited. The marketing site therefore links here, and this decides
 * what to show.
 *
 * AND THE ONE THAT CATCHES PEOPLE OUT: iOS has no install API at all. Safari
 * never fires `beforeinstallprompt` and never will — on iPhone the user has to
 * go through the Share menu themselves. A button that waits for an event that
 * cannot arrive would leave every iPhone user staring at nothing, so the iOS
 * path is instructions rather than a prompt, and that is not a fallback for a
 * failure, it is the only route Apple provides.
 */

export type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

/** Where we are, as far as installing is concerned. */
export function detectPlatform(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): Platform {
  const s = String(ua ?? '');
  // iPadOS 13+ reports itself as a Mac, so a touch-capable "Mac" is an iPad.
  const iPadAsMac = /Macintosh/.test(s)
    && typeof navigator !== 'undefined'
    && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(s) || iPadAsMac) return 'ios';
  if (/Android/.test(s)) return 'android';
  if (/Windows|Macintosh|X11|Linux/.test(s)) return 'desktop';
  return 'unknown';
}

/** Is the app already installed and running from the home screen? */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    // Safari's own flag, which predates the standard and is still what iOS sets.
    return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** Safari on iOS is the only browser there that can add to the home screen. */
export function isIosSafari(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  if (detectPlatform(ua) !== 'ios') return false;
  // Chrome, Firefox and Edge on iOS cannot add to the home screen at all.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(String(ua ?? ''));
}

export interface Steps {
  title: string;
  steps: string[];
  /** True when the browser can do it for them with one tap. */
  automatic: boolean;
  /** Set when this browser cannot install at all, and why. */
  blocked?: string;
}

/**
 * What to tell this person.
 *
 * `canPrompt` is whether we actually caught `beforeinstallprompt` — not whether
 * we think the browser supports it. Guessing produces a button that does
 * nothing, which is worse than instructions that work.
 */
export function installSteps(platform: Platform, canPrompt: boolean, iosSafari = true): Steps {
  if (canPrompt) {
    return {
      title: 'Add StudyQuest to your device',
      steps: ['Tap Install and confirm. It gets its own icon and opens full screen.'],
      automatic: true,
    };
  }

  switch (platform) {
    case 'ios':
      if (!iosSafari) {
        return {
          title: 'Open this page in Safari first',
          steps: [
            'On iPhone and iPad, only Safari can add an app to the home screen.',
            'Tap the ••• menu and choose Open in Safari, then try again.',
          ],
          automatic: false,
          blocked: 'Chrome, Firefox and Edge on iOS cannot install apps.',
        };
      }
      return {
        title: 'Add StudyQuest to your home screen',
        steps: [
          'Tap the Share button at the bottom of Safari — the square with an arrow going up.',
          'Scroll down and tap "Add to Home Screen".',
          'Tap Add. StudyQuest appears with its own icon and opens full screen.',
        ],
        automatic: false,
      };

    case 'android':
      return {
        title: 'Add StudyQuest to your home screen',
        steps: [
          'Tap the ⋮ menu at the top right of Chrome.',
          'Tap "Add to Home screen" or "Install app".',
          'Confirm. StudyQuest appears with its own icon and opens full screen.',
        ],
        automatic: false,
      };

    default:
      return {
        title: 'Install StudyQuest on this computer',
        steps: [
          'Look for the install icon in the address bar — a screen with a downward arrow.',
          'If it is not there, open the browser menu and choose "Install StudyQuest".',
          'It opens in its own window, without browser tabs.',
        ],
        automatic: false,
      };
  }
}

/**
 * Did the visitor arrive asking to install?
 *
 * The marketing site links here with ?install=1 precisely because it cannot do
 * the installing itself.
 */
export function wantsInstall(search: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  try {
    return new URLSearchParams(search).get('install') === '1';
  } catch {
    return false;
  }
}
