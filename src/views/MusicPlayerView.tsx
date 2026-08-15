import React, { useState, useEffect, useRef } from 'react';
import { 
  Music, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  ExternalLink,
  CloudRain,
  Coffee,
  Trees,
  Wind,
  Zap,
  Flame,
  Moon,
  Waves
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface AmbientSound {
  id: string;
  name: string;
  emoji: string;
  icon: any;
  url: string;
}

const AMBIENT_SOUNDS: AmbientSound[] = [
  { id: 'rain', name: 'Rain', emoji: '🌧️', icon: CloudRain, url: 'https://www.soundjay.com/nature/rain-01.mp3' },
  { id: 'cafe', name: 'Cafe', emoji: '☕', icon: Coffee, url: 'https://www.soundjay.com/misc/sounds/coffee-shop-1.mp3' },
  { id: 'forest', name: 'Forest', emoji: '🌲', icon: Trees, url: 'https://www.soundjay.com/nature/forest-01.mp3' },
  { id: 'white-noise', name: 'White Noise', emoji: '🌫️', icon: Wind, url: 'https://www.soundjay.com/misc/sounds/white-noise-01.mp3' },
  { id: 'lofi', name: 'Lo-fi Beats', emoji: '🎧', icon: Music, url: 'https://www.soundjay.com/misc/sounds/lofi-beat-01.mp3' },
  { id: 'ocean', name: 'Ocean Waves', emoji: '🌊', icon: Waves, url: 'https://www.soundjay.com/nature/ocean-wave-1.mp3' },
  { id: 'fireplace', name: 'Fireplace', emoji: '🔥', icon: Flame, url: 'https://www.soundjay.com/nature/fire-1.mp3' },
  { id: 'night', name: 'Night Sounds', emoji: '🌃', icon: Moon, url: 'https://www.soundjay.com/nature/cricket-01.mp3' },
];

const LOFI_STREAMS = [
  { id: 'jfKfPfyJRdk', title: 'lofi hip hop radio - beats to relax/study to', thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/maxresdefault.jpg' },
  { id: '5qap5aO4i9A', title: 'lofi hip hop radio - beats to sleep/chill to', thumbnail: 'https://i.ytimg.com/vi/5qap5aO4i9A/maxresdefault.jpg' },
  { id: 'DWcUme6KmCY', title: 'Deep Focus - Ambient Study Music', thumbnail: 'https://i.ytimg.com/vi/DWcUme6KmCY/maxresdefault.jpg' },
  { id: 'lP26UCnoH9s', title: 'Coffee Shop Radio - 24/7 Lofi & Jazz', thumbnail: 'https://i.ytimg.com/vi/lP26UCnoH9s/maxresdefault.jpg' },
];

export const MusicPlayerView: React.FC = () => {
  const [activeSounds, setActiveSounds] = useState<Record<string, { playing: boolean; volume: number }>>({});
  const [activeYoutube, setActiveYoutube] = useState<string | null>(null);
  const [masterVolume, setMasterVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm') {
        setIsMuted(prev => {
          const newMuted = !prev;
          toast(newMuted ? "🔇 Muted" : "🔊 Unmuted");
          return newMuted;
        });
      }
      if (e.key === '+') {
        setMasterVolume(prev => {
          const newVol = Math.min(1, prev + 0.1);
          toast(`🔊 Volume: ${Math.round(newVol * 100)}%`);
          return newVol;
        });
      }
      if (e.key === '-') {
        setMasterVolume(prev => {
          const newVol = Math.max(0, prev - 0.1);
          toast(`🔊 Volume: ${Math.round(newVol * 100)}%`);
          return newVol;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSound = (id: string) => {
    setActiveSounds(prev => {
      const isPlaying = !prev[id]?.playing;
      
      if (isPlaying) {
        if (!audioRefs.current[id]) {
          const audio = new Audio(AMBIENT_SOUNDS.find(s => s.id === id)?.url);
          audio.loop = true;
          audioRefs.current[id] = audio;
        }
        audioRefs.current[id].volume = (prev[id]?.volume || 0.5) * masterVolume;
        audioRefs.current[id].play().catch(() => {
          toast.error("Audio playback failed. Please interact with the page first.");
        });
      } else {
        audioRefs.current[id]?.pause();
      }

      return {
        ...prev,
        [id]: {
          playing: isPlaying,
          volume: prev[id]?.volume || 0.5
        }
      };
    });
  };

  const updateSoundVolume = (id: string, volume: number) => {
    setActiveSounds(prev => ({
      ...prev,
      [id]: { ...prev[id], volume }
    }));
    if (audioRefs.current[id]) {
      audioRefs.current[id].volume = volume * masterVolume;
    }
  };

  useEffect(() => {
    Object.keys(audioRefs.current).forEach(id => {
      if (audioRefs.current[id]) {
        audioRefs.current[id].volume = (activeSounds[id]?.volume || 0.5) * (isMuted ? 0 : masterVolume);
      }
    });
  }, [masterVolume, isMuted, activeSounds]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 animate-fade-up pb-32">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
          Study Music 🎵
        </h1>
        <p className="text-gray-500 font-medium mt-1">Stay focused with curated study sounds</p>
      </div>

      {/* Ambient Sounds Grid */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-white tracking-tight">Ambient Sounds</h2>
          <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-full border border-gray-100 shadow-sm">
            <button onClick={() => setIsMuted(!isMuted)} className="text-gray-400 hover:text-primary transition-colors">
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={masterVolume}
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
              className="w-24 accent-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AMBIENT_SOUNDS.map((sound) => {
            const isActive = activeSounds[sound.id]?.playing;
            return (
              <div 
                key={sound.id}
                className={cn(
                  "card-bright p-6 flex flex-col items-center gap-4 transition-all relative overflow-hidden group",
                  isActive && "border-primary/30 ring-4 ring-primary/5"
                )}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-primary/5 animate-pulse" />
                )}
                
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-transform group-hover:scale-110",
                  isActive ? "bg-primary/10" : "bg-gray-50"
                )}>
                  {sound.emoji}
                </div>

                <div className="text-center">
                  <h3 className="font-bold text-white">{sound.name}</h3>
                  <button 
                    onClick={() => toggleSound(sound.id)}
                    className={cn(
                      "mt-2 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                      isActive 
                        ? "bg-primary text-white shadow-lg shadow-primary/20" 
                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                    )}
                  >
                    {isActive ? 'Playing' : 'Play'}
                  </button>
                </div>

                {isActive && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full pt-2"
                  >
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={activeSounds[sound.id]?.volume || 0.5}
                      onChange={(e) => updateSoundVolume(sound.id, parseFloat(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* YouTube Lo-fi Section */}
      <section className="space-y-6">
        <h2 className="text-xl font-black text-white tracking-tight">Lo-fi Radio 📻</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            {LOFI_STREAMS.map((stream) => (
              <button
                key={stream.id}
                onClick={() => setActiveYoutube(stream.id)}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group",
                  activeYoutube === stream.id 
                    ? "bg-primary/5 border-primary shadow-lg shadow-primary/5" 
                    : "bg-white border-gray-100 hover:border-gray-200"
                )}
              >
                <div className="w-24 h-16 rounded-lg overflow-hidden relative shrink-0">
                  <img src={stream.thumbnail} alt={stream.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play size={20} className="text-white fill-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-white truncate">{stream.title}</h4>
                  <p className="text-xs text-gray-500 mt-1">YouTube Live Stream</p>
                </div>
                {activeYoutube === stream.id && (
                  <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                )}
              </button>
            ))}
          </div>

          <div className="card-bright aspect-video overflow-hidden bg-black flex items-center justify-center relative">
            {activeYoutube ? (
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${activeYoutube}?autoplay=1&controls=0&modestbranding=1`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="text-center p-8">
                <Music size={48} className="text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 font-bold">Select a stream to start playing</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Mini Player */}
      <AnimatePresence>
        {(Object.values(activeSounds).some(s => s.playing) || activeYoutube) && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl z-[9999] px-4"
          >
            <div className="bg-[#1a0533] border border-white/10 rounded-2xl shadow-2xl p-4 flex items-center gap-6 text-white">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <Music size={20} className="text-primary animate-pulse" />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Now Playing</p>
                <p className="text-sm font-bold truncate">
                  {Object.entries(activeSounds)
                    .filter(([_, s]) => s.playing)
                    .map(([id]) => AMBIENT_SOUNDS.find(s => s.id === id)?.name)
                    .concat(activeYoutube ? ['Lo-fi Radio'] : [])
                    .join(' + ')}
                </p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="flex items-center gap-2">
                  <Volume2 size={16} className="text-gray-400" />
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01" 
                    value={masterVolume}
                    onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                    className="w-20 accent-primary"
                  />
                </div>
                <button 
                  onClick={() => {
                    setActiveSounds({});
                    setActiveYoutube(null);
                    Object.values(audioRefs.current).forEach(a => a.pause());
                  }}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <Pause size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
