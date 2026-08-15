import React, { useState, useEffect } from 'react';
import { useUserStore } from '../store/useUserStore';
import { X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../lib/firebase';

export const GuestBanner: React.FC = () => {
  const { isGuest, guestGenerations } = useUserStore();
  const [isVisible, setIsVisible] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);

  useEffect(() => {
    // Show banner if guest has generated at least one study kit
    if (isGuest && guestGenerations > 0) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [isGuest, guestGenerations]);

  const handleDismiss = () => {
    setIsVisible(false);
  };

  const handleSignIn = () => {
    setShowSignInModal(true);
    // Trigger sign-in modal - this would need to be connected to your auth modal
    // For now, we'll just redirect to the auth screen
    window.location.reload();
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-gradient-to-r from-brand-purple/20 to-brand-purple-dark/20 border border-brand-purple/30 rounded-2xl p-4 mb-6"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-text-main font-bold text-sm">
                Your study kit will be lost in 24h — sign up to save it forever
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSignIn}
                className="flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-xl font-bold text-xs hover:bg-brand-purple/90 transition-all"
              >
                Save my work
                <ArrowRight size={14} />
              </button>
              <button
                onClick={handleDismiss}
                className="p-2 text-text-dim hover:text-text-main transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
