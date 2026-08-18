import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, Medal, Crown, Star, Loader2, TrendingUp, Users } from 'lucide-react';
import { db, collection, query, orderBy, limit, getDocs, handleFirestoreError, OperationType } from '../lib/firebase';
import { cn } from '../lib/utils';
import { useUserStore } from '../store/useUserStore';

interface LeaderboardUser {
  uid: string;
  email: string;
  xp: number;
  level: number;
  isPro: boolean;
}

export default function Leaderboard() {
  const { user, isGuest } = useUserStore();
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      if (!user || isGuest) {
        setLoading(false);
        return;
      }

      try {
        const q = query(collection(db, 'users'), orderBy('xp', 'desc'), limit(10));
        const querySnapshot = await getDocs(q);
        const leaderboardData = querySnapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        })) as LeaderboardUser[];
        setUsers(leaderboardData);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'users_leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [user, isGuest]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center py-20">
        <Loader2 className="w-12 h-12 text-brand-purple animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 py-8 max-w-3xl mx-auto">
      <div className="text-center space-y-2">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple text-xs font-black uppercase tracking-[0.2em]"
        >
          <Trophy size={14} />
          Global Rankings
        </motion.div>
        <h1 className="text-4xl font-black text-text-main tracking-tight">Study Champions</h1>
        <p className="text-text-dim text-sm">See how you stack up against the top learners worldwide.</p>
      </div>

      <div className="glass rounded-[2.5rem] border border-border-main overflow-hidden shadow-2xl">
        <div className="p-6 bg-brand-purple/5 border-b border-border-main flex items-center justify-between">
          <div className="flex items-center gap-4">
            <TrendingUp size={20} className="text-brand-purple" />
            <span className="text-sm font-bold text-text-main">Top 10 Learners</span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Updated Real-time</span>
        </div>

        {users.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass p-6 rounded-2xl border border-brand-purple/20 text-center space-y-3 mb-6"
          >
            <Users size={22} className="text-brand-purple" />
            <h3 className="font-bold text-text-main text-sm">Be the first to climb the ranks!</h3>
            <p className="text-text-dim text-xs leading-relaxed">
              Share StudyQuest with your classmates. As more students join, the leaderboard fills up — and you'll see exactly where you rank.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={() => {
                  navigator.clipboard.writeText('https://brainifyai.lovable.app');
                }}
                className="px-4 py-2 bg-brand-purple/10 border border-brand-purple/30 text-brand-purple text-xs font-bold rounded-lg hover:bg-brand-purple/20 transition-all"
              >
                Copy invite link
              </button>
            </div>
          </motion.div>
        )}

        <div className="divide-y divide-border-main">
          {users.map((user, index) => (
            <motion.div 
              key={user.uid}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "flex items-center gap-4 p-5 transition-all hover:bg-glass-bg group",
                index === 0 ? "bg-brand-purple/5" : ""
              )}
            >
              <div className="w-10 flex items-center justify-center">
                {index === 0 ? (
                  <Crown className="text-yellow-400" size={24} />
                ) : index === 1 ? (
                  <Medal className="text-slate-300" size={22} />
                ) : index === 2 ? (
                  <Medal className="text-orange-400" size={20} />
                ) : (
                  <span className="text-sm font-black text-text-dim group-hover:text-text-main transition-colors">#{index + 1}</span>
                )}
              </div>

              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-purple to-brand-purple-dark flex items-center justify-center text-white font-black text-lg shadow-lg group-hover:scale-110 transition-transform">
                {user.email?.[0].toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-text-main truncate">{user.email?.split('@')[0]}</h4>
                  {user.isPro && (
                    <span className="px-1.5 py-0.5 rounded bg-brand-purple/20 text-brand-purple text-[8px] font-black uppercase tracking-widest">Pro</span>
                  )}
                </div>
                <div className="text-xs text-text-dim font-medium">Level {user.level || 1} Scholar</div>
              </div>

              <div className="text-right">
                <div className="flex items-center gap-1.5 justify-end text-brand-purple">
                  <Star size={14} fill="currentColor" />
                  <span className="text-lg font-black tracking-tight">{user.xp || 0}</span>
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-text-dim">XP Points</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="glass p-8 rounded-[2rem] border border-border-main text-center space-y-4">
        <h4 className="font-bold text-text-main">Want to climb the ranks?</h4>
        <p className="text-sm text-text-dim">Generate study kits, complete quizzes, and maintain your daily streak to earn more XP!</p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <div className="px-4 py-2 rounded-xl bg-glass-bg border border-border-main text-xs font-bold text-text-main flex items-center gap-2">
            <Star size={14} className="text-brand-purple" fill="currentColor" />
            Study Kit: +50 XP
          </div>
          <div className="px-4 py-2 rounded-xl bg-glass-bg border border-border-main text-xs font-bold text-text-main flex items-center gap-2">
            <Star size={14} className="text-brand-purple" fill="currentColor" />
            Quiz Master: +100 XP
          </div>
          <div className="px-4 py-2 rounded-xl bg-glass-bg border border-border-main text-xs font-bold text-text-main flex items-center gap-2">
            <Star size={14} className="text-brand-purple" fill="currentColor" />
            Daily Streak: +20 XP
          </div>
        </div>
      </div>
    </div>
  );
}
