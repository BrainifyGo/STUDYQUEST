import React from 'react';
import { useUserStore } from '../store/useUserStore';
import { Lock } from 'lucide-react';
import { cn } from '../lib/utils';

interface GuestGuardProps {
  children: React.ReactNode;
  featureName: string;
}

export const GuestGuard: React.FC<GuestGuardProps> = ({ children, featureName }) => {
  const { authLoading, isGuest } = useUserStore();

  // Return null during auth loading to prevent UI flash
  if (authLoading) {
    return null;
  }

  // Show locked overlay for guests
  if (isGuest) {
    return (
      <div className="relative w-full">
        <div className="opacity-40 pointer-events-none filter blur-[1px]">
          {children}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[1px] rounded-xl z-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <Lock className="text-white/90" size={16} />
            <p className="text-white font-bold text-[10px] leading-tight">
              Sign up to unlock
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render children normally for authenticated users
  return <>{children}</>;
};
