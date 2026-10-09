import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Award,
  Clock,
  Calendar,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthContext';
import { StudentDashboardLayout } from '@/layouts/StudentDashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MathText } from '@/components/ui/MathText';
import { formatDate } from '@/lib/utils';
import { StudentExamReviewData, StudentReviewQuestion } from '@/types';

export const StudentExamReview: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState<StudentExamReviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<'all' | 'correct' | 'incorrect'>('all');

  const loadReviewData = async () => {
    if (!attemptId) return;
    setIsLoading(true);
    setError(null);
    setIsLocked(false);

    try {
      // 1. Fetch via RPC: get_student_exam_review
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_student_exam_review', {
        p_attempt_id: attemptId,
      });

      if (!rpcErr && rpcData) {
        setData(rpcData as StudentExamReviewData);
      } else {
        // If error message indicates locked scheduled time
        if (rpcErr?.message?.toLowerCase().includes('locked')) {
          setIsLocked(true);
          setError(rpcErr.message);
          return;
        }

        console.warn('RPC fallback triggered:', rpcErr?.message);
        await loadFallbackReviewData();
      }
    } catch (err: any) {
      console.error('Failed to load review:', err);
      setError(err?.message || 'Failed to load exam review');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFallbackReviewData = async () => {
    try {
      // 1. Fetch attempt
      const { data: attempt, error: attemptErr } = await supabase
        .from('exam_attempts')
        .select('*')
        .eq('id', attemptId!)
        .single();

      if (attemptErr || !attempt) throw attemptErr || new Error('Attempt not found');

      // 2. Fetch exam
      const { data: exam, error: examErr } = await supabase
        .from('exams')
        .select('*')
        .eq('id', attempt.exam_id)
        .single();

      if (examErr || !exam) throw examErr || new Error('Exam not found');

      // Check time gate
      const now = new Date();
      const examEndTime = new Date(exam.end_time);
      if (now < examEndTime) {
        setIsLocked(true);
        setError(`This exam review is locked until the scheduled end time (${formatDate(exam.end_time)}) to maintain academic integrity.`);
        return;
      }

      // 3. Fetch questions & choices
      const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .eq('exam_id', exam.id)
        .order('order_index');

      // 4. Fetch choices
      const { data: choices } = await supabase
        .from('question_choices')
        .select('*')
        .order('order_index');

      // 5. Fetch student answers
      const { data: answers } = await supabase
        .from('answers')
        .select('*')
        .eq('attempt_id', attemptId!);

      const answersMap: Record<string, any> = {};
      answers?.forEach((a) => {
        answersMap[a.question_id] = a;
      });

      const choicesMap: Record<string, any[]> = {};
      choices?.forEach((c) => {
        if (!choicesMap[c.question_id]) choicesMap[c.question_id] = [];
        choicesMap[c.question_id].push(c);
      });

      const formattedQuestions: StudentReviewQuestion[] = (questions || []).map((q) => ({
        id: q.id,
        order_index: q.order_index,
        question_text: q.question_text,
        question_type: q.question_type,
        points: q.points,
        image_url: q.image_url,
        choices: choicesMap[q.id] || [],
        student_answer: answersMap[q.id] || null,
      }));

      setData({
        attempt,
        exam,
        questions: formattedQuestions,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load fallback review');
    }
  };

  useEffect(() => {
    loadReviewData();
  }, [attemptId]);

  if (isLoading) {
    return (
      <StudentDashboardLayout>
        <div className="bg-white p-20 rounded-2xl border border-slate-200 text-center shadow-xs">
          <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-500 font-medium">Retrieving exam solutions and grading breakdown...</p>
        </div>
      </StudentDashboardLayout>
    );
  }

  if (isLocked) {
    return (
      <StudentDashboardLayout>
        <div className="bg-white p-12 sm:p-16 rounded-2xl border border-slate-200 text-center shadow-xs max-w-2xl mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Exam Review Currently Locked</h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {error || 'Detailed answers and question solutions are protected until the scheduled exam end time has officially passed for all candidates.'}
          </p>
          <div className="pt-2">
            <Button
              onClick={() => navigate('/student/dashboard')}
              className="rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Return to Assessments Dashboard
            </Button>
          </div>
        </div>
      </StudentDashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <StudentDashboardLayout>
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-xs max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Unable to Load Review</h2>
          <p className="text-xs text-slate-500">{error || 'Exam attempt not found'}</p>
          <Button
            onClick={() => navigate('/student/dashboard')}
            variant="outline"
            className="rounded-xl border-slate-200 text-xs font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to Dashboard
          </Button>
        </div>
      </StudentDashboardLayout>
    );
  }

  const { attempt, exam, questions } = data;

  // Question counts
  const correctCount = questions.filter((q) => q.student_answer?.is_correct === true).length;
  const incorrectCount = questions.filter((q) => q.student_answer?.is_correct === false).length;

  const filteredQuestions = questions.filter((q) => {
    if (filterType === 'correct') return q.student_answer?.is_correct === true;
    if (filterType === 'incorrect') return q.student_answer?.is_correct === false;
    return true;
  });

  return (
    <StudentDashboardLayout>
      <div className="space-y-6">
        {/* Navigation & Back Button */}
        <div>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-blue-700 transition-colors cursor-pointer mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Assessments Dashboard</span>
          </button>
        </div>

        {/* Hero Score Banner */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Graded & Released Assessment</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {exam.title}
              </h1>
              {exam.description && (
                <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                  {exam.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                <span className="flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Submitted {attempt.submitted_at ? formatDate(attempt.submitted_at) : 'N/A'}</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {attempt.strike_count === 0 ? '0 Strikes Recorded' : `${attempt.strike_count} Strikes Logged`}
                  </span>
                </span>
              </div>
            </div>

            {/* Score Highlight Box */}
            <div className="flex items-center gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100 flex-shrink-0">
              <div className="text-right">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Final Grade
                </span>
                <div className="flex items-baseline space-x-1.5 mt-0.5">
                  <span className="text-3xl font-black text-slate-900">{attempt.total_score}</span>
                  <span className="text-sm font-semibold text-slate-400">
                    / {attempt.max_possible_score} pts
                  </span>
                </div>
              </div>

              <div className="h-10 w-px bg-slate-200" />

              <div className="text-center pl-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Accuracy
                </span>
                <span
                  className={`text-3xl font-black mt-0.5 block ${
                    attempt.percentage >= 75
                      ? 'text-emerald-600'
                      : attempt.percentage >= 50
                      ? 'text-blue-600'
                      : 'text-rose-600'
                  }`}
                >
                  {attempt.percentage}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Navigation Bar */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs font-semibold">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-blue-50 text-blue-800 font-bold border border-blue-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Questions ({questions.length})
            </button>
            <button
              onClick={() => setFilterType('correct')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                filterType === 'correct'
                  ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Correct ({correctCount})
            </button>
            <button
              onClick={() => setFilterType('incorrect')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                filterType === 'incorrect'
                  ? 'bg-rose-50 text-rose-800 font-bold border border-rose-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Incorrect ({incorrectCount})
            </button>
          </div>

          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
            Showing {filteredQuestions.length} of {questions.length} items
          </span>
        </div>

        {/* Questions Breakdown List */}
        <div className="space-y-4">
          {filteredQuestions.map((q, idx) => {
            const isCorrect = q.student_answer?.is_correct === true;
            const pointsEarned = q.student_answer?.points_earned ?? 0;
            const selectedChoiceId = q.student_answer?.selected_choice_id;

            return (
              <div
                key={q.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4 transition-all"
              >
                {/* Question Header: Number, Points, Status Badge */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center">
                      {q.order_index}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {q.question_type === 'multiple_choice'
                        ? 'Multiple Choice'
                        : q.question_type === 'true_false'
                        ? 'True / False'
                        : 'Short Answer'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    {/* Points Pill */}
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                        isCorrect
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {pointsEarned} / {q.points} pt{q.points !== 1 ? 's' : ''}
                    </span>

                    {/* Result Badge */}
                    {isCorrect ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Correct</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Incorrect</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Question Prompt with KaTeX Math Rendering */}
                <div className="text-sm font-semibold text-slate-900 leading-relaxed">
                  <MathText content={q.question_text} />
                </div>

                {/* Attached Diagram / Image */}
                {q.image_url && (
                  <div className="p-2 border border-slate-200 rounded-xl bg-slate-50 max-w-md">
                    <img
                      src={q.image_url}
                      alt={`Diagram for Question ${q.order_index}`}
                      className="max-h-60 rounded-lg object-contain w-full"
                    />
                  </div>
                )}

                {/* Choices Breakdown for MC / True-False */}
                {q.question_type !== 'short_answer' && q.choices && (
                  <div className="space-y-2 pt-2">
                    {q.choices.map((choice, cIdx) => {
                      const letter = String.fromCharCode(65 + cIdx);
                      const isSelected = selectedChoiceId === choice.id;
                      const isChoiceCorrect = choice.is_correct === true;

                      let choiceClass =
                        'border-slate-200 bg-white text-slate-700 hover:border-slate-300';
                      let badge = null;

                      if (isSelected && isChoiceCorrect) {
                        // Correctly chosen
                        choiceClass =
                          'border-emerald-400 bg-emerald-50/70 text-emerald-950 font-medium ring-1 ring-emerald-400';
                        badge = (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Your Answer (Correct)</span>
                          </span>
                        );
                      } else if (isSelected && !isChoiceCorrect) {
                        // Incorrect choice by candidate
                        choiceClass =
                          'border-rose-400 bg-rose-50/70 text-rose-950 font-medium ring-1 ring-rose-400';
                        badge = (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>Your Answer (Incorrect)</span>
                          </span>
                        );
                      } else if (!isSelected && isChoiceCorrect) {
                        // The correct answer that student missed
                        choiceClass =
                          'border-emerald-300 bg-emerald-50/30 text-emerald-900 border-dashed';
                        badge = (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Correct Answer</span>
                          </span>
                        );
                      }

                      return (
                        <div
                          key={choice.id}
                          className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${choiceClass}`}
                        >
                          <div className="flex items-center space-x-3">
                            <span
                              className={`w-6 h-6 rounded-lg font-bold text-[11px] flex items-center justify-center flex-shrink-0 ${
                                isSelected
                                  ? isChoiceCorrect
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-rose-600 text-white'
                                  : isChoiceCorrect
                                  ? 'bg-emerald-200 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {letter}
                            </span>
                            <div className="font-medium text-slate-800">
                              <MathText content={choice.choice_text} />
                            </div>
                          </div>

                          {badge && <div>{badge}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Short Answer Breakdown */}
                {q.question_type === 'short_answer' && (
                  <div className="space-y-3 pt-2">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Your Submitted Response:
                      </span>
                      <p className="text-xs font-semibold text-slate-900 font-mono">
                        {q.student_answer?.text_answer || (
                          <span className="italic text-slate-400">No response provided</span>
                        )}
                      </p>
                    </div>

                    {q.choices?.[0]?.choice_text && (
                      <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                        <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
                          Correct Expected Answer:
                        </span>
                        <p className="text-xs font-bold text-emerald-950 font-mono">
                          {q.choices[0].choice_text}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </StudentDashboardLayout>
  );
};
