import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Zap, RotateCcw, AlertCircle } from 'lucide-react';
import { Logo } from './Logo';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4 bg-gradient-to-b from-black to-[#0a0a0f]">
          <div className="w-full max-w-md glass-panel border border-border-main p-8 rounded-2xl text-center space-y-6">
            <div className="flex justify-center mb-4">
              <Logo className="scale-75" />
            </div>
            
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="text-red-500" size={32} />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Something went wrong</h1>
              <p className="text-text-dim text-sm">
                We encountered an unexpected error. Don't worry, your data is safe.
              </p>
            </div>

            {this.state.error && (
              <div className="p-4 bg-glass-bg rounded-xl text-left overflow-auto max-h-32 scrollbar-hide">
                <code className="text-[10px] text-red-400 font-mono break-all">
                  {this.state.error.message}
                </code>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-gradient-to-r from-brand-purple to-brand-purple-dark text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(124,124,255,0.3)] transition-all"
            >
              <RotateCcw size={18} />
              Reload Page
            </button>
            
            <p className="text-[10px] text-text-dim">
              If the problem persists, please contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
