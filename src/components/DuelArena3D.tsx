import React, { useEffect, useRef } from 'react';

/**
 * THE DUEL ARENA — 3D. Pro only.
 *
 * Two fighters on lit podiums, facing each other, reacting to every round.
 *
 * RAW WEBGL, NOT THREE.JS — the same call as `BossArena3D`, for the same reason:
 * three.js is around 600 KB against a 2.2 MB bundle, and even lazy-loaded that
 * is a real download on a phone for one screen. This is a few kilobytes and has
 * no dependency to keep updated.
 *
 * WHY THE FIGHTERS ARE BOXES. Six boxes each — head, torso, two arms, two legs.
 * A jointed figure can lunge, flinch and fall over; a single solid can only
 * scale and spin, which is exactly why the boss arena's icosahedron could never
 * read as a person. The blocky look is also the look RED asked for.
 *
 * ONE MESH, MANY DRAWS. Every box in the scene is the same 36 vertices with a
 * different model matrix. That keeps the buffer tiny and means adding a third
 * fighter later is a loop bound, not new geometry.
 *
 * WHAT IS DELIBERATELY NOT IN HERE. Names, health numbers and the question stay
 * in HTML on top of the canvas. Text drawn into WebGL is invisible to a screen
 * reader and blurry when the browser zooms, and this screen is mostly text.
 *
 * IF WEBGL IS UNAVAILABLE it reports upward and the caller falls back to the 2D
 * arena, so a Pro player on an old phone gets the duel rather than a black box.
 */

export type DuelSide = 'you' | 'foe';

export interface DuelArenaEvent {
  /** Bumped by the parent for every round; drives the animation. */
  id: number;
  /** Who landed the hit, or null for a dead round. */
  winner: DuelSide | null;
  /** True when both fighters were right and it was decided on speed. */
  traded: boolean;
}

interface DuelArena3DProps {
  youHpPct: number;
  foeHpPct: number;
  event: DuelArenaEvent;
  /** Set once the duel is over, so the loser can stay down. */
  loser: DuelSide | null;
  onUnsupported: () => void;
}

/* ── Shaders ─────────────────────────────────────────────────────────────── */

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uProj, uView, uModel;
varying vec3 vNormal, vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  // No non-uniform scaling on rotated parts, so the model matrix is a fine
  // normal matrix and we can skip the inverse-transpose entirely.
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProj * uView * world;
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColour;
uniform float uFlash;
varying vec3 vNormal, vWorld;
void main() {
  vec3 n = normalize(vNormal);
  // Two lamps, one warm from the left and one cool from the right, so each
  // fighter is lit by its own corner of the arena and they read as separate.
  float warm = max(dot(n, normalize(vec3(-0.6, 0.8, 0.5))), 0.0);
  float cool = max(dot(n, normalize(vec3(0.7, 0.6, 0.4))), 0.0);

  vec3 viewDir = normalize(vec3(0.0, 1.1, 7.0) - vWorld);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);

  vec3 col = uColour * (0.22 + 0.5 * warm + 0.42 * cool);
  col += uColour * rim * 1.25;
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;

const FLOOR_VERT = `
attribute vec2 aXZ;
uniform mat4 uProj, uView;
varying vec2 vXZ;
void main() {
  vXZ = aXZ;
  gl_Position = uProj * uView * vec4(aXZ.x, 0.0, aXZ.y, 1.0);
}`;

const FLOOR_FRAG = `
precision mediump float;
uniform float uTime;
varying vec2 vXZ;
void main() {
  vec2 g = abs(fract(vXZ * 0.5 + vec2(0.0, uTime * 0.03)) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.05, min(g.x, g.y));
  float fade = 1.0 - clamp(length(vXZ) / 16.0, 0.0, 1.0);
  // Cool blue-violet, so the coloured podium lights read against it.
  gl_FragColor = vec4(vec3(0.29, 0.35, 0.85) * line * fade, line * fade * 0.7);
}`;

/* ── Geometry ────────────────────────────────────────────────────────────── */

/** A unit cube centred on the origin: 36 vertices, flat normals. */
function unitBox(): { positions: Float32Array; normals: Float32Array } {
  const faces: Array<[number[], number[], number[], number[], number[]]> = [
    // corners a,b,c,d wound CCW, then the outward normal
    [[-1,-1, 1],[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1],[ 0, 0, 1]],
    [[ 1,-1,-1],[-1,-1,-1],[-1, 1,-1],[ 1, 1,-1],[ 0, 0,-1]],
    [[ 1,-1, 1],[ 1,-1,-1],[ 1, 1,-1],[ 1, 1, 1],[ 1, 0, 0]],
    [[-1,-1,-1],[-1,-1, 1],[-1, 1, 1],[-1, 1,-1],[-1, 0, 0]],
    [[-1, 1, 1],[ 1, 1, 1],[ 1, 1,-1],[-1, 1,-1],[ 0, 1, 0]],
    [[-1,-1,-1],[ 1,-1,-1],[ 1,-1, 1],[-1,-1, 1],[ 0,-1, 0]],
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  for (const [a, b, c, d, n] of faces) {
    for (const v of [a, b, c, a, c, d]) {
      positions.push(v[0] * 0.5, v[1] * 0.5, v[2] * 0.5);
      normals.push(n[0], n[1], n[2]);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
}

/* ── Matrix maths (the part three.js would hide) ─────────────────────────── */

function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

/** Column-major TRS, rotating about Z then X. Enough for a lunge and a fall. */
function trs(
  tx: number, ty: number, tz: number,
  sx: number, sy: number, sz: number,
  rz = 0, rx = 0,
): Float32Array {
  const cz = Math.cos(rz), sz2 = Math.sin(rz);
  const cx = Math.cos(rx), sx2 = Math.sin(rx);
  // R = Rx * Rz, then scale columns.
  const m00 = cz,          m01 = -sz2,          m02 = 0;
  const m10 = cx * sz2,    m11 = cx * cz,       m12 = -sx2;
  const m20 = sx2 * sz2,   m21 = sx2 * cz,      m22 = cx;
  return new Float32Array([
    m00 * sx, m10 * sx, m20 * sx, 0,
    m01 * sy, m11 * sy, m21 * sy, 0,
    m02 * sz, m12 * sz, m22 * sz, 0,
    tx, ty, tz, 1,
  ]);
}

/**
 * A real look-at, rather than the pitch-and-translate approximation this had
 * first. That version framed the fighters against the bottom of the canvas with
 * dead space above them — visible the moment the arena was actually rendered,
 * and invisible from reading the code, because "roughly a pitch about X" is
 * true right up until you care where the subject sits in frame.
 *
 * Aiming at a point instead of the origin also means the framing is a number
 * anyone can change: raise `target` and the camera looks higher.
 */
function lookAt(
  eye: [number, number, number],
  target: [number, number, number],
): Float32Array {
  const f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  f[0] /= fl; f[1] /= fl; f[2] /= fl;

  // right = normalize(cross(forward, worldUp)) with worldUp = +Y, which works
  // out to (-f.z, 0, f.x). Getting this sign backwards flips the up vector too,
  // and the scene renders upside down with left and right swapped — which is
  // exactly what it did before this comment existed.
  const r = [-f[2], 0, f[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  r[0] /= rl; r[1] /= rl; r[2] /= rl;

  // up = cross(right, forward)
  const u = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];

  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return new Float32Array([
    r[0], u[0], -f[0], 0,
    r[1], u[1], -f[1], 0,
    r[2], u[2], -f[2], 0,
    -dot(r, eye), -dot(u, eye), dot(f, eye), 1,
  ]);
}

/*
  The arena panel is short and wide (h-52 on a phone), so the vertical field of
  view is what decides whether a fighter fits. These numbers frame both figures
  head to podium with a little air, and they are here rather than inline so the
  framing is one place to adjust.
*/
const CAMERA_EYE: [number, number, number] = [0, 1.75, 5.6];
const CAMERA_TARGET: [number, number, number] = [0, 0.95, 0];

function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const make = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[duel3d] shader failed:', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  };
  const v = make(gl.VERTEX_SHADER, vs);
  const f = make(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

/* ── The figure ──────────────────────────────────────────────────────────── */

/**
 * One box of a fighter: offset from the fighter's feet, size, and tint.
 * `swing` marks the limbs that animate, so the pose code does not have to know
 * which index is an arm.
 */
interface Part {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  shade: number;          // multiplier on the fighter's colour
  swing: 'none' | 'arm' | 'leg';
}

const FIGURE: Part[] = [
  { x: 0,     y: 1.52, z: 0, w: 0.52, h: 0.46, d: 0.5,  shade: 1.15, swing: 'none' }, // head
  { x: 0,     y: 1.02, z: 0, w: 0.66, h: 0.62, d: 0.38, shade: 1.0,  swing: 'none' }, // torso
  { x: -0.46, y: 1.06, z: 0, w: 0.22, h: 0.56, d: 0.24, shade: 0.85, swing: 'arm'  },
  { x: 0.46,  y: 1.06, z: 0, w: 0.22, h: 0.56, d: 0.24, shade: 0.85, swing: 'arm'  },
  { x: -0.17, y: 0.44, z: 0, w: 0.24, h: 0.64, d: 0.26, shade: 0.7,  swing: 'leg'  },
  { x: 0.17,  y: 0.44, z: 0, w: 0.24, h: 0.64, d: 0.26, shade: 0.7,  swing: 'leg'  },
];

const YOU_COLOUR: [number, number, number] = [0.24, 0.70, 0.98];   // cyan-blue
const FOE_COLOUR: [number, number, number] = [0.72, 0.35, 0.98];   // violet

export const DuelArena3D: React.FC<DuelArena3DProps> = ({
  youHpPct, foeHpPct, event, loser, onUnsupported,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /*
    Live values the render loop reads without being rebuilt.

    A loop recreated on every prop change drops frames and loses its own timing,
    and animating from state rather than an explicit event id means any stray
    re-render replays the last hit. The boss arena learned both of these.
  */
  const live = useRef({
    youHpPct, foeHpPct, loser,
    eventId: event.id,
    winner: event.winner,
    traded: event.traded,
    struckAt: -10,
  });

  useEffect(() => {
    const prev = live.current.eventId;
    live.current.youHpPct = youHpPct;
    live.current.foeHpPct = foeHpPct;
    live.current.loser = loser;
    live.current.winner = event.winner;
    live.current.traded = event.traded;
    if (event.id !== prev) {
      live.current.eventId = event.id;
      live.current.struckAt = performance.now() / 1000;
    }
  }, [youHpPct, foeHpPct, loser, event.id, event.winner, event.traded]);

  /*
    THE CALLBACK LIVES IN A REF, AND THE GL EFFECT DEPENDS ON NOTHING.

    This was a real bug, found by rendering the arena and watching it fall back
    to 2D on a machine where WebGL demonstrably worked. The effect used to list
    `onUnsupported` as a dependency, and the parent passes it as an inline arrow
    — a fresh function identity on every render. The duel re-renders ten times a
    second because of the round clock, so the effect tore the context down and
    built a new one 10x/sec. Browsers cap how many WebGL contexts may exist;
    past the cap, creation quietly starts failing, shaders refuse to compile,
    and the arena reports itself unsupported. On a phone that would have looked
    like "3D does not work on my device".

    A render loop must be built once. Anything the loop needs to read comes
    through a ref, never through a dependency.
  */
  const unsupportedRef = useRef(onUnsupported);
  useEffect(() => { unsupportedRef.current = onUnsupported; }, [onUnsupported]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext('webgl', { antialias: true, alpha: true })
      || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) { unsupportedRef.current(); return; }

    const prog = compile(gl, VERT, FRAG);
    const floorProg = compile(gl, FLOOR_VERT, FLOOR_FRAG);
    if (!prog || !floorProg) { unsupportedRef.current(); return; }

    const box = unitBox();
    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, box.positions, gl.STATIC_DRAW);
    const normBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, box.normals, gl.STATIC_DRAW);

    const floorBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, floorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -16, -16, 16, -16, 16, 16, -16, -16, 16, 16, -16, 16,
    ]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'aPos');
    const aNormal = gl.getAttribLocation(prog, 'aNormal');
    const uProj = gl.getUniformLocation(prog, 'uProj');
    const uView = gl.getUniformLocation(prog, 'uView');
    const uModel = gl.getUniformLocation(prog, 'uModel');
    const uColour = gl.getUniformLocation(prog, 'uColour');
    const uFlash = gl.getUniformLocation(prog, 'uFlash');

    const aXZ = gl.getAttribLocation(floorProg, 'aXZ');
    const fProj = gl.getUniformLocation(floorProg, 'uProj');
    const fView = gl.getUniformLocation(floorProg, 'uView');
    const fTime = gl.getUniformLocation(floorProg, 'uTime');

    const reduceMotion = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let running = true;
    const t0 = performance.now() / 1000;

    const draw = (
      model: Float32Array, colour: [number, number, number], shade: number, flash: number,
    ) => {
      gl.uniformMatrix4fv(uModel, false, model);
      gl.uniform3f(uColour, colour[0] * shade, colour[1] * shade, colour[2] * shade);
      gl.uniform1f(uFlash, flash);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
    };

    const render = () => {
      if (!running) return;
      const now = performance.now() / 1000;
      const t = now - t0;
      const s = live.current;

      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);

      const proj = perspective(Math.PI / 4.4, w / h, 0.1, 60);
      const view = lookAt(CAMERA_EYE, CAMERA_TARGET);

      // Floor first, blended, no depth write — it is a backdrop.
      gl.useProgram(floorProg);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(fProj, false, proj);
      gl.uniformMatrix4fv(fView, false, view);
      gl.uniform1f(fTime, reduceMotion ? 0 : t);
      gl.bindBuffer(gl.ARRAY_BUFFER, floorBuf);
      gl.enableVertexAttribArray(aXZ);
      gl.vertexAttribPointer(aXZ, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);

      // Fighters and podiums.
      gl.useProgram(prog);
      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
      gl.enableVertexAttribArray(aNormal);
      gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

      // 0 -> 1 over 0.6s from the moment a round resolved.
      const since = now - s.struckAt;
      const beat = since >= 0 && since < 0.6 ? 1 - since / 0.6 : 0;
      const punch = reduceMotion ? 0 : beat;

      for (const side of ['you', 'foe'] as DuelSide[]) {
        const isYou = side === 'you';
        const baseX = isYou ? -1.55 : 1.55;
        const colour = isYou ? YOU_COLOUR : FOE_COLOUR;
        const hp = isYou ? s.youHpPct : s.foeHpPct;

        const attacking = s.winner === side && beat > 0;
        const hurt = s.winner && s.winner !== side && beat > 0;
        const down = s.loser === side;

        // Podium. Low, wide, and lit in the fighter's colour.
        draw(trs(baseX, 0.16, 0, 1.85, 0.32, 1.85), colour, 0.4 + 0.25 * (hp / 100), 0);

        // Lunge towards the middle on a hit; recoil away when hit.
        const lunge = attacking ? punch * 0.42 : 0;
        const recoil = hurt ? punch * 0.3 : 0;
        const dir = isYou ? 1 : -1;
        const offsetX = baseX + dir * lunge - dir * recoil;

        // Idle bob, faster when healthy — a fighter on 8 HP should look spent.
        const vigour = 0.4 + 0.6 * (hp / 100);
        const bob = reduceMotion ? 0 : Math.sin(t * 2.1 * vigour + (isYou ? 0 : 1.7)) * 0.035;

        // Knocked out: pitch face-down and sink. Reads instantly, no text needed.
        const fallen = down ? 1 : 0;
        const pitch = fallen * (Math.PI / 2) * (isYou ? -1 : 1);
        const sink = fallen * -0.42;

        const flash = hurt ? punch * 0.8 : 0;

        for (const part of FIGURE) {
          // Arms swing forward on the lunge; legs brace. Both are damped by
          // `punch`, so between rounds the figure just breathes.
          let swingZ = 0;
          if (part.swing === 'arm') swingZ = -dir * (0.25 + lunge * 2.2) * (attacking ? 1 : 0.12);
          if (part.swing === 'leg') swingZ = dir * lunge * 0.5;
          if (reduceMotion) swingZ = 0;

          // Rotate the fighter's local offset into the pose.
          const cz = Math.cos(pitch), szz = Math.sin(pitch);
          const py = part.y * cz + sink + bob;
          const pz = part.y * szz;

          draw(
            trs(
              offsetX + part.x, 0.32 + py, pz,
              part.w, part.h, part.d,
              swingZ, pitch,
            ),
            colour, part.shade, flash,
          );
        }
      }

      raf = requestAnimationFrame(render);
    };

    render();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(normBuf);
      gl.deleteBuffer(floorBuf);
      gl.deleteProgram(prog);
      gl.deleteProgram(floorProg);
      // Browsers cap how many GL contexts exist at once. Leaking one per duel
      // would eventually refuse to make another, and the arena would go black
      // with nothing in the console to explain it.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // Deliberately empty: build the context once, for the life of the arena.
    // See the note by `unsupportedRef` — a dependency here rebuilt it 10x/sec.
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      // Decorative: every fact on this screen is in the HTML above and below it.
      aria-hidden="true"
    />
  );
};

export default DuelArena3D;
