import React, { useEffect, useState } from 'react';
import { Music, X, ChevronUp, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  activeAmbience, onAmbienceChange, stopAmbience, stopAllAmbience,
} from '../lib/ambience';
import {
  onFocusChange, playingFocusTone, stopFocusTone, toneById,
} from '../lib/focusTones';
import {
  onMusicChange, playingPiece, stopMusic, pieceById,
} from '../lib/generativeMusic';

/**
 * The music bar — what is playing, when the player itself is closed.
 *
 * The audio engines are module singletons, so sound keeps going after the music
 * panel unmounts. That is deliberate: closing the panel, or walking into a study
 * room, should not silence your rain. But it leaves a real hazard — audio with
 * no control anywhere on screen, which is how you end up hunting for the tab
 * that is making a noise.
 *
 * This is that control. It only appears when something is playing AND the full
 * player is closed, so it is never a second copy of a panel already open.
 *
 * (It replaces `MusicMiniPlayer.tsx`, which read from a `musicPlayerState` in a
 * `MusicPage` that nothing imported — both were orphans, wired to an audio
 * system the app no longer used.)
 */

const NAMES: Record<string, string> = {
  rain: 'Rain', waves: 'Waves', forest: 'Forest', 'white-noise': 'Static',
};

interface MusicBarProps {
  /** Opens the full player. */
  onExpand: () => void;
  /** Sits higher when something else already owns the bottom of the screen. */
  raised?: boolean;
}

export const MusicBar: React.FC<MusicBarProps> = ({ onExpand, raised }) => {
  const [, bump] = useState(0);
  /*
    THE BAR CAN BE PUT AWAY WITHOUT STOPPING THE MUSIC.

    It sits across the bottom of every screen for as long as anything is
    playing, which is the whole point — but "I want my screen back" and "I want
    silence" are different wishes, and the only control was the one that stopped
    the sound. Minimised it is a single round button in the corner.
  */
  const [minimised, setMinimised] = useState(false);

  // One subscription per engine. Neither owns the other, and either can change
  // without the other doing anything.
  useEffect(() => {
    const rerender = () => bump((n) => n + 1);
    const offA = onAmbienceChange(rerender);
    const offF = onFocusChange(rerender);
    const offM = onMusicChange(rerender);
    return () => { offA(); offF(); offM(); };
  }, []);

  const layers = activeAmbience();
  const tone = playingFocusTone();
  const piece = playingPiece();
  const playing = layers.length > 0 || !!tone || !!piece;

  const label = [
    piece ? pieceById(piece)?.title : null,
    tone ? toneById(tone)?.title : null,
    ...layers.map((id) => NAMES[id] ?? id),
  ].filter(Boolean).join(' + ');

  const stopEverything = () => {
    stopAllAmbience();
    stopFocusTone();
    stopMusic();
    // Belt and braces: stopAllAmbience iterates a copy, but a layer added
    // between the two calls would otherwise survive the "stop everything".
    for (const id of activeAmbience()) stopAmbience(id);
  };

  if (playing && minimised) {
    return (
      <motion.button
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={() => setMinimised(false)}
        aria-label={`Music playing: ${label}. Show the player.`}
        title={label}
        className={`fixed right-3 z-[70] w-12 h-12 rounded-full glass-panel border border-border-main shadow-2xl flex items-center justify-center text-brand-purple ${raised ? 'bottom-24' : 'bottom-4'}`}
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Music size={18} className="animate-pulse" />
      </motion.button>
    );
  }

  return (
    <AnimatePresence>
      {playing && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          className={`fixed left-0 right-0 z-[70] px-3 ${raised ? 'bottom-20' : 'bottom-0'}`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto max-w-2xl glass-panel border border-border-main rounded-2xl shadow-2xl flex items-center gap-3 px-4 py-2.5">
            <span className="w-8 h-8 rounded-xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center shrink-0">
              <Music size={15} className="text-brand-purple" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-purple">Playing</p>
              <p className="text-xs font-bold text-text-main truncate">{label}</p>
            </div>

            <button
              onClick={() => setMinimised(true)}
              aria-label="Minimise the music bar"
              className="p-2 rounded-lg text-text-dim hover:text-text-main hover:bg-glass-bg transition-all"
            >
              <Minus size={16} />
            </button>
            <button
              onClick={onExpand}
              aria-label="Open the music player"
              className="p-2 rounded-lg text-text-dim hover:text-text-main hover:bg-glass-bg transition-all"
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={stopEverything}
              aria-label="Stop all sound"
              className="p-2 rounded-lg text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MusicBar;
