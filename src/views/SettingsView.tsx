import React from 'react';
import UpgradePage from '../components/UpgradePage';
import { User } from 'firebase/auth';

interface SettingsViewProps {
  user: User | null;
  isSubscribed: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ isSubscribed }) => {
  return (
    <div className="animate-fade-up">
      <UpgradePage onBack={() => {}} isSubscribed={isSubscribed} />
    </div>
  );
};
