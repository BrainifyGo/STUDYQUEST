import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, Zap, ShieldCheck, CreditCard, ArrowRight, 
  Sparkles, Flame, Star, Key, Loader2, Check, 
  Brain, Users, BarChart3, Clock, Lock, 
  ChevronDown, HelpCircle, X
} from 'lucide-react';
import { db, auth, doc, getDoc, updateDoc } from '../lib/firebase';
import { cn } from '../lib/utils';

interface UpgradePageProps {
  onBack: () => void;
  isSubscribed?: boolean;
  onUpgradeSuccess?: () => void;
}

// --- Hero Section ---
const HeroSection = ({ onUpgrade }: { onUpgrade: () => void }) => (
  <div className="text-center space-y-8 mb-20 relative">
    <motion.div 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple text-xs font-black uppercase tracking-[0.2em]"
    >
      <Sparkles size={14} fill="currentColor" />
      The Future of Learning
    </motion.div>
    
    <div className="space-y-6">
      <motion.h1 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-5xl md:text-8xl font-black text-text-main tracking-tight leading-[1.1]"
      >
        Unlock Your Full <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple via-brand-purple-light to-brand-purple-dark">
          Learning Potential
        </span>
      </motion.h1>
      <motion.h2
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-2xl md:text-3xl font-bold text-text-main/80 tracking-tight"
      >
        Go beyond limits with StudyQuest Pro
      </motion.h2>
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-text-dim text-lg md:text-xl max-w-2xl mx-auto font-medium leading-relaxed"
      >
        AI-powered study tools, collaboration, analytics, and more — all in one place. 
        Designed for students who are serious about mastery.
      </motion.p>
    </div>

    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="pt-4"
    >
      <button 
        onClick={onUpgrade}
        className="btn-primary px-10 py-5 rounded-2xl font-black text-lg shadow-2xl shadow-brand-purple/40 flex items-center gap-3 mx-auto group"
      >
        Upgrade to Pro
        <ArrowRight className="group-hover:translate-x-1 transition-transform" />
      </button>
    </motion.div>
  </div>
);

// --- Pricing Card ---
const PricingCard = ({ onUpgrade, isSubscribed, billingCycle }: { onUpgrade: () => void, isSubscribed: boolean, billingCycle: 'monthly' | 'annual' }) => (
  <motion.div 
    initial={{ y: 40, opacity: 0 }}
    whileInView={{ y: 0, opacity: 1 }}
    viewport={{ once: true }}
    whileHover={{ y: -10 }}
    className="relative w-full max-w-lg mx-auto"
  >
    {/* Glow Effect */}
    <div className="absolute -inset-1 bg-gradient-to-r from-brand-purple to-brand-purple-dark rounded-[2.5rem] blur-2xl opacity-20 group-hover:opacity-40 transition duration-1000" />
    
    <div className="relative glass p-10 md:p-12 rounded-[2.5rem] border-2 border-brand-purple/30 overflow-hidden bg-brand-purple/[0.02]">
      {/* Best Value Badge */}
      {billingCycle === 'annual' && (
        <div className="absolute top-0 right-0 bg-gradient-to-r from-brand-purple to-brand-purple-dark text-white text-[10px] font-black uppercase tracking-[0.2em] px-8 py-3 rounded-bl-3xl shadow-xl z-10">
          Best Value
        </div>
      )}

      <div className="space-y-10">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-brand-purple font-black text-xs uppercase tracking-[0.2em]">
            <Star size={14} fill="currentColor" />
            Pro Membership
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-text-main/20 line-through tracking-tighter">
                {billingCycle === 'annual' ? '£120/year' : '£12/mo'}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-6xl font-black text-text-main tracking-tighter">
                  {billingCycle === 'annual' ? '£48' : '£5'}
                </span>
                <span className="text-text-dim font-bold text-xl">
                  {billingCycle === 'annual' ? '/year' : '/month'}
                </span>
              </div>
            </div>
            <p className="text-brand-purple-light text-sm font-bold">
              {billingCycle === 'annual' ? 'Save over £70 per year' : 'Limited time launch offer'}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <p className="text-text-muted font-bold text-sm uppercase tracking-widest">Everything in Pro:</p>
          <ul className="grid grid-cols-1 gap-4">
            {[
              "Unlimited AI Study Kit Generation",
              "Full AI Tutor Access (Deep Explanations)",
              "Save & Access Unlimited Study Kits",
              "Real-time Collaborative Study Rooms",
              "Multiplayer Quizzes & Shared Sessions",
              "Advanced Analytics & Progress Tracking",
              "Multi-device sync (Coming Soon)"
            ].map((feature, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-text-main/80 font-medium">
                <div className="mt-1 w-5 h-5 rounded-full bg-brand-purple/20 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-brand-purple" strokeWidth={4} />
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onUpgrade}
          disabled={isSubscribed}
          className="w-full relative group/btn"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-brand-purple to-brand-purple-dark rounded-2xl blur opacity-40 group-hover/btn:opacity-100 transition duration-500" />
          <div className="relative btn-primary w-full h-16 text-xl font-black flex items-center justify-center gap-3 rounded-2xl shadow-2xl shadow-brand-purple/20">
            {isSubscribed ? "Already Subscribed" : "Start Pro Now"}
            {!isSubscribed && <ArrowRight className="group-hover/btn:translate-x-1 transition-transform" size={24} />}
          </div>
        </motion.button>
      </div>
    </div>
  </motion.div>
);

// --- Feature Section ---
const FeatureSection = () => {
  const features = [
    {
      icon: <Brain className="text-brand-purple" size={32} />,
      title: "AI Power",
      description: "Generate summaries, flashcards, quizzes, and mind maps instantly from any source."
    },
    {
      icon: <Users className="text-green-400" size={32} />,
      title: "Collaboration",
      description: "Study together in real-time rooms with shared notes, live chat, and multiplayer quizzes."
    },
    {
      icon: <BarChart3 className="text-blue-400" size={32} />,
      title: "Analytics",
      description: "Track your progress, identify knowledge gaps, and master subjects faster with deep insights."
    },
    {
      icon: <Clock className="text-yellow-400" size={32} />,
      title: "Productivity",
      description: "Built-in focus timer and session tracking to keep you in the flow and avoid burnout."
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-32">
      {features.map((f, i) => (
        <motion.div 
          key={i}
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.1 }}
          className="glass p-8 rounded-[2rem] border border-border-main flex gap-6 group hover:bg-glass-bg transition-all"
        >
          <div className="w-16 h-16 rounded-2xl bg-glass-bg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            {f.icon}
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-text-main tracking-tight">{f.title}</h3>
            <p className="text-text-dim text-sm leading-relaxed font-medium">{f.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

// --- Comparison Table ---
const ComparisonTable = () => (
  <div className="w-full my-32 space-y-12">
    <div className="text-center space-y-2">
      <h2 className="text-3xl font-black text-text-main tracking-tight">Free vs Pro</h2>
      <p className="text-text-dim font-medium">See why Pro is the essential choice for serious students.</p>
    </div>

    <div className="glass rounded-[2.5rem] border border-border-main overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border-main">
            <th className="p-8 text-xs font-black text-text-main/20 uppercase tracking-widest">Feature</th>
            <th className="p-8 text-xs font-black text-text-main/20 uppercase tracking-widest text-center">Free</th>
            <th className="p-8 text-xs font-black text-brand-purple uppercase tracking-widest text-center bg-brand-purple/5">Pro</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {[
            { label: "AI Generations", free: "5 / day", pro: "Unlimited" },
            { label: "Study History", free: "Limited (10 items)", pro: "Full History Access" },
            { label: "Study Rooms", free: "None", pro: "Unlimited Access" },
            { label: "Multiplayer Quizzes", free: "None", pro: "Unlimited Access" },
            { label: "AI Tutor Chat", free: "Basic", pro: "Full Deep Access" },
            { label: "Analytics", free: "Basic", pro: "Advanced Insights" },
            { label: "Device Sync", free: "None", pro: "Coming Soon" }
          ].map((row, i) => (
            <tr key={i} className="border-b border-border-main last:border-0 hover:bg-glass-bg transition-colors">
              <td className="p-8 text-text-main/80 font-bold">{row.label}</td>
              <td className="p-8 text-text-dim text-center font-medium">{row.free}</td>
              <td className="p-8 text-text-main font-black text-center bg-brand-purple/5">{row.pro}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// --- Trust Section ---
const TrustSection = () => (
  <div className="flex flex-wrap justify-center gap-12 my-20">
    <div className="flex items-center gap-3 text-text-dim font-black text-[10px] uppercase tracking-[0.2em]">
      <ShieldCheck size={18} className="text-brand-purple" />
      Secure Payments
    </div>
    <div className="flex items-center gap-3 text-text-dim font-black text-[10px] uppercase tracking-[0.2em]">
      <CreditCard size={18} className="text-brand-purple" />
      Cancel Anytime
    </div>
    <div className="flex items-center gap-3 text-text-dim font-black text-[10px] uppercase tracking-[0.2em]">
      <Lock size={18} className="text-brand-purple" />
      No Hidden Fees
    </div>
  </div>
);

// --- Main Upgrade Page ---
export default function UpgradePage({ onBack, isSubscribed = false, onUpgradeSuccess }: UpgradePageProps) {
  const [view, setView] = useState<'main' | 'key'>('main');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [upgradeKey, setUpgradeKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleUpgradeClick = async () => {
    try {
      setError('');
      
      if (!auth.currentUser) {
        setError('Please sign in to upgrade.');
        return;
      }

      const email = auth.currentUser.email;
      const uid = auth.currentUser.uid;

      if (!email) {
        setError('Please add an email to your account to upgrade.');
        return;
      }

      const response = await fetch(`/api/lemonsqueezy/checkout?email=${encodeURIComponent(email)}&uid=${uid}`);
      
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (err: any) {
      console.error('Upgrade Error:', err);
      setError(err.message || 'Failed to start upgrade process. Please try again.');
    }
  };

  const handleKeyUpgrade = async () => {
    if (!upgradeKey.trim()) return;
    if (!auth.currentUser) {
      setError('Please sign in to upgrade.');
      return;
    }

    setIsValidating(true);
    setError('');
    
    const key = upgradeKey.trim();
    const uid = auth.currentUser.uid;
    let claimed = false;

    try {
      // REDEMPTION IS TWO WRITES, AND THE ORDER MATTERS.
      //
      // This used to query the whole `upgrade_keys` collection for a match, which is what made
      // every key in it readable by every signed-in user. The key string is now the document
      // ID, so this is a direct lookup: you can fetch a key you were given, and the rules deny
      // `list`, so you cannot go fishing for one you weren't.
      const keyRef = doc(db, 'upgrade_keys', key);
      const keySnap = await getDoc(keyRef);

      // Same message for "no such key" and "already used" — telling them apart would let
      // someone probe which keys exist.
      if (!keySnap.exists() || keySnap.data()?.isUsed === true) {
        setError('Invalid or already used key.');
        return;
      }
      const type = keySnap.data()?.type;

      // Claim the key FIRST. The rules only permit unused -> used, so if two people race for
      // the same key exactly one of these succeeds and the loser is told it's already used.
      // The second write below is what actually grants Pro, and it will only pass for the
      // account whose uid is stamped on the key here.
      await updateDoc(keyRef, { isUsed: true, usedBy: uid });
      claimed = true;

      await updateDoc(doc(db, 'users', uid), {
        isPro: true,
        subscriptionType: type,
        redeemedKey: key,
      });

      setSuccess(true);
      if (onUpgradeSuccess) onUpgradeSuccess();
      setTimeout(() => onBack(), 2000);

    } catch (err: any) {
      // A failure between the two writes leaves the key spent but the account still free. It
      // can't be silently retried — the key is claimed now — so say so plainly and hand back
      // the key, rather than showing a generic error that loses it.
      console.error('Key redemption failed:', err);
      setError(
        claimed
          ? `Your key ${key} was accepted but the upgrade didn't finish. ` +
            `Please send that key to support and we'll apply it — don't try another key.`
          : 'Invalid or already used key.'
      );
    } finally {
      setIsValidating(false);
    }
  };

  if (view === 'key') {
    return (
      <div className="min-h-screen w-full bg-bg-dark flex items-center justify-center p-4 md:p-12 overflow-y-auto">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-brand-purple/10 blur-[120px] rounded-full opacity-50" />
        </div>

        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-5xl glass rounded-[3rem] border border-brand-purple/20 shadow-2xl overflow-hidden"
        >
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Left Side: Info */}
            <div className="p-8 md:p-12 bg-brand-purple/5 border-b md:border-b-0 md:border-r border-border-main flex flex-col justify-between">
              <div className="space-y-8">
                <button 
                  onClick={() => setView('main')}
                  className="flex items-center gap-2 text-text-dim hover:text-text-main transition-colors font-black text-[10px] uppercase tracking-[0.2em]"
                >
                  <ArrowRight className="rotate-180" size={14} />
                  Back to Pricing
                </button>

                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-brand-purple/20 flex items-center justify-center">
                    <Key className="text-brand-purple" size={32} />
                  </div>
                  <h3 className="text-4xl font-black text-text-main tracking-tight">Activate Your Pro Access</h3>
                  <p className="text-text-dim text-lg font-medium leading-relaxed">
                    Redeem your unique upgrade key to unlock all premium features instantly. No credit card required for activation.
                  </p>
                </div>

                <div className="space-y-6 pt-4">
                  <div className="flex items-center gap-4 text-text-muted">
                    <div className="w-10 h-10 rounded-xl bg-glass-bg flex items-center justify-center shrink-0">
                      <Zap size={18} className="text-brand-purple" />
                    </div>
                    <span className="text-sm font-bold">Instant Feature Unlock</span>
                  </div>
                  <div className="flex items-center gap-4 text-text-muted">
                    <div className="w-10 h-10 rounded-xl bg-glass-bg flex items-center justify-center shrink-0">
                      <Users size={18} className="text-green-400" />
                    </div>
                    <span className="text-sm font-bold">Collaborative Access</span>
                  </div>
                  <div className="flex items-center gap-4 text-text-muted">
                    <div className="w-10 h-10 rounded-xl bg-glass-bg flex items-center justify-center shrink-0">
                      <ShieldCheck size={18} className="text-blue-400" />
                    </div>
                    <span className="text-sm font-bold">Secure Activation</span>
                  </div>
                </div>
              </div>

              <div className="pt-12">
                <p className="text-[10px] text-text-dim uppercase tracking-[0.2em] font-black leading-relaxed">
                  Need a key? Contact support or purchase one from our official store.
                </p>
              </div>
            </div>

            {/* Right Side: Form */}
            <div className="p-8 md:p-12 flex flex-col justify-center space-y-10">
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] ml-1">Enter Upgrade Key</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={upgradeKey}
                      onChange={(e) => setUpgradeKey(e.target.value)}
                      placeholder="PRO-XXXX-XXXX"
                      className="w-full bg-glass-bg border border-border-main rounded-2xl px-8 py-6 text-2xl font-mono tracking-widest focus:outline-none focus:border-brand-purple/50 transition-all text-text-main placeholder:text-text-dim"
                    />
                    {success && <Check className="absolute right-6 top-1/2 -translate-y-1/2 text-green-400" size={32} />}
                  </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-xs font-bold flex items-center gap-2 px-4 py-4 bg-red-400/10 rounded-2xl border border-red-400/20"
                  >
                    <Flame size={16} />
                    {error}
                  </motion.div>
                )}

                <div className="space-y-4 pt-4">
                  <button 
                    onClick={handleKeyUpgrade}
                    disabled={isValidating || success || !upgradeKey.trim()}
                    className="w-full btn-primary h-20 rounded-2xl font-black text-xl flex items-center justify-center gap-4 shadow-2xl shadow-brand-purple/20 group"
                  >
                    {isValidating ? (
                      <Loader2 className="animate-spin" size={24} />
                    ) : success ? (
                      <>
                        <Check size={24} />
                        Activated!
                      </>
                    ) : (
                      <>
                        Activate Now
                        <ArrowRight className="group-hover:translate-x-1 transition-transform" size={24} />
                      </>
                    )}
                  </button>
                  
                  <button 
                    onClick={() => setView('main')}
                    className="w-full py-4 text-text-dim hover:text-text-main transition-colors font-bold text-xs uppercase tracking-widest"
                  >
                    Cancel and Go Back
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center gap-8 opacity-20 grayscale">
                <div className="w-12 h-12 rounded-xl bg-glass-bg" />
                <div className="w-12 h-12 rounded-xl bg-glass-bg" />
                <div className="w-12 h-12 rounded-xl bg-glass-bg" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-bg-dark overflow-x-hidden">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1000px] bg-brand-purple/5 blur-[120px] rounded-full opacity-50" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-brand-purple/5 blur-[100px] rounded-full opacity-30" />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto py-16 px-6 lg:px-12">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-12">
          <motion.button 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={onBack}
            className="flex items-center gap-2 text-text-dim hover:text-text-main transition-colors font-black text-[10px] uppercase tracking-[0.2em]"
          >
            <ArrowRight className="rotate-180" size={14} />
            Back to Dashboard
          </motion.button>

          <motion.button 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => setView('key')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-glass-bg border border-border-main text-text-muted hover:text-text-main hover:bg-glass-bg transition-all font-bold text-[10px] uppercase tracking-[0.2em]"
          >
            <Key size={14} />
            Redeem Key
          </motion.button>
        </div>

        <HeroSection onUpgrade={handleUpgradeClick} />
        
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto mb-8 text-red-400 text-xs font-bold flex items-center gap-2 px-4 py-3 bg-red-400/10 rounded-xl border border-red-400/20"
          >
            <Flame size={14} />
            {error}
          </motion.div>
        )}

        {/* Billing Toggle */}
        <div className="flex flex-col items-center gap-6 mb-16">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4 p-1.5 bg-glass-bg rounded-2xl border border-border-main"
          >
            <button 
              onClick={() => setBillingCycle('monthly')}
              className={cn(
                "px-8 py-3 rounded-xl text-sm font-black transition-all",
                billingCycle === 'monthly' ? 'bg-brand-purple text-white shadow-lg' : 'text-text-dim hover:text-text-main'
              )}
            >
              Monthly
            </button>
            <button 
              onClick={() => setBillingCycle('annual')}
              className={cn(
                "px-8 py-3 rounded-xl text-sm font-black transition-all relative",
                billingCycle === 'annual' ? 'bg-brand-purple text-white shadow-lg' : 'text-text-dim hover:text-text-main'
              )}
            >
              Annual
              <span className="absolute -top-3 -right-3 bg-green-500 text-[8px] px-2 py-0.5 rounded-full text-white font-black uppercase tracking-tighter shadow-lg">
                Save 20%
              </span>
            </button>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-orange-400 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse-subtle"
          >
            <Flame size={12} fill="currentColor" />
            Limited Time Offer • Ends Soon
          </motion.div>
        </div>

        <div id="pricing-section" className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1">
            <PricingCard onUpgrade={handleUpgradeClick} isSubscribed={isSubscribed} billingCycle={billingCycle} />
          </div>
          
          <div className="order-1 lg:order-2 space-y-12">
            <div className="space-y-4">
              <h3 className="text-3xl font-black text-text-main tracking-tight">Why Pro?</h3>
              <p className="text-text-dim font-medium leading-relaxed">
                StudyQuest Pro is more than just a subscription. It's an investment in your academic success. 
                Unlock the full power of our AI and collaborate with students worldwide.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                { icon: <Zap size={20} />, title: "Unlimited AI", desc: "No daily caps on generation" },
                { icon: <Users size={20} />, title: "Study Rooms", desc: "Real-time collaboration" },
                { icon: <BarChart3 size={20} />, title: "Analytics", desc: "Deep progress insights" },
                { icon: <Clock size={20} />, title: "Focus Mode", desc: "Advanced productivity tools" }
              ].map((item, i) => (
                <div key={i} className="glass p-6 rounded-2xl border border-border-main space-y-2">
                  <div className="text-brand-purple">{item.icon}</div>
                  <h4 className="text-text-main font-bold text-sm">{item.title}</h4>
                  <p className="text-text-dim text-xs leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <TrustSection />

        <FeatureSection />

        <ComparisonTable />

        {/* Footer CTA */}
        <div className="mt-40 text-center space-y-8">
          <h2 className="text-4xl font-black text-text-main tracking-tight">Ready to master your studies?</h2>
          <button 
            onClick={handleUpgradeClick}
            className="btn-primary px-12 py-6 rounded-[2rem] font-black text-xl shadow-2xl shadow-brand-purple/40 hover:scale-105 transition-transform"
          >
            Start Pro Now
          </button>
          {/* Was "Join 10,000+ students already using Pro". There are not 10,000
              students. On a page that takes card details, an invented number is
              not marketing, it is a false statement to someone about to pay. */}
          <p className="text-text-dim text-xs font-bold uppercase tracking-widest">Built by GCSE students, for GCSE students</p>
        </div>
      </div>
    </div>
  );
}
