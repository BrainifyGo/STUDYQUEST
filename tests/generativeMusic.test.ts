/**
 * The generative music theory.
 *
 * The audio graph needs a browser, but the note maths does not — and the note
 * maths is what decides whether this sounds like music or like a fault. These
 * pin the parts that would be silently wrong rather than obviously broken.
 */
import { describe, expect, it } from 'vitest';
import {
  PIECES, pieceById, midiToHz, noteAt, musicGain,
} from '../src/lib/generativeMusic';

describe('the pieces', () => {

  it('all have a distinct id and a title', () => {
    const ids = PIECES.map((p) => p.id);
    expect(new Set(ids).size).toBe(PIECES.length);
    for (const p of PIECES) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.blurb.length).toBeGreaterThan(0);
    }
  });

  it('can be looked up, and an unknown id returns nothing rather than throwing', () => {
    expect(pieceById('still')?.title).toBe('Still');
    expect(pieceById('nope')).toBeUndefined();
  });

  it('never contains a leading tone', () => {
    // A semitone below the root creates tension that wants resolving, which is
    // exactly what pulls attention off the page. Every scale here avoids it.
    for (const p of PIECES) {
      expect(p.scale, `${p.id} has a leading tone`).not.toContain(11 - 0);
      expect(p.scale.includes(1), `${p.id} has a flat second`).toBe(false);
    }
  });

  it('only builds chords from degrees the scale can supply', () => {
    for (const p of PIECES) {
      for (const chord of p.chords) {
        for (const degree of chord) {
          expect(Number.isFinite(noteAt(p, degree)), `${p.id} degree ${degree}`).toBe(true);
        }
      }
    }
  });
});

describe('note maths', () => {

  it('puts A440 where it belongs', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);   // an octave up doubles
    expect(midiToHz(57)).toBeCloseTo(220, 6);   // an octave down halves
  });

  it('wraps a degree past the end of the scale into the next octave', () => {
    const p = PIECES[0];                        // 5-note scale
    // Degree 5 is degree 0 an octave up. Without the wrap the chord shapes
    // would index off the end of the array and produce NaN — silence, or a
    // console full of errors, depending on the browser.
    expect(noteAt(p, p.scale.length)).toBe(noteAt(p, 0) + 12);
  });

  it('handles a negative degree instead of producing NaN', () => {
    // JS % keeps the sign of the dividend, so -1 % 5 is -1, which indexes off
    // the FRONT of the array. This is the bug that guard exists for.
    const p = PIECES[0];
    expect(Number.isFinite(noteAt(p, -1))).toBe(true);
    expect(noteAt(p, -1)).toBe(noteAt(p, p.scale.length - 1) - 12);
  });

  it('rises as the degree rises', () => {
    const p = PIECES[0];
    for (let d = 0; d < 12; d++) {
      expect(noteAt(p, d + 1)).toBeGreaterThan(noteAt(p, d));
    }
  });
});

describe('volume', () => {

  it('is silent at zero and capped at one', () => {
    expect(musicGain(0)).toBe(0);
    expect(musicGain(1)).toBeCloseTo(0.42, 6);
    expect(musicGain(5)).toBeCloseTo(0.42, 6);
  });

  it('is squared, because loudness is not linear in amplitude', () => {
    // A slider halfway through should not be half as loud; mapped straight
    // through it sounds far louder than half.
    expect(musicGain(0.5)).toBeCloseTo(0.25 * 0.42, 6);
  });

  it('survives rubbish input rather than passing NaN into the audio graph', () => {
    // A NaN gain silences a Web Audio node permanently and logs nothing.
    expect(musicGain(NaN)).toBe(0);
    expect(musicGain(-3)).toBe(0);
    expect(musicGain(undefined as any)).toBe(0);
  });
});
