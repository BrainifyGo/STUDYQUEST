/**
 * Installing StudyQuest.
 *
 * Two rules run through these tests, and both are browser rules we cannot argue
 * with:
 *
 * A SITE CAN ONLY INSTALL ITS OWN APP. `beforeinstallprompt` is same-origin, so
 * the marketing site cannot install the app — it links across with ?install=1
 * and the app takes over.
 *
 * iOS HAS NO INSTALL API. Safari never fires the event, so the iPhone path is
 * instructions, not a prompt. A button waiting for an event that cannot arrive
 * would leave every iPhone user staring at nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  detectPlatform, installSteps, isIosSafari, wantsInstall,
} from '../src/lib/install';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

describe('knowing where we are', () => {
  it('recognises each platform', () => {
    expect(detectPlatform(UA.iphone)).toBe('ios');
    expect(detectPlatform(UA.android)).toBe('android');
    expect(detectPlatform(UA.windows)).toBe('desktop');
    expect(detectPlatform(UA.mac)).toBe('desktop');
    expect(detectPlatform('')).toBe('unknown');
  });

  it('knows Safari is the only iOS browser that can install', () => {
    /*
      Chrome, Firefox and Edge on iOS are all Safari underneath but none of them
      expose Add to Home Screen. Telling a Chrome-on-iPhone user to tap Share
      sends them looking for a menu item that is not there.
    */
    expect(isIosSafari(UA.iphone)).toBe(true);
    expect(isIosSafari(UA.iphoneChrome)).toBe(false);
    expect(isIosSafari(UA.android)).toBe(false);
  });
});

describe('what we tell them', () => {
  it('offers one tap when the browser really gave us the prompt', () => {
    const s = installSteps('android', true);
    expect(s.automatic).toBe(true);
    expect(s.steps).toHaveLength(1);
  });

  it('never claims one tap on iOS, whatever else is true', () => {
    // Safari has no install API and never will. This is the whole iOS story.
    const s = installSteps('ios', false, true);
    expect(s.automatic).toBe(false);
    expect(s.steps.join(' ')).toMatch(/share/i);
    expect(s.steps.join(' ')).toMatch(/add to home screen/i);
  });

  it('sends an iOS non-Safari user to Safari, and says why', () => {
    const s = installSteps('ios', false, false);
    expect(s.blocked).toMatch(/cannot install/i);
    expect(s.steps.join(' ')).toMatch(/safari/i);
  });

  it('gives Android the Chrome menu route when no prompt arrived', () => {
    const s = installSteps('android', false);
    expect(s.automatic).toBe(false);
    expect(s.steps.join(' ')).toMatch(/add to home screen|install app/i);
  });

  it('has something useful for a computer too', () => {
    const s = installSteps('desktop', false);
    expect(s.steps.join(' ')).toMatch(/address bar|browser menu/i);
    expect(s.title).toMatch(/install/i);
  });

  it('always says something, whatever the platform', () => {
    for (const p of ['ios', 'android', 'desktop', 'unknown'] as const) {
      const s = installSteps(p, false);
      expect(s.title.length, p).toBeGreaterThan(8);
      expect(s.steps.length, p).toBeGreaterThan(0);
    }
  });
});

describe('the hand-off from the marketing site', () => {
  it('picks up the install request', () => {
    /*
      The marketing site cannot install anything itself — same-origin rule — so
      it links here with ?install=1 and this is how the app knows to open the
      install sheet immediately rather than making them hunt for it.
    */
    expect(wantsInstall('?install=1')).toBe(true);
    expect(wantsInstall('?utm_source=x&install=1')).toBe(true);
  });

  it('ignores anything else', () => {
    expect(wantsInstall('')).toBe(false);
    expect(wantsInstall('?install=0')).toBe(false);
    expect(wantsInstall('?installed=1')).toBe(false);
    expect(wantsInstall('nonsense')).toBe(false);
  });
});
