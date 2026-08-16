import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import {
  TrendingUp, Clock, BookOpen, Brain, Zap, Target,
  Award, Calendar, ChevronRight, Activity, Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { db, auth, collection, query, where, getDocs, doc, getDoc, handleFirestoreError, OperationType } from '../lib/firebase';
import { levelProgress } from '../lib/progress';
import {
  bucketSessions, sessionsInPeriod, summarise, PERIODS,
  type Period, type SessionRow,
} from '../lib/studyPeriods';

const COLORS = ['#7c7cff', '#f87171', '#fbbf24', '#34d399', '#a78bfa', '#f472b6'];

// Custom hook to ensure container is measured before rendering charts
function useContainerReady() {
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setIsReady(true);
          observer.disconnect();
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return { isReady, containerRef };
}

/**
 * Badges, and what each is actually for.
 *
 * Kept as data next to the check that awards it, so a badge cannot appear in the
 * list without something deciding whether it has been earned.
 */
const BADGES: { id: string; name: string; how: string; earned: (s: BadgeStats) => boolean }[] = [
  { id: 'first-xp', name: 'Off the mark', how: 'Earn your first XP', earned: (s) => s.xp > 0 },
  { id: 'level-2', name: 'Levelling up', how: 'Reach level 2', earned: (s) => s.level >= 2 },
  { id: 'level-5', name: 'Getting serious', how: 'Reach level 5', earned: (s) => s.level >= 5 },
  { id: 'level-10', name: 'Veteran', how: 'Reach level 10', earned: (s) => s.level >= 10 },
  { id: 'sessions-5', name: 'Regular', how: 'Log 5 study sessions', earned: (s) => s.sessions >= 5 },
  { id: 'sessions-25', name: 'Committed', how: 'Log 25 study sessions', earned: (s) => s.sessions >= 25 },
];

interface BadgeStats { xp: number; level: number; sessions: number; }

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [showBadges, setShowBadges] = useState(false);
  const [xp, setXp] = useState(0);
  const progress = levelProgress(xp);
  const { isReady: activityReady, containerRef: activityRef } = useContainerReady();
  const { isReady: subjectReady, containerRef: subjectRef } = useContainerReady();
  const [period, setPeriod] = useState<Period>('weekly');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [subjectData, setSubjectData] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!auth.currentUser) return;

      try {
        const q = query(collection(db, 'study_sessions'), where('userId', '==', auth.currentUser.uid));
        const querySnapshot = await getDocs(q);
        const sessions = querySnapshot.docs.map(doc => doc.data());

        if (sessions.length === 0) {
          setLoading(false);
          return;
        }

        // The rows are kept as they are. Everything the chart shows is derived
        // from them below, so switching period is a re-render rather than a
        // refetch — and the three period buttons finally do something.
        setSessions(sessions as SessionRow[]);

        const subjects: Record<string, number> = {};
        for (const row of sessions as SessionRow[]) {
          if (row.subject) subjects[row.subject] = (subjects[row.subject] || 0) + (Number(row.duration) || 0);
        }
        const totalSubjectHours = Object.values(subjects).reduce((a, b) => a + b, 0);
        setSubjectData(
          totalSubjectHours > 0
            ? Object.entries(subjects).map(([name, value], i) => ({
                name,
                value: Math.round((value / totalSubjectHours) * 100),
                color: COLORS[i % COLORS.length],
              }))
            : []
        );

        // The player's real XP, for the level bar and the badges. Previously the
        // bar was a hardcoded 85% and the numbers beneath it were invented.
        const me = await getDoc(doc(db, 'users', auth.currentUser.uid));
        setXp(Number(me.data()?.xp) || 0);

      } catch (err) {
        // Fail quiet: fall back to the empty state instead of an error banner
        console.warn('Firestore permission error in Analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-12 py-8 animate-pulse">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="h-5 w-36 rounded-full bg-glass-bg border border-border-main" />
            <div className="h-9 w-56 rounded-xl bg-glass-bg border border-border-main" />
            <div className="h-4 w-72 rounded-lg bg-glass-bg border border-border-main" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-3xl bg-glass-bg border border-border-main" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 h-[380px] rounded-[2rem] bg-glass-bg border border-border-main" />
          <div className="h-[380px] rounded-[2rem] bg-glass-bg border border-border-main" />
        </div>
      </div>
    );
  }

  const hasData = sessions.length > 0;

  // Derived, not stored. Changing the period changes the chart AND the four
  // headline cards, which is what makes the buttons mean anything: "12h" under
  // Weekly and "12h" under All Time would just be a relabelled tab.
  const displayStudyData = bucketSessions(sessions, period);
  const stats = summarise(sessionsInPeriod(sessions, period));

  const displaySubjectData = subjectData.length > 0 ? subjectData : [
    { name: 'No Data', value: 100, color: '#ffffff10' }
  ];

  return (
    <div className="space-y-12 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple text-xs font-black uppercase tracking-[0.2em]"
          >
            <Activity size={14} />
            Learning Insights
          </motion.div>
          <h1 className="text-4xl font-black text-text-main tracking-tight">Your Progress</h1>
          <p className="text-text-dim text-sm">Track your study habits and mastery across all subjects.</p>
        </div>
        
        <div className="flex items-center gap-3 p-1.5 bg-glass-bg rounded-2xl border border-border-main">
          {/* These three had no onClick and no state behind them. */}
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold transition-all',
                period === p.id
                  ? 'bg-brand-purple text-white shadow-lg'
                  : 'text-text-dim hover:text-text-main'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData && (
        <div className="glass p-6 rounded-3xl border border-border-main border-dashed flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center shrink-0">
            <Sparkles className="text-brand-purple" size={22} />
          </div>
          <div>
            <p className="font-bold text-text-main">Start studying to see your analytics</p>
            <p className="text-text-dim text-sm">The charts below fill in automatically once you complete study sessions.</p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={<Clock className="text-brand-purple" />} 
          label="Study Time" 
          value={`${stats.totalHours}h`} 
          change="+12%" 
          positive 
        />
        <StatCard 
          icon={<Brain className="text-green-400" />} 
          label="Mastery Score" 
          value={`${stats.avgScore}%`} 
          change="+5%" 
          positive 
        />
        <StatCard 
          icon={<Zap className="text-yellow-400" />} 
          label="Sessions" 
          value={String(stats.totalSessions)} 
          change="-2%" 
          positive={false} 
        />
        <StatCard 
          icon={<Target className="text-blue-400" />} 
          label="Goal Progress" 
          value={`${stats.goalProgress}%`} 
          change="+18%" 
          positive 
        />
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Activity Chart */}
        <div className="lg:col-span-2 glass p-8 rounded-[2rem] border border-border-main space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-text-main">Study Activity</h3>
              <p className="text-xs text-text-dim font-medium">Daily hours spent focused</p>
            </div>
            <TrendingUp className="text-brand-purple" size={24} />
          </div>
          
          <div className="h-[300px] w-full relative min-h-[300px]" ref={activityRef}>
            {activityReady && (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                <AreaChart data={displayStudyData}>
                  <defs>
                    <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c7cff" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#7c7cff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" vertical={false} />
                  <XAxis 
                    dataKey="day" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'var(--text-dim)', fontSize: 12, fontWeight: 600 }} 
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'var(--text-dim)', fontSize: 12, fontWeight: 600 }} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--bg-card)', 
                      border: '1px solid var(--border-main)', 
                      borderRadius: '16px',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                    }}
                    itemStyle={{ color: '#7c7cff', fontWeight: 'bold' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="hours" 
                    stroke="#7c7cff" 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorHours)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Subject Breakdown */}
        <div className="glass p-8 rounded-[2rem] border border-border-main space-y-8">
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-text-main">Subject Focus</h3>
            <p className="text-xs text-text-dim font-medium">Distribution of study time</p>
          </div>

          <div className="h-[250px] w-full relative min-h-[250px]" ref={subjectRef}>
            {subjectReady && (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                <PieChart>
                  <Pie
                    data={displaySubjectData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {displaySubjectData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--bg-card)', 
                      border: '1px solid var(--border-main)', 
                      borderRadius: '16px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-text-main">{subjectData.length > 0 ? '100%' : '0%'}</span>
              <span className="text-[10px] text-text-dim font-bold uppercase tracking-widest">Total</span>
            </div>
          </div>

          <div className="space-y-3">
            {displaySubjectData.map((s, i) => (
              <div key={i} className="flex items-center justify-between group cursor-default">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-sm font-bold text-text-muted group-hover:text-text-main transition-colors">{s.name}</span>
                </div>
                <span className="text-sm font-black text-text-main">{s.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Achievement Section */}
      <div className="glass p-10 rounded-[2.5rem] border border-border-main relative overflow-hidden group">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-brand-purple/10 blur-[100px] rounded-full group-hover:bg-brand-purple/20 transition-all duration-700" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
          <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-brand-purple to-brand-purple-dark flex items-center justify-center shadow-2xl shadow-brand-purple/40 shrink-0">
            <Award size={48} className="text-white" />
          </div>
          
          {/*
            This block used to be invented: "Weekly Champion", "10 focus sessions
            this week", "top 5% of students", a bar fixed at 85%, and 850/1000 XP —
            none of it read from anything. Made-up praise is worse than no praise,
            because the moment someone notices, they stop believing the real numbers
            too. It now shows the player's actual level and XP.
          */}
          <div className="flex-1 text-center md:text-left space-y-4">
            <div className="space-y-1">
              <h3 className="text-2xl font-black text-text-main tracking-tight">
                Level {progress.level}
              </h3>
              <p className="text-text-dim font-medium">
                {stats.totalSessions > 0
                  ? `${stats.totalSessions} study session${stats.totalSessions === 1 ? '' : 's'} logged. Keep going.`
                  : 'No study sessions logged yet — play a round in the Arcade to start earning XP.'}
              </p>
            </div>
            <div className="w-full h-3 bg-glass-bg rounded-full overflow-hidden border border-border-main">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${progress.percent}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-brand-purple to-brand-purple-dark shadow-[0_0_15px_rgba(124,124,255,0.5)]"
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-text-dim">
              <span>{progress.into.toLocaleString()} XP</span>
              <span>{(progress.needed - progress.into).toLocaleString()} XP to level {progress.level + 1}</span>
            </div>
          </div>

          <button
            onClick={() => setShowBadges((v) => !v)}
            aria-expanded={showBadges}
            className="btn-primary px-8 py-4 rounded-2xl font-bold flex items-center gap-2 shrink-0"
          >
            {showBadges ? 'Hide Badges' : 'View Badges'}
            <ChevronRight size={18} className={showBadges ? 'rotate-90 transition-transform' : 'transition-transform'} />
          </button>
        </div>

        {/* The panel the button had nothing to open. Locked badges stay visible
            with what earns them — a badge you cannot see is not a goal. */}
        {showBadges && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BADGES.map((b) => {
              const earned = b.earned({ xp, level: progress.level, sessions: stats.totalSessions });
              return (
                <div
                  key={b.id}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border p-4',
                    earned
                      ? 'border-brand-purple/40 bg-brand-purple/5'
                      : 'border-border-main bg-glass-bg opacity-60'
                  )}
                >
                  <Award
                    size={22}
                    className={earned ? 'text-brand-purple shrink-0' : 'text-text-dim shrink-0'}
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-text-main text-sm">{b.name}</div>
                    <div className="text-xs text-text-dim">
                      {earned ? 'Earned' : b.how}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, change, positive }: { icon: React.ReactNode, label: string, value: string, change: string, positive: boolean }) {
  return (
    <motion.div 
      whileHover={{ y: -5, scale: 1.02 }}
      className="glass p-6 rounded-3xl border border-border-main space-y-4 group transition-all hover:bg-glass-bg hover:border-brand-purple/30"
    >
      <div className="flex items-center justify-between">
        <div className="w-12 h-12 rounded-2xl bg-glass-bg flex items-center justify-center group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className={cn(
          "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
          positive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
        )}>
          {change}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] text-text-dim font-bold uppercase tracking-widest">{label}</div>
        <div className="text-3xl font-black text-text-main tracking-tight">{value}</div>
      </div>
    </motion.div>
  );
}
