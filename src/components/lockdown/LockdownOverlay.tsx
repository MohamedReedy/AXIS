import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Clock, Maximize2, ShieldAlert, Siren } from 'lucide-react';
import { isFullscreenSupported } from '@/features/lockdown/useLockdown';

interface LockdownOverlayProps {
  isVisible: boolean;
  warningCount: number;
  maxStrikes: number;
  message: string | null;
  onReturnToFullscreen: () => void;
  onTimeout?: () => void;
}

export const LockdownOverlay: React.FC<LockdownOverlayProps> = ({
  isVisible,
  warningCount,
  maxStrikes,
  message,
  onReturnToFullscreen,
  onTimeout,
}) => {
  const [countdown, setCountdown] = useState<number>(10);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const isCritical = warningCount >= maxStrikes;
  const isFsSupported = isFullscreenSupported();

  // Reset countdown to 10 whenever visibility starts or strike count changes (consecutive strike logged)
  useEffect(() => {
    if (isVisible && !isCritical) {
      setCountdown(10);
    }
  }, [isVisible, warningCount, isCritical]);

  // Run the 10-second countdown timer
  useEffect(() => {
    if (!isVisible || isCritical) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Time is up! Trigger consecutive strike penalty
          if (onTimeoutRef.current) {
            onTimeoutRef.current();
          }
          return 10; // Reset countdown for the next 10-second interval
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isVisible, isCritical]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0B1120]/95 backdrop-blur-2xl p-4 sm:p-6 text-center animate-shake select-none">
      <div className="max-w-lg w-full bg-white border-2 border-red-500 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-950/60 flex flex-col items-center space-y-5">
        
        {/* Animated Warning Icon with live 10s countdown badge */}
        <div className="relative">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-red-50 flex items-center justify-center border-2 border-red-200 animate-pulse">
            {isCritical ? (
              <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 text-red-600" />
            ) : (
              <Siren className="w-10 h-10 sm:w-12 sm:h-12 text-red-600 animate-bounce" />
            )}
          </div>
          {!isCritical && (
            <div
              className="absolute -bottom-1 -right-1 bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-lg border-2 border-white animate-pulse font-mono flex items-center space-x-1"
              title="Time remaining to return"
            >
              <Clock className="w-3 h-3" />
              <span>{countdown}s</span>
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

        {/* Callout Notice & 10-Second Return Window */}
        {!isCritical && (
          <div className="w-full bg-red-50 rounded-2xl p-4 text-xs text-red-900 border border-red-200 space-y-2.5 shadow-inner">
            <div className="font-bold text-red-700 uppercase tracking-wider text-[11px] flex items-center justify-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Mandatory 10-Second Return Window</span>
            </div>

            <div className="p-3 rounded-xl bg-white/90 border border-red-200 text-slate-800 space-y-1 text-left">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-red-700 font-bold">Must return to screen in:</span>
                <span className="font-mono text-base font-black text-red-600 px-2.5 py-0.5 bg-red-100 rounded-lg border border-red-200">
                  {countdown}s
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                You must return within <strong>10 seconds</strong>. Remaining outside records an additional consecutive strike every 10 seconds until automatic disqualification.
              </p>
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
            <span>Acknowledge Strike & Resume Examination ({countdown}s)</span>
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
