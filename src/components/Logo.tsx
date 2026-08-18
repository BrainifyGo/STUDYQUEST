import React from 'react';
import { cn } from '../lib/utils';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ className, showText = true, size = 62 }) => {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img
        src="/logo-brain-transparent.png"
        alt="StudyQuest logo"
        width={size}
        height={size}
        className="object-contain drop-shadow-lg"
      />
      {/* The wordmark was text-white, so "Study" vanished in light mode and the
          logo read as just "Quest". The token follows the theme. */}
      {showText && (
        <span className="text-xl font-black tracking-tighter text-text-main">
          Study<span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Quest</span>
        </span>
      )}
    </div>
  );
};
