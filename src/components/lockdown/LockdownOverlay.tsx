import React from 'react';
import { AlertTriangle, Maximize2, ShieldAlert, Siren } from 'lucide-react';

interface LockdownOverlayProps {
  isVisible: boolean;
  warningCount: number;
  maxStrikes: number;
  message: string | null;
  graceSeconds: number | null;
  onReturnToFullscreen: () => void;
}

export const LockdownOverlay: React.FC<LockdownOverlayProps> = ({
  isVisible,
  warningCount,
  maxStrikes,
  message,
  graceSeconds,
  onReturnToFullscreen,
}) => {
  if (!isVisible && !graceSeconds) return null;

  const isCritical = warningCount >= maxStrikes;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 sm:p-6 text-center animate-shake select-none">
      <div className="max-w-lg w-full bg-white border-2 border-red-500 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-950/40 flex flex-col items-center space-y-5">
        
        {/* Animated Warning Icon */}
        <div className="relative">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-red-50 flex items-center justify-center border-2 border-red-200 animate-pulse">
            {isCritical ? (
              <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 text-red-600" />
            ) : (
              <Siren className="w-10 h-10 sm:w-12 sm:h-12 text-red-600 animate-bounce" />
            )}
          </div>
          {graceSeconds !== null && graceSeconds > 0 && !isCritical && (
            <div className="absolute -bottom-2 -right-2 bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-md border border-red-400">
              {graceSeconds}s
            </div>
          )}
        </div>

        {/* Header & Status */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-center space-x-2">
            {Array.from({ length: maxStrikes }).map((_, idx) => (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all ${
                  idx < warningCount
                    ? 'bg-red-600 shadow-sm shadow-red-500/50 scale-110'
                    : 'bg-slate-200'
                }`}
                title={`Strike ${idx + 1}`}
              />
            ))}
          </div>

          <span className="inline-block px-3.5 py-1 rounded-full bg-red-50 text-red-700 font-bold text-xs uppercase tracking-wider border border-red-200">
            {graceSeconds !== null && !isCritical
              ? `⚠️ Pre-Strike Warning: ${graceSeconds}s Grace Period`
              : `Violation Strike ${warningCount} of ${maxStrikes}`}
          </span>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {isCritical ? 'EXAM TERMINATED (DISQUALIFIED)' : '⚠️ SECURITY ALERT: EXAM FOCUS LOST'}
          </h2>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            {message ||
              'You exited full-screen, clicked cancel, or switched to another window! Return immediately to avoid an official violation strike.'}
          </p>
        </div>

        {/* Countdown Box */}
        {graceSeconds !== null && graceSeconds > 0 && !isCritical && (
          <div className="w-full bg-red-50 rounded-2xl p-4 text-xs text-red-900 border border-red-200 space-y-1 shadow-inner">
            <div className="font-bold text-red-700 uppercase tracking-wider text-[11px] flex items-center justify-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Warning: Action Will Be Taken In</span>
            </div>
            <div>
              Return to fullscreen in{' '}
              <strong className="text-red-700 text-base font-mono font-black px-2 py-0.5 bg-red-100 rounded">
                {graceSeconds}s
              </strong>{' '}
              or an official strike will be recorded and you will be disqualified!
            </div>
          </div>
        )}

        {/* Return Button */}
        {!isCritical ? (
          <button
            onClick={onReturnToFullscreen}
            className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-axis-blue to-blue-700 hover:from-blue-700 hover:to-blue-800 active:scale-[0.98] text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-md shadow-blue-600/30 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer text-sm"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Return to Fullscreen & Resume Exam</span>
          </button>
        ) : (
          <div className="p-3.5 bg-red-50 rounded-xl text-xs text-red-700 border border-red-200 font-medium">
            Your exam session has been terminated due to excessive violations. Your recorded answers have been transmitted to the administrator.
          </div>
        )}
      </div>
    </div>
  );
};
