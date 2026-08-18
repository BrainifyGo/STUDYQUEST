import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, RotateCcw, Coffee, Zap, Brain, Bell, Settings, CheckCircle2, Sparkles, ShieldCheck, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useUserStore, TIMER_DURATIONS, TimerMode } from '../store/useUserStore';

const MODES: Record<TimerMode, { label: string, time: number, color: string, icon: any }> = {
  work: { label: 'Focus Time', time: TIMER_DURATIONS.work, color: 'text-brand-purple', icon: Brain },
  shortBreak: { label: 'Short Break', time: TIMER_DURATIONS.shortBreak, color: 'text-green-400', icon: Coffee },
  longBreak: { label: 'Long Break', time: TIMER_DURATIONS.longBreak, color: 'text-blue-400', icon: Zap },
};

export default function FocusTimer() {
  const {
    timerMode: mode,
    setTimerMode: setMode,
    timerTimeLeft: timeLeft,
    setTimerTimeLeft: setTimeLeft,
    timerIsRunning: isActive,
    setTimerIsRunning: setIsActive,
    timerSessionCount: sessionsCompleted,
  } = useUserStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showFocusAgreement, setShowFocusAgreement] = useState(true);
  const [isCommitted, setIsCommitted] = useState(false);

  const startFocusSession = () => {
    setShowFocusAgreement(false);
    setIsActive(true);
  };

  const toggleTimer = () => {
    if (!isActive && mode === 'work' && showFocusAgreement) {
      // Show agreement before starting work session
      return;
    }
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(MODES[mode].time);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = (timeLeft / MODES[mode].time) * 100;
  const ModeIcon = MODES[mode].icon;

  // py-12 alone left the play / reset / settings row sitting under the fixed
  // mobile bottom nav — the controls were there, just half covered.
  return (
    <div className="flex flex-col items-center justify-center space-y-8 sm:space-y-12 py-8 sm:py-12 pb-28 lg:pb-12 relative">
      <AnimatePresence>
        {showFocusAgreement && mode === 'work' && !isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md glass-panel rounded-[2rem] sm:rounded-[2.5rem] border border-border-main p-6 sm:p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-purple to-transparent opacity-50" />
              
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-16 h-16 rounded-3xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center">
                  <Brain className="text-brand-purple" size={32} />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-text-main">Ready to Focus?</h2>
                  <p className="text-text-dim text-sm">
                    Commit to this session for maximum productivity.
                  </p>
                </div>

                <div className="w-full space-y-4 text-left bg-black/20 p-6 rounded-3xl border border-border-main">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="text-brand-purple shrink-0 mt-0.5" size={18} />
                    <span className="text-sm text-text-main font-medium">No social media or distractions</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="text-brand-purple shrink-0 mt-0.5" size={18} />
                    <span className="text-sm text-text-main font-medium">One task at a time</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="text-brand-purple shrink-0 mt-0.5" size={18} />
                    <span className="text-sm text-text-main font-medium">Deep work state only</span>
                  </div>
                </div>

                <div className="w-full flex items-center justify-between p-4 bg-brand-purple/5 rounded-2xl border border-brand-purple/20">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="text-brand-purple" size={18} />
                    <span className="text-xs font-bold text-text-main">I'm committing to this session</span>
                  </div>
                  <button 
                    onClick={() => setIsCommitted(!isCommitted)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      isCommitted ? "bg-brand-purple" : "bg-white/10"
                    )}
                  >
                    <motion.div 
                      animate={{ x: isCommitted ? 24 : 4 }}
                      className="absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>

                <div className="w-full space-y-3">
                  <button
                    disabled={!isCommitted}
                    onClick={startFocusSession}
                    className={cn(
                      "w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2",
                      isCommitted 
                        ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20 hover:scale-[1.02]" 
                        : "bg-white/5 text-text-dim cursor-not-allowed"
                    )}
                  >
                    Start Focus Session <Play size={16} fill="currentColor" />
                  </button>
                  <button 
                    onClick={() => setShowFocusAgreement(false)}
                    className="text-[10px] font-black uppercase tracking-widest text-text-dim hover:text-text-main transition-all"
                  >
                    Skip agreement
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/40 text-xs font-bold uppercase tracking-[0.2em]"
        >
          Pomodoro Timer
        </motion.div>
        <h1 className="text-4xl font-black text-white">Stay Focused</h1>
        <p className="text-white/40 text-sm max-w-xs mx-auto">
          Use the Pomodoro technique to maintain high levels of productivity and avoid burnout.
        </p>
      </div>

      {/* Timer Circle */}
      <div className="relative w-80 h-80 flex items-center justify-center">
        {/* Background Ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90 transform">
          <circle
            cx="160"
            cy="160"
            r="140"
            className="stroke-white/5 fill-none"
            strokeWidth="12"
          />
          <motion.circle
            cx="160"
            cy="160"
            r="140"
            className={cn("fill-none transition-colors duration-500", 
              mode === 'work' ? 'stroke-brand-purple' : 
              mode === 'shortBreak' ? 'stroke-green-400' : 'stroke-blue-400'
            )}
            strokeWidth="12"
            strokeDasharray={2 * Math.PI * 140}
            initial={{ strokeDashoffset: 2 * Math.PI * 140 }}
            animate={{ strokeDashoffset: (2 * Math.PI * 140) * (progress / 100) }}
            strokeLinecap="round"
          />
        </svg>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center space-y-2">
          <motion.div 
            key={mode}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={cn("flex items-center gap-2 font-black uppercase tracking-[0.2em] text-xs", MODES[mode].color)}
          >
            <ModeIcon size={14} fill="currentColor" />
            {MODES[mode].label}
          </motion.div>
          <div className="text-7xl font-black text-white font-mono tracking-tighter">
            {formatTime(timeLeft)}
          </div>
          <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest">
            Session {sessionsCompleted + 1}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6">
        <button 
          onClick={resetTimer}
          className="p-4 rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
        >
          <RotateCcw size={24} />
        </button>
        
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleTimer}
          className={cn(
            "w-20 h-20 rounded-3xl flex items-center justify-center text-white shadow-2xl transition-all duration-300",
            isActive ? 'bg-red-500 shadow-red-500/20' : 'bg-brand-purple shadow-brand-purple/20'
          )}
        >
          {isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
        </motion.button>

        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-4 rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
        >
          <Settings size={24} />
        </button>
      </div>

      {/* Mode Selector */}
      <div className="flex p-1.5 bg-white/5 rounded-2xl border border-white/10">
        {(Object.keys(MODES) as TimerMode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setTimeLeft(MODES[m].time);
              setIsActive(false);
            }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-xs font-bold transition-all",
              mode === m ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white'
            )}
          >
            {MODES[m].label.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-12 pt-12 border-t border-white/5 w-full max-w-md">
        <div className="text-center space-y-1">
          <div className="text-2xl font-black text-white">{sessionsCompleted}</div>
          <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Sessions</div>
        </div>
        <div className="text-center space-y-1">
          <div className="text-2xl font-black text-white">{Math.floor((sessionsCompleted * 25) / 60)}h</div>
          <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Focused</div>
        </div>
        <div className="text-center space-y-1">
          <div className="text-2xl font-black text-white">4</div>
          <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Goal</div>
        </div>
      </div>
    </div>
  );
}
