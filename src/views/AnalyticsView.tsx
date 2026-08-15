import React from 'react';
import { BarChart3, TrendingUp, Calendar, Target, Award, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { useUserStore } from '../store/useUserStore';

export const AnalyticsView: React.FC = () => {
  const { user, isGuest, authLoading } = useUserStore();
  
  if (authLoading) return null; // still loading
  if (isGuest) return null;     // guest blocked
  // user can be null briefly but authLoading covers that window

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
          Analytics 📊
        </h1>
        <p className="text-gray-500 font-medium mt-1">Track your study progress and performance</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Study Time', value: '42.5h', icon: Clock, color: 'text-primary', bg: 'bg-primary/5' },
          { label: 'Kits Generated', value: '128', icon: BarChart3, color: 'text-secondary', bg: 'bg-secondary/5' },
          { label: 'Avg. Quiz Score', value: '85%', icon: Target, color: 'text-success', bg: 'bg-success/5' },
          { label: 'Current Streak', value: '12 Days', icon: TrendingUp, color: 'text-orange-500', bg: 'bg-orange-50/50' },
        ].map((stat, i) => (
          <div key={i} className="card-bright p-6 flex items-center gap-4">
            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", stat.bg, stat.color)}>
              <stat.icon size={28} />
            </div>
            <div>
              <p className="text-2xl font-black text-white">{stat.value}</p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-bright p-8 space-y-6">
          <h3 className="text-xl font-bold text-white">Weekly Activity</h3>
          <div className="h-64 bg-gray-50 rounded-2xl flex items-end justify-between p-6 gap-2">
            {[40, 70, 45, 90, 65, 80, 50].map((height, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div 
                  className="w-full bg-primary/20 rounded-t-lg transition-all hover:bg-primary/40 cursor-pointer" 
                  style={{ height: `${height}%` }}
                />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-bright p-8 space-y-6">
          <h3 className="text-xl font-bold text-white">Subject Distribution</h3>
          <div className="space-y-4">
            {[
              { label: 'Physics', value: 75, color: 'bg-primary' },
              { label: 'History', value: 45, color: 'bg-secondary' },
              { label: 'Mathematics', value: 90, color: 'bg-success' },
              { label: 'Biology', value: 30, color: 'bg-orange-500' },
            ].map((subject, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-gray-700">{subject.label}</span>
                  <span className="text-gray-400">{subject.value}%</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", subject.color)} style={{ width: `${subject.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
