/**
 * Keeping slurs out of usernames.
 *
 * Ola and Daniel found you could register the n-word. These pin the evasions,
 * because a word list on its own catches none of them.
 */
import { describe, expect, it } from 'vitest';
import {
  checkUsernameSafety, normaliseForSafety, safetyMessage,
} from '../src/lib/usernameSafety';

const blocked = (u: string) =>
  expect(checkUsernameSafety(u).ok, `"${u}" should be blocked`).toBe(false);
const allowed = (u: string) =>
  expect(checkUsernameSafety(u).ok, `"${u}" should be allowed`).toBe(true);

describe('the evasions', () => {

  it('blocks the slur however it is spelled', () => {
    // Every one of these is the same word to a reader, and a different string
    // to `includes()`. This is the whole reason normalisation exists.
    blocked('nigger');
    blocked('n1gger');
    blocked('n!gger');
    blocked('n.i.g.g.e.r');
    blocked('n_i_g_g_e_r');
    blocked('nigg3r');
    blocked('niiigger');
    blocked('NIGGER');
    blocked('nigga');
    blocked('n1gg4');
  });

  it('blocks other slurs and their obvious variants', () => {
    blocked('faggot');
    blocked('f4ggot');
    blocked('ch1nk');
    blocked('k1ke');
    blocked('paki');
    blocked('retard');
    blocked('r3t4rd');
  });

  it('blocks sexual and violent terms', () => {
    blocked('pedo');
    blocked('p3do');
    blocked('rapist');
    blocked('pornstar');
    blocked('kys');
  });

  it('sees through accents and lookalike alphabets', () => {
    // "ñïgger" and the Cyrillic-mixed version are different code points
    // entirely, and sail through anything that has not normalised.
    blocked('ñïgger');
    blocked('nigger');
  });
});

describe('not blocking innocent names', () => {

  it('allows ordinary usernames', () => {
    allowed('ola');
    allowed('daniel_1');
    allowed('sammyadeoye');
    allowed('student2026');
    allowed('mathswhiz');
    allowed('bio.geek');
  });

  it('does not fall for the Scunthorpe problem', () => {
    // Short terms match as whole words only. A filter that blocks "Cassandra"
    // for containing "ass" is one people work around rather than respect.
    allowed('cassandra');
    allowed('classic');
    allowed('assignment');
    allowed('sussex');
    allowed('essex');
    allowed('analysis');   // contains "anal"
    allowed('scunthorpe');
  });

  it('still blocks those short terms on their own', () => {
    blocked('ass');
    blocked('sex');
    blocked('shit');
  });
});

describe('reserved names', () => {

  it('keeps the ones that would let someone impersonate us', () => {
    expect(checkUsernameSafety('admin')).toEqual({ ok: false, reason: 'reserved' });
    expect(checkUsernameSafety('studyquest')).toEqual({ ok: false, reason: 'reserved' });
    expect(checkUsernameSafety('support')).toEqual({ ok: false, reason: 'reserved' });
    expect(checkUsernameSafety('m0derator')).toEqual({ ok: false, reason: 'reserved' });
  });
});

describe('normalisation', () => {

  it('folds substitutions, strips separators and collapses runs', () => {
    expect(normaliseForSafety('n1gg3r')).toBe(normaliseForSafety('nigger'));
    expect(normaliseForSafety('h.e.l.l.o')).toBe('helo');
    expect(normaliseForSafety('aaaabbbb')).toBe('ab');
    expect(normaliseForSafety('')).toBe('');
    // 1->i, 3->e, 4->a, 5->s. 2 maps to nothing, so it is stripped.
    expect(normaliseForSafety('12345')).toBe('ieas');
  });
});

describe('what we say back', () => {

  it('never repeats the word or names the rule', () => {
    // Anything more detailed is a hint sheet for someone determined to get
    // abuse past the filter.
    const msg = safetyMessage('offensive');
    expect(msg).not.toMatch(/nigg|slur|contains/i);
    expect(msg).toMatch(/not allowed/i);
    expect(safetyMessage('reserved')).toMatch(/reserved/i);
  });
});
