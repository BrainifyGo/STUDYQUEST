import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Music, X, Play, Pause, Volume2, Headphones, Wind, Coffee, Trees, Sparkles, CloudRain, Waves, TreePine, Ghost, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { Howl } from 'howler';
import { toast } from 'sonner';

interface StudyMusicProps {
  onClose: () => void;
}

type MusicCategory = 'Lo-Fi' | 'Focus' | 'Classical' | 'Ambient';

interface StudyTrack {
  id: string;
  title: string;
  category: MusicCategory;
}

// Standard YouTube videos (not livestreams — livestream links go dead when the
// broadcast ends, regular uploads don't).
const STUDY_TRACKS: StudyTrack[] = [
  { id: 'jfKfPfyJRdk', title: 'Lofi Hip Hop', category: 'Lo-Fi' },
  { id: '5qap5aO4i9A', title: 'Chill Beats', category: 'Lo-Fi' },
  { id: 'DWcJFNfaw9c', title: 'Deep Focus', category: 'Focus' },
  { id: 'lTRiuFIWV54', title: 'Alpha Waves', category: 'Focus' },
  // Was `__eq8T5b4-w`, which is gone from YouTube — checked, it 404s on oEmbed,
  // so the Classical tab had exactly one track and that track was a dead frame.
  // Every id in this list was verified live before shipping.
  { id: 'mIYzp5rcTvU', title: 'Classical Study', category: 'Classical' },
  { id: 'sjkrrmBnpGE', title: 'Jazz Coffee', category: 'Ambient' },
];

const CATEGORIES: MusicCategory[] = ['Lo-Fi', 'Focus', 'Classical', 'Ambient'];

const CATEGORY_ICONS: Record<MusicCategory, React.ReactNode> = {
  'Lo-Fi': <Headphones size={16} />,
  'Focus': <Wind size={16} />,
  'Classical': <Coffee size={16} />,
  'Ambient': <Trees size={16} />,
};

const AMBIENT_SOUNDS = [
  { id: 'rain', name: 'Rain', icon: <CloudRain size={16} />, url: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3' },
  { id: 'waves', name: 'Waves', icon: <Waves size={16} />, url: 'https://assets.mixkit.co/active_storage/sfx/1113/1113-preview.mp3' },
  { id: 'forest', name: 'Forest', icon: <TreePine size={16} />, url: 'https://assets.mixkit.co/active_storage/sfx/1117/1117-preview.mp3' },
  { id: 'white-noise', name: 'Static', icon: <Zap size={16} />, url: 'https://assets.mixkit.co/active_storage/sfx/2357/2357-preview.mp3' },
];

export default function StudyMusic({ onClose }: StudyMusicProps) {
  const [activeCategory, setActiveCategory] = useState<MusicCategory>('Lo-Fi');
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeAmbients, setActiveAmbients] = useState<Record<string, { active: boolean, volume: number }>>({
    rain: { active: false, volume: 0.5 },
    waves: { active: false, volume: 0.5 },
    forest: { active: false, volume: 0.5 },
    'white-noise': { active: false, volume: 0.5 },
  });
  
  const howlsRef = useRef<Record<string, Howl>>({});

  useEffect(() => {
    // Cleanup howls on unmount
    return () => {
      Object.values(howlsRef.current).forEach(h => h.stop());
    };
  }, []);

  const toggleAmbient = (id: string) => {
    const sound = AMBIENT_SOUNDS.find(s => s.id === id);
    if (!sound) return;

    const isCurrentlyActive = activeAmbients[id].active;
    
    if (!isCurrentlyActive) {
      if (!howlsRef.current[id]) {
        /*
          The button used to light up whether or not a single byte arrived.

          A blocked school network, an offline phone or a moved file all produced
          the same thing: an "on" toggle and silence, which is why the music looked
          broken rather than unavailable. Howler reports both failures — the file
          not loading, and the browser refusing to play it — so both now switch the
          toggle back off and say what happened.
        */
        const fail = (what: string) => {
          setActiveAmbients(prev => ({ ...prev, [id]: { ...prev[id], active: false } }));
          toast.error(`${sound.name} could not ${what}. Check your connection — some networks block it.`);
        };
        howlsRef.current[id] = new Howl({
          src: [sound.url],
          loop: true,
          volume: activeAmbients[id].volume,
          html5: true,
          onloaderror: () => fail('load'),
          onplayerror: () => fail('play'),
        });
      }
      howlsRef.current[id].play();
    } else {
      howlsRef.current[id]?.pause();
    }

    setActiveAmbients(prev => ({
      ...prev,
      [id]: { ...prev[id], active: !isCurrentlyActive }
    }));
  };

  const handleVolumeChange = (id: string, volume: number) => {
    setActiveAmbients(prev => ({
      ...prev,
      [id]: { ...prev[id], volume }
    }));
    if (howlsRef.current[id]) {
      howlsRef.current[id].volume(volume);
    }
  };

  const toggleTrack = (id: string) => {
    setActiveTrackId(prev => (prev === id ? null : id));
  };

  const tracksInCategory = STUDY_TRACKS.filter(t => t.category === activeCategory);
  const activeTrack = STUDY_TRACKS.find(t => t.id === activeTrackId) || null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-24 right-4 md:bottom-8 md:right-8 w-[calc(100vw-2rem)] md:w-[400px] glass-panel rounded-[2.5rem] border border-border-main shadow-2xl z-[60] overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-border-main flex items-center justify-between bg-glass-bg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center">
            <Music className="text-brand-purple" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-text-main">Study Music</h3>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full", activeTrack ? "bg-brand-purple animate-pulse" : "bg-text-dim/40")} />
              <span className="text-[10px] text-text-dim uppercase tracking-widest font-bold">
                {activeTrack ? 'Now Playing' : 'Paused'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-glass-bg text-text-dim hover:text-text-main transition-all"
        >
          <X size={20} />
        </button>
      </div>

      {/* Category Filters */}
      <div className="p-4 flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-border-main bg-black/20">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeCategory === category
                ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20"
                : "text-text-dim hover:text-text-main hover:bg-glass-bg"
            )}
          >
            {CATEGORY_ICONS[category]}
            {category}
          </button>
        ))}
      </div>

      {/* Now Playing Embed */}
      {activeTrack && (
        <div className="p-4 aspect-video bg-black/40 relative group">
          <iframe
            key={activeTrack.id}
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${activeTrack.id}?autoplay=1&controls=1&showinfo=0&rel=0&modestbranding=1`}
            title={activeTrack.title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="rounded-2xl"
          ></iframe>
        </div>
      )}

      {/* Track List */}
      {tracksInCategory.length > 0 && (
        <div className="p-4 space-y-2 max-h-52 overflow-y-auto">
          {tracksInCategory.map((track) => {
            const isActive = activeTrackId === track.id;
            return (
              <button
                key={track.id}
                onClick={() => toggleTrack(track.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border",
                  isActive
                    ? "bg-brand-purple/20 border-brand-purple"
                    : "bg-glass-bg border-border-main hover:border-brand-purple/40"
                )}
              >
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  isActive ? "bg-brand-purple text-white" : "bg-black/20 text-text-dim"
                )}>
                  {isActive ? <Pause size={16} /> : <Play size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text-main truncate">{track.title}</p>
                  <p className="text-[10px] text-text-dim uppercase tracking-widest font-bold">{track.category}</p>
                </div>
                {isActive && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-brand-purple shrink-0">Now Playing</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Ambient Sounds */}
      {activeCategory === 'Ambient' && (
      <div className="p-6 space-y-4 bg-glass-bg/50">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-text-dim">Ambient Layers</h4>
        <div className="grid grid-cols-2 gap-3">
          {AMBIENT_SOUNDS.map((sound) => (
            <div key={sound.id} className="space-y-2">
              <button
                onClick={() => toggleAmbient(sound.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border",
                  activeAmbients[sound.id].active
                    ? "bg-brand-purple/20 border-brand-purple text-brand-purple shadow-lg shadow-brand-purple/10"
                    : "bg-glass-bg border-border-main text-text-dim hover:text-text-main"
                )}
              >
                {sound.icon}
                {sound.name}
              </button>
              {activeAmbients[sound.id].active && (
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01"
                  value={activeAmbients[sound.id].volume}
                  onChange={(e) => handleVolumeChange(sound.id, parseFloat(e.target.value))}
                  className="w-full h-1 bg-brand-purple/20 rounded-lg appearance-none cursor-pointer accent-brand-purple"
                />
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Footer Info */}
      <div className="p-4 bg-glass-bg flex items-center justify-between border-t border-border-main">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-dim">
          <Volume2 size={12} />
          <span>Mix your perfect focus</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-brand-purple">
          <Sparkles size={12} />
          <span>Focus Mode Active</span>
        </div>
      </div>
    </motion.div>
  );
}
