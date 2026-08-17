import React from 'react';

const DashboardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col h-dvh bg-background overflow-hidden">
      {/* Header Skeleton */}
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50">
        <div className="flex items-center gap-4">
          <div className="w-32 h-8 bg-muted animate-pulse rounded" />
          <div className="w-24 h-8 bg-muted animate-pulse rounded-full" />
        </div>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-muted animate-pulse rounded-full" />
          <div className="w-10 h-10 bg-muted animate-pulse rounded-full" />
          <div className="w-24 h-8 bg-muted animate-pulse rounded-full" />
          <div className="w-32 h-10 bg-muted animate-pulse rounded-lg" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Skeleton */}
        <aside className="w-64 border-r border-border bg-card/30 p-4 hidden md:block">
          <div className="space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="w-full h-10 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
          <div className="mt-auto pt-8">
            <div className="w-full h-32 bg-muted animate-pulse rounded-xl" />
          </div>
        </aside>

        {/* Main Content Skeleton */}
        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Input Area Skeleton */}
            <div className="space-y-4">
              <div className="w-48 h-8 bg-muted animate-pulse rounded" />
              <div className="w-full h-40 bg-muted animate-pulse rounded-xl" />
              <div className="flex gap-4">
                <div className="w-32 h-10 bg-muted animate-pulse rounded-lg" />
                <div className="w-32 h-10 bg-muted animate-pulse rounded-lg" />
              </div>
            </div>

            {/* Output Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-64 bg-muted animate-pulse rounded-2xl border border-border" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardSkeleton;
