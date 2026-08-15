import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useUserStore } from '../store/useUserStore';
import { cn } from '../lib/utils';

interface HelpButtonProps {
  className?: string;
}

export const HelpButton: React.FC<HelpButtonProps> = ({ className }) => {
  const { setShowOnboarding } = useUserStore();

  return (
    <div className={cn("fixed bottom-6 left-6 z-50", className)}>
      <button
        onClick={() => setShowOnboarding(true)}
        className="group relative flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 hover:border-primary/60 transition-all shadow-lg shadow-primary/10"
        aria-label="Help & Tutorial"
      >
        <HelpCircle className="w-5 h-5" />
        
        {/* Tooltip */}
        <div className="absolute left-full ml-3 px-2 py-1 bg-popover text-popover-foreground text-xs rounded border border-border opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-xl">
          Help & Tutorial
        </div>
      </button>
    </div>
  );
};
