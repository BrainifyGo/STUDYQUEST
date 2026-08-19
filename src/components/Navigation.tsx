import React from 'react';
import { Layout, FolderOpen, BarChart3, Clock, Settings } from 'lucide-react';
import { useUserStore } from '../store/useUserStore';
import { cn } from '../lib/utils';

export const Navigation: React.FC = () => {
  const { activeView, setActiveView } = useUserStore();

  const navItems = [
    { id: 'dashboard', label: 'Home', icon: Layout },
    { id: 'library', label: 'Library', icon: FolderOpen },
    { id: 'analytics', label: 'Stats', icon: BarChart3 },
    { id: 'focus', label: 'Focus', icon: Clock },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="hide-when-typing lg:hidden fixed bottom-0 left-0 right-0 glass-panel border-t border-border-main px-4 py-2 flex items-center justify-between z-50" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;

        return (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 transition-all min-w-11 min-h-11",
              isActive ? "text-brand-purple" : "text-text-dim"
            )}
          >
            <Icon size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
