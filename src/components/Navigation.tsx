import React from 'react';
import { Layout, FolderOpen, BarChart3, FileText, Settings } from 'lucide-react';
import { useUserStore } from '../store/useUserStore';
import { cn } from '../lib/utils';

export const Navigation: React.FC = () => {
  const { activeView, setActiveView } = useUserStore();

  /*
    Five slots, and everything not in them lives behind the hamburger — where,
    on a phone, most people never look. So what earns a slot is what the app is
    for, not what is pleasant to have.

    Past Papers took Focus's place. Practising real questions and being told why
    the marks went is the reason to open StudyQuest; a pomodoro timer is a nice
    extra that every phone already has built in. Focus is still one tap away in
    the menu.
  */
  const navItems = [
    { id: 'dashboard', label: 'Home', icon: Layout },
    { id: 'library', label: 'Library', icon: FolderOpen },
    { id: 'paper', label: 'Papers', icon: FileText },
    { id: 'analytics', label: 'Stats', icon: BarChart3 },
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
