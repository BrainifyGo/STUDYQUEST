import React from 'react';
import { Calendar, Clock, Plus, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useUserStore } from '../store/useUserStore';

export const StudyPlannerView: React.FC = () => {
  const { user, isGuest, authLoading } = useUserStore();
  
  if (authLoading) return null; // still loading
  if (isGuest) return null;     // guest blocked
  // user can be null briefly but authLoading covers that window

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
            Study Planner 📅
          </h1>
          <p className="text-gray-500 font-medium mt-1">Plan your study sessions and track your progress</p>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-vibrant px-6 py-3 flex items-center gap-2">
            <Plus size={20} />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Calendar / Upcoming */}
        <div className="lg:col-span-8 space-y-8">
          <div className="card-bright p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Today's Schedule</h3>
              <span className="text-sm font-bold text-primary">April 4, 2026</span>
            </div>

            <div className="space-y-4">
              {[
                { time: '09:00 AM', task: 'Physics Midterm Prep', category: 'Physics', completed: true },
                { time: '11:30 AM', task: 'History Summary Generation', category: 'History', completed: false },
                { time: '02:00 PM', task: 'Math Quiz Practice', category: 'Math', completed: false },
                { time: '04:30 PM', task: 'Biology Flashcards Review', category: 'Biology', completed: false },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-6 p-4 rounded-2xl border border-gray-100 hover:border-primary/20 transition-all group">
                  <div className="w-20 pt-1 shrink-0">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">{item.time}</span>
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <div className="space-y-1">
                      <h4 className={cn("font-bold text-white", item.completed && "line-through text-gray-400")}>{item.task}</h4>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.category}</span>
                    </div>
                    <button className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                      item.completed ? "bg-success/10 text-success" : "bg-gray-100 text-gray-300 hover:bg-primary/10 hover:text-primary"
                    )}>
                      {item.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Goals / Stats */}
        <div className="lg:col-span-4 space-y-8">
          <div className="card-bright p-8 space-y-6">
            <h3 className="text-xl font-bold text-white">Weekly Goals</h3>
            <div className="space-y-6">
              {[
                { goal: '10 Study Kits', progress: 7, total: 10, color: 'bg-primary' },
                { goal: '5 Quiz Masteries', progress: 2, total: 5, color: 'bg-secondary' },
                { goal: '20h Study Time', progress: 12.5, total: 20, color: 'bg-success' },
              ].map((goal, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-gray-700">{goal.goal}</span>
                    <span className="text-gray-400">{goal.progress}/{goal.total}</span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", goal.color)} style={{ width: `${(goal.progress / goal.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-bright p-8 bg-gradient-to-br from-primary to-secondary text-white space-y-4">
            <h3 className="text-xl font-bold">Plan your week</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Use the AI Study Planner to automatically generate a schedule based on your exams.
            </p>
            <button className="w-full py-3 bg-white text-primary font-black text-xs rounded-xl shadow-lg hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
              <span>Try AI Planner</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
