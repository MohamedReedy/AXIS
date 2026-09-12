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
  const [isPrivacyShieldActive, setIsPrivacyShieldActive] = useState<boolean>(false);

  const graceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isReportingRef = useRef<boolean>(false);
  const originalTitleRef = useRef<string>(document.title);
  const departureTimeRef = useRef<number | null>(null);
  const departureReasonRef = useRef<string>('');
  const departureTypeRef = useRef<ViolationType>('tab_blur');

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
      setIsPrivacyShieldActive(false);
      document.title = originalTitleRef.current;
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
        graceTimerRef.current = null;
        setGraceSeconds(null);
      }
    }
  }, []);

  // Trigger official violation reporting
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
            `SECURITY VIOLATION (${result.strike_count}/${maxStrikes}): ${details}. Return to examination immediately.`
          );
        }
      } catch (err) {
        console.error('Failed to report violation:', err);
      } finally {
        setTimeout(() => {
          isReportingRef.current = false;
        }, 1200);
      }
    },
    [isActive, maxStrikes, onViolation, onDisqualify]
  );

  // Start warning grace countdown BEFORE taking punitive action (used for desktop fullscreen exits)
  const startGraceWarning = useCallback(
    (type: ViolationType, warningText: string, violationDetails: string) => {
      if (!isActive) return;

      playSecurityWarningSound();
      setWarningMessage(warningText);
      document.title = '🚨 RETURN TO EXAM NOW!';

      const targetEndTime = Date.now() + 10000;
      setGraceSeconds(10);

      if (graceTimerRef.current) clearInterval(graceTimerRef.current);

      graceTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((targetEndTime - Date.now()) / 1000));
        setGraceSeconds(remaining);

        if (remaining <= 0) {
          if (graceTimerRef.current) {
            clearInterval(graceTimerRef.current);
            graceTimerRef.current = null;
          }
          document.title = originalTitleRef.current;
          triggerViolation(type, violationDetails);
        }
      }, 500);
    },
    [isActive, triggerViolation]
  );

  useEffect(() => {
    if (!isActive) return;
    originalTitleRef.current = document.title;

    // Handle departure (window blur, tab hidden, pagehide)
    const handleDeparture = (type: ViolationType, reason: string) => {
      // Ignore blur if student is typing in an input/textarea and document is still visible
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
        !document.hidden
      ) {
        return;
      }

      // Activate Privacy Shield immediately to mask exam content from OS screenshots / multitasking previews
      setIsPrivacyShieldActive(true);

      if (departureTimeRef.current === null) {
        departureTimeRef.current = Date.now();
        departureReasonRef.current = reason;
        departureTypeRef.current = type;
      }
    };

    // Handle return (window focus, tab visible)
    const handleReturn = () => {
      // Always remove privacy shield when candidate is actively back
      setIsPrivacyShieldActive(false);
      document.title = originalTitleRef.current;

      if (departureTimeRef.current !== null) {
        const awayMs = Date.now() - departureTimeRef.current;
        const awaySeconds = Math.max(1, Math.round(awayMs / 1000));
        const savedReason = departureReasonRef.current;
        const savedType = departureTypeRef.current || 'tab_blur';

        departureTimeRef.current = null;
        departureReasonRef.current = '';

        // If away for >= 1500ms (1.5s), this is an intentional app/tab switch -> STRIKE!
        if (awayMs >= 1500) {
          playSecurityWarningSound();
          if (graceTimerRef.current) {
            clearInterval(graceTimerRef.current);
            graceTimerRef.current = null;
          }
          setGraceSeconds(null);

          const fullReason = `${savedReason} (${awaySeconds}s away)`;
          triggerViolation(savedType, fullReason);
          return;
        }
      }

      // If returning quickly or restoring fullscreen
      if (!isFullscreenSupported() || !!getFullscreenElement()) {
        if (graceTimerRef.current) {
          clearInterval(graceTimerRef.current);
          graceTimerRef.current = null;
        }
        setGraceSeconds(null);
      }
    };

    // 1. Fullscreen change listener
    const handleFullscreenChange = () => {
      const inFullscreen = !isFullscreenSupported() || !!getFullscreenElement();
      setIsFullscreen(inFullscreen);

      if (!inFullscreen && isFullscreenSupported()) {
        // User clicked Exit Full Screen on a device supporting fullscreen
        startGraceWarning(
          'fullscreen_exit',
          '⚠️ SECURITY WARNING: You exited full-screen examination mode! Return to full-screen immediately. You have 10 seconds before a violation strike is recorded.',
          'Exited full-screen and did not return within 10s grace period'
        );
      } else if (inFullscreen) {
        handleReturn();
      }
    };

    // 2. Window Blur (User clicked on another window, opened another app, or snipping tool)
    const handleWindowBlur = () => {
      handleDeparture(
        'window_switch',
        isMobileDevice()
          ? 'Switched mobile app or minimized examination'
          : 'Switched away to another application or window'
      );
    };

    // 3. Window Focus (User returned to the exam window)
    const handleWindowFocus = () => {
      handleReturn();
    };

    // 4. Tab visibility change (minimized or switched tab / switched app)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleDeparture(
          'tab_blur',
          isMobileDevice()
            ? 'Switched mobile app or minimized browser'
            : 'Switched browser tab or minimized window'
        );
      } else {
        handleReturn();
      }
    };

    // 5. Pagehide (Mobile app switch / screen lock / browser minimize on iOS & Android)
    const handlePageHide = () => {
      handleDeparture(
        'window_switch',
        isMobileDevice()
          ? 'Switched to another application or minimized browser'
          : 'Switched application or minimized window'
      );
    };

    // 6. Mouse leave detection (Exit intent before leaving desktop viewport)
    const handleMouseLeave = (e: MouseEvent) => {
      if (isMobileDevice()) return;
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

    // 9. Forbidden keyboard shortcuts & Anti-Screenshot Interception
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // PrintScreen key
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        e.preventDefault();
        e.stopPropagation();
        playSecurityWarningSound();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('⚠️ Screen capture is strictly prohibited during examination.').catch(() => {});
        }
        triggerViolation('forbidden_shortcut', 'Screenshot attempt blocked (PrintScreen key)');
        return;
      }

      // Mac Screenshot shortcuts: Cmd + Shift + 3 / 4 / 5
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        playSecurityWarningSound();
        triggerViolation('forbidden_shortcut', `Screenshot shortcut blocked (Cmd+Shift+${e.key})`);
        return;
      }

      // Windows Snipping shortcut: Win/Ctrl + Shift + S
      if (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        playSecurityWarningSound();
        triggerViolation('forbidden_shortcut', 'Screen snipping shortcut blocked (Win/Ctrl+Shift+S)');
        return;
      }

      // Developer Tools: F12 or Ctrl/Cmd + Shift + I / J / C
      if (e.key === 'F12' || (isCtrlOrCmd && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase()))) {
        e.preventDefault();
        e.stopPropagation();
        playSecurityWarningSound();
        triggerViolation('forbidden_shortcut', 'Attempted to access Developer Tools');
        return;
      }

      // Ctrl/Cmd + C, V, X, U, P (Print / Save)
      if (isCtrlOrCmd && ['c', 'v', 'x', 'u', 'p'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation();
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

    // 10. KeyUp for PrintScreen fallback (some Windows browsers only fire on keyup)
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('⚠️ Screen capture is strictly prohibited during examination.').catch(() => {});
        }
        triggerViolation('forbidden_shortcut', 'Screenshot attempt blocked (PrintScreen)');
      }
    };

    // 11. Prevent tab closing or accidental navigation (beforeunload)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Examination is currently in progress. You cannot exit without submitting.';
      return e.returnValue;
    };

    // 12. Trap browser back / forward navigation (popstate)
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
    window.addEventListener('keyup', handleKeyUp);
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
      window.removeEventListener('keyup', handleKeyUp);
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
    isPrivacyShieldActive,
    warningMessage,
    warningCount,
    graceSeconds,
    cursorWarning,
    enterFullscreen,
    clearWarning: () => setWarningMessage(null),
  };
}
