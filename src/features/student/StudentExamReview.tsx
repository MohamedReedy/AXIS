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
  Check,
  Sparkles,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthContext';
import { StudentDashboardLayout } from '@/layouts/StudentDashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MathText } from '@/components/ui/MathText';
import { formatDate, parseQuestionContent } from '@/lib/utils';
import { StudentExamReviewData, StudentReviewQuestion } from '@/types';

export const StudentExamReview: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState<StudentExamReviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<'all' | 'correct' | 'incorrect' | 'unanswered'>('all');

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

      if (!rpcErr && rpcData && rpcData.questions && rpcData.questions.length > 0) {
        // Ensure choices are sorted by order_index
        rpcData.questions.forEach((q: any) => {
          if (q.choices && Array.isArray(q.choices)) {
            q.choices.sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));
          }
        });
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
      await loadFallbackReviewData();
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

      // 3. Fetch questions with nested choices
      const { data: questions, error: qErr } = await supabase
        .from('questions')
        .select(`
          id,
          exam_id,
          order_index,
          question_text,
          question_type,
          points,
          choices:question_choices(id, question_id, order_index, choice_text, is_correct)
        `)
        .eq('exam_id', exam.id)
        .order('order_index');

      if (qErr) throw qErr;

      // If question_choices were blocked by RLS, load from student_question_choices view
      const hasEmptyChoices = (questions || []).some(
        (q: any) => q.question_type !== 'short_answer' && (!q.choices || q.choices.length === 0)
      );

      const fallbackChoicesMap: Record<string, any[]> = {};
      if (hasEmptyChoices && questions && questions.length > 0) {
        const questionIds = questions.map((q: any) => q.id);
        const { data: viewChoices } = await supabase
          .from('student_question_choices')
          .select('id, question_id, order_index, choice_text')
          .in('question_id', questionIds)
          .order('order_index');

        if (viewChoices) {
          viewChoices.forEach((c) => {
            if (!fallbackChoicesMap[c.question_id]) fallbackChoicesMap[c.question_id] = [];
            fallbackChoicesMap[c.question_id].push(c);
          });
        }
      }

      // 4. Fetch student answers for this attempt
      const { data: answers } = await supabase
        .from('answers')
        .select('*')
        .eq('attempt_id', attemptId!);

      const answersMap: Record<string, any> = {};
      answers?.forEach((a) => {
        answersMap[a.question_id] = a;
      });

      const formattedQuestions: StudentReviewQuestion[] = (questions || []).map((q: any) => {
        const rawChoices = (q.choices && q.choices.length > 0)
          ? q.choices
          : (fallbackChoicesMap[q.id] || []);

        const sortedChoices = [...rawChoices].sort(
          (a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)
        );

        // If choice.is_correct is not defined, infer from student answer if they were correct
        const ans = answersMap[q.id];
        if (ans && ans.is_correct && ans.selected_choice_id) {
          sortedChoices.forEach((c: any) => {
            if (c.id === ans.selected_choice_id) {
              c.is_correct = true;
            }
          });
        }

        return {
          id: q.id,
          order_index: q.order_index,
          question_text: q.question_text,
          question_type: q.question_type,
          points: q.points,
          choices: sortedChoices,
          student_answer: answersMap[q.id] || null,
        };
      });

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

  // Breakdown statistics
  const correctCount = questions.filter((q) => q.student_answer?.is_correct === true).length;
  const incorrectCount = questions.filter((q) => {
    const ans = q.student_answer;
    const hasAnswered = ans && (ans.selected_choice_id || (ans.text_answer && ans.text_answer.trim() !== ''));
    return ans?.is_correct === false && hasAnswered;
  }).length;
  const unansweredCount = questions.filter((q) => {
    const ans = q.student_answer;
    return !ans || (!ans.selected_choice_id && (!ans.text_answer || ans.text_answer.trim() === ''));
  }).length;

  const filteredQuestions = questions.filter((q) => {
    const ans = q.student_answer;
    const isCorrect = ans?.is_correct === true;
    const hasAnswered = ans && (ans.selected_choice_id || (ans.text_answer && ans.text_answer.trim() !== ''));

    if (filterType === 'correct') return isCorrect;
    if (filterType === 'incorrect') return !isCorrect && hasAnswered;
    if (filterType === 'unanswered') return !hasAnswered;
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
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs">
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
                  <span>Submitted: {attempt.submitted_at ? formatDate(attempt.submitted_at) : 'N/A'}</span>
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
            <div className="flex items-center gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex-shrink-0 shadow-xs">
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
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-1.5 text-xs font-semibold overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                filterType === 'all'
                  ? 'bg-blue-50 text-blue-800 font-bold border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              All Items ({questions.length})
            </button>
            <button
              onClick={() => setFilterType('correct')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                filterType === 'correct'
                  ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Correct ({correctCount})
            </button>
            <button
              onClick={() => setFilterType('incorrect')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                filterType === 'incorrect'
                  ? 'bg-rose-50 text-rose-800 font-bold border border-rose-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Incorrect ({incorrectCount})
            </button>
            <button
              onClick={() => setFilterType('unanswered')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                filterType === 'unanswered'
                  ? 'bg-amber-50 text-amber-800 font-bold border border-amber-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Unanswered ({unansweredCount})
            </button>
          </div>

          <span className="text-xs text-slate-400 font-medium text-right sm:text-left">
            Showing {filteredQuestions.length} of {questions.length} questions
          </span>
        </div>

        {/* Questions Breakdown List */}
        <div className="space-y-5">
          {filteredQuestions.map((q) => {
            const isCorrect = q.student_answer?.is_correct === true;
            const pointsEarned = q.student_answer?.points_earned ?? 0;
            const selectedChoiceId = q.student_answer?.selected_choice_id;
            const hasSubmittedAnswer =
              q.student_answer &&
              (q.student_answer.selected_choice_id ||
                (q.student_answer.text_answer && q.student_answer.text_answer.trim() !== ''));

            // Parse clean question text and embedded images (<!--IMAGE:...-->)
            const { text: cleanPrompt, imageUrl: parsedImage } = parseQuestionContent(q.question_text);
            const displayImage = q.image_url || parsedImage;

            return (
              <div
                key={q.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-7 space-y-5 transition-all hover:border-slate-300"
              >
                {/* Question Header: Number, Points, Status Badge */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 font-black text-xs flex items-center justify-center border border-blue-100 shadow-xs">
                      {q.order_index}
                    </span>
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block leading-none">
                        {q.question_type === 'multiple_choice'
                          ? 'Multiple Choice Question'
                          : q.question_type === 'true_false'
                          ? 'True / False Question'
                          : 'Short Answer Question'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    {/* Points Pill */}
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                        isCorrect
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {pointsEarned} / {q.points} pt{q.points !== 1 ? 's' : ''}
                    </span>

                    {/* Result Badge */}
                    {isCorrect ? (
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Correct</span>
                      </span>
                    ) : hasSubmittedAnswer ? (
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold shadow-xs">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Incorrect</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold shadow-xs">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Not Answered</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Question Prompt with KaTeX Math Rendering */}
                <div className="text-sm sm:text-base font-semibold text-slate-900 leading-relaxed pl-0.5">
                  <MathText content={cleanPrompt} />
                </div>

                {/* Attached Diagram / Image */}
                {displayImage && (
                  <div className="p-3 border border-slate-200 rounded-2xl bg-slate-50/70 inline-block max-w-full">
                    <img
                      src={displayImage}
                      alt={`Diagram for Question ${q.order_index}`}
                      className="max-h-80 rounded-xl object-contain w-auto shadow-xs border border-slate-200"
                    />
                  </div>
                )}

                {/* Choices Breakdown for Multiple Choice / True-False */}
                {q.question_type !== 'short_answer' && q.choices && q.choices.length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Answer Choices:
                    </span>

                    {q.choices.map((choice, cIdx) => {
                      const letter = String.fromCharCode(65 + cIdx);
                      const isSelected = selectedChoiceId === choice.id;
                      const isChoiceCorrect = choice.is_correct === true;

                      let containerStyle = 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50/60';
                      let letterBadgeStyle = 'bg-slate-100 text-slate-700 font-bold border border-slate-200';
                      let statusBadge = null;

                      if (isSelected && isChoiceCorrect) {
                        // Student selected the correct answer
                        containerStyle = 'border-emerald-500 bg-emerald-50/80 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs';
                        letterBadgeStyle = 'bg-emerald-600 text-white font-bold';
                        statusBadge = (
                          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-bold shadow-xs flex-shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Your Answer • Correct</span>
                          </span>
                        );
                      } else if (isSelected && !isChoiceCorrect) {
                        // Student selected wrong answer
                        containerStyle = 'border-rose-400 bg-rose-50/80 text-rose-950 ring-2 ring-rose-400/20 shadow-xs';
                        letterBadgeStyle = 'bg-rose-600 text-white font-bold';
                        statusBadge = (
                          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-rose-600 text-white text-[11px] font-bold shadow-xs flex-shrink-0">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Your Answer • Incorrect</span>
                          </span>
                        );
                      } else if (!isSelected && isChoiceCorrect) {
                        // The actual correct answer (student missed it or didn't answer)
                        containerStyle = 'border-emerald-500 bg-emerald-50/50 text-emerald-950 border-2 shadow-xs';
                        letterBadgeStyle = 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300';
                        statusBadge = (
                          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold flex-shrink-0">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Correct Answer</span>
                          </span>
                        );
                      }

                      return (
                        <div
                          key={choice.id}
                          className={`p-3.5 sm:p-4 rounded-2xl border flex items-center justify-between text-xs sm:text-sm transition-all ${containerStyle}`}
                        >
                          <div className="flex items-center space-x-3.5 flex-1 mr-3">
                            <span
                              className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center flex-shrink-0 ${letterBadgeStyle}`}
                            >
                              {letter}
                            </span>
                            <div className="font-medium text-slate-900 leading-normal">
                              <MathText content={choice.choice_text} />
                            </div>
                          </div>

                          {statusBadge && <div>{statusBadge}</div>}
                        </div>
                      );
                    })}

                    {/* Unanswered callout banner */}
                    {!selectedChoiceId && (
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 flex items-center space-x-2 mt-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>No option was selected for this question. The correct option is highlighted above in green.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Short Answer Breakdown */}
                {q.question_type === 'short_answer' && (
                  <div className="space-y-3 pt-2">
                    <div className={`p-4 rounded-2xl border ${isCorrect ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Your Submitted Response:
                      </span>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 font-mono">
                        {q.student_answer?.text_answer || (
                          <span className="italic text-slate-400">No response submitted (Unanswered)</span>
                        )}
                      </p>
                    </div>

                    {q.choices?.[0]?.choice_text && (
                      <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-300">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                            Correct Expected Answer:
                          </span>
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Answer Key</span>
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-emerald-950 font-mono">
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
