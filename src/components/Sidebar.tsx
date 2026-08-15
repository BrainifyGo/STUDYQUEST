import React from 'react';
import { useUserStore } from '../store/useUserStore';
import { 
  LayoutDashboard, 
  Library, 
  Trophy, 
  Users, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Zap,
  BarChart3,
  Calendar,
  Timer,
  Music,
  Mic
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { GuestGuard } from './GuestGuard';

interface SidebarProps {
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ className }) => {
  const { 
    activeView, 
    setActiveView, 
    userData, 
    sidebarCollapsed, 
    setSidebarCollapsed,
    setShowMusic,
    setShowVoiceBuddy
  } = useUserStore();

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'library', icon: Library, label: 'Library' },
    { id: 'analytics', icon: BarChart3, label: 'Analytics' },
    { id: 'planner', icon: Calendar, label: 'Study Planner' },
    { id: 'leaderboard', icon: Trophy, label: 'Leaderboard' },
    { id: 'timer', icon: Timer, label: 'Focus Timer' },
    { id: 'collab', icon: Users, label: 'Study Rooms' },
    { id: 'music', icon: Music, label: 'Study Music' },
    { id: 'voice', icon: Mic, label: 'Voice Buddy' },
    { id: 'upgrade', icon: Zap, label: 'Upgrade' },
  ];

  return (
    <motion.aside 
      initial={false}
      animate={{ width: sidebarCollapsed ? 80 : 260 }}
      className={cn(
        "flex flex-col bg-sidebar-bg text-white h-screen fixed left-0 top-0 transition-all duration-300 z-50 border-r border-white/10",
        className
      )}
    >
      {/* Logo Area */}
      <div className="p-6 flex items-center justify-between relative">
        <div className={cn("flex items-center gap-3", sidebarCollapsed && "mx-auto")}>
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
            <Zap className="text-white fill-white" size={24} />
          </div>
          {!sidebarCollapsed && (
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xl font-black tracking-tighter text-white"
            >
              Brainify <span className="text-secondary">AI</span>
            </motion.span>
          )}
        </div>
        
        <button 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-10 w-6 h-6 bg-primary rounded-full flex items-center justify-center text-white shadow-lg z-50 hover:scale-110 transition-transform"
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;

          const button = (
            <button
              onClick={() => {
                if (item.id === 'music') setShowMusic(true);
                else if (item.id === 'voice') setShowVoiceBuddy(true);
                else setActiveView(item.id);
              }}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl transition-all group relative",
                isActive 
                  ? "bg-white/15 text-white border-l-[3px] border-secondary rounded-l-none" 
                  : "text-white/70 hover:text-white hover:bg-white/10",
                sidebarCollapsed && "justify-center px-0"
              )}
            >
              <Icon size={20} className={cn(
                "shrink-0 transition-transform group-hover:scale-110",
                isActive ? "stroke-[2.5px]" : "stroke-[2px]"
              )} />
              {!sidebarCollapsed && (
                <motion.span 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-sm font-bold tracking-tight"
                >
                  {item.label}
                </motion.span>
              )}
              
              {/* Tooltip for collapsed state */}
              {sidebarCollapsed && (
                <div className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
                  {item.label}
                </div>
              )}
            </button>
          );

          // Wrap specific items with GuestGuard
          if (['library', 'analytics', 'planner', 'leaderboard', 'collab'].includes(item.id)) {
            return (
              <GuestGuard key={item.id} featureName={item.label}>
                {button}
              </GuestGuard>
            );
          }

          return <React.Fragment key={item.id}>{button}</React.Fragment>;
        })}
      </nav>

      {/* Pro Upgrade Card */}
      {!sidebarCollapsed && (
        <div className="p-4 mx-4 mb-4 bg-gradient-to-br from-[#7c3aed] to-[#ec4899] rounded-2xl relative overflow-hidden group">
          <div className="absolute -right-2 -top-2 text-white/20 rotate-12 group-hover:rotate-45 transition-transform">
            <Zap size={48} />
          </div>
          <div className="flex items-center gap-2 text-white">
            <Zap size={16} className="fill-white" />
            <span className="text-xs font-black uppercase tracking-widest">Go Pro</span>
          </div>
          <p className="text-[10px] text-white/80 font-medium leading-relaxed mt-2">
            Unlock unlimited generations, priority AI & more
          </p>
          <button 
            onClick={() => setActiveView('upgrade')}
            className="w-full mt-3 py-2 bg-white text-primary text-xs font-bold rounded-lg shadow-lg hover:bg-white/90 transition-all"
          >
            Upgrade Now →
          </button>
        </div>
      )}

      {/* Bottom User Card */}
      <div className="p-4 border-t border-white/10 bg-sidebar-bg">
        <div className={cn(
          "flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/10",
          sidebarCollapsed && "justify-center"
        )}>
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 overflow-hidden shrink-0">
            {userData?.photoURL ? (
              <img src={userData.photoURL} alt={userData.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-primary font-black text-xs">
                {userData?.displayName?.charAt(0) || 'U'}
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black tracking-tight text-white truncate leading-none">{userData?.displayName || 'User'}</p>
              <div className="inline-flex mt-1 px-1.5 py-0.5 rounded-md bg-primary/20 text-primary text-[8px] font-black uppercase tracking-widest">
                {userData?.isPro ? 'PRO PLAN' : 'FREE PLAN'}
              </div>
            </div>
          )}
          {!sidebarCollapsed && (
            <button 
              onClick={() => setActiveView('settings')}
              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
};
