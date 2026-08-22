import React from 'react';
import type { DuelArenaEvent, DuelSide } from './DuelArena3D';

/**
 * THE DUEL ARENA — 2D. Everyone gets this one.
 *
 * Drawn, not fetched: SVG and CSS, no sprites. Same reason as the boss arena —
 * a fighter that reacts has to be made of parts that move independently, and
 * **an image cannot flinch**.
 *
 * IT TAKES THE SAME PROPS AS THE 3D ARENA, deliberately. It is used in three
 * situations — a free account, WebGL unavailable, and reduced-motion — and if
 * the two components drifted apart, the fallback would quietly become the buggy
 * one because nobody testing on a Pro desktop would ever see it.
 *
 * THE GATE IS ON THE SPECTACLE, NEVER THE MECHANICS. Same duel, same questions,
 * same damage, same difficulty. Pro gets it in WebGL. Gating how a fight LOOKS
 * is a fair upsell; gating whether you can win it would not be.
 */

interface DuelArena2DProps {
  youHpPct: number;
  foeHpPct: number;
  event: DuelArenaEvent;
  loser: DuelSide | null;
}

/** One blocky fighter, posed. Mirrors the six parts the 3D figure is built from. */
const Fighter: React.FC<{
  side: DuelSide;
  hpPct: number;
  attacking: boolean;
  hurt: boolean;
  down: boolean;
}> = ({ side, hpPct, attacking, hurt, down }) => {
  const isYou = side === 'you';
  const body = isYou ? '#3db4fa' : '#b85afa';
  const limb = isYou ? '#2b87c4' : '#8b3fc4';
  const head = isYou ? '#7fd0ff' : '#d69dff';

  // Facing each other: the player looks right, the opponent looks left.
  const face = isYou ? 1 : -1;

  const transform = [
    down ? `translate(0 26) rotate(${face * 78} 40 62)` : '',
    attacking && !down ? `translate(${face * 10} 0)` : '',
    hurt && !down ? `translate(${-face * 7} 0)` : '',
  ].filter(Boolean).join(' ');

  return (
    <svg
      viewBox="0 0 80 100"
      className={[
        'w-20 h-28 sm:w-24 sm:h-32 transition-transform duration-300 ease-out',
        down ? '' : 'motion-safe:animate-[duelBob_2.4s_ease-in-out_infinite]',
      ].join(' ')}
      style={{ animationDelay: isYou ? '0ms' : '600ms' }}
      aria-hidden="true"
    >
      <g transform={transform} opacity={down ? 0.55 : 1}>
        {/* legs */}
        <rect x="30" y="62" width="8" height="22" rx="2" fill={limb} />
        <rect x="42" y="62" width="8" height="22" rx="2" fill={limb} />
        {/* arms — the leading one swings forward on a hit */}
        <rect
          x={isYou ? 52 : 20} y="36" width="8" height="20" rx="2" fill={limb}
          className="transition-transform duration-200"
          transform={attacking && !down ? `rotate(${face * -42} ${isYou ? 56 : 24} 40)` : ''}
        />
        <rect x={isYou ? 20 : 52} y="36" width="8" height="20" rx="2" fill={limb} />
        {/* torso */}
        <rect x="28" y="32" width="24" height="30" rx="4" fill={body} />
        {/* head */}
        <rect x="30" y="12" width="20" height="18" rx="4" fill={head} />
        {/* eyes, angled harder as health drops — the silhouette tells the story
            faster than the number does */}
        <rect
          x={isYou ? 40 : 33} y={hpPct < 40 ? 19 : 18} width="7" height="3" rx="1.5"
          fill="#0b1020"
          transform={`rotate(${(isYou ? 1 : -1) * (hpPct < 40 ? 14 : 0)} ${isYou ? 43 : 36} 20)`}
        />
        {hurt && <rect x="24" y="8" width="32" height="80" rx="8" fill="#fff" opacity="0.55" />}
      </g>
    </svg>
  );
};

export const DuelArena2D: React.FC<DuelArena2DProps> = ({
  youHpPct, foeHpPct, event, loser,
}) => {
  const beat = event.id;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl bg-gradient-to-b from-[#0d1030] via-[#0a0d24] to-[#05060f]">
      {/* Receding grid — the whole sense of depth, for the price of a gradient. */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(99,120,255,.28) 1px, transparent 1px),'
            + 'linear-gradient(90deg, rgba(99,120,255,.22) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
          maskImage: 'linear-gradient(to top, black 0%, transparent 72%)',
          WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 72%)',
        }}
        aria-hidden="true"
      />

      <div className="relative h-full flex items-end justify-around pb-6 sm:pb-8">
        {(['you', 'foe'] as DuelSide[]).map((side) => {
          const isYou = side === 'you';
          const hp = isYou ? youHpPct : foeHpPct;
          return (
            <div key={`${side}-${beat}`} className="flex flex-col items-center">
              <Fighter
                side={side}
                hpPct={hp}
                attacking={event.winner === side}
                hurt={!!event.winner && event.winner !== side}
                down={loser === side}
              />
              {/* Podium: a lit disc, dimming as its fighter fades. */}
              <div
                className="mt-1 h-4 w-24 sm:w-28 rounded-[50%] blur-[1px] transition-opacity duration-500"
                style={{
                  background: isYou
                    ? 'radial-gradient(ellipse at center, #3db4fa 0%, rgba(61,180,250,0) 72%)'
                    : 'radial-gradient(ellipse at center, #b85afa 0%, rgba(184,90,250,0) 72%)',
                  opacity: 0.35 + 0.6 * (hp / 100),
                }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>

      {/* The verdict for the round, over the middle. Keyed on the event id so it
          replays exactly once per round rather than on every re-render. */}
      {event.winner && (
        <div
          key={beat}
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none"
        >
          <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-black/60 text-white motion-safe:animate-[duelPop_.7s_ease-out_forwards]">
            {event.traded ? 'FASTER!' : 'HIT!'}
          </span>
        </div>
      )}
    </div>
  );
};

export default DuelArena2D;
