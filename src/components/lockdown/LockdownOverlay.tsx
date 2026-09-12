import React from 'react';
import { AlertTriangle, Maximize2, ShieldAlert, Siren } from 'lucide-react';
import { isFullscreenSupported } from '@/features/lockdown/useLockdown';

interface LockdownOverlayProps {
  isVisible: boolean;
  warningCount: number;
  maxStrikes: number;
  message: string | null;
  onReturnToFullscreen: () => void;
}

export const LockdownOverlay: React.FC<LockdownOverlayProps> = ({
  isVisible,
  warningCount,
  maxStrikes,
  message,
  onReturnToFullscreen,
}) => {
  if (!isVisible) return null;

  const isCritical = warningCount >= maxStrikes;
  const isFsSupported = isFullscreenSupported();

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0B1120]/95 backdrop-blur-2xl p-4 sm:p-6 text-center animate-shake select-none">
      <div className="max-w-lg w-full bg-white border-2 border-red-500 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-950/60 flex flex-col items-center space-y-5">
        
        {/* Animated Warning Icon */}
        <div className="relative">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-red-50 flex items-center justify-center border-2 border-red-200 animate-pulse">
            {isCritical ? (
              <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 text-red-600" />
            ) : (
              <Siren className="w-10 h-10 sm:w-12 sm:h-12 text-red-600 animate-bounce" />
            )}
          </div>
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
            {isCritical
              ? `Maximum Strikes Exceeded (${warningCount}/${maxStrikes})`
              : `Violation Strike ${warningCount} of ${maxStrikes} Recorded`}
          </span>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {isCritical
              ? 'EXAM TERMINATED (DISQUALIFIED)'
              : '🚨 SECURITY VIOLATION RECORDED'}
          </h2>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            {message ||
              (isFsSupported
                ? 'You navigated away, exited full-screen, or switched to another window! An official violation strike has been recorded.'
                : 'You navigated away from the examination! An official violation strike has been recorded.')}
          </p>
        </div>

        {/* Callout Notice */}
        {!isCritical && (
          <div className="w-full bg-red-50 rounded-2xl p-3.5 text-xs text-red-900 border border-red-200 space-y-1 shadow-inner">
            <div className="font-bold text-red-700 uppercase tracking-wider text-[11px] flex items-center justify-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Violation Logged to Server Authority</span>
            </div>
            <p className="text-[11px] text-red-700">
              This incident has been permanently recorded. You have{' '}
              <strong className="font-mono font-bold text-red-800">
                {Math.max(0, maxStrikes - warningCount)}
              </strong>{' '}
              strike{Math.max(0, maxStrikes - warningCount) === 1 ? '' : 's'} remaining before automatic disqualification.
            </p>
          </div>
        )}

        {/* Return Button */}
        {!isCritical ? (
          <button
            onClick={onReturnToFullscreen}
            className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-axis-blue to-blue-700 hover:from-blue-700 hover:to-blue-800 active:scale-[0.98] text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-md shadow-blue-600/30 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer text-sm"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Acknowledge Strike & Resume Examination</span>
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
