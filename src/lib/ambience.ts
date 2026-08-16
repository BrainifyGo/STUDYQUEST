/**
 * AMBIENCE — rain, waves, forest and white noise, generated in the browser.
 *
 * WHY THIS EXISTS, rather than four MP3 files.
 *
 * The four ambient sounds were hotlinked from mixkit's *sound-effect preview*
 * endpoint. Measured, those files are 7 KB to 42 KB — between roughly half a
 * second and two and a half seconds of audio. They are one-shot effects, not
 * loops. Set to `loop: true`, a 0.4-second forest clip restarts twice a second
 * forever, and the discontinuity at each seam is an audible click. That is
 * exactly the report: "they all sound like clicks".
 *
 * Longer files would fix the clicking and keep three other problems: they are
 * someone else's URLs (the Classical music track had already gone dead), they
 * are a download on a phone data plan, and they are blocked outright on the
 * school networks a lot of our users are on.
 *
 * Noise-based ambience is cheap to synthesise, so it is synthesised. It never
 * loops because there is no loop point, it never 404s, it costs no bandwidth,
 * and it cannot be blocked.
 *
 * The DSP is deliberately plain: a noise source, a filter, and a slow
 * modulation. The character comes from the filter and the movement, which is
 * most of what these sounds are.
 */

export type AmbienceId = 'rain' | 'waves' | 'forest' | 'white-noise';

/** Seconds of noise generated per source. Long enough that its own period is inaudible. */
const NOISE_SECONDS = 4;

/**
 * How loud each layer sits at "full" volume.
 *
 * Not all 1.0: white noise at the same gain as rain is painfully brighter,
 * because its energy is spread evenly rather than rolled off. These are trims,
 * measured by ear against each other.
 */
export const LAYER_TRIM: Record<AmbienceId, number> = {
  rain: 0.55,
  waves: 0.75,
  forest: 0.5,
  'white-noise': 0.28,
};

/** A user-facing 0..1 slider mapped to gain. */
export function trimmedGain(id: AmbienceId, volume: number): number {
  const v = Math.min(1, Math.max(0, Number(volume) || 0));
  // Squared, because loudness is not linear in amplitude — a slider at half way
  // sounds far more than half as loud if you map it straight through.
  return v * v * (LAYER_TRIM[id] ?? 0.5);
}

/**
 * Fill a buffer with noise of a given colour.
 *
 * `white` is flat. `pink` rolls off 3 dB per octave and is what most natural
 * ambience actually is — rain and wind included. `brown` rolls off harder and
 * gives the low rumble under a wave.
 */
function fillNoise(data: Float32Array, colour: 'white' | 'pink' | 'brown'): void {
  if (colour === 'white') {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return;
  }

  if (colour === 'brown') {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
    return;
  }

  // Pink — the Paul Kellet filter bank, the standard cheap approximation.
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

/** One playing layer, and how to stop it. */
interface Layer {
  gain: GainNode;
  stop: () => void;
}

/**
 * A single shared AudioContext.
 *
 * Browsers cap the number of contexts, and each one costs an audio thread. It is
 * created on the first play, not at import — a context created without a user
 * gesture starts suspended and never recovers on iOS.
 */
let ctx: AudioContext | null = null;

function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) throw new Error('This browser has no Web Audio support');
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noiseSource(ac: AudioContext, colour: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
  const buf = ac.createBuffer(1, ac.sampleRate * NOISE_SECONDS, ac.sampleRate);
  fillNoise(buf.getChannelData(0), colour);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

/** A slow sine that moves a parameter — what stops a noise bed sounding dead. */
function slowLFO(ac: AudioContext, hz: number, depth: number, target: AudioParam, centre: number) {
  const osc = ac.createOscillator();
  osc.frequency.value = hz;
  const amp = ac.createGain();
  amp.gain.value = depth;
  target.value = centre;
  osc.connect(amp).connect(target);
  osc.start();
  return osc;
}

function buildLayer(ac: AudioContext, id: AmbienceId, out: GainNode): Layer {
  const gain = ac.createGain();
  gain.connect(out);
  const stops: { stop: (t?: number) => void }[] = [];

  switch (id) {
    case 'rain': {
      // Bright, busy, no low end — rain is the hiss of a great many small
      // impacts, so it lives above about 1 kHz.
      const src = noiseSource(ac, 'pink');
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      src.connect(hp).connect(lp).connect(gain);
      src.start();
      stops.push(src);
      // Drifts between heavier and lighter rain over about half a minute.
      stops.push(slowLFO(ac, 0.03, 1800, lp.frequency, 6000));
      break;
    }

    case 'waves': {
      // A low bed with a swell on it. The swell is the whole sound: without the
      // LFO this is just rumble.
      const src = noiseSource(ac, 'brown');
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const swell = ac.createGain();
      swell.gain.value = 0.5;
      src.connect(lp).connect(swell).connect(gain);
      src.start();
      stops.push(src);
      // ~0.09 Hz is a wave every eleven seconds, which is about right for a beach.
      stops.push(slowLFO(ac, 0.09, 0.42, swell.gain, 0.5));
      stops.push(slowLFO(ac, 0.05, 260, lp.frequency, 700));
      break;
    }

    case 'forest': {
      // A quiet wind bed, plus occasional birds. The bed alone is indistinguishable
      // from rain with the treble off, so the birds are what make it a forest.
      const src = noiseSource(ac, 'pink');
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      const bed = ac.createGain();
      bed.gain.value = 0.35;
      src.connect(lp).connect(bed).connect(gain);
      src.start();
      stops.push(src);
      stops.push(slowLFO(ac, 0.06, 700, lp.frequency, 2000));

      // A chirp is two or three quick sine sweeps. Timing is random so it never
      // settles into a pattern, which is what would make it annoying.
      let timer: ReturnType<typeof setTimeout> | null = null;
      const chirp = () => {
        const now = ac.currentTime;
        const notes = 2 + Math.floor(Math.random() * 3);
        for (let n = 0; n < notes; n++) {
          const t = now + n * 0.11;
          const osc = ac.createOscillator();
          const env = ac.createGain();
          osc.type = 'sine';
          const base = 1800 + Math.random() * 1600;
          osc.frequency.setValueAtTime(base, t);
          osc.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.07);
          env.gain.setValueAtTime(0.0001, t);
          env.gain.exponentialRampToValueAtTime(0.08, t + 0.012);
          env.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
          osc.connect(env).connect(gain);
          osc.start(t);
          osc.stop(t + 0.12);
        }
        timer = setTimeout(chirp, 3500 + Math.random() * 9000);
      };
      timer = setTimeout(chirp, 1500 + Math.random() * 4000);
      stops.push({ stop: () => { if (timer) clearTimeout(timer); } });
      break;
    }

    case 'white-noise':
    default: {
      const src = noiseSource(ac, 'white');
      src.connect(gain);
      src.start();
      stops.push(src);
      break;
    }
  }

  return {
    gain,
    stop: () => {
      for (const s of stops) { try { s.stop(); } catch { /* already stopped */ } }
      try { gain.disconnect(); } catch { /* already gone */ }
    },
  };
}

/** Everything currently playing. */
const playing = new Map<AmbienceId, Layer>();

/** Start a layer, or adjust it if it is already running. Fades in, never clicks. */
export function startAmbience(id: AmbienceId, volume: number): void {
  const ac = audioContext();
  const target = trimmedGain(id, volume);

  const existing = playing.get(id);
  if (existing) {
    existing.gain.gain.setTargetAtTime(target, ac.currentTime, 0.08);
    return;
  }

  const master = ac.createGain();
  master.gain.value = 1;
  master.connect(ac.destination);

  const layer = buildLayer(ac, id, master);
  // A gain that jumps from 0 to full IS a click. Every start and stop ramps.
  layer.gain.gain.setValueAtTime(0.0001, ac.currentTime);
  layer.gain.gain.setTargetAtTime(target, ac.currentTime, 0.25);
  playing.set(id, layer);
}

export function setAmbienceVolume(id: AmbienceId, volume: number): void {
  const layer = playing.get(id);
  if (!layer || !ctx) return;
  layer.gain.gain.setTargetAtTime(trimmedGain(id, volume), ctx.currentTime, 0.08);
}

export function stopAmbience(id: AmbienceId): void {
  const layer = playing.get(id);
  if (!layer || !ctx) return;
  playing.delete(id);
  layer.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
  // Torn down after the fade, so the last thing heard is silence rather than a cut.
  setTimeout(() => layer.stop(), 600);
}

export function stopAllAmbience(): void {
  for (const id of Array.from(playing.keys())) stopAmbience(id as AmbienceId);
}

export function isAmbiencePlaying(id: AmbienceId): boolean {
  return playing.has(id);
}
