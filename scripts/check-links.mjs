/**
 * Re-check every exam board link in src/lib/examBoards.ts.
 *
 *   npm run check:links
 *
 * Exam boards reorganise their sites constantly, so these WILL rot. A dead link
 * is worse than a missing one — the student concludes the material is gone
 * rather than that we pointed them somewhere wrong — and nothing in the app can
 * detect it, because a 404 page still renders fine in a new tab.
 *
 * So this is the thing that catches it, and it is committed rather than being a
 * check somebody ran once. Exits non-zero if any link is dead, so it can go in
 * CI later.
 */
import { RESOURCES, BOARDS, describeResource } from '../src/lib/examBoards.ts';

const UA = 'Mozilla/5.0 (compatible; StudyQuest link check)';
const TIMEOUT = 25_000;

async function check(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    // Some boards refuse HEAD; GET and throw the body away is slower and honest.
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA },
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: err.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

let dead = 0;
console.log(`Checking ${RESOURCES.length} exam board links…\n`);

for (const r of RESOURCES) {
  const { ok, status } = await check(r.url);
  if (!ok) dead++;
  console.log(
    `${ok ? '  ok  ' : ' DEAD '} ${String(status).padEnd(11)} ${describeResource(r).padEnd(46)} ${r.url}`,
  );
}

// The board home pages too — if one moves, every link under it is suspect.
console.log('');
for (const b of Object.values(BOARDS)) {
  const { ok, status } = await check(b.home);
  if (!ok) dead++;
  console.log(`${ok ? '  ok  ' : ' DEAD '} ${String(status).padEnd(11)} ${b.fullName} home`);
}

console.log(`\n${dead === 0 ? 'All links alive.' : `${dead} dead link(s).`}`);
process.exit(dead === 0 ? 0 : 1);
