import React from 'react';
import { useUserStore } from '../store/useUserStore';
import { 
  Bell, 
  Search, 
  Zap, 
  Flame, 
  Trophy,
  LogOut,
  User as UserIcon,
  Settings as SettingsIcon,
  HelpCircle,
  Mic,
  MessageSquare,
  Music
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

export const Header: React.FC = () => {
  const { 
    userData, 
    setActiveView, 
    dailyGenerationCount,
    setShowVoiceBuddy,
    setShowMusic
  } = useUserStore();
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);

  const limit = 10;
  const remaining = Math.max(0, limit - dailyGenerationCount);
  const isPro = userData?.isPro || userData?.plan === 'pro';

  const getLimitColor = () => {
    if (remaining > 5) return 'text-success bg-success/10';
    if (remaining >= 3) return 'text-warning bg-warning/10';
    return 'text-energy bg-energy/10';
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="h-20 border-b border-gray-100 bg-white px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left: Search Bar */}
      <div className="flex-1 max-w-md hidden sm:flex">
        <div className="relative w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search your library..." 
            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Right: Stats & Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Usage Limit */}
        <div className={cn(
          "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2",
          isPro ? "text-primary bg-primary/10" : getLimitColor()
        )}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {isPro ? (
            "∞ Unlimited"
          ) : (
            remaining === 0 ? (
              <span className="flex items-center gap-1">
                Limit reached — <button onClick={() => setActiveView('upgrade')} className="underline font-black">Upgrade</button>
              </span>
            ) : (
              `${remaining} / ${limit} generations left today`
            )
          )}
        </div>

        {/* Voice Buddy, AI Tutor & Music */}
        <div className="hidden md:flex items-center gap-2">
          <button 
            onClick={() => setShowMusic(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-all text-xs font-bold"
          >
            <Music size={14} className="text-secondary" />
            Music
          </button>
          <button 
            onClick={() => setShowVoiceBuddy(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-all text-xs font-bold"
          >
            <Mic size={14} className="text-primary" />
            Voice Buddy
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-all text-xs font-bold">
            <MessageSquare size={14} className="text-secondary" />
            AI Tutor
          </button>
        </div>

        {/* User Profile */}
        <div className="relative">
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-3 p-1 rounded-xl bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 overflow-hidden shrink-0">
              {userData?.photoURL ? (
                <img src={userData.photoURL} alt={userData.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-primary font-black text-xs">
                  {userData?.displayName?.charAt(0) || 'U'}
                </div>
              )}
            </div>
            <div className="hidden sm:block text-left pr-2">
              <p className="text-[10px] font-black tracking-tight text-gray-900 leading-none truncate max-w-[80px]">{userData?.displayName || 'User'}</p>
              <div className="inline-flex mt-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest">
                {userData?.isPro ? 'Pro' : 'Free'} Plan
              </div>
            </div>
          </button>

          {/* Profile Dropdown */}
          {showProfileMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
              <div className="absolute right-0 mt-3 w-64 bg-white border border-gray-200 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-3 border-b border-gray-100 mb-1">
                  <p className="text-sm font-black text-gray-900">{userData?.displayName}</p>
                  <p className="text-[10px] text-gray-500 font-medium truncate">{userData?.email || 'No email'}</p>
                </div>
                
                <div className="space-y-0.5">
                  <button onClick={() => { setActiveView('settings'); setShowProfileMenu(false); }} className="w-full flex items-center gap-3 p-2 rounded-lg text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all">
                    <UserIcon size={16} />
                    Profile
                  </button>
                  <button onClick={() => { setActiveView('settings'); setShowProfileMenu(false); }} className="w-full flex items-center gap-3 p-2 rounded-lg text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all">
                    <SettingsIcon size={16} />
                    Settings
                  </button>
                  <button className="w-full flex items-center gap-3 p-2 rounded-lg text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all">
                    <HelpCircle size={16} />
                    Help Center
                  </button>
                </div>

                <div className="mt-1 pt-1 border-t border-gray-100">
                  <button 
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 p-2 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 transition-all"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
