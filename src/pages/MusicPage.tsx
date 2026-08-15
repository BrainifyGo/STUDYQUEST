import React, { useState, useEffect, useRef } from 'react';
import { Howl } from 'howler';
import { 
  CloudRain, 
  Coffee, 
  Trees, 
  Wind, 
  Music as MusicIcon, 
  Waves, 
  Flame, 
  Moon,
  Volume2,
  Play,
  Pause,
  ExternalLink,
  Radio
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface AmbientSound {
  id: string;
  name: string;
  icon: React.ElementType;
  url: string;
}

const AMBIENT_SOUNDS: AmbientSound[] = [
  { id: 'rain', name: 'Rain', icon: CloudRain, url: 'https://assets.mixkit.co/sfx/preview/mixkit-light-rain-loop-2393.mp3' },
  { id: 'cafe', name: 'Cafe', icon: Coffee, url: 'https://assets.mixkit.co/sfx/preview/mixkit-coffee-shop-ambience-loop-451.mp3' },
  { id: 'forest', name: 'Forest', icon: Trees, url: 'https://assets.mixkit.co/sfx/preview/mixkit-forest-birds-ambience-1210.mp3' },
  { id: 'white-noise', name: 'White Noise', icon: Wind, url: 'https://assets.mixkit.co/sfx/preview/mixkit-wind-blowing-loop-1160.mp3' },
  { id: 'lofi', name: 'Lo-fi Beats', icon: MusicIcon, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' }, // Placeholder for lofi loop
  { id: 'ocean', name: 'Ocean Waves', icon: Waves, url: 'https://assets.mixkit.co/sfx/preview/mixkit-sea-waves-loop-1196.mp3' },
  { id: 'fireplace', name: 'Fireplace', icon: Flame, url: 'https://assets.mixkit.co/sfx/preview/mixkit-fire-crackling-loop-3039.mp3' },
  { id: 'night', name: 'Night Sounds', icon: Moon, url: 'https://assets.mixkit.co/sfx/preview/mixkit-crickets-and-insects-in-the-night-2441.mp3' },
];

const LOFI_STREAMS = [
  { id: 'lofi-hiphop', name: 'Lofi Hip Hop', url: 'https://www.youtube.com/embed/jfKfPfyJRdk', thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/maxresdefault.jpg' },
  { id: 'chillhop', name: 'Chillhop Radio', url: 'https://www.youtube.com/embed/5yx6BWlEVcY', thumbnail: 'https://i.ytimg.com/vi/5yx6BWlEVcY/maxresdefault.jpg' },
  { id: 'jazz-bossa', name: 'Jazz & Bossa Nova', url: 'https://www.youtube.com/embed/Dx5qFachd3A', thumbnail: 'https://i.ytimg.com/vi/Dx5qFachd3A/maxresdefault.jpg' },
  { id: 'deep-focus', name: 'Deep Focus', url: 'https://www.youtube.com/embed/b1aM3HSXDIE', thumbnail: 'https://i.ytimg.com/vi/b1aM3HSXDIE/maxresdefault.jpg' },
];

// Global state for music player (simplified for this context)
export const musicPlayerState = {
  activeSounds: new Map<string, Howl>(),
  volumes: new Map<string, number>(),
  isPlaying: false,
  masterVolume: 0.5,
  listeners: new Set<() => void>(),
  
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },
  
  notify() {
    this.listeners.forEach(l => l());
  },

  toggleSound(sound: AmbientSound) {
    if (this.activeSounds.has(sound.id)) {
      const howl = this.activeSounds.get(sound.id);
      howl?.stop();
      this.activeSounds.delete(sound.id);
      this.volumes.delete(sound.id);
    } else {
      const howl = new Howl({
        src: [sound.url],
        loop: true,
        volume: this.masterVolume,
        html5: true
      });
      howl.play();
      this.activeSounds.set(sound.id, howl);
      this.volumes.set(sound.id, this.masterVolume);
    }
    this.isPlaying = this.activeSounds.size > 0;
    this.notify();
  },

  setSoundVolume(id: string, volume: number) {
    const howl = this.activeSounds.get(id);
    if (howl) {
      howl.volume(volume * this.masterVolume);
      this.volumes.set(id, volume);
      this.notify();
    }
  },

  setMasterVolume(volume: number) {
    this.masterVolume = volume;
    this.activeSounds.forEach((howl, id) => {
      const soundVol = this.volumes.get(id) || 1;
      howl.volume(soundVol * volume);
    });
    this.notify();
  },

  toggleAll() {
    if (this.isPlaying) {
      this.activeSounds.forEach(howl => howl.pause());
      this.isPlaying = false;
    } else {
      this.activeSounds.forEach(howl => howl.play());
      this.isPlaying = this.activeSounds.size > 0;
    }
    this.notify();
  }
};

const MusicPage: React.FC = () => {
  const [activeLofi, setActiveLofi] = useState<string | null>(null);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    return musicPlayerState.subscribe(() => forceUpdate({}));
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-12 pb-32">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <MusicIcon className="w-8 h-8 text-primary" />
          Study Music
        </h1>
        <p className="text-muted-foreground">Focus better with ambient sounds and curated lo-fi streams.</p>
      </header>

      {/* Ambient Sounds Grid */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Wind className="w-5 h-5 text-primary" />
          Ambient Sounds
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {AMBIENT_SOUNDS.map((sound) => {
            const isActive = musicPlayerState.activeSounds.has(sound.id);
            const volume = musicPlayerState.volumes.get(sound.id) || 1;
            const Icon = sound.icon;

            return (
              <div
                key={sound.id}
                className={cn(
                  "relative group p-6 rounded-2xl border transition-all cursor-pointer bg-card hover:bg-card/80",
                  isActive ? "border-primary ring-1 ring-primary/50 bg-primary/5" : "border-border"
                )}
                onClick={() => musicPlayerState.toggleSound(sound)}
              >
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className={cn(
                    "p-4 rounded-full transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground"
                  )}>
                    <Icon className="w-8 h-8" />
                  </div>
                  <span className="font-medium">{sound.name}</span>
                </div>

                {isActive && (
                  <div 
                    className="mt-6 px-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Volume2 className="w-4 h-4 text-muted-foreground" />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={(e) => musicPlayerState.setSoundVolume(sound.id, parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* YouTube Lo-fi Section */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          Lo-fi Radio 📻
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {LOFI_STREAMS.map((stream) => (
            <button
              key={stream.id}
              onClick={() => setActiveLofi(stream.id)}
              className={cn(
                "group relative aspect-video rounded-xl overflow-hidden border transition-all",
                activeLofi === stream.id ? "border-primary ring-2 ring-primary/50" : "border-border hover:border-primary/50"
              )}
            >
              <img 
                src={stream.thumbnail} 
                alt={stream.name}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Play className="w-10 h-10 text-white fill-white" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                <span className="text-sm font-medium text-white">{stream.name}</span>
              </div>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeLofi && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="aspect-video w-full rounded-2xl overflow-hidden border border-border bg-card shadow-2xl"
            >
              <iframe
                width="100%"
                height="100%"
                src={LOFI_STREAMS.find(s => s.id === activeLofi)?.url + "?autoplay=1"}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

export default MusicPage;
