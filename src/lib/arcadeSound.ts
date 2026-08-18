/**
 * ARCADE SOUND — generated, like everything else that makes noise here.
 *
 * No files, for the same reasons the music is generated: nothing to 404, nothing
 * for a school network to block, no download, no licence. See
 * src/lib/generativeMusic.ts for the longer version of that argument.
 *
 * Game sound has one requirement the music does not: it must be *immediate*.
 * A hit that arrives 100ms late feels like a different event, so every sound
 * here is scheduled against the AudioContext clock at `currentTime`, never via
 * setTimeout.
 *
 * Everything is short, quiet and mixed well below the music. These play dozens
 * of times a round; anything with a long tail becomes a drone, and anything
 * loud becomes the reason someone turns the volume off.
 */

export type Sfx =
  | 'hit'        // you answered correctly — the boss takes damage
  | 'miss'       // you got it wrong
  | 'combo'      // three or more in a row, rising with the streak
  | 'enrage'     // the boss crosses into a new phase
  | 'victory'
  | 'defeat'
  | 'tick';      // the clock, under ten seconds

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

/** Muting is remembered, because a student who turned it off meant it. */
const STORAGE_KEY = 'studyquest_sfx';

export function sfxEnabled(): boolean {
  return enabled;
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  if (master && ctx) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02);
}

export function loadSfxPreference(): boolean {
  try { enabled = localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { /* ignore */ }
  return enabled;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    // Well under the music. These fire constantly and are punctuation, not
    // the soundtrack.
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** A tone with an envelope. The building block for nearly all of these. */
function tone(
  ac: AudioContext, opts: {
    type?: OscillatorType; from: number; to?: number;
    at?: number; length: number; level?: number;
    /** Optional low-pass, which is what separates "thud" from "ping". */
    cutoff?: number;
  }
): void {
  const t = ac.currentTime + (opts.at ?? 0);
  const osc = ac.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.from, t);
  if (opts.to && opts.to !== opts.from) {
    // Exponential, because pitch is perceived logarithmically — a linear sweep
    // sounds like it slows down at the top.
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t + opts.length);
  }

  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(opts.level ?? 0.3, t + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t + opts.length);

  let node: AudioNode = osc;
  if (opts.cutoff) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = opts.cutoff;
    osc.connect(lp);
    node = lp;
  }
  node.connect(env);
  env.connect(master!);

  osc.start(t);
  osc.stop(t + opts.length + 0.02);
}

/** A burst of noise — impacts, which a pure tone cannot do. */
function noise(ac: AudioContext, length: number, cutoff: number, level = 0.3, at = 0): void {
  const t = ac.currentTime + at;
  const buf = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * length)), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    // Decaying noise rather than flat: an impact is loudest at the moment it
    // lands, and flat noise sounds like a fault.
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;

  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;

  const env = ac.createGain();
  env.gain.setValueAtTime(level, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + length);

  src.connect(lp).connect(env).connect(master!);
  src.start(t);
}

/**
 * Play one.
 *
 * `combo` takes the streak so the pitch climbs with it — the sound itself tells
 * you the run is building, which a number on screen does more slowly.
 */
export function playSfx(sfx: Sfx, combo = 0): void {
  const ac = audio();
  if (!ac) return;

  switch (sfx) {
    case 'hit':
      // Impact plus a short rising tone: the thud lands, the tone confirms.
      noise(ac, 0.09, 2200, 0.35);
      tone(ac, { type: 'triangle', from: 320, to: 620, length: 0.13, level: 0.22 });
      break;

    case 'miss':
      // Falling, muffled, minor. Wrong should sound wrong without being harsh —
      // it plays after a mistake, and a buzzer is a reason to stop playing.
      tone(ac, { type: 'sine', from: 260, to: 120, length: 0.28, level: 0.24, cutoff: 900 });
      break;

    case 'combo': {
      // A major arpeggio that starts higher the longer the streak, capped so a
      // twenty-run does not end up inaudible.
      const step = Math.min(12, Math.max(0, combo - 2));
      const root = 440 * Math.pow(2, step / 12);
      [0, 4, 7].forEach((semi, i) => {
        tone(ac, {
          type: 'triangle', from: root * Math.pow(2, semi / 12),
          length: 0.14, level: 0.16, at: i * 0.045,
        });
      });
      break;
    }

    case 'enrage':
      // Low, dirty and rising — the one sound allowed to be unpleasant.
      tone(ac, { type: 'sawtooth', from: 90, to: 260, length: 0.55, level: 0.3, cutoff: 700 });
      noise(ac, 0.4, 500, 0.3);
      break;

    case 'victory':
      [0, 4, 7, 12].forEach((semi, i) => {
        tone(ac, { type: 'triangle', from: 523.25 * Math.pow(2, semi / 12),
                   length: 0.4, level: 0.22, at: i * 0.11 });
      });
      break;

    case 'defeat':
      [0, -3, -7].forEach((semi, i) => {
        tone(ac, { type: 'sine', from: 392 * Math.pow(2, semi / 12),
                   length: 0.5, level: 0.22, at: i * 0.16, cutoff: 1200 });
      });
      break;

    case 'tick':
      tone(ac, { type: 'square', from: 1200, length: 0.04, level: 0.1, cutoff: 3000 });
      break;
  }
}
