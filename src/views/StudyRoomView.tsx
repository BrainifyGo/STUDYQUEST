import React from 'react';
import CollaborativeRoom from '../components/CollaborativeRoom';
import { User } from 'firebase/auth';

interface StudyRoomViewProps {
  roomId: string | null;
  user: User | null;
}

export const StudyRoomView: React.FC<StudyRoomViewProps> = ({ roomId, user }) => {
  return (
    <div className="animate-fade-up h-full">
      <CollaborativeRoom 
        roomId={roomId || ''} 
        userName={user?.displayName || user?.email?.split('@')[0] || 'Student'} 
        onClose={() => {}} 
        onPickStudyKit={() => {}} 
      />
    </div>
  );
};
