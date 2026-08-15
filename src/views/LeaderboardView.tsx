import React from 'react';
import Leaderboard from '../components/Leaderboard';
import { User } from 'firebase/auth';
import { useUserStore } from '../store/useUserStore';

interface LeaderboardViewProps {
  user: User | null;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = () => {
  const { user, isGuest, authLoading } = useUserStore();
  
  if (authLoading) return null; // still loading
  if (isGuest) return null;     // guest blocked
  // user can be null briefly but authLoading covers that window

  return (
    <div className="animate-fade-up">
      <Leaderboard />
    </div>
  );
};
