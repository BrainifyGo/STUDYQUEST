/**
 * GENERATIVE MUSIC — actual music, made in the browser, with no files.
 *
 * WHY WE STOPPED USING YOUTUBE.
 *
 * The music tab has been reported broken four times across three rounds of
 * fixes, for four different reasons: a video was deleted, a 24/7 livestream had
 * no embeddable recording, a phone refused to autoplay, and school networks
 * block youtube.com outright. Every one looks identical to a student — a black
 * rectangle — and none is fixable by choosing a different video, because the
 * next video can die the same way.
 *
 * Worse, I could not verify a replacement. oEmbed, the innertube player API and
 * scraping the embed page each reported all six videos fine or all six broken,
 * including ones known to work. Shipping an id I cannot test is how the previous
 * three replacements were chosen, and it is why we are here again.
 *
 * So the music is generated. It cannot 404, cannot be blocked, needs no network
 * after the page loads, costs nothing to serve, and has no licence attached.
 *
 * WHAT IT ACTUALLY IS.
 *
 * Not lofi hip hop — nobody would enjoy a synthesised attempt at that. This is
 * generative ambient in the Music for Airports tradition: a slow chord pad, and
 * notes from that chord arriving at intervals that never quite repeat. That
 * style suits revision (it has no hook to follow, which is the point) and it is
 * the style that computers genuinely do well.
 *
 * The music never loops, because it is never recorded — each note is scheduled a
 * few seconds before it sounds, forever.
 */

export type PieceId = 'still' | 'drift' | 'dusk' | 'glass';

export interface Piece {
  id: PieceId;
  title: string;
  blurb: string;
  /** Semitone offsets from the root, defining the mode's colour. */
  scale: number[];
  /** Root note, in MIDI numbers. 60 is middle C. */
  root: number;
  /** Chords as scale-degree triads; the pad moves slowly between them. */
  chords: number[][];
  /** Average seconds between melody notes. */
  noteGap: number;
  /** Seconds a chord is held. */
  chordHold: number;
  /** Brightness of the pad, in Hz. */
  tone: number;
}

/**
 * Four pieces. Each is a mode and a tempo, not a recording.
 *
 * All four avoid the leading tone (a semitone below the root), because that
 * interval creates tension that wants resolving — which is exactly the thing
 * that pulls your attention off the page.
 */
export const PIECES: Piece[] = [
  {
    id: 'still', title: 'Still',
    blurb: 'Slow major chords, long gaps. The quietest of the four.',
    root: 60, scale: [0, 2, 4, 7, 9],            // major pentatonic
    chords: [[0, 2, 4], [3, 5, 0], [4, 6, 1], [0, 2, 4]],
    noteGap: 5.5, chordHold: 16, tone: 900,
  },
  {
    id: 'drift', title: 'Drift',
    blurb: 'Minor and open. Notes wander further apart.',
    root: 57, scale: [0, 2, 3, 5, 7, 10],        // minor, no sixth
    chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]],
    noteGap: 6.5, chordHold: 20, tone: 700,
  },
  {
    id: 'dusk', title: 'Dusk',
    blurb: 'Warm and low, with the pad well forward.',
    root: 53, scale: [0, 2, 3, 5, 7, 9],         // dorian
    chords: [[0, 2, 4], [2, 4, 6], [5, 0, 2], [0, 2, 4]],
    noteGap: 7.5, chordHold: 24, tone: 520,
  },
  {
    id: 'glass', title: 'Glass',
    blurb: 'Bright and sparse. Single high notes over a thin pad.',
    // Was [0, 2, 4, 7, 9, 11]. The 11 is a leading tone — a semitone below the
    // root — which is exactly the interval the note above says every piece
    // avoids, and a test caught the contradiction. Its brightness comes from the
    // high root and the open filter, not from a sharpened degree.
    root: 65, scale: [0, 2, 4, 7, 9],
    chords: [[0, 2, 4], [4, 6, 1], [0, 2, 4], [3, 5, 0]],
    noteGap: 4.5, chordHold: 14, tone: 1400,
  },
];

export function pieceById(id: string): Piece | undefined {
  return PIECES.find((p) => p.id === id);
}

/** MIDI note number to Hz. 69 is A440, and everything else follows from it. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * The MIDI note for a scale degree, wrapping into higher octaves.
 *
 * Degree 7 in a 5-note scale is degree 2 an octave up — this is what lets the
 * chord shapes above be written as plain numbers without worrying about range.
 */
export function noteAt(piece: Piece, degree: number): number {
  const n = piece.scale.length;
  const octave = Math.floor(degree / n);
  // JS % keeps the sign of the dividend, so a negative degree needs the extra
  // wrap or it indexes off the front of the array and yields NaN.
  const step = ((degree % n) + n) % n;
  return piece.root + piece.scale[step] + octave * 12;
}

/** Volume slider (0..1) to gain, squared because loudness is not linear. */
export function musicGain(volume: number): number {
  const v = Math.min(1, Math.max(0, Number(volume) || 0));
  return v * v * 0.42;
}

/* ---------------------------------------------------------------- engine */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let playing: PieceId | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

export function onMusicChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function announce(): void {
  for (const fn of listeners) fn();
}

export function playingPiece(): PieceId | null {
  return playing;
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

/**
 * A reverb tail, generated as decaying noise.
 *
 * Reverb is what makes this sound like music in a room rather than a test tone.
 * An impulse response is normally a recorded file; this is the standard synthetic
 * substitute — noise on an exponential decay — which is indistinguishable at
 * this length and costs no download.
 */
function buildReverb(ac: AudioContext, seconds = 3.2): ConvolverNode {
  const length = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, length, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
    }
  }
  const node = ac.createConvolver();
  node.buffer = buf;
  return node;
}

/**
 * One note: a soft sine with a long, gentle envelope.
 *
 * The attack is deliberately slow (0.4s). A fast attack is a piano; a slow one is
 * a pad, and a pad is what you can work through without noticing each note.
 */
function scheduleNote(ac: AudioContext, hz: number, at: number, length: number, level: number, out: GainNode): void {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = hz;

  // A quiet fifth above thickens the note without turning it into a chord.
  const shimmer = ac.createOscillator();
  shimmer.type = 'sine';
  shimmer.frequency.value = hz * 1.5;
  const shimmerGain = ac.createGain();
  shimmerGain.gain.value = 0.12;

  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + 0.4);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);

  osc.connect(env);
  shimmer.connect(shimmerGain).connect(env);
  env.connect(out);

  osc.start(at); osc.stop(at + length + 0.1);
  shimmer.start(at); shimmer.stop(at + length + 0.1);
}

/**
 * Start a piece.
 *
 * Notes are scheduled a few seconds ahead on a repeating timer rather than one
 * per `setTimeout`. Web Audio's clock is sample-accurate and the JS timer is not,
 * so scheduling ahead is what keeps the rhythm even when the tab is busy — a
 * note fired from a delayed `setTimeout` lands late and audibly.
 */
export function playPiece(id: PieceId, volume: number): void {
  const piece = pieceById(id);
  if (!piece) throw new Error(`Unknown piece: ${id}`);

  stopMusic();
  const ac = audioContext();

  master = ac.createGain();
  master.gain.setValueAtTime(0.0001, ac.currentTime);
  master.gain.setTargetAtTime(musicGain(volume), ac.currentTime, 0.8);
  master.connect(ac.destination);

  reverb = buildReverb(ac);
  const wet = ac.createGain();
  wet.gain.value = 0.5;
  reverb.connect(wet).connect(master);

  // Notes go to both the dry output and the reverb, so the tail sits behind them.
  const voices = ac.createGain();
  voices.gain.value = 0.6;
  voices.connect(master);
  voices.connect(reverb);

  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = piece.tone;

  let nextChordAt = ac.currentTime + 0.2;
  let nextNoteAt = ac.currentTime + 1.5;
  let chordIndex = 0;
  const horizon = 4;                 // seconds of music scheduled in advance

  const schedule = () => {
    if (!ctx || playing !== id) return;
    const until = ctx.currentTime + horizon;

    while (nextChordAt < until) {
      const chord = piece.chords[chordIndex % piece.chords.length];
      chordIndex++;
      for (const degree of chord) {
        // The pad sits an octave below the melody so the two do not compete.
        scheduleNote(ctx, midiToHz(noteAt(piece, degree) - 12), nextChordAt,
                     piece.chordHold * 1.1, 0.055, voices);
      }
      nextChordAt += piece.chordHold;
    }

    while (nextNoteAt < until) {
      // Melody notes are drawn from the chord that is sounding, so nothing ever
      // clashes — random notes from the scale would eventually hit a second
      // against the pad, which is the one thing that would make this grating.
      const chord = piece.chords[Math.max(0, chordIndex - 1) % piece.chords.length];
      const degree = chord[Math.floor(Math.random() * chord.length)]
                   + (Math.random() < 0.4 ? 7 : 0);          // sometimes an octave up
      scheduleNote(ctx, midiToHz(noteAt(piece, degree)), nextNoteAt,
                   3.5 + Math.random() * 3, 0.10, voices);
      // Gaps vary by up to half the average, so it never settles into a pulse.
      nextNoteAt += piece.noteGap * (0.6 + Math.random() * 0.9);
    }
  };

  playing = id;
  schedule();
  timer = setInterval(schedule, (horizon * 1000) / 2);
  announce();
}

export function setMusicVolume(volume: number): void {
  if (!master || !ctx) return;
  master.gain.setTargetAtTime(musicGain(volume), ctx.currentTime, 0.15);
}

export function stopMusic(): void {
  if (timer) { clearInterval(timer); timer = null; }
  playing = null;

  if (master && ctx) {
    const dying = master;
    // Faded rather than cut: notes already scheduled would otherwise stop
    // mid-envelope, which is a click.
    dying.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    setTimeout(() => { try { dying.disconnect(); } catch { /* gone */ } }, 2000);
  }
  master = null;
  reverb = null;
  announce();
}
