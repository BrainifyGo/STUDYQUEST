/**
 * FOCUS TONES — the Focus tab, generated rather than embedded.
 *
 * WHY.
 *
 * "Deep Focus" and "Alpha Waves" were YouTube embeds, and YouTube embeds have
 * now failed for three separate reasons in this project: a video was deleted,
 * autoplay was refused, and school networks block youtube.com outright. Every
 * one of those looks identical to a student — a black rectangle — and none of
 * them is something we can fix by picking a different video, because the next
 * video can die too.
 *
 * Focus audio is the one category that does not need YouTube. Binaural beats,
 * isochronic pulses and noise beds are *defined* by their frequencies; there is
 * nothing to license and nothing to stream. Generated, they cannot 404, cannot
 * be blocked, cost no data, and work on a locked-down school laptop — which is
 * where a lot of this gets used.
 *
 * A NOTE ON THE CLAIMS. Binaural beats are commonly sold as "alpha waves make
 * you focus". The evidence for that is weak and contested. Nothing in the UI
 * built on this claims a cognitive effect; the tracks are described by what they
 * sound like. Making up neuroscience to sell a study app to fourteen-year-olds
 * is not something we are going to do.
 */

export type FocusToneId = 'deep-focus' | 'alpha-waves' | 'flow-state' | 'deep-work';

export interface FocusTone {
  id: FocusToneId;
  title: string;
  /** Honest one-line description of the SOUND, not of a claimed effect. */
  blurb: string;
  /** Base carrier pitch in Hz. */
  carrier: number;
  /**
   * Difference between the two ears, in Hz. The perceived pulse rate.
   * Named after the EEG bands only because that is what people search for.
   */
  beat: number;
  /** How much noise bed sits under the tones, 0..1. */
  bed: number;
  /** Colour of that bed. */
  bedColour: 'pink' | 'brown';
}

export const FOCUS_TONES: FocusTone[] = [
  {
    id: 'deep-focus', title: 'Deep Focus',
    blurb: 'A low steady tone with a slow 4 Hz pulse, over soft brown noise.',
    carrier: 110, beat: 4, bed: 0.35, bedColour: 'brown',
  },
  {
    id: 'alpha-waves', title: 'Alpha Waves',
    blurb: 'A brighter tone pulsing at 10 Hz, over a light noise bed.',
    carrier: 180, beat: 10, bed: 0.22, bedColour: 'pink',
  },
  {
    id: 'flow-state', title: 'Flow State',
    blurb: 'A warm mid tone at 7 Hz, with the bed rolling gently underneath.',
    carrier: 144, beat: 7, bed: 0.3, bedColour: 'pink',
  },
  {
    id: 'deep-work', title: 'Deep Work',
    blurb: 'Almost no tone — mostly a low, even rumble for blocking out a room.',
    carrier: 90, beat: 2, bed: 0.62, bedColour: 'brown',
  },
];

export function toneById(id: string): FocusTone | undefined {
  return FOCUS_TONES.find((t) => t.id === id);
}

/**
 * The two ear frequencies for a tone.
 *
 * Split either side of the carrier rather than left = carrier, right = carrier +
 * beat, so the perceived pitch is the carrier itself rather than sitting sharp
 * of it — otherwise every track sounds slightly out of tune with the next.
 */
export function earFrequencies(tone: FocusTone): { left: number; right: number } {
  return { left: tone.carrier - tone.beat / 2, right: tone.carrier + tone.beat / 2 };
}

/** Volume slider (0..1) to gain. Squared, because loudness is not linear. */
export function toneGain(volume: number): number {
  const v = Math.min(1, Math.max(0, Number(volume) || 0));
  // Capped well below 1: these are pure tones, and a pure tone at the same
  // nominal gain as noise is markedly louder and far more fatiguing.
  return v * v * 0.32;
}

/* ---------------------------------------------------------------- playback */

let ctx: AudioContext | null = null;
let current: { id: FocusToneId; stop: () => void; gain: GainNode } | null = null;

// Same reason as in ambience.ts: the engine outlives the panel, so anything
// drawing a "now playing" bar has to be told when this changes.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onFocusChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function announce(): void {
  for (const fn of listeners) fn();
}

function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) throw new Error('This browser has no Web Audio support');
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noiseBuffer(ac: AudioContext, colour: 'pink' | 'brown'): AudioBuffer {
  const buf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
  const data = buf.getChannelData(0);
  if (colour === 'brown') {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

/** Start a focus tone, replacing whatever was playing. Ramped, never clicks. */
export function playFocusTone(id: FocusToneId, volume: number): void {
  const tone = toneById(id);
  if (!tone) throw new Error(`Unknown focus tone: ${id}`);

  stopFocusTone();
  const ac = audioContext();

  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, ac.currentTime);
  out.connect(ac.destination);

  const { left, right } = earFrequencies(tone);
  const merger = ac.createChannelMerger(2);
  merger.connect(out);

  const stops: { stop: (t?: number) => void }[] = [];

  // One oscillator per ear. The beat is the difference between them, so it is
  // never generated as a signal in its own right — that is the whole idea.
  [left, right].forEach((hz, channel) => {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const g = ac.createGain();
    g.gain.value = 0.5;
    osc.connect(g);
    g.connect(merger, 0, channel);
    osc.start();
    stops.push(osc);
  });

  if (tone.bed > 0) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, tone.bedColour);
    src.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = tone.bedColour === 'brown' ? 500 : 1600;
    const bg = ac.createGain();
    bg.gain.value = tone.bed;
    src.connect(lp).connect(bg).connect(out);
    src.start();
    stops.push(src);
  }

  out.gain.setTargetAtTime(toneGain(volume), ac.currentTime, 0.4);

  announceLater();
  current = {
    id,
    gain: out,
    stop: () => {
      for (const s of stops) { try { s.stop(); } catch { /* already stopped */ } }
      try { out.disconnect(); } catch { /* already gone */ }
    },
  };
}

export function setFocusVolume(volume: number): void {
  if (!current || !ctx) return;
  current.gain.gain.setTargetAtTime(toneGain(volume), ctx.currentTime, 0.1);
}

export function stopFocusTone(): void {
  if (!current || !ctx) return;
  const dying = current;
  current = null;
  announce();
  dying.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
  setTimeout(() => dying.stop(), 800);
}

export function playingFocusTone(): FocusToneId | null {
  return current?.id ?? null;
}

// `current` is assigned after the graph is built, so listeners are told on the
// next tick — otherwise they read the old value and the bar lags by one track.
function announceLater(): void {
  setTimeout(announce, 0);
}
