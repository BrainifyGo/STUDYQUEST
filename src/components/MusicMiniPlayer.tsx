import React, { useState, useEffect } from 'react';
import { Music, Play, Pause, Volume2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { musicPlayerState } from '../pages/MusicPage';
import { useUserStore } from '../store/useUserStore';
import { cn } from '../lib/utils';

export const MusicMiniPlayer: React.FC = () => {
  const { activeView, setActiveView } = useUserStore();
  const [, forceUpdate] = useState({});

  useEffect(() => {
    return musicPlayerState.subscribe(() => forceUpdate({}));
  }, []);

  const isVisible = musicPlayerState.activeSounds.size > 0 && activeView !== 'music';
  const activeSoundNames = Array.from(musicPlayerState.activeSounds.keys())
    .map(id => id.charAt(0).toUpperCase() + id.slice(1))
    .join(' + ');

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          className="fixed bottom-0 left-0 right-0 h-14 bg-[#1a0533] border-t border-primary/20 flex items-center justify-between px-6 z-40 shadow-2xl backdrop-blur-md"
        >
          {/* Left: Now Playing */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary animate-pulse">
              <Music className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-bold text-primary/60">Now Playing</span>
              <span className="text-xs font-medium text-foreground truncate max-w-[200px]">
                {activeSoundNames || "Ambient Mix"}
              </span>
            </div>
          </div>

          {/* Center: Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => musicPlayerState.toggleAll()}
              className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-primary/20"
            >
              {musicPlayerState.isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
          </div>

          {/* Right: Volume & Link */}
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-3">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={musicPlayerState.masterVolume}
                onChange={(e) => musicPlayerState.setMasterVolume(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
            
            <button
              onClick={() => setActiveView('music')}
              className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors group"
            >
              Go to Music
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
