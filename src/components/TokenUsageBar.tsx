import React from 'react';
import { Zap } from 'lucide-react';
import { useUserStore, getProStatus } from '../store/useUserStore';
import { getMonthlyLimit } from '../lib/tokenService';
import { cn } from '../lib/utils';

function nextResetLabel(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

export const TokenUsageBar: React.FC = () => {
  const { userData } = useUserStore();
  const isPro = getProStatus(userData);
  const used = userData?.tokensUsedThisMonth ?? 0;
  const limit = getMonthlyLimit(isPro);
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const isNearLimit = pct >= 90;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-text-main flex items-center gap-2">
          <Zap size={14} className="text-brand-purple" />
          AI Usage This Month
        </span>
        <span className="text-text-dim text-xs font-medium">
          {used.toLocaleString()} / {limit.toLocaleString()} tokens
        </span>
      </div>
      <div className="h-2 w-full bg-glass-bg rounded-full overflow-hidden border border-border-main">
        <div
          className={cn("h-full rounded-full transition-all", isNearLimit ? "bg-red-400" : "bg-brand-purple")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-text-dim">Resets on {nextResetLabel()}</p>
    </div>
  );
};

export default TokenUsageBar;
