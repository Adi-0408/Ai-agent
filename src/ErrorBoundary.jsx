import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Captured runtime error in ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-[#070913] text-slate-100 flex items-center justify-center p-6 relative overflow-hidden select-none">
          {/* Ambient Glows */}
          <div className="fixed -top-24 left-[40%] w-[550px] h-[350px] rounded-full bg-violet-600/15 blur-[140px] pointer-events-none" />
          <div className="fixed -bottom-24 left-[30%] w-[500px] h-[350px] rounded-full bg-cyan-500/15 blur-[140px] pointer-events-none" />

          <div className="max-w-md w-full p-6 rounded-2xl bg-[#0D1326]/80 backdrop-blur-2xl border border-white/[0.12] shadow-[0_20px_50px_rgba(0,0,0,0.7)] text-center relative z-10 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center mx-auto text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <AlertTriangle size={24} />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white tracking-tight">Something encountered an issue</h2>
              <p className="text-xs text-slate-400">
                Echo caught an unexpected client error. The workspace has protected your session.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] text-left overflow-x-auto text-[11px] font-mono text-rose-300/90 max-h-32">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-slate-200 transition-all"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 hover:opacity-95 text-xs font-medium text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center gap-2 transition-all"
              >
                <RefreshCw size={12} />
                <span>Reload Workspace</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
