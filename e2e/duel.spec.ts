import { test, expect, type Browser, type Page } from '@playwright/test';
import { adminAvailable, cleanup, mintTokens } from './fixtures/testUsers';

/**
 * TWO REAL BROWSERS, ONE LIVE DUEL.
 *
 * The bot duel was already covered by unit tests, and the server's refereeing by
 * `duelMatch.test.ts`. What neither can prove is that the two halves speak the
 * same protocol over a real socket — which is exactly where a feature like this
 * breaks.
 *
 * The harness picks its answers by a PREFIX in the option text, never by asking
 * which is correct, because the server deliberately never says until the round
 * closes. If that ever changed, this test would keep passing while the game
 * became cheatable — so `duelMatch.test.ts` guards the secrecy and this guards
 * the flow.
 */
test.describe.configure({ mode: 'serial' });

async function player(browser: Browser, room: string, name: string, token: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${name}] ${e.message}`));
  const qs = new URLSearchParams({ room, name, token });
  await page.goto(`/e2e/fixtures/duel-harness.html?${qs}`);
  await expect.poll(async () => {
    const s = await page.evaluate(() => window.__duel);
    if (s.joinDenied) throw new Error(`${name}: join denied — ${s.joinDenied}`);
    if (s.error) throw new Error(`${name}: ${s.error}`);
    return s.phase;
  }, { timeout: 30_000 }).toBe('in-room');
  return { ctx, page, name };
}

const snap = (p: Page) => p.evaluate(() => window.__duel.snap);

test.describe('live duel', () => {
  let tokens: string[] = [];
  test.skip(!adminAvailable(), 'needs Firebase admin credentials in .env');
  test.beforeAll(async () => { tokens = await mintTokens(); });
  test.afterAll(async () => { await cleanup(); });

  test('two players duel to a finish and agree on the result', async ({ browser }) => {
    const room = `e2e-duel-${Date.now()}`;
    const a = await player(browser, room, 'Alice', tokens[0]);
    const b = await player(browser, room, 'Bob', tokens[1]);

    try {
      await a.page.evaluate(() => window.__duelApi.create());

      // Bob sees the offer and takes it.
      await expect.poll(async () =>
        (await b.page.evaluate(() => window.__duel.offers)).length,
        { message: 'bob never saw the duel offer', timeout: 15_000 },
      ).toBeGreaterThan(0);

      const offer = (await b.page.evaluate(() => window.__duel.offers))[0];
      await b.page.evaluate((id) => window.__duelApi.accept(id), offer.duelId);

      // Alice wins every round by answering correctly while Bob answers wrong.
      for (let round = 1; round <= 7; round++) {
        const asking = async (p: Page) => {
          await expect.poll(async () => {
            const s = await snap(p);
            return s?.phase === 'asking' ? s.round : 0;
          }, { message: `round ${round} never started`, timeout: 25_000 }).toBe(round);
        };
        await asking(a.page);
        await asking(b.page);

        await a.page.evaluate(() => window.__duelApi.answer('right'));
        await b.page.evaluate(() => window.__duelApi.answer('wrong'));

        // Both sides must leave the round; whoever is knocked out ends it early.
        await expect.poll(async () => {
          const s = await snap(a.page);
          return s?.phase;
        }, { message: `round ${round} never resolved`, timeout: 25_000 })
          .toMatch(/revealing|over/);

        if ((await snap(a.page))?.phase === 'over') break;
      }

      await expect.poll(async () => (await snap(a.page))?.phase,
        { message: 'the duel never ended', timeout: 30_000 }).toBe('over');
      await expect.poll(async () => (await snap(b.page))?.phase,
        { message: 'bob never saw the duel end', timeout: 30_000 }).toBe('over');

      const aState = (await snap(a.page))!.state!;
      const bState = (await snap(b.page))!.state!;

      // Alice was right every time, so she must have won.
      expect(aState.winner).toBe('you');
      // And Bob, computing the same rounds from his own side, must agree.
      expect(bState.winner).toBe('foe');

      /*
        THE ASSERTION THAT MATTERS. Both browsers run the same deterministic
        scoring over the same server-refereed inputs, so their views of the
        health must match exactly — Alice's health is Bob's opponent's health.
        If they ever disagree, one of them is showing a lie.
      */
      expect(aState.you.hp).toBe(bState.foe.hp);
      expect(aState.foe.hp).toBe(bState.you.hp);
      expect(aState.foe.hp).toBeLessThan(100);
    } finally {
      await a.ctx.close(); await b.ctx.close();
    }
  });

  test('walking out ends the duel for the other player', async ({ browser }) => {
    const room = `e2e-duel-quit-${Date.now()}`;
    const a = await player(browser, room, 'Alice', tokens[0]);
    const b = await player(browser, room, 'Bob', tokens[1]);

    try {
      await a.page.evaluate(() => window.__duelApi.create());
      await expect.poll(async () =>
        (await b.page.evaluate(() => window.__duel.offers)).length,
        { timeout: 15_000 }).toBeGreaterThan(0);
      const offer = (await b.page.evaluate(() => window.__duel.offers))[0];
      await b.page.evaluate((id) => window.__duelApi.accept(id), offer.duelId);

      await expect.poll(async () => (await snap(a.page))?.phase,
        { timeout: 25_000 }).toBe('asking');

      // Bob closes the tab mid-duel — the commonest way to quit anything.
      await b.ctx.close();

      await expect.poll(async () => (await snap(a.page))?.phase, {
        message: 'alice was left watching a clock that never moves',
        timeout: 25_000,
      }).toBe('over');
      expect((await snap(a.page))?.forfeitedBy).toBeTruthy();
    } finally {
      await a.ctx.close();
      await b.ctx.close().catch(() => {});
    }
  });
});
