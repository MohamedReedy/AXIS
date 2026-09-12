import { useEffect, useState, useCallback, useRef } from 'react';
import { ViolationType } from '@/types';
import { playSecurityWarningSound } from '@/lib/sound';

export const isFullscreenSupported = (): boolean => {
  if (typeof document === 'undefined') return false;
  return !!(
    document.fullscreenEnabled ||
    (document as any).webkitFullscreenEnabled ||
    (document as any).mozFullScreenEnabled ||
    (document as any).msFullscreenEnabled
  );
};

export const getFullscreenElement = (): Element | null => {
  if (typeof document === 'undefined') return null;
  return (
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement ||
    null
  );
};

export const isMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (Boolean(navigator.maxTouchPoints) && navigator.maxTouchPoints > 1)
  );
};

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
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => !isFullscreenSupported() || !!getFullscreenElement());
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

  // Request fullscreen utility (cross-browser with mobile fallback)
  const enterFullscreen = useCallback(async () => {
    try {
      const docEl = document.documentElement as any;
      if (!getFullscreenElement() && isFullscreenSupported()) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          await docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen request not supported or declined on this device:', err);
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
      const inFullscreen = !isFullscreenSupported() || !!getFullscreenElement();
      setIsFullscreen(inFullscreen);

      if (!inFullscreen && isFullscreenSupported()) {
        // User clicked Exit Full Screen / Cancel / Esc on a device supporting fullscreen
        startGraceWarning(
          'fullscreen_exit',
          '⚠️ SECURITY WARNING: You exited full-screen examination mode! Return to full-screen immediately. You have 10 seconds before a violation strike is recorded.',
          'Exited full-screen and did not return within 10s grace period'
        );
      } else if (inFullscreen) {
        // Returned safely to fullscreen / active focus!
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
      // If user on mobile merely tapped an input and the page is still visible, ignore synthetic keyboard blur
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !document.hidden) {
        return;
      }

      startGraceWarning(
        'window_switch',
        '⚠️ SECURITY WARNING: You navigated away to another window or app! Return to the examination immediately. You have 10 seconds before a violation strike is recorded.',
        'Switched to another application or window and did not return within 10s'
      );
    };

    // 3. Window Focus (User returned to the exam window)
    const handleWindowFocus = () => {
      document.title = originalTitleRef.current;
      if (!isFullscreenSupported() || !!getFullscreenElement()) {
        if (graceTimerRef.current) {
          clearInterval(graceTimerRef.current);
          graceTimerRef.current = null;
        }
        setGraceSeconds(null);
        setWarningMessage(null);
      }
    };

    // 4. Tab visibility change (minimized or switched tab / switched app)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        startGraceWarning(
          'tab_blur',
          '⚠️ SECURITY WARNING: Switched browser tab or minimized examination! Return to the exam tab immediately.',
          'Switched browser tab or minimized window'
        );
      } else {
        document.title = originalTitleRef.current;
        if (!isFullscreenSupported() || !!getFullscreenElement()) {
          if (graceTimerRef.current) {
            clearInterval(graceTimerRef.current);
            graceTimerRef.current = null;
          }
          setGraceSeconds(null);
          setWarningMessage(null);
        }
      }
    };

    // 5. Pagehide (Mobile app switch / screen lock / browser minimize on iOS & Android)
    const handlePageHide = () => {
      startGraceWarning(
        'window_switch',
        '⚠️ SECURITY WARNING: Switched application or minimized examination! Return to the exam immediately.',
        'Switched application or minimized window on mobile device'
      );
    };

    // 6. Mouse leave detection (Exit intent before leaving desktop viewport)
    const handleMouseLeave = (e: MouseEvent) => {
      if (isMobileDevice()) return; // Ignore synthetic mouse events on mobile touchscreens
      if (e.clientY <= 5) {
        playSecurityWarningSound();
        setCursorWarning('⚠️ CAUTION: Cursor leaving exam viewport. Keep your mouse focused on the examination.');
      }
    };
    const handleMouseEnter = () => {
      setCursorWarning(null);
    };

    // 7. Context menu (right-click / long-press context menu) prevention
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      playSecurityWarningSound();
      triggerViolation('context_menu', 'Right-click context menu is disabled during exam');
    };

    // 8. Copy / Paste / Cut prevention
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

    // 9. Forbidden keyboard shortcuts
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
        return;
      }
    };

    // 10. Prevent tab closing or accidental navigation (beforeunload)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Examination is currently in progress. You cannot exit without submitting.';
      return e.returnValue;
    };

    // 11. Trap browser back / forward navigation (popstate)
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      triggerViolation('window_switch', 'Browser navigation (back/forward) is disabled');
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
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
    setIsFullscreen(!isFullscreenSupported() || !!getFullscreenElement());

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
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
