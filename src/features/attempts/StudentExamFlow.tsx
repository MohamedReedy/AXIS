import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Shield,
  Clock,
  Calendar,
  AlertTriangle,
  Maximize2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Send,
  Lock,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabase';
import { Exam, Question, QuestionChoice, AttemptStatus, ViolationType } from '@/types';
import { StudentLayout } from '@/layouts/StudentLayout';
import { useLockdown } from '@/features/lockdown/useLockdown';
import { LockdownOverlay } from '@/components/lockdown/LockdownOverlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatTimeRemaining, getExamSlug } from '@/lib/utils';
import { parseExamConfig } from '@/lib/examConfig';

type ExamStep = 'lobby' | 'rules' | 'taking' | 'completed' | 'disqualified' | 'expired';

export const StudentExamFlow: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();

  // Exam and Question state
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, { choiceId?: string; text?: string }>>({});

  // Student Identity
  const [studentName, setStudentName] = useState<string>('');
  const [studentEmail, setStudentEmail] = useState<string>('');
  const [studentCode, setStudentCode] = useState<string>('');

  // Attempt State
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [step, setStep] = useState<ExamStep>('lobby');
  const [deadlineAt, setDeadlineAt] = useState<Date | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [strikes, setStrikes] = useState<number>(0);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [maxScore, setMaxScore] = useState<number | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [lastSavedText, setLastSavedText] = useState<string>('No answers saved yet');

  // Status & Loading
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);
  const [windowState, setWindowState] = useState<'early' | 'open' | 'closed'>('open');
  const [timeUntilStart, setTimeUntilStart] = useState<number>(0);

  // Update last saved relative time string
  useEffect(() => {
    if (!lastSavedTime) return;
    const updateSavedText = () => {
      const elapsed = Math.floor((Date.now() - lastSavedTime.getTime()) / 1000);
      if (elapsed < 5) {
        setLastSavedText('Saved just now');
      } else if (elapsed < 60) {
        setLastSavedText(`Saved ${elapsed}s ago`);
      } else {
        const mins = Math.floor(elapsed / 60);
        setLastSavedText(`Saved ${mins}m ago`);
      }
    };
    updateSavedText();
    const interval = setInterval(updateSavedText, 3000);
    return () => clearInterval(interval);
  }, [lastSavedTime]);

  // Fetch Public Exam Details
  useEffect(() => {
    if (!examId) return;

    const fetchPublicExam = async () => {
      try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(examId);
        let examObj: Exam | null = null;

        if (isUUID) {
          const { data, error: examErr } = await supabase
            .from('exams')
            .select('id, title, description, instructions, status, start_time, end_time, duration_minutes, max_strikes')
            .eq('id', examId)
            .single();

          if (examErr) throw examErr;
          examObj = data as Exam;
        } else {
          // Slug or clean title search (e.g. /exam/test or /exam/midterm-physics)
          const decodedParam = decodeURIComponent(examId).trim();
          const targetSlug = getExamSlug(decodedParam);

          // 1. Try exact or case-insensitive title match
          const { data: titleMatch } = await supabase
            .from('exams')
            .select('id, title, description, instructions, status, start_time, end_time, duration_minutes, max_strikes')
            .ilike('title', decodedParam.replace(/-/g, ' '))
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (titleMatch) {
            examObj = titleMatch as Exam;
          } else {
            // 2. Query exams and match against generated slug
            const { data: allExams, error: allErr } = await supabase
              .from('exams')
              .select('id, title, description, instructions, status, start_time, end_time, duration_minutes, max_strikes')
              .order('created_at', { ascending: false });

            if (allErr) throw allErr;
            if (allExams && allExams.length > 0) {
              const matched = allExams.find(
                (e) => getExamSlug(e.title) === targetSlug || e.title.toLowerCase() === decodedParam.toLowerCase()
              );
              if (matched) {
                examObj = matched as Exam;
              }
            }
          }

          if (!examObj) {
            throw new Error(`Examination "${decodedParam}" not found or link is invalid.`);
          }
        }

        setExam(examObj);

        // Schedule check
        const now = new Date().getTime();
        const start = new Date(examObj.start_time).getTime();
        const end = new Date(examObj.end_time).getTime();

        if (now < start) {
          setWindowState('early');
          setTimeUntilStart(Math.floor((start - now) / 1000));
        } else if (now > end) {
          setWindowState('closed');
        } else {
          setWindowState('open');
        }
      } catch (err: any) {
        console.error('Failed to load exam:', err);
        setError(err?.message || 'Exam not found or link is invalid.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPublicExam();
  }, [examId]);

  // Schedule Countdown for Early Access
  useEffect(() => {
    if (windowState !== 'early') return;

    const timer = setInterval(() => {
      setTimeUntilStart((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setWindowState('open');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [windowState]);

  // Exam Duration Countdown Timer
  useEffect(() => {
    if (step !== 'taking' || !deadlineAt) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const diff = Math.floor((deadlineAt.getTime() - now) / 1000);

      if (diff <= 0) {
        clearInterval(timer);
        setSecondsRemaining(0);
        handleAutoSubmit('expired');
      } else {
        setSecondsRemaining(diff);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [step, deadlineAt]);

  // Violation Reporter callback
  const handleReportViolation = async (type: ViolationType, details?: string) => {
    if (!attemptId) return { strike_count: strikes, is_disqualified: false };

    try {
      const { data, error: rpcErr } = await supabase.rpc('record_violation', {
        p_attempt_id: attemptId,
        p_violation_type: type,
        p_details: details || null,
      });

      if (rpcErr) {
        // Fallback: manually update attempt
        const newStrikes = strikes + 1;
        setStrikes(newStrikes);
        const isDisq = newStrikes >= (exam?.max_strikes || 3);
        await supabase.from('violations').insert([{ attempt_id: attemptId, violation_type: type, details }]);
        await supabase
          .from('exam_attempts')
          .update({
            strike_count: newStrikes,
            status: isDisq ? 'disqualified' : 'in_progress',
            submitted_at: isDisq ? new Date().toISOString() : null,
          })
          .eq('id', attemptId);
        return { strike_count: newStrikes, is_disqualified: isDisq };
      }

      setStrikes(data.strike_count);
      return data;
    } catch (err) {
      console.error('Error logging violation:', err);
      return { strike_count: strikes + 1, is_disqualified: false };
    }
  };

  // Disqualification callback
  const handleDisqualification = () => {
    setStep('disqualified');
  };

  // Anti-Cheat Lockdown Hook
  const { isFullscreen, warningMessage, warningCount, graceSeconds, cursorWarning, enterFullscreen } = useLockdown({
    isActive: step === 'taking',
    maxStrikes: exam?.max_strikes || 3,
    currentStrikes: strikes,
    onViolation: handleReportViolation,
    onDisqualify: handleDisqualification,
  });

  // Start Exam Attempt
  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exam || !studentName.trim() || !studentEmail.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      // 1. Call start_exam RPC
      const { data, error: rpcErr } = await supabase.rpc('start_exam', {
        p_exam_id: exam.id,
        p_student_name: studentName,
        p_student_email: studentEmail,
        p_student_code: studentCode || null,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      if (!data?.attempt_id) {
        throw new Error('Unable to initialize exam session. Please contact your administrator.');
      }

      const currentAttemptId = data.attempt_id;
      const deadlineDate = new Date(data.deadline_at);
      setStrikes(data.strike_count || 0);

      setAttemptId(currentAttemptId);
      setDeadlineAt(deadlineDate);

      // 2. Load Questions for this exam (Choices without exposing is_correct)
      const { data: qData, error: qErr } = await supabase
        .from('questions')
        .select(`
          id,
          exam_id,
          order_index,
          question_text,
          question_type,
          points,
          created_at,
          choices:question_choices(id, question_id, order_index, choice_text)
        `)
        .eq('exam_id', exam.id)
        .order('order_index');

      if (qErr) throw qErr;

      setQuestions(qData as Question[]);
      setStep('rules');
    } catch (err: any) {
      console.error('Failed to start attempt:', err);
      setError(err?.message || 'Could not begin exam attempt.');
    } finally {
      setIsLoading(false);
    }
  };

  // Transition from rules to active exam with fullscreen
  const handleBeginWithFullscreen = async () => {
    await enterFullscreen();
    setStep('taking');
  };

  // Save student answer on option click
  const handleSelectChoice = async (questionId: string, choiceId: string) => {
    setStudentAnswers((prev) => ({
      ...prev,
      [questionId]: { choiceId },
    }));
    setLastSavedTime(new Date());
    setLastSavedText('Saved just now');

    if (!attemptId) return;

    // Save to database
    try {
      const { error: rpcErr } = await supabase.rpc('save_student_answer', {
        p_attempt_id: attemptId,
        p_question_id: questionId,
        p_selected_choice_id: choiceId,
        p_text_answer: null,
      });
      if (rpcErr) throw rpcErr;
    } catch {
      // Fallback
      await supabase.from('answers').upsert({
        attempt_id: attemptId,
        question_id: questionId,
        selected_choice_id: choiceId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'attempt_id,question_id' });
    }
  };

  const handleShortAnswerChange = async (questionId: string, text: string) => {
    setStudentAnswers((prev) => ({
      ...prev,
      [questionId]: { text },
    }));
    setLastSavedTime(new Date());
    setLastSavedText('Saved just now');

    if (!attemptId) return;

    try {
      const { error: rpcErr } = await supabase.rpc('save_student_answer', {
        p_attempt_id: attemptId,
        p_question_id: questionId,
        p_selected_choice_id: null,
        p_text_answer: text,
      });
      if (rpcErr) throw rpcErr;
    } catch {
      await supabase.from('answers').upsert({
        attempt_id: attemptId,
        question_id: questionId,
        text_answer: text,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'attempt_id,question_id' });
    }
  };

  // Manual or Auto Submit
  const handleAutoSubmit = async (reason: 'manual' | 'expired') => {
    if (!attemptId || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_exam', {
        p_attempt_id: attemptId,
      });

      if (!rpcErr && data) {
        setFinalScore(data.total_score);
        setMaxScore(data.max_possible_score);
      }

      // Exit fullscreen safely
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });

      setStep(reason === 'expired' ? 'expired' : 'completed');
    } catch (err: any) {
      console.error('Submission error:', err);
      setStep('completed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <StudentLayout>
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 rounded-full border-3 border-axis-blue/20 border-t-axis-blue animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading examination environment...</p>
        </div>
      </StudentLayout>
    );
  }

  if (error && step === 'lobby') {
    return (
      <StudentLayout>
        <div className="max-w-md w-full p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-5 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto text-red-600 border border-red-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-black text-slate-900">Examination Notice</h2>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">{error}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setError(null)}
            className="w-full"
          >
            Try Another Email
          </Button>
        </div>
      </StudentLayout>
    );
  }

  // Early Schedule Waiting Screen
  if (windowState === 'early') {
    return (
      <StudentLayout>
        <div className="max-w-lg w-full p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-6 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto text-axis-blue border border-sky-100">
            <Clock className="w-7 h-7 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <div className="eyebrow-axis">Upcoming Assessment</div>
            <h2 className="text-2xl font-black text-slate-900">{exam?.title}</h2>
            <p className="text-xs text-slate-500">This examination is scheduled but not open yet.</p>
          </div>
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Opens in:
            </span>
            <div className="text-3xl font-mono font-black text-axis-blue">
              {formatTimeRemaining(timeUntilStart)}
            </div>
            <div className="text-xs text-slate-400 pt-2">
              Scheduled start: {formatDate(exam?.start_time)}
            </div>
          </div>
        </div>
      </StudentLayout>
    );
  }

  // Closed Schedule Screen
  if (windowState === 'closed') {
    return (
      <StudentLayout>
        <div className="max-w-md w-full p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto text-red-600 border border-red-100">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Exam Window Closed</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            The scheduled testing window for this examination closed on {formatDate(exam?.end_time)}.
          </p>
        </div>
      </StudentLayout>
    );
  }

  // PHASE 1: LOBBY & IDENTIFICATION
  if (step === 'lobby') {
    return (
      <StudentLayout>
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6">
          <div className="text-center space-y-2">
            <img
              src="/axis-logo.png"
              alt="AXIS"
              className="w-16 h-16 mx-auto object-contain mb-2"
            />
            <div className="eyebrow-axis">Examination Registration</div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{exam?.title}</h1>
            <p className="text-xs text-slate-500 leading-relaxed">{exam?.description || 'Please enter your candidate credentials to access this assessment.'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 text-xs">
            <div className="flex items-center space-x-2 text-slate-700 font-medium">
              <Clock className="w-3.5 h-3.5 text-axis-blue flex-shrink-0" />
              <span>{exam?.duration_minutes} Mins Duration</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-700 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span>Max {exam?.max_strikes} Violations</span>
            </div>
          </div>

          <form onSubmit={handleStartExam} className="space-y-4">
            <Input
              label="Candidate Full Name"
              placeholder="e.g. John Doe"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              required
            />
            <Input
              label="Email Address"
              type="email"
              placeholder="student@example.com"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              required
            />
            <Input
              label="Student / Candidate ID (Optional)"
              placeholder="e.g. STU-1049"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value)}
            />

            <Button
              type="submit"
              size="lg"
              className="w-full mt-3 bg-[#0052D4] hover:bg-[#0041A8] active:bg-[#00358A] text-white font-bold py-3 shadow-xs hover:shadow-md hover:brightness-105 transition-all cursor-pointer border border-[#0052D4]"
              isLoading={isLoading}
            >
              Proceed to Security Check
            </Button>
          </form>
        </div>
      </StudentLayout>
    );
  }

  // PHASE 2 & 3: RULES & FULLSCREEN ACTIVATION
  if (step === 'rules') {
    return (
      <StudentLayout>
        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 border border-red-100 flex-shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="eyebrow-axis">Pre-Flight Security Check</div>
              <h2 className="text-xl font-black text-slate-900">Browser Security Lockdown</h2>
              <p className="text-xs text-slate-500">Please review anti-cheating regulations before launching</p>
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3 text-xs text-slate-700">
            <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              Enforced Proctoring Protocol:
            </div>
            <ul className="space-y-2.5 list-disc list-inside text-slate-600">
              <li>
                <strong className="text-slate-900">Mandatory Full-Screen:</strong> The exam will lock your screen into full-screen. Exiting triggers an immediate warning siren and countdown.
              </li>
              <li>
                <strong className="text-slate-900">No Tab or Window Switching:</strong> Leaving or blurring the window will register an official anti-cheat strike.
              </li>
              <li>
                <strong className="text-slate-900">Clipboard & Inspection Blocked:</strong> Right-click, Copy, Cut, Paste, and devtools shortcuts are strictly disabled.
              </li>
              <li>
                <strong className="text-slate-900">Disqualification Threshold:</strong> Accumulating {exam?.max_strikes} strikes results in immediate disqualification and zero grade.
              </li>
            </ul>
          </div>

          <Button
            size="lg"
            onClick={handleBeginWithFullscreen}
            className="w-full flex items-center justify-center space-x-2 bg-[#0052D4] hover:bg-[#0041A8] active:bg-[#00358A] text-white font-bold py-3 shadow-xs hover:shadow-md hover:brightness-105 transition-all cursor-pointer border border-[#0052D4]"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Enter Fullscreen & Begin Exam</span>
          </Button>
        </div>
      </StudentLayout>
    );
  }

  // PHASE 4: ACTIVE LOCKED EXAM (Section 6 Prototype Style)
  if (step === 'taking') {
    const currentQ = questions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === questions.length - 1;
    const answeredCount = Object.keys(studentAnswers).length;
    const unansweredCount = Math.max(0, questions.length - answeredCount);

    return (
      <div className="fixed inset-0 z-40 bg-slate-50 text-slate-900 flex flex-col lockdown-active">
        {/* Anti-Cheat Overlay (pops up on violation) */}
        <LockdownOverlay
          isVisible={!isFullscreen || !!warningMessage}
          warningCount={warningCount}
          maxStrikes={exam?.max_strikes || 3}
          message={warningMessage}
          graceSeconds={graceSeconds}
          onReturnToFullscreen={enterFullscreen}
        />

        {/* Top Header Bar with Logo, Timer & Strike Count */}
        <header className="h-16 px-6 bg-white border-b border-slate-200 flex items-center justify-between shadow-xs sticky top-0 z-30">
          <div className="flex items-center space-x-3.5">
            <img
              src="/axis-logo.png"
              alt="AXIS"
              className="w-8 h-8 object-contain"
            />
            <div className="leading-tight">
              <span className="font-black text-slate-900 text-sm tracking-tight block">
                AXIS • <span className="font-medium text-slate-600">{exam?.title}</span>
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Candidate: {studentName}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Strikes indicator */}
            <span className={strikes > 0 ? 'badge-pill badge-bad font-black' : 'badge-pill badge-ok font-bold'}>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Strikes: {strikes} / {exam?.max_strikes || 3}</span>
            </span>

            {/* Server Timer countdown */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-axis-blue font-mono font-black text-sm">
              <Clock className="w-4 h-4 text-axis-blue animate-pulse" />
              <span>{formatTimeRemaining(secondsRemaining)}</span>
              <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase hidden sm:inline">server</span>
            </div>
          </div>
        </header>

        {/* Active Warning Banner when strikes > 0 */}
        {strikes > 0 && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-2.5 flex items-center justify-between text-xs text-red-700 animate-pulse-subtle">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 animate-bounce" />
              <span>
                <strong>Security Alert:</strong> {strikes} of {exam?.max_strikes || 3} cheating violation strikes recorded.
                Exiting full-screen or switching tabs will result in automatic disqualification!
              </span>
            </div>
            <span className="font-bold text-red-700 font-mono hidden sm:inline">
              {(exam?.max_strikes || 3) - strikes} strike{((exam?.max_strikes || 3) - strikes) === 1 ? '' : 's'} remaining
            </span>
          </div>
        )}

        {/* Cursor Exit Intent Alert */}
        {cursorWarning && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-center space-x-2 text-xs text-amber-800 font-bold animate-pulse">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{cursorWarning}</span>
          </div>
        )}

        {/* Exam Body - Section 6 Prototype Split Layout */}
        <main className="flex-1 max-w-[1460px] w-full mx-auto p-4 sm:p-6 flex flex-col justify-between overflow-y-auto">
          {/* Breadcrumb strip */}
          <div className="hero-axis mb-5 py-3.5 px-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="eyebrow-axis text-[10px]">Sprint 2 • Examination Runtime</div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">{exam?.title}</h2>
              </div>
              <div className="goal-pill py-1 text-[11px]">
                ◆ Server owns timer • item order • answers • submit state
              </div>
            </div>
          </div>

          <div className="split-axis items-start">
            {/* Left Column: Question Card */}
            {currentQ && (
              <div className="card-axis space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <span className="badge-pill badge-axis font-bold text-[11px]">Course Exam</span>
                    <span className="badge-pill badge-info text-[10px] uppercase font-bold">
                      {currentQ.question_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-right">
                    <b className="text-base font-black font-mono text-axis-blue">{formatTimeRemaining(secondsRemaining)}</b>
                    <div className="text-[10px] text-slate-400 font-medium">server time</div>
                  </div>
                </div>

                {/* Question progress */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>
                    Question <strong className="text-slate-900 font-bold">{currentQuestionIndex + 1}</strong> of{' '}
                    {questions.length}
                  </span>
                  <span className="font-bold text-emerald-600">({currentQ.points} Pts)</span>
                </div>

                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-axis-cyan to-axis-blue h-full transition-all duration-300"
                    style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                  />
                </div>

                {/* Question Text */}
                <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed pt-2 select-none">
                  {currentQ.question_text}
                </h3>

                {/* Options List (.list-item-axis from prototype) */}
                {currentQ.question_type === 'short_answer' ? (
                  <div className="pt-2">
                    <input
                      type="text"
                      value={studentAnswers[currentQ.id]?.text || ''}
                      onChange={(e) => handleShortAnswerChange(currentQ.id, e.target.value)}
                      placeholder="Type your answer here..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-axis-blue focus:outline-none focus:ring-2 focus:ring-axis-blue/15"
                    />
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-2">
                    {currentQ.choices?.map((choice) => {
                      const isSelected = studentAnswers[currentQ.id]?.choiceId === choice.id;
                      return (
                        <label
                          key={choice.id}
                          onClick={() => handleSelectChoice(currentQ.id, choice.id)}
                          className={`list-item-axis ${isSelected ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={`q_${currentQ.id}`}
                            checked={isSelected}
                            readOnly
                            className="w-4 h-4 text-axis-blue focus:ring-axis-blue border-slate-300 cursor-pointer"
                          />
                          <span className="text-sm font-medium text-slate-800 select-none">
                            {choice.choice_text}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                <hr className="my-5 border-slate-100" />

                {/* Action Buttons Row */}
                <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentQuestionIndex === 0}
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                    className="flex items-center space-x-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </Button>

                  <div className="flex items-center space-x-2">
                    {!isLastQuestion ? (
                      <Button
                        size="sm"
                        onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                        className="flex items-center space-x-1"
                      >
                        <span>Save & Next</span>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => setIsSubmitModalOpen(true)}
                        isLoading={isSubmitting}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center space-x-1.5 border-0 shadow-sm"
                      >
                        <span>Submit Exam</span>
                        <Send className="w-4 h-4" />
                      </Button>
                    )}

                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setIsSubmitModalOpen(true)}
                      isLoading={isSubmitting}
                    >
                      Submit Attempt
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Right Column: Attempt State Card (from Section 6 Prototype) */}
            <div className="space-y-4">
              <div className="card-axis space-y-4">
                <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Attempt state</h3>
                <div className="kv-axis">
                  <b>Attempt</b>
                  <span className="font-semibold text-slate-800">1 of 1</span>
                  
                  <b>Form</b>
                  <span className="text-slate-700">Form A • version locked</span>
                  
                  <b>Candidate</b>
                  <span className="font-bold text-slate-900 truncate">{studentName}</span>

                  <b>Answered</b>
                  <span>
                    <strong className="text-axis-blue font-bold">{answeredCount}</strong> of {questions.length} items
                  </span>

                  <b>Last answer</b>
                  <span className="text-slate-700 font-medium">{lastSavedText}</span>

                  <b>Timer authority</b>
                  <span className="badge-pill badge-ok">Server</span>

                  <b>CRM dependency</b>
                  <span className="badge-pill badge-ok">None</span>

                  <b>Proctoring status</b>
                  <span className="badge-pill badge-axis">Enforced</span>

                  <b>Violations</b>
                  <span className={strikes > 0 ? 'badge-pill badge-bad font-black' : 'badge-pill badge-ok font-bold'}>
                    {strikes} of {exam?.max_strikes || 3}
                  </span>
                </div>
              </div>

              {/* Callout box directly from prototype */}
              <div className="callout-axis warn">
                <b>Tampering:</b> changing a client-side timer or score is ignored and logged as a security event. Tab switching, window blurs, or exiting full-screen triggers an official strike!
              </div>

              {/* Question Navigation Palette */}
              <div className="card-axis">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Item Overview</h4>
                <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                  {questions.map((q, idx) => {
                    const isAnswered = !!studentAnswers[q.id]?.choiceId || !!studentAnswers[q.id]?.text;
                    const isCurrent = currentQuestionIndex === idx;

                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrentQuestionIndex(idx)}
                        className={`h-9 rounded-xl font-bold text-xs flex items-center justify-center transition-all border cursor-pointer ${
                          isCurrent
                            ? 'bg-[#0052D4] text-white border-[#0052D4] shadow-sm ring-2 ring-[#0052D4]/30'
                            : isAnswered
                            ? 'bg-sky-50 text-[#0052D4] border-sky-200 hover:bg-sky-100'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="leading-none">{idx + 1}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* In-Fullscreen Submission Confirmation Modal */}
        {isSubmitModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-150">
            <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-left p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-150">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-[#0052D4]/10 border border-[#0052D4]/20 flex items-center justify-center text-[#0052D4] flex-shrink-0">
                  <Send className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Ready to Submit Exam?</h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Please review your completion status before ending your exam session.
                  </p>
                </div>
              </div>

              {/* Progress & Item Summary */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2.5 py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Questions</span>
                    <span className="text-lg font-black text-slate-800">{questions.length}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Answered</span>
                    <span className="text-lg font-black text-emerald-600">{answeredCount}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${unansweredCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      Unanswered
                    </span>
                    <span className={`text-lg font-black ${unansweredCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {unansweredCount}
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#0052D4] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0}%` }}
                  />
                </div>
              </div>

              {/* Warning / Status Note */}
              {unansweredCount > 0 ? (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start space-x-3 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Unanswered questions detected: </span>
                    You have <strong>{unansweredCount} unanswered</strong> item{unansweredCount > 1 ? 's' : ''}. Unanswered questions will receive 0 marks. You can return to the exam or approve to submit now.
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start space-x-3 text-xs text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">All questions answered: </span>
                    All {questions.length} questions have been answered. You are ready to finalize your attempt.
                  </div>
                </div>
              )}

              {/* Callout Notice */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-800">Notice:</strong> Approving this confirmation will immediately end your exam session, exit full-screen mode, and permanently submit your answers.
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setIsSubmitModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4"
                >
                  Return to Exam
                </Button>
                <Button
                  size="md"
                  onClick={() => {
                    setIsSubmitModalOpen(false);
                    handleAutoSubmit('manual');
                  }}
                  isLoading={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center space-x-2 border-0 shadow-sm px-5"
                >
                  <span>Confirm & End Exam</span>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PHASE 5: COMPLETION / DISQUALIFICATION / EXPIRED
  return (
    <StudentLayout>
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center space-y-6">
        {step === 'completed' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <div className="eyebrow-axis">Attempt Finalized</div>
              <h2 className="text-2xl font-black text-slate-900">Exam Submitted Successfully</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your responses have been securely transmitted to the examination board.
              </p>
            </div>
            {parseExamConfig(exam?.instructions).showScoreToStudent && finalScore !== null && maxScore !== null ? (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-500 block uppercase tracking-wider font-bold">
                  Preliminary Score
                </span>
                <span className="text-3xl font-black text-emerald-600 font-mono">
                  {finalScore} / {maxScore}
                </span>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="font-bold text-slate-900">Scores Withheld by Administrator</div>
                <p className="text-slate-500 leading-relaxed">
                  Your responses have been recorded. Official grades are hidden and will be released following administrative review.
                </p>
              </div>
            )}
          </>
        )}

        {step === 'disqualified' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto text-red-600">
              <Shield className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <div className="eyebrow-axis text-red-600">Proctoring Enforcement</div>
              <h2 className="text-2xl font-black text-red-600">Exam Disqualified</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                You exceeded the maximum allowed anti-cheating violations ({strikes} strikes recorded).
                Your attempt has been terminated and reported to your administrator.
              </p>
            </div>
          </>
        )}

        {step === 'expired' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
              <Clock className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <div className="eyebrow-axis text-amber-600">Time Limit Reached</div>
              <h2 className="text-2xl font-black text-slate-900">Time Expired</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your exam duration has elapsed. Answers recorded up to this point have been submitted.
              </p>
            </div>
          </>
        )}

        <div className="pt-2 text-xs text-slate-400 font-medium">
          You may now safely close this browser window.
        </div>
      </div>
    </StudentLayout>
  );
};
