import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useUserStore, TIMER_DURATIONS } from '../store/useUserStore';

// Mounted once at the app root so the Focus Timer keeps counting down
// even while the user is on a different view.
export default function TimerEngine() {
  const {
    timerTimeLeft,
    timerIsRunning,
    timerMode,
    timerSessionCount,
    activeView,
    decrementTimerTimeLeft,
    setTimerIsRunning,
    setTimerMode,
    setTimerTimeLeft,
    setTimerSessionCount,
    setActiveView,
  } = useUserStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerIsRunning && timerTimeLeft > 0) {
      intervalRef.current = setInterval(() => {
        decrementTimerTimeLeft();
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerIsRunning, timerTimeLeft, decrementTimerTimeLeft]);

  useEffect(() => {
    if (!timerIsRunning || timerTimeLeft !== 0) return;

    setTimerIsRunning(false);
    new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {});

    const onFocusView = activeView === 'focus';
    if (timerMode === 'work') {
      const newCount = timerSessionCount + 1;
      setTimerSessionCount(newCount);
      const nextMode = newCount % 4 === 0 ? 'longBreak' : 'shortBreak';
      setTimerMode(nextMode);
      setTimerTimeLeft(TIMER_DURATIONS[nextMode]);
    } else {
      setTimerMode('work');
      setTimerTimeLeft(TIMER_DURATIONS.work);
    }

    if (!onFocusView) {
      toast('Focus session complete. Time for a break.', {
        action: {
          label: 'View Timer',
          onClick: () => setActiveView('focus'),
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerTimeLeft, timerIsRunning]);

  useEffect(() => {
    if (timerIsRunning) {
      const m = Math.floor(timerTimeLeft / 60).toString().padStart(2, '0');
      const s = (timerTimeLeft % 60).toString().padStart(2, '0');
      document.title = `Focusing ${m}:${s} — StudyQuest`;
    } else {
      document.title = 'StudyQuest — Study Smarter';
    }
  }, [timerIsRunning, timerTimeLeft]);

  return null;
}
