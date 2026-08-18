import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart } from 'lucide-react';
import type { Boss } from '../lib/bosses';

/**
 * THE BOSS ARENA — 2D.
 *
 * The fight worked mechanically and looked like a form: a name, a percentage,
 * and a bar. This is the same fight drawn as a game.
 *
 * Everything here is drawn rather than loaded — SVG shapes and CSS, no sprites.
 * That is partly the project's habit by now (the music and the ambience are
 * generated too) and partly because a boss that reacts has to be made of parts
 * that can move independently. An image cannot flinch.
 *
 * WHAT MAKES IT READ AS A GAME, in rough order of how much each contributes:
 *
 *  1. REACTION. The boss flinches when hit, lunges when it hits you, and its
 *     face changes with the phase. A static picture beside a number is a chart.
 *  2. IMPACT. Damage numbers fly off, particles burst, the arena shakes. These
 *     are what tell you the hit *landed* before you have read anything.
 *  3. ANTICIPATION. The idle bob and the breathing glow mean the thing is alive
 *     between questions, so the fight does not stop while you think.
 *
 * All of it is `prefers-reduced-motion` aware: the shake and the float stop, the
 * information does not.
 */

export interface ArenaEvent {
  /** Bumped by the parent every time something worth animating happens. */
  id: number;
  kind: 'hit' | 'hurt' | 'enrage' | 'win' | 'lose';
  /** Damage dealt or taken, for the flying number. */
  amount?: number;
}

interface BossArena2DProps {
  boss: Boss;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  playerHp: number;
  maxPlayerHp: number;
  event: ArenaEvent | null;
  line: string;
}

/** Phase colours. Violet while it is comfortable, red once it is not. */
const PHASE = {
  1: { body: '#7c7cff', glow: 'rgba(124,124,255,0.45)', ring: '#7c7cff' },
  2: { body: '#f59e0b', glow: 'rgba(245,158,11,0.45)', ring: '#f59e0b' },
  3: { body: '#ef4444', glow: 'rgba(239,68,68,0.55)', ring: '#ef4444' },
} as const;

interface Particle { id: number; x: number; y: number; dx: number; dy: number; hue: string; }

export const BossArena2D: React.FC<BossArena2DProps> = ({
  boss, hp, maxHp, phase, playerHp, maxPlayerHp, event, line,
}) => {
  const colour = PHASE[phase];
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;

  const [particles, setParticles] = useState<Particle[]>([]);
  const [floater, setFloater] = useState<{ id: number; text: string; bad: boolean } | null>(null);
  const [shake, setShake] = useState(0);
  const seq = useRef(0);

  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, []);

  // One effect drives everything: the parent bumps `event.id`, and the arena
  // reacts. Keeping it to a single trigger means the animation can never get
  // out of step with the state that caused it.
  useEffect(() => {
    if (!event) return;

    const strength = event.kind === 'enrage' ? 14 : event.kind === 'hurt' ? 10 : 6;
    if (!reduced.current) setShake(strength);
    const stop = setTimeout(() => setShake(0), 340);

    if (event.kind === 'hit' || event.kind === 'hurt') {
      setFloater({
        id: ++seq.current,
        text: event.kind === 'hit' ? `-${event.amount ?? 0}` : `-${event.amount ?? 1}`,
        bad: event.kind === 'hurt',
      });

      if (!reduced.current) {
        // Burst outward from the centre. Twelve is enough to read as an impact
        // without turning into a screensaver.
        const burst: Particle[] = Array.from({ length: 12 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
          const speed = 40 + Math.random() * 55;
          return {
            id: ++seq.current, x: 0, y: 0,
            dx: Math.cos(a) * speed, dy: Math.sin(a) * speed,
            hue: event.kind === 'hit' ? colour.ring : '#ef4444',
          };
        });
        setParticles(burst);
        setTimeout(() => setParticles([]), 620);
      }
    }

    return () => clearTimeout(stop);
  }, [event?.id]);

  return (
    <div className="relative select-none">
      {/* The arena floor — a pool of phase-coloured light that breathes. */}
      <motion.div
        aria-hidden="true"
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: phase === 3 ? 1.1 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-x-0 bottom-0 h-24 rounded-[50%] blur-2xl"
        style={{ background: colour.glow }}
      />

      <motion.div
        animate={shake ? { x: [0, -shake, shake, -shake * 0.6, shake * 0.4, 0] } : { x: 0 }}
        transition={{ duration: 0.34 }}
        className="relative flex flex-col items-center gap-4 pt-2"
      >
        {/* The boss itself */}
        <div className="relative">
          <motion.div
            animate={
              event?.kind === 'hurt'
                ? { y: [0, 14, 0], scale: [1, 1.06, 1] }        // it lunges at you
                : event?.kind === 'hit'
                ? { y: [0, -6, 0], rotate: [0, -4, 3, 0] }      // it flinches
                : reduced.current
                ? { y: 0 }
                : { y: [0, -7, 0] }                             // idle: alive
            }
            transition={
              event ? { duration: 0.32 }
                    : { duration: phase === 3 ? 1.2 : 2.4, repeat: Infinity, ease: 'easeInOut' }
            }
          >
            <BossFace boss={boss} phase={phase} colour={colour} />
          </motion.div>

          {/* Impact particles */}
          <AnimatePresence>
            {particles.map((p) => (
              <motion.span
                key={p.id}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full pointer-events-none"
                style={{ background: p.hue }}
              />
            ))}
          </AnimatePresence>

          {/* The damage number */}
          <AnimatePresence>
            {floater && (
              <motion.div
                key={floater.id}
                initial={{ y: 0, opacity: 0, scale: 0.7 }}
                animate={{ y: -58, opacity: 1, scale: 1.15 }}
                exit={{ opacity: 0, y: -80 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                onAnimationComplete={() => setFloater(null)}
                className={`absolute left-1/2 -translate-x-1/2 top-2 text-3xl font-black pointer-events-none drop-shadow-lg ${
                  floater.bad ? 'text-red-400' : 'text-white'
                }`}
              >
                {floater.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Name and title */}
        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-black text-text-main tracking-tight">{boss.name}</h2>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: colour.ring }}>
            {boss.title}
          </p>
        </div>

        {/* Health. Segmented, because a smooth bar hides how much a hit was
            worth — with notches you can see the chunk come off. */}
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-1.5 text-[10px] font-black uppercase tracking-widest">
            <span className="text-text-dim">
              {phase === 3 ? 'Enraged' : phase === 2 ? 'Rattled' : 'Composed'}
            </span>
            <span style={{ color: colour.ring }}>{Math.ceil(pct)}%</span>
          </div>

          <div className="relative h-4 rounded-full bg-black/40 border border-border-main overflow-hidden">
            <motion.div
              animate={{ width: `${pct}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${colour.body}, ${colour.ring})` }}
            />
            <div className="absolute inset-0 flex pointer-events-none" aria-hidden="true">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex-1 border-r border-black/30 last:border-r-0" />
              ))}
            </div>
          </div>
        </div>

        {/* Your lives, as hearts rather than a number. */}
        {maxPlayerHp > 0 && (
          <div className="flex items-center gap-1.5" aria-label={`${playerHp} of ${maxPlayerHp} lives left`}>
            {Array.from({ length: maxPlayerHp }).map((_, i) => (
              <motion.span
                key={i}
                animate={i < playerHp ? { scale: 1 } : { scale: 0.8 }}
                className={i < playerHp ? 'text-red-400' : 'text-text-dim/30'}
              >
                <Heart size={16} fill={i < playerHp ? 'currentColor' : 'none'} />
              </motion.span>
            ))}
          </div>
        )}

        {/* What the boss is saying */}
        <AnimatePresence mode="wait">
          <motion.p
            key={line}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm italic text-text-dim text-center max-w-sm min-h-[1.5rem]"
          >
            {line ? `"${line}"` : ''}
          </motion.p>
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

/**
 * The face.
 *
 * Drawn as SVG so each part can move on its own — the eyes narrow, the mouth
 * goes from level to a grimace to bared teeth, and horns grow in at phase 3.
 * The phase is readable from the face alone, without reading the percentage,
 * which is the point: you should be able to tell how the fight is going by
 * glancing at it.
 */
const BossFace: React.FC<{
  boss: Boss; phase: 1 | 2 | 3; colour: { body: string; ring: string };
}> = ({ phase, colour }) => {
  const eyeTilt = phase === 1 ? 0 : phase === 2 ? 8 : 16;
  const mouth = phase === 1
    ? 'M 42 78 Q 60 82 78 78'          // level
    : phase === 2
    ? 'M 42 82 Q 60 72 78 82'          // grimace
    : 'M 40 84 Q 60 66 80 84';         // bared

  return (
    <svg width="150" height="150" viewBox="0 0 120 120" className="drop-shadow-2xl">
      <defs>
        <radialGradient id="bossBody" cx="40%" cy="35%">
          <stop offset="0%" stopColor={colour.ring} stopOpacity="0.95" />
          <stop offset="100%" stopColor={colour.body} stopOpacity="0.55" />
        </radialGradient>
      </defs>

      {/* Horns appear only when enraged — a silhouette change, which reads
          faster than a colour change. */}
      {phase === 3 && (
        <>
          <path d="M 26 34 L 16 8 L 40 24 Z" fill={colour.body} opacity="0.9" />
          <path d="M 94 34 L 104 8 L 80 24 Z" fill={colour.body} opacity="0.9" />
        </>
      )}

      <circle cx="60" cy="60" r="44" fill="url(#bossBody)" stroke={colour.ring} strokeWidth="2.5" />

      {/* Eyes: angle down as it gets angrier. */}
      <g transform={`rotate(${eyeTilt} 44 52)`}>
        <rect x="34" y="48" width="20" height="7" rx="3.5" fill="#0b0b14" />
      </g>
      <g transform={`rotate(${-eyeTilt} 76 52)`}>
        <rect x="66" y="48" width="20" height="7" rx="3.5" fill="#0b0b14" />
      </g>

      <path d={mouth} stroke="#0b0b14" strokeWidth="4" fill="none" strokeLinecap="round" />

      {/* Teeth, phase 3 only. */}
      {phase === 3 && (
        <g fill="#0b0b14">
          <path d="M 50 76 l 4 8 l 4 -8 z" />
          <path d="M 62 76 l 4 8 l 4 -8 z" />
        </g>
      )}
    </svg>
  );
};

export default BossArena2D;
