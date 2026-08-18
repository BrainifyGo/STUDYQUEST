/**
 * What each plan gets.
 *
 * The upgrade page advertised six Pro features and FIVE of them were available
 * to every free account, because the only gate in the app was GuestGuard, which
 * separates guests from signed-in users and has nothing to do with paying.
 * These pin the rules so that cannot drift back.
 */
import { describe, expect, it } from 'vitest';
import {
  can, planOf, canSaveKit, upsellFor, PRO_FEATURES, PRO_SELLING_POINTS,
  FREE_SAVED_KITS, type Feature,
} from '../src/lib/entitlements';

describe('plans', () => {

  it('treats anything falsy as free', () => {
    // `isPro` is missing on older accounts, and undefined must not read as Pro.
    expect(planOf(undefined)).toBe('free');
    expect(planOf(false)).toBe('free');
    expect(planOf(true)).toBe('pro');
  });
});

describe('what free is refused', () => {

  it('locks every advertised Pro feature', () => {
    for (const f of PRO_FEATURES) {
      expect(can('free', f), `free should NOT have ${f}`).toBe(false);
    }
  });

  it('gives Pro everything', () => {
    for (const f of PRO_FEATURES) {
      expect(can('pro', f), `pro should have ${f}`).toBe(true);
    }
  });

  it('locks the 3D arena but never the fight itself', () => {
    // The gate is on the SPECTACLE, not the mechanics. A free player gets the
    // same boss, phases, damage and questions — just drawn in 2D. Gating how a
    // fight looks is a fair upsell; gating whether you can win it is not, and
    // there is deliberately no feature flag that could do the latter.
    expect(can('free', '3d-arena')).toBe(false);
    expect(can('pro', '3d-arena')).toBe(true);
    expect(PRO_FEATURES).not.toContain('boss-battle' as any);
    expect(PRO_FEATURES).not.toContain('arcade' as any);
  });

  it('locks the four that were reported as unlocked', () => {
    // Named individually rather than only looped, so removing one from
    // PRO_FEATURES cannot quietly make this suite pass.
    expect(can('free', 'ai-tutor')).toBe(false);
    expect(can('free', 'study-rooms')).toBe(false);
    expect(can('free', 'advanced-analytics')).toBe(false);
    expect(can('free', 'unlimited-kits')).toBe(false);
  });
});

describe('the saved-kit allowance', () => {

  it('lets a free account save right up to the limit', () => {
    expect(canSaveKit('free', 0)).toBe(true);
    expect(canSaveKit('free', FREE_SAVED_KITS - 1)).toBe(true);
  });

  it('stops a free account at the limit', () => {
    expect(canSaveKit('free', FREE_SAVED_KITS)).toBe(false);
    expect(canSaveKit('free', FREE_SAVED_KITS + 50)).toBe(false);
  });

  it('never stops Pro', () => {
    expect(canSaveKit('pro', 0)).toBe(true);
    expect(canSaveKit('pro', 100000)).toBe(true);
  });

  it('leaves a free account genuinely usable', () => {
    // A free tier nobody can get anything out of never produces a Pro customer.
    expect(FREE_SAVED_KITS).toBeGreaterThanOrEqual(10);
  });
});

describe('what we tell people', () => {

  it('has an explanation for every gated feature', () => {
    for (const f of PRO_FEATURES) {
      const { title, body } = upsellFor(f);
      expect(title.length, `${f} has no title`).toBeGreaterThan(0);
      expect(body.length, `${f} has no body`).toBeGreaterThan(0);
    }
  });

  it('never claims anything is unlimited', () => {
    // Pro carries a 50,000-token daily cap. "Unlimited AI Study Kit Generation"
    // was on the page that takes card details, and it was not true.
    for (const point of PRO_SELLING_POINTS) {
      const text = `${point.headline} ${point.detail}`.toLowerCase();
      expect(text, `"${point.headline}" claims unlimited`).not.toMatch(/unlimited/);
    }
  });

  it('sells every feature it gates', () => {
    // A gate with no matching selling point is a feature people lose without
    // ever being told why.
    const blurb = PRO_SELLING_POINTS.map((p) => `${p.headline} ${p.detail}`).join(' ').toLowerCase();
    expect(blurb).toMatch(/tutor/);
    expect(blurb).toMatch(/room/);
    expect(blurb).toMatch(/progress|analytics/);
    expect(blurb).toMatch(/keep every study kit|study kit/);
  });
});
