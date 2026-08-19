import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Music, X, Play, Pause, Volume2, Headphones, Wind, Trees,
  CloudRain, Waves, TreePine, Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import {
  startAmbience, stopAmbience, setAmbienceVolume, type AmbienceId,
} from '../lib/ambience';
import {
  FOCUS_TONES, playFocusTone, stopFocusTone, setFocusVolume, type FocusToneId,
} from '../lib/focusTones';
import {
  PIECES, playPiece, stopMusic, setMusicVolume as setEngineVolume,
  playingPiece, onMusicChange, type PieceId,
} from '../lib/generativeMusic';

/**
 * STUDY MUSIC — three tabs, none of which touch the network.
 *
 * THIS PANEL USED TO BE YOUTUBE. It was reported broken four times across three
 * rounds of fixes, for four different reasons: a deleted video, a 24/7
 * livestream with no embeddable recording, a phone refusing to autoplay, and
 * school networks blocking youtube.com. Every one looked identical to a student
 * — a black rectangle — and none was fixable by choosing another video, because
 * the next video can die the same way. I also could not verify a replacement
 * from this machine: oEmbed, the innertube API and the embed page each reported
 * every video fine or every video broken, including ones known to work.
 *
 * So all three tabs are generated in the browser now. Nothing to 404, nothing to
 * block, no data used, no licence, and no id to go stale.
 *
 *   Music   — generative ambient (src/lib/generativeMusic.ts)
 *   Focus   — binaural tones and noise beds (src/lib/focusTones.ts)
 *   Ambient — rain, waves, forest, static (src/lib/ambience.ts)
 *
 * Closing this panel does NOT stop the sound. The engines are module singletons,
 * so audio survives unmounting — which is what lets music carry on into a study
 * room. <MusicBar /> is the control that goes with that.
 */

interface StudyMusicProps {
  onClose: () => void;
}

type MusicCategory = 'Music' | 'Focus' | 'Ambient';

const CATEGORIES: MusicCategory[] = ['Music', 'Focus', 'Ambient'];

const CATEGORY_ICONS: Record<MusicCategory, React.ReactNode> = {
  Music: <Headphones size={16} />,
  Focus: <Wind size={16} />,
  Ambient: <Trees size={16} />,
};

const AMBIENT_SOUNDS: { id: AmbienceId; name: string; icon: React.ReactNode }[] = [
  { id: 'rain', name: 'Rain', icon: <CloudRain size={16} /> },
  { id: 'waves', name: 'Waves', icon: <Waves size={16} /> },
  { id: 'forest', name: 'Forest', icon: <TreePine size={16} /> },
  { id: 'white-noise', name: 'Static', icon: <Zap size={16} /> },
];

export default function StudyMusic({ onClose }: StudyMusicProps) {
  const [activeCategory, setActiveCategory] = useState<MusicCategory>('Music');

  /* ── generative music ─────────────────────────────────── */
  const [activePiece, setActivePiece] = useState<PieceId | null>(playingPiece());
  const [musicVolume, setMusicVolume] = useState(0.55);

  // The engine may already be playing from before this panel mounted, and can be
  // stopped from the MusicBar while it is open. Subscribing keeps the two in
  // step rather than letting this component trust its own stale copy.
  useEffect(() => onMusicChange(() => setActivePiece(playingPiece())), []);

  const togglePiece = (id: PieceId) => {
    if (activePiece === id) { stopMusic(); return; }
    try {
      playPiece(id, musicVolume);
    } catch (err) {
      console.warn('[music]', err);
      toast.error('Your browser will not play generated audio.');
    }
  };

  /* ── focus tones ──────────────────────────────────────── */
  const [activeTone, setActiveTone] = useState<FocusToneId | null>(null);
  const [toneVolume, setToneVolume] = useState(0.5);

  const toggleTone = (id: FocusToneId) => {
    if (activeTone === id) {
      stopFocusTone();
      setActiveTone(null);
      return;
    }
    try {
      playFocusTone(id, toneVolume);
      setActiveTone(id);
    } catch (err) {
      console.warn('[focus]', err);
      toast.error('Your browser will not play generated audio.');
    }
  };

  /* ── ambient layers ───────────────────────────────────── */
  const [activeAmbients, setActiveAmbients] = useState<Record<string, { active: boolean; volume: number }>>({
    rain: { active: false, volume: 0.5 },
    waves: { active: false, volume: 0.5 },
    forest: { active: false, volume: 0.5 },
    'white-noise': { active: false, volume: 0.5 },
  });

  const toggleAmbient = (id: AmbienceId) => {
    const wasActive = activeAmbients[id].active;
    try {
      if (wasActive) stopAmbience(id);
      else startAmbience(id, activeAmbients[id].volume);
    } catch (err) {
      // Only reachable on a browser with no Web Audio at all.
      console.warn('[ambience]', err);
      toast.error('Your browser will not play generated audio.');
      return;
    }
    setActiveAmbients((prev) => ({ ...prev, [id]: { ...prev[id], active: !wasActive } }));
  };

  const handleAmbientVolume = (id: AmbienceId, volume: number) => {
    setActiveAmbients((prev) => ({ ...prev, [id]: { ...prev[id], volume } }));
    setAmbienceVolume(id, volume);
  };

  const anythingPlaying = !!activePiece || !!activeTone
    || Object.values(activeAmbients).some((a) => a.active);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      role="dialog"
      aria-label="Study music"
      className="fixed right-3 left-3 md:left-auto md:right-8 md:w-[400px] glass-panel rounded-3xl border border-border-main shadow-2xl z-[60] overflow-hidden"
      /*
        Sits directly on top of the bottom nav, whatever height the nav is on
        this device. It used to be a flat `bottom-24` with an `md:bottom-8`,
        which cleared an iPhone by about six pixels — and on a tablet, where the
        md: rules apply but the nav is still on screen (it is lg:hidden), the
        panel sat behind the nav entirely. Both offsets are in the variables now,
        so the desktop gap survives and the tablet case is covered. See
        index.css. This is inline rather than a class because it has to beat the
        md: variant it replaces.
      */
      style={{
        bottom: 'calc(var(--app-nav-h) + var(--app-panel-gap))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Header */}
      <div className="p-5 border-b border-border-main flex items-center justify-between bg-glass-bg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center">
            <Music className="text-brand-purple" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-text-main">Study Music</h3>
            <div className="flex items-center gap-1.5">
              <div className={cn('w-1.5 h-1.5 rounded-full',
                anythingPlaying ? 'bg-brand-purple animate-pulse' : 'bg-text-dim/40')} />
              <span className="text-[10px] text-text-dim uppercase tracking-widest font-bold">
                {anythingPlaying ? 'Playing' : 'Silent'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close the music player"
          className="p-2 rounded-xl hover:bg-glass-bg text-text-dim hover:text-text-main transition-all"
        >
          <X size={20} />
        </button>
      </div>

      {/* Tabs */}
      <div className="p-3 flex items-center gap-2 border-b border-border-main bg-black/20">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            aria-pressed={activeCategory === category}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all',
              activeCategory === category
                ? 'bg-brand-purple text-white shadow-lg shadow-brand-purple/20'
                : 'text-text-dim hover:text-text-main hover:bg-glass-bg'
            )}
          >
            {CATEGORY_ICONS[category]}
            {category}
          </button>
        ))}
      </div>

      {/* Music */}
      {activeCategory === 'Music' && (
        <div className="p-4 space-y-3 max-h-[24rem] overflow-y-auto scrollbar-hide">
          <p className="text-[10px] font-black uppercase tracking-widest text-text-dim">
            Made in your browser — works offline, never repeats
          </p>
          {PIECES.map((piece) => {
            const isOn = activePiece === piece.id;
            return (
              <button
                key={piece.id}
                onClick={() => togglePiece(piece.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border',
                  isOn ? 'bg-brand-purple/20 border-brand-purple'
                       : 'bg-glass-bg border-border-main hover:border-brand-purple/40'
                )}
              >
                <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                  isOn ? 'bg-brand-purple text-white' : 'bg-black/20 text-text-dim')}>
                  {isOn ? <Pause size={16} /> : <Play size={16} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-text-main">{piece.title}</span>
                  <span className="block text-[11px] text-text-dim leading-snug">{piece.blurb}</span>
                </span>
              </button>
            );
          })}

          {activePiece && (
            <div className="flex items-center gap-2 pt-1">
              <Volume2 size={14} className="text-text-dim shrink-0" />
              <input
                type="range" min="0" max="1" step="0.01"
                value={musicVolume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setMusicVolume(v);
                  setEngineVolume(v);
                }}
                className="w-full h-1 accent-brand-purple"
                aria-label="Music volume"
              />
            </div>
          )}
        </div>
      )}

      {/* Focus */}
      {activeCategory === 'Focus' && (
        <div className="p-4 space-y-3 max-h-[24rem] overflow-y-auto scrollbar-hide">
          {FOCUS_TONES.map((tone) => {
            const isOn = activeTone === tone.id;
            return (
              <button
                key={tone.id}
                onClick={() => toggleTone(tone.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border',
                  isOn ? 'bg-brand-purple/20 border-brand-purple'
                       : 'bg-glass-bg border-border-main hover:border-brand-purple/40'
                )}
              >
                <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                  isOn ? 'bg-brand-purple text-white' : 'bg-black/20 text-text-dim')}>
                  {isOn ? <Pause size={16} /> : <Play size={16} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-text-main">{tone.title}</span>
                  <span className="block text-[11px] text-text-dim leading-snug">{tone.blurb}</span>
                </span>
              </button>
            );
          })}

          {activeTone && (
            <div className="flex items-center gap-2 pt-1">
              <Volume2 size={14} className="text-text-dim shrink-0" />
              <input
                type="range" min="0" max="1" step="0.01"
                value={toneVolume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setToneVolume(v);
                  setFocusVolume(v);
                }}
                className="w-full h-1 accent-brand-purple"
                aria-label="Focus tone volume"
              />
            </div>
          )}

          <p className="text-[10px] text-text-dim/70 leading-relaxed pt-1">
            These are tones and noise, described by how they sound. We make no claim that they
            change how well you concentrate.
          </p>
        </div>
      )}

      {/* Ambient */}
      {activeCategory === 'Ambient' && (
        <div className="p-5 space-y-4 max-h-[24rem] overflow-y-auto scrollbar-hide">
          <p className="text-[10px] font-black uppercase tracking-widest text-text-dim">
            Ambient layers — stack as many as you like
          </p>
          <div className="grid grid-cols-2 gap-3">
            {AMBIENT_SOUNDS.map((sound) => (
              <div key={sound.id} className="space-y-2">
                <button
                  onClick={() => toggleAmbient(sound.id)}
                  aria-pressed={activeAmbients[sound.id].active}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border',
                    activeAmbients[sound.id].active
                      ? 'bg-brand-purple/20 border-brand-purple text-brand-purple'
                      : 'bg-glass-bg border-border-main text-text-dim hover:text-text-main'
                  )}
                >
                  {sound.icon}
                  {sound.name}
                </button>
                {activeAmbients[sound.id].active && (
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={activeAmbients[sound.id].volume}
                    onChange={(e) => handleAmbientVolume(sound.id, parseFloat(e.target.value))}
                    className="w-full h-1 accent-brand-purple"
                    aria-label={`${sound.name} volume`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
