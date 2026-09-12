import { useEffect, useState, useCallback, useRef } from 'react';
import { ViolationType } from '@/types';
import { playSecurityWarningSound } from '@/lib/sound';

interface UseLockdownOptions {
  isActive: boolean;
  maxStrikes: number;
  currentStrikes: number;
  onViolation: (type: ViolationType, details?: string) => Promise<{ strike_count: number; is_disqualified: boolean }>;
  onDisqualify: () => void;
}

export function useLockdown({
  isActive,
  maxStrikes,
  currentStrikes,
  onViolation,
  onDisqualify,
}: UseLockdownOptions) {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [warningCount, setWarningCount] = useState<number>(currentStrikes);
  const [graceSeconds, setGraceSeconds] = useState<number | null>(null);
  const [cursorWarning, setCursorWarning] = useState<string | null>(null);

  const graceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isReportingRef = useRef<boolean>(false);
  const originalTitleRef = useRef<string>(document.title);

  // Sync warning count when parent updates strikes
  useEffect(() => {
    setWarningCount(currentStrikes);
  }, [currentStrikes]);

  // Request fullscreen utility
  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen request failed:', err);
    } finally {
      setIsFullscreen(true);
      setWarningMessage(null);
      setCursorWarning(null);
      document.title = originalTitleRef.current;
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
        graceTimerRef.current = null;
        setGraceSeconds(null);
      }
    }
  }, []);

  // Trigger official violation reporting after warning period expires
  const triggerViolation = useCallback(
    async (type: ViolationType, details: string) => {
      if (!isActive || isReportingRef.current) return;
      isReportingRef.current = true;

      try {
        const result = await onViolation(type, details);
        setWarningCount(result.strike_count);

        if (result.is_disqualified || result.strike_count >= maxStrikes) {
          setWarningMessage(`EXAM TERMINATED: Maximum violation strikes reached (${result.strike_count}/${maxStrikes}).`);
          onDisqualify();
        } else {
          setWarningMessage(
            `SECURITY WARNING (${result.strike_count}/${maxStrikes}): ${details}. Return to full-screen immediately.`
          );
        }
      } catch (err) {
        console.error('Failed to report violation:', err);
      } finally {
        setTimeout(() => {
          isReportingRef.current = false;
        }, 1000);
      }
    },
    [isActive, maxStrikes, onViolation, onDisqualify]
  );

  // Start warning grace countdown BEFORE taking any punitive action
  const startGraceWarning = useCallback(
    (type: ViolationType, warningText: string, violationDetails: string) => {
      if (!isActive) return;

      playSecurityWarningSound();
      setWarningMessage(warningText);
      document.title = '🚨 RETURN TO EXAM NOW!';

      let countdown = 10;
      setGraceSeconds(countdown);

      if (graceTimerRef.current) clearInterval(graceTimerRef.current);

      graceTimerRef.current = setInterval(() => {
        countdown -= 1;
        setGraceSeconds(countdown);

        if (countdown <= 0) {
          if (graceTimerRef.current) {
            clearInterval(graceTimerRef.current);
            graceTimerRef.current = null;
          }
          document.title = originalTitleRef.current;
          // Grace period elapsed without returning: NOW take official punitive action
          triggerViolation(type, violationDetails);
        }
      }, 1000);
    },
    [isActive, triggerViolation]
  );

  useEffect(() => {
    if (!isActive) return;
    originalTitleRef.current = document.title;

    // 1. Fullscreen change listener (Warning first before strike)
    const handleFullscreenChange = () => {
      const inFullscreen = !!document.fullscreenElement;
      setIsFullscreen(inFullscreen);

      if (!inFullscreen) {
        // User clicked Exit Full Screen / Cancel / Esc
        startGraceWarning(
          'fullscreen_exit',
          '⚠️ SECURITY WARNING: You exited full-screen examination mode! Return to full-screen immediately. You have 10 seconds before a violation strike is recorded.',
          'Exited full-screen and did not return within 10s grace period'
        );
      } else {
        // Returned safely to fullscreen!
        if (graceTimerRef.current) {
          clearInterval(graceTimerRef.current);
          graceTimerRef.current = null;
        }
        setGraceSeconds(null);
        setWarningMessage(null);
        document.title = originalTitleRef.current;
      }
    };

    // 2. Window Blur (User clicked on another window or app)
    const handleWindowBlur = () => {
      startGraceWarning(
        'window_switch',
        '⚠️ SECURITY WARNING: You navigated away to another window! Click back into the examination window immediately. You have 10 seconds before a violation strike is recorded.',
        'Switched to another application or window and did not return within 10s'
      );
    };

    // 3. Window Focus (User returned to the exam window)
    const handleWindowFocus = () => {
      document.title = originalTitleRef.current;
      if (document.fullscreenElement) {
        if (graceTimerRef.current) {
          clearInterval(graceTimerRef.current);
          graceTimerRef.current = null;
        }
        setGraceSeconds(null);
        setWarningMessage(null);
      }
    };

    // 4. Tab visibility change (minimized or switched tab)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        startGraceWarning(
          'tab_blur',
          '⚠️ SECURITY WARNING: Switched browser tab or minimized examination! Return to the exam tab immediately.',
          'Switched browser tab or minimized window'
        );
      } else {
        document.title = originalTitleRef.current;
      }
    };

    // 5. Mouse leave detection (Exit intent before leaving)
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 5) {
        playSecurityWarningSound();
        setCursorWarning('⚠️ CAUTION: Cursor leaving exam viewport. Keep your mouse focused on the examination.');
      }
    };
    const handleMouseEnter = () => {
      setCursorWarning(null);
    };

    // 6. Context menu (right-click) prevention
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      playSecurityWarningSound();
      triggerViolation('context_menu', 'Right-click context menu is disabled during exam');
    };

    // 7. Copy / Paste / Cut prevention
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      playSecurityWarningSound();
      triggerViolation('copy_paste', 'Clipboard copy action is strictly prohibited');
    };
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      playSecurityWarningSound();
      triggerViolation('copy_paste', 'Clipboard paste action is strictly prohibited');
    };
    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      playSecurityWarningSound();
      triggerViolation('copy_paste', 'Clipboard cut action is strictly prohibited');
    };

    // 8. Forbidden keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // F12 or Inspect
      if (e.key === 'F12' || (isCtrlOrCmd && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C'))) {
        e.preventDefault();
        playSecurityWarningSound();
        triggerViolation('forbidden_shortcut', 'Attempted to access Developer Tools');
        return;
      }

      // Ctrl/Cmd + C, V, X, U, P, S
      if (isCtrlOrCmd && ['c', 'v', 'x', 'u', 'p', 's'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        playSecurityWarningSound();
        triggerViolation('forbidden_shortcut', `Attempted forbidden shortcut (Cmd/Ctrl + ${e.key.toUpperCase()})`);
        return;
      }

      // Alt+Tab interception hint
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        playSecurityWarningSound();
        return;
      }

      // Escape key interception
      if (e.key === 'Escape') {
        e.preventDefault();
        playSecurityWarningSound();
        // Browser will fire handleFullscreenChange which handles the 10-second warning!
        return;
      }
    };

    // 9. Prevent tab closing or accidental navigation (beforeunload)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Examination is currently in progress. You cannot exit without submitting.';
      return e.returnValue;
    };

    // 10. Trap browser back / forward navigation
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      triggerViolation('window_switch', 'Browser navigation (back/forward) is disabled');
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    // Initial check
    setIsFullscreen(!!document.fullscreenElement);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);

      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
      }
      document.title = originalTitleRef.current;
    };
  }, [isActive, startGraceWarning, triggerViolation]);

  return {
    isFullscreen,
    warningMessage,
    warningCount,
    graceSeconds,
    cursorWarning,
    enterFullscreen,
    clearWarning: () => setWarningMessage(null),
  };
}
