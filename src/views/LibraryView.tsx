import React from 'react';
import Library from '../components/Library';
import { useUserStore } from '../store/useUserStore';

interface LibraryViewProps {
  history: any[];
  onOpenItem: (item: any) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onOpenItem }) => {
  const { user, isGuest, authLoading } = useUserStore();
  
  if (authLoading) return null; // still loading
  if (isGuest) return null;     // guest blocked
  // user can be null briefly but authLoading covers that window

  return (
    <div className="animate-fade-up">
      <Library onOpenItem={onOpenItem} />
    </div>
  );
};
