import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, X, Sparkles } from 'lucide-react';

interface AutoUpdateBannerProps {
  show: boolean;
  onClose: () => void;
  onUpdate: () => void;
  version: string;
}

export const AutoUpdateBanner: React.FC<AutoUpdateBannerProps> = ({ show, onClose, onUpdate, version }) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-lg"
        >
          <div className="glass border border-brand-purple/30 p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 bg-brand-purple/10 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-purple/20 flex items-center justify-center shrink-0">
                <Sparkles className="text-brand-purple w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-text-main">New Version Available!</h4>
                <p className="text-[10px] text-text-dim font-bold uppercase tracking-wider">Version {version} is ready to improve your study session.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={onUpdate}
                className="px-4 py-2 bg-brand-purple text-white text-xs font-black rounded-lg hover:bg-brand-purple/90 transition-all flex items-center gap-2 shadow-lg shadow-brand-purple/20"
              >
                <RefreshCw size={14} />
                Update Now
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-glass-bg rounded-lg text-text-dim transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
