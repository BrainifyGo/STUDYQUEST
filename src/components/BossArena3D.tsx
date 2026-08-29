import React, { useEffect, useRef } from 'react';
import type { Boss } from '../lib/bosses';

/**
 * THE BOSS ARENA — 3D. Pro only.
 *
 * WHY RAW WEBGL AND NOT THREE.JS. three.js is roughly 600 KB, and the main
 * bundle is already 2.2 MB. Even lazy-loaded that is a real download on a
 * phone, for one screen. This is a few kilobytes, has no dependency to keep
 * updated, and does everything the scene actually needs: a perspective camera,
 * a lit rotating solid, and a floor.
 *
 * It also matches how the rest of this app handles assets — the music, the
 * ambience and the 2D boss are all generated rather than fetched.
 *
 * WHAT IT IS. An icosahedron that rotates, pulses with the phase, flinches when
 * hit and lurches when it hits you, over a grid floor that recedes to a horizon.
 * Lighting is a single directional lamp with a rim term, which is what stops it
 * reading as a flat silhouette.
 *
 * IF WEBGL IS UNAVAILABLE the component reports it and the caller falls back to
 * the 2D arena. A Pro user on an old phone gets the fight, not a black box.
 */

interface BossArena3DProps {
  boss: Boss;
  hpPct: number;
  phase: 1 | 2 | 3;
  /** Bumped by the parent on every hit; drives the flinch. */
  eventId: number;
  eventKind: 'hit' | 'hurt' | 'enrage' | 'win' | 'lose' | null;
  onUnsupported: () => void;
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uProj, uView, uModel;
uniform float uWobble;
varying vec3 vNormal, vWorld;
void main() {
  // Displace along the normal so the solid breathes rather than merely scaling.
  vec3 p = aPos * (1.0 + uWobble * 0.12 * sin(aPos.y * 6.0 + uWobble * 9.0));
  vec4 world = uModel * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProj * uView * world;
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColour;
uniform float uHurt;
varying vec3 vNormal, vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 lightDir = normalize(vec3(0.5, 0.9, 0.7));
  float lambert = max(dot(n, lightDir), 0.0);

  // A rim term: brightest where the surface turns away from the camera. This is
  // what keeps it from reading as a flat blob against a dark background.
  vec3 viewDir = normalize(vec3(0.0, 0.4, 3.2) - vWorld);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);

  vec3 col = uColour * (0.25 + 0.75 * lambert) + uColour * rim * 1.4;
  col = mix(col, vec3(1.0), uHurt * 0.75);   // white flash on impact
  gl_FragColor = vec4(col, 1.0);
}`;

const FLOOR_VERT = `
attribute vec2 aXZ;
uniform mat4 uProj, uView;
varying vec2 vXZ;
void main() {
  vXZ = aXZ;
  gl_Position = uProj * uView * vec4(aXZ.x, -1.1, aXZ.y, 1.0);
}`;

const FLOOR_FRAG = `
precision mediump float;
uniform vec3 uColour;
uniform float uTime;
varying vec2 vXZ;
void main() {
  // A grid that fades with distance, which is most of the sense of depth.
  vec2 g = abs(fract(vXZ * 0.5 + vec2(0.0, uTime * 0.05)) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.06, min(g.x, g.y));
  float fade = 1.0 - clamp(length(vXZ) / 14.0, 0.0, 1.0);
  gl_FragColor = vec4(uColour * line * fade * 0.9, line * fade * 0.75);
}`;

const PHASE_COLOUR: Record<number, [number, number, number]> = {
  1: [0.49, 0.49, 1.0],
  2: [0.96, 0.62, 0.04],
  3: [0.94, 0.27, 0.27],
};

/** An icosahedron, subdivided once. Enough facets to catch the light. */
function icosphere(): { positions: Float32Array; normals: Float32Array } {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });

  let faces = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
    [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
  ];

  // One subdivision. Two would be smoother and four times the vertices, which
  // is not worth it at this size.
  const mid = (a: number[], b: number[]) => {
    const m = [(a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2];
    const l = Math.hypot(m[0], m[1], m[2]);
    return [m[0]/l, m[1]/l, m[2]/l];
  };
  const next: number[][] = [];
  for (const [a, b, c] of faces) {
    const ab = verts.push(mid(verts[a], verts[b])) - 1;
    const bc = verts.push(mid(verts[b], verts[c])) - 1;
    const ca = verts.push(mid(verts[c], verts[a])) - 1;
    next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  faces = next;

  const positions: number[] = [];
  for (const f of faces) for (const i of f) positions.push(...verts[i]);
  // The sphere is centred at the origin, so the position IS the normal.
  return { positions: new Float32Array(positions), normals: new Float32Array(positions) };
}

function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const make = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[3D] shader failed:', gl.getShaderInfoLog(sh));
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

/** Column-major perspective matrix — the one piece of maths three.js would hide. */
function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

export const BossArena3D: React.FC<BossArena3DProps> = ({
  boss, hpPct, phase, eventId, eventKind, onUnsupported,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read by the render loop without re-creating it — a loop rebuilt on every
  // state change drops frames and loses its own timing.
  const live = useRef({ hpPct, phase, eventId, eventKind, hurtAt: -10, kind: '' as string });
  live.current.hpPct = hpPct;
  live.current.phase = phase;

  useEffect(() => {
    if (eventKind) { live.current.hurtAt = performance.now() / 1000; live.current.kind = eventKind; }
  }, [eventId, eventKind]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext('webgl', { antialias: true, alpha: true })
      || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) { onUnsupported(); return; }

    const prog = compile(gl, VERT, FRAG);
    const floorProg = compile(gl, FLOOR_VERT, FLOOR_FRAG);
    if (!prog || !floorProg) { onUnsupported(); return; }

    const { positions, normals } = icosphere();
    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const normBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

    const floorBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, floorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -14, -14, 14, -14, -14, 14, 14, -14, 14, 14, -14, 14,
    ]), gl.STATIC_DRAW);

    let raf = 0;
    const start = performance.now() / 1000;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    };

    const draw = () => {
      resize();
      const now = performance.now() / 1000;
      const t = now - start;
      const s = live.current;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const proj = perspective(Math.PI / 4, canvas.width / Math.max(1, canvas.height), 0.1, 60);
      const view = new Float32Array([
        1,0,0,0,  0,1,0,0,  0,0,1,0,  0,-0.35,-3.6,1,
      ]);

      // Floor first, so the solid draws over it.
      gl.useProgram(floorProg);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(gl.getUniformLocation(floorProg, 'uProj'), false, proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(floorProg, 'uView'), false, view);
      gl.uniform3fv(gl.getUniformLocation(floorProg, 'uColour'), PHASE_COLOUR[s.phase]);
      gl.uniform1f(gl.getUniformLocation(floorProg, 'uTime'), reduced ? 0 : t);
      const aXZ = gl.getAttribLocation(floorProg, 'aXZ');
      gl.bindBuffer(gl.ARRAY_BUFFER, floorBuf);
      gl.enableVertexAttribArray(aXZ);
      gl.vertexAttribPointer(aXZ, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);

      // The boss.
      const since = now - s.hurtAt;
      const hurt = since < 0.28 ? 1 - since / 0.28 : 0;
      const spin = reduced ? 0.6 : t * (0.35 + (3 - s.phase === 0 ? 0 : (s.phase - 1) * 0.25));
      const lunge = s.kind === 'hurt' && since < 0.3 ? Math.sin(since / 0.3 * Math.PI) * 0.5 : 0;
      // Smaller as its health drops, so the fight is visible from the shape.
      const scale = 0.75 + (s.hpPct / 100) * 0.35;

      const c = Math.cos(spin), sn = Math.sin(spin);
      const model = new Float32Array([
        c * scale, 0, sn * scale, 0,
        0, scale, 0, 0,
        -sn * scale, 0, c * scale, 0,
        0, reduced ? 0 : Math.sin(t * 1.4) * 0.06, lunge, 1,
      ]);

      gl.useProgram(prog);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uProj'), false, proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uView'), false, view);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uModel'), false, model);
      gl.uniform3fv(gl.getUniformLocation(prog, 'uColour'), PHASE_COLOUR[s.phase]);
      gl.uniform1f(gl.getUniformLocation(prog, 'uHurt'), hurt);
      gl.uniform1f(gl.getUniformLocation(prog, 'uWobble'),
        reduced ? 0 : (s.phase === 3 ? 1 : s.phase === 2 ? 0.55 : 0.25) * (0.6 + hurt));

      const aPos = gl.getAttribLocation(prog, 'aPos');
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      const aNorm = gl.getAttribLocation(prog, 'aNormal');
      gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
      gl.enableVertexAttribArray(aNorm);
      gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      // A WebGL context is a real GPU resource and browsers cap how many exist.
      // Leaving them behind on every round would eventually refuse to make more.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [onUnsupported]);

  return (
    <div className="relative w-full h-64 sm:h-72">
      <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
      {/* The name is HTML rather than drawn in GL: text in a canvas is invisible
          to a screen reader and blurry on a high-DPI display. */}
      <div className="absolute inset-x-0 bottom-0 text-center pointer-events-none">
        <h2 className="text-xl sm:text-2xl font-black text-text-main tracking-tight">{boss.name}</h2>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-text-dim">{boss.title}</p>
      </div>
    </div>
  );
};

export default BossArena3D;
