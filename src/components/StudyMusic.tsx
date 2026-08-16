import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Music, X, Play, Pause, Volume2, Headphones, Wind, Coffee, Trees, Sparkles, CloudRain, Waves, TreePine, Ghost, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import {
  startAmbience, stopAmbience, setAmbienceVolume, stopAllAmbience,
  type AmbienceId,
} from '../lib/ambience';
import {
  FOCUS_TONES, playFocusTone, stopFocusTone, setFocusVolume,
  type FocusToneId,
} from '../lib/focusTones';

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
  // Deep Focus and Alpha Waves used to be YouTube embeds here. They are
  // generated now (src/lib/focusTones.ts) — the whole Focus tab works with no
  // network at all, which is the only way to stop it breaking again.
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

/*
  Generated, not downloaded.

  These used to be four hotlinked MP3s from mixkit's sound-EFFECT preview
  endpoint. Measured: 7 KB to 42 KB each, i.e. between half a second and two
  seconds of audio. Set to loop, a half-second forest clip restarts twice a
  second and every seam is a click — which is precisely how they sounded.
  See src/lib/ambience.ts.
*/
const AMBIENT_SOUNDS: { id: AmbienceId; name: string; icon: React.ReactNode }[] = [
  { id: 'rain', name: 'Rain', icon: <CloudRain size={16} /> },
  { id: 'waves', name: 'Waves', icon: <Waves size={16} /> },
  { id: 'forest', name: 'Forest', icon: <TreePine size={16} /> },
  { id: 'white-noise', name: 'Static', icon: <Zap size={16} /> },
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
  
  const playerFrameRef = useRef<HTMLIFrameElement>(null);
  /** Track id -> why it would not play. Empty when everything is fine. */
  const [failedTracks, setFailedTracks] = useState<Record<string, string>>({});

  /*
    YouTube reports embed failures by posting a message to the parent, but only
    once the player has been told to listen. Without this the iframe fails
    completely silently.
  */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin)) return;
      let payload: any;
      try { payload = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }

      if (payload?.event === 'onReady') {
        // Ask for events; YouTube stays quiet until it is asked.
        playerFrameRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: 'listening', id: 1 }), 'https://www.youtube.com'
        );
        return;
      }

      if (payload?.event === 'onError' && activeTrackIdRef.current) {
        // 101 and 150 are the same thing: the owner disallowed embedding.
        const code = Number(payload.info);
        const why = code === 2 ? 'The link for this track is wrong — please report it.'
                  : code === 5 ? 'This browser cannot play it.'
                  : code === 100 ? 'The video has been removed from YouTube.'
                  : (code === 101 || code === 150) ? 'The owner does not allow it to play inside other sites.'
                  : 'It would not load. Some school and office networks block YouTube.';
        setFailedTracks((prev) => ({ ...prev, [activeTrackIdRef.current!]: why }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    // Leaving the panel stops the sound. A layer still playing after the player
    // is closed has no control anywhere on screen.
    return () => stopAllAmbience();
  }, []);

  const toggleAmbient = (id: AmbienceId) => {
    const wasActive = activeAmbients[id].active;
    try {
      if (wasActive) stopAmbience(id);
      else startAmbience(id, activeAmbients[id].volume);
    } catch (err) {
      // Only reachable on a browser with no Web Audio at all.
      console.warn('[ambience]', err);
      toast.error('Your browser will not play ambient sound.');
      return;
    }
    setActiveAmbients(prev => ({ ...prev, [id]: { ...prev[id], active: !wasActive } }));
  };

  const handleVolumeChange = (id: AmbienceId, volume: number) => {
    setActiveAmbients(prev => ({ ...prev, [id]: { ...prev[id], volume } }));
    setAmbienceVolume(id, volume);
  };

  const [activeTone, setActiveTone] = useState<FocusToneId | null>(null);
  const [toneVolume, setToneVolume] = useState(0.5);

  useEffect(() => () => stopFocusTone(), []);

  const toggleTone = (id: FocusToneId) => {
    if (activeTone === id) {
      stopFocusTone();
      setActiveTone(null);
      return;
    }
    try {
      playFocusTone(id, toneVolume);
      setActiveTone(id);
      // A generated tone replaces a video; two things playing at once is a mess.
      setActiveTrackId(null);
    } catch (err) {
      console.warn('[focus]', err);
      toast.error('Your browser will not play generated audio.');
    }
  };

  const activeTrackIdRef = useRef<string | null>(null);
  useEffect(() => { activeTrackIdRef.current = activeTrackId; }, [activeTrackId]);

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

      {/*
        Now playing.

        The iframe used to be dropped in with `autoplay=1` and nothing watching
        it. When YouTube refuses to play a video in an embed — the owner
        disabled embedding, the stream ended, the network blocks youtube.com, or
        a phone refuses to autoplay — the result was a silent black rectangle
        with no explanation and no way out, which is why "the music doesn't
        work" covered four completely different causes.

        The player now reports. `enablejsapi` plus an origin lets YouTube post
        errors back, and anything that goes wrong is named, with a link out to
        the track so the student can still listen to it.
      */}
      {activeTrack && (
        <div className="p-4 aspect-video bg-black/40 relative group">
          {failedTracks[activeTrack.id] ? (
            <div className="w-full h-full rounded-2xl border border-border-main flex flex-col items-center justify-center text-center gap-3 p-6">
              <Music className="text-text-dim" size={28} />
              <p className="text-sm font-bold text-text-main">{activeTrack.title} will not play here</p>
              <p className="text-xs text-text-dim max-w-xs">{failedTracks[activeTrack.id]}</p>
              <a
                href={`https://www.youtube.com/watch?v=${activeTrack.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-brand-purple hover:underline"
              >
                Open it on YouTube
              </a>
            </div>
          ) : (
            <iframe
              key={activeTrack.id}
              ref={playerFrameRef}
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${activeTrack.id}?autoplay=1&controls=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
              title={activeTrack.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="rounded-2xl w-full h-full border-0"
            />
          )}
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

      {/* Focus tones — generated, so this tab cannot go dark. */}
      {activeCategory === 'Focus' && (
        <div className="p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-text-dim">
            Generated in your browser — works offline
          </p>
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
                <div className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                  isOn ? 'bg-brand-purple text-white' : 'bg-black/20 text-text-dim'
                )}>
                  {isOn ? <Pause size={16} /> : <Play size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text-main">{tone.title}</p>
                  <p className="text-[11px] text-text-dim leading-snug">{tone.blurb}</p>
                </div>
              </button>
            );
          })}

          {activeTone && (
            <div className="flex items-center gap-2 pt-1">
              <Volume2 size={14} className="text-text-dim shrink-0" />
              <input
                type="range"
                min="0" max="1" step="0.01"
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
            These are tones and noise, described by how they sound. We make no
            claim that they change how well you concentrate.
          </p>
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
