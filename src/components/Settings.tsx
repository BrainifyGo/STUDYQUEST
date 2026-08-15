import React, { useState } from 'react';
import {
  User,
  Bell,
  Shield,
  LogOut,
  ChevronRight,
  CreditCard,
  Zap,
  CheckCircle2,
  X,
  Camera,
  Save,
  Trash2,
  Download,
  KeyRound,
  AlertCircle
} from 'lucide-react';
import { useUserStore } from '../store/useUserStore';
import { auth, db, doc, updateDoc, deleteDoc, resetPassword } from '../lib/firebase';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { TokenUsageBar } from './TokenUsageBar';

type SettingsTab = 'notifications' | 'privacy' | 'subscription';

export const Settings: React.FC = () => {
  const { user, userData, setUserData, isGuest, setActiveView } = useUserStore();
  const [isSaving, setIsSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(userData?.displayName || '');
  const [notifications, setNotifications] = useState(userData?.notifications ?? true);
  const [studyReminders, setStudyReminders] = useState(userData?.studyReminders ?? true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('notifications');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleSaveProfile = async () => {
    if (!user || isGuest) return;
    setIsSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName,
        notifications,
        studyReminders
      });

      if (userData) {
        setUserData({
          ...userData,
          displayName,
          notifications,
          studyReminders
        });
      }

      setSuccessMessage('Settings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.reload();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    try {
      await resetPassword(user.email);
      setResetEmailSent(true);
      setTimeout(() => setResetEmailSent(false), 5000);
    } catch (error) {
      console.error('Error sending password reset email:', error);
    }
  };

  const handleExportData = () => {
    if (!userData) return;
    const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brainify-my-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid));
      await auth.currentUser.delete();
      window.location.reload();
    } catch (error: any) {
      console.error('Error deleting account:', error);
      if (error.code === 'auth/requires-recent-login') {
        setDeleteError('For security, please log out and log back in, then try again.');
      } else {
        setDeleteError('Something went wrong deleting your account. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: typeof Bell }[] = [
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield },
    { id: 'subscription', label: 'Subscription', icon: CreditCard },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-main">Settings</h1>
          <p className="text-text-dim mt-1">Manage your account and preferences</p>
        </div>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-all text-sm font-bold"
        >
          <LogOut size={16} />
          <span>Log Out</span>
        </button>
      </div>

      {/* Profile Section — always visible above the tabs */}
      <section className="glass p-6 rounded-2xl border border-border-main space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="w-20 h-20 rounded-full bg-brand-purple/20 flex items-center justify-center overflow-hidden border-2 border-brand-purple/30">
              {userData?.photoURL ? (
                <img src={userData.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User size={32} className="text-brand-purple" />
              )}
            </div>
            <button className="absolute bottom-0 right-0 p-1.5 bg-brand-purple text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={14} />
            </button>
          </div>
          <div>
            <h3 className="font-bold text-text-main text-lg">{userData?.displayName || 'Student'}</h3>
            <p className="text-text-dim text-sm">{userData?.email}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple text-[10px] font-bold uppercase tracking-wider">
              {userData?.isPro ? 'Pro Member' : 'Free Plan'}
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-border-main">
          <label className="text-sm font-bold text-text-muted">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full bg-glass-bg border border-border-main rounded-xl px-4 py-3 text-text-main focus:outline-none focus:border-brand-purple transition-all"
          />
        </div>

        <div className="pt-2 flex items-center justify-between">
          <AnimatePresence>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="text-green-400 text-sm font-medium flex items-center gap-2"
              >
                <CheckCircle2 size={16} />
                {successMessage}
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={handleSaveProfile}
            disabled={isSaving}
            className="btn-primary flex items-center gap-2 py-2 px-6 ml-auto"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={18} />
            )}
            <span>Save Changes</span>
          </button>
        </div>
      </section>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-glass-bg rounded-2xl border border-border-main w-full overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all",
                isActive
                  ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20"
                  : "text-text-dim hover:text-text-main hover:bg-glass-bg"
              )}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'notifications' && (
        <section className="glass p-6 rounded-2xl border border-border-main space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-purple/10 text-brand-purple">
              <Bell size={20} />
            </div>
            <div>
              <h3 className="font-bold text-text-main">Notifications</h3>
              <p className="text-text-dim text-xs">Choose what you want to hear about</p>
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-border-main pt-4">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-text-main">Email Notifications</div>
              <div className="text-xs text-text-dim">Receive updates about your study progress</div>
            </div>
            <button
              onClick={() => setNotifications(!notifications)}
              className={cn(
                "w-12 h-6 rounded-full transition-all relative shrink-0",
                notifications ? "bg-brand-purple" : "bg-text-dim/30"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                notifications ? "right-1" : "left-1"
              )} />
            </button>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-border-main pt-4">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-text-main">Study Reminders</div>
              <div className="text-xs text-text-dim">Get nudged when it's time for a study session</div>
            </div>
            <button
              onClick={() => setStudyReminders(!studyReminders)}
              className={cn(
                "w-12 h-6 rounded-full transition-all relative shrink-0",
                studyReminders ? "bg-brand-purple" : "bg-text-dim/30"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                studyReminders ? "right-1" : "left-1"
              )} />
            </button>
          </div>

          <p className="text-xs text-text-dim">Click "Save Changes" above to apply.</p>
        </section>
      )}

      {activeTab === 'privacy' && (
        <div className="space-y-6">
          <section className="glass p-6 rounded-2xl border border-border-main space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand-purple/10 text-brand-purple">
                <Shield size={20} />
              </div>
              <div>
                <h3 className="font-bold text-text-main">Privacy & Security</h3>
                <p className="text-text-dim text-xs">Manage your data and account access</p>
              </div>
            </div>

            <div className="flex items-center justify-between py-2 border-t border-border-main pt-4">
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-text-main">Change Password</div>
                <div className="text-xs text-text-dim">Sends a password reset link to {user?.email || 'your email'}</div>
              </div>
              <button
                onClick={handleChangePassword}
                disabled={!user?.email}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-glass-bg border border-border-main text-text-main text-sm font-bold hover:border-brand-purple/50 transition-all disabled:opacity-50 shrink-0"
              >
                <KeyRound size={16} />
                <span>{resetEmailSent ? 'Email Sent!' : 'Send Reset Link'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between py-2 border-t border-border-main pt-4">
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-text-main">Export My Data</div>
                <div className="text-xs text-text-dim">Download a copy of your account data as JSON</div>
              </div>
              <button
                onClick={handleExportData}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-glass-bg border border-border-main text-text-main text-sm font-bold hover:border-brand-purple/50 transition-all shrink-0"
              >
                <Download size={16} />
                <span>Export</span>
              </button>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 size={20} />
              <h3 className="font-bold">Danger Zone</h3>
            </div>
            <p className="text-sm text-red-400/70">Once you delete your account, there is no going back. Please be certain.</p>
            {deleteError && (
              <div className="flex items-center gap-2 text-red-400 text-xs font-medium">
                <AlertCircle size={14} />
                {deleteError}
              </div>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/10 transition-all"
            >
              Delete Account
            </button>
          </section>
        </div>
      )}

      {activeTab === 'subscription' && (
        <section className="glass p-6 rounded-2xl border border-border-main">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand-purple/10 text-brand-purple">
                <Zap size={20} />
              </div>
              <div>
                <h3 className="font-bold text-text-main">Subscription Plan</h3>
                <p className="text-text-dim text-xs">Manage your billing and features</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-text-main">{userData?.isPro ? 'StudyQuest Pro' : 'StudyQuest Free'}</div>
              <div className="text-xs text-text-dim">{userData?.isPro ? 'Active' : 'Limited Access'}</div>
            </div>
          </div>

          <div className="pb-6 mb-6 border-b border-border-main">
            <TokenUsageBar />
          </div>

          {!userData?.isPro && (
            <div className="p-4 rounded-xl bg-brand-purple/5 border border-brand-purple/10 space-y-3">
              <p className="text-sm text-text-muted">Upgrade to Pro to unlock unlimited study kits, voice buddy, and collaborative rooms.</p>
              <button
                onClick={() => setActiveView('upgrade')}
                className="btn-primary flex items-center gap-2 py-2 px-6"
              >
                <Zap size={16} />
                <span>Upgrade to Pro</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </section>
      )}

      {/* Delete Account Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setShowDeleteConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md glass p-8 rounded-3xl border border-border-main shadow-2xl"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                  <Trash2 size={32} />
                </div>
                <h2 className="text-2xl font-black text-text-main tracking-tight">Delete Account?</h2>
                <p className="text-text-dim">This permanently deletes your account and all study data. This cannot be undone.</p>

                <div className="flex gap-3 w-full pt-4">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="flex-1 py-3 rounded-xl bg-glass-bg border border-border-main text-text-muted font-bold hover:text-text-main transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isDeleting ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <span>Delete Forever</span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogoutConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md glass p-8 rounded-3xl border border-border-main shadow-2xl"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                  <LogOut size={32} />
                </div>
                <h2 className="text-2xl font-black text-text-main tracking-tight">Log Out?</h2>
                <p className="text-text-dim">Are you sure you want to log out of your account?</p>
                
                <div className="flex gap-3 w-full pt-4">
                  <button 
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 py-3 rounded-xl bg-glass-bg border border-border-main text-text-muted font-bold hover:text-text-main transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                  >
                    Log Out
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
