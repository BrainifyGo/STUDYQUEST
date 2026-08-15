import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Timer, Settings, Bell, Zap, Coffee, Brain } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const FocusTimerView: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'short' | 'long'>('focus');

  useEffect(() => {
    let interval: any = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === 'focus' ? 25 * 60 : mode === 'short' ? 5 * 60 : 15 * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const changeMode = (newMode: 'focus' | 'short' | 'long') => {
    setMode(newMode);
    setIsActive(false);
    setTimeLeft(newMode === 'focus' ? 25 * 60 : newMode === 'short' ? 5 * 60 : 15 * 60);
  };

  const totalTime = mode === 'focus' ? 25 * 60 : mode === 'short' ? 5 * 60 : 15 * 60;
  const progress = timeLeft / totalTime;
  const dashOffset = 955 - (955 * progress);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
          Focus Timer ⏱️
        </h1>
        <p className="text-gray-500 font-medium mt-1">Boost your productivity with the Pomodoro technique</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Timer Section */}
        <div className="lg:col-span-8 flex flex-col items-center justify-center space-y-12 py-12 card-bright relative overflow-hidden">
          {/* Background Decoration */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.03)_0%,transparent_70%)]" />
          
          {/* Mode Selector */}
          <div className="flex bg-gray-100 rounded-2xl p-1.5 relative z-10">
            {[
              { id: 'focus', label: 'Focus', icon: Brain },
              { id: 'short', label: 'Short Break', icon: Coffee },
              { id: 'long', label: 'Long Break', icon: Timer },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => changeMode(m.id as any)}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                  mode === m.id 
                    ? "bg-white text-primary shadow-sm" 
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-200/50"
                )}
              >
                <m.icon size={16} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          {/* Timer Display */}
          <div className="relative flex flex-col items-center justify-center">
            <div className="w-80 h-80 rounded-full border-8 border-gray-100 flex items-center justify-center relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="160"
                  cy="160"
                  r="152"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-primary/10"
                />
                <motion.circle
                  cx="160"
                  cy="160"
                  r="152"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray="955"
                  animate={{ strokeDashoffset: dashOffset }}
                  className="text-primary"
                />
              </svg>
              <div className="text-center space-y-2 relative z-10">
                <span className="text-7xl font-black text-white tracking-tighter tabular-nums">
                  {formatTime(timeLeft)}
                </span>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  {mode === 'focus' ? 'Time to Focus' : 'Take a Break'}
                </p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6 relative z-10">
            <button 
              onClick={resetTimer}
              className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all flex items-center justify-center"
            >
              <RotateCcw size={24} />
            </button>
            <button 
              onClick={toggleTimer}
              className="w-24 h-24 rounded-[2rem] bg-primary text-white shadow-xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
            >
              {isActive ? <Pause size={40} fill="white" /> : <Play size={40} fill="white" className="ml-1" />}
            </button>
            <button className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all flex items-center justify-center">
              <Settings size={24} />
            </button>
          </div>
        </div>

        {/* Stats Section */}
        <div className="lg:col-span-4 space-y-8">
          <div className="card-bright p-8 space-y-6">
            <h3 className="text-xl font-bold text-white">Today's Progress</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-primary/5 space-y-1">
                <p className="text-2xl font-black text-primary">4</p>
                <p className="text-[10px] font-black text-primary/60 uppercase tracking-widest">Sessions</p>
              </div>
              <div className="p-4 rounded-2xl bg-secondary/5 space-y-1">
                <p className="text-2xl font-black text-secondary">100m</p>
                <p className="text-[10px] font-black text-secondary/60 uppercase tracking-widest">Focused</p>
              </div>
            </div>
          </div>

          <div className="card-bright p-8 space-y-6">
            <h3 className="text-xl font-bold text-white">Focus Goals</h3>
            <div className="space-y-4">
              {[
                { label: 'Daily Goal', progress: 4, total: 8, color: 'bg-primary' },
                { label: 'Weekly Goal', progress: 24, total: 40, color: 'bg-secondary' },
              ].map((goal, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-gray-700">{goal.label}</span>
                    <span className="text-gray-400">{goal.progress}/{goal.total}</span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", goal.color)} style={{ width: `${(goal.progress / goal.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
