import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Calendar,
  Lock,
  Unlock,
  AlertTriangle,
  Award,
  ChevronRight,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  TrendingUp,
  FileCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthContext';
import { StudentDashboardLayout } from '@/layouts/StudentDashboardLayout';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { StudentSubmittedExam } from '@/types';

export const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exams, setExams] = useState<StudentSubmittedExam[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'released' | 'locked'>('all');

  const fetchStudentExams = async () => {
    setIsLoading(true);
    try {
      // 1. Try using the secure RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_student_submitted_exams');

      if (!rpcErr && rpcData) {
        setExams(rpcData as StudentSubmittedExam[]);
      } else {
        // Fallback: Direct query if RPC has not been migrated yet
        console.warn('RPC fallback triggered:', rpcErr?.message);
        await fetchFallbackExams();
      }
    } catch (err: any) {
      console.error('Failed to load student exams:', err);
      await fetchFallbackExams();
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFallbackExams = async () => {
    if (!user) return;
    try {
      // Match by student_id or email
      const userEmail = user.email?.toLowerCase();
      const { data: attempts, error } = await supabase
        .from('exam_attempts')
        .select(`
          id,
          exam_id,
          started_at,
          submitted_at,
          status,
          strike_count,
          total_score,
          max_possible_score,
          percentage,
          student_email,
          student_id,
          exams:exam_id (
            id,
            title,
            description,
            start_time,
            end_time,
            duration_minutes
          )
        `)
        .or(`student_id.eq.${user.id},student_email.ilike.${userEmail}`)
        .in('status', ['submitted', 'disqualified', 'expired'])
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      const now = new Date();
      const mapped: StudentSubmittedExam[] = (attempts || []).map((att: any) => {
        const examObj = att.exams;
        const endTime = examObj?.end_time ? new Date(examObj.end_time) : new Date(0);
        const isReleased = now >= endTime;

        return {
          attempt_id: att.id,
          exam_id: att.exam_id,
          exam_title: examObj?.title || 'Examination',
          exam_description: examObj?.description || '',
          exam_start_time: examObj?.start_time || att.started_at,
          exam_end_time: examObj?.end_time || att.started_at,
          duration_minutes: examObj?.duration_minutes || 60,
          started_at: att.started_at,
          submitted_at: att.submitted_at,
          status: att.status,
          strike_count: att.strike_count || 0,
          total_score: att.total_score || 0,
          max_possible_score: att.max_possible_score || 0,
          percentage: att.percentage || 0,
          is_review_released: isReleased,
        };
      });

      setExams(mapped);
    } catch (err) {
      console.error('Fallback query error:', err);
    }
  };

  useEffect(() => {
    fetchStudentExams();
  }, [user]);

  // Compute aggregate statistics
  const totalSubmissions = exams.length;
  const avgScore = totalSubmissions > 0
    ? (exams.reduce((sum, e) => sum + (e.percentage || 0), 0) / totalSubmissions).toFixed(1)
    : '0';
  const highestScore = totalSubmissions > 0
    ? Math.max(...exams.map((e) => e.percentage || 0)).toFixed(1)
    : '0';
  const cleanStrikesCount = exams.filter((e) => (e.strike_count || 0) === 0).length;

  // Filtered exams
  const filteredExams = exams.filter((e) => {
    const matchesSearch =
      e.exam_title.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      (e.exam_description && e.exam_description.toLowerCase().includes(searchQuery.toLowerCase().trim()));

    if (!matchesSearch) return false;

    if (statusFilter === 'released') return e.is_review_released;
    if (statusFilter === 'locked') return !e.is_review_released;
    return true;
  });

  return (
    <StudentDashboardLayout
      title="My Assessment Portfolio"
      subtitle="Track your exam history, performance scores, and inspect solutions once testing windows close"
    >
      <div className="space-y-6">
        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Exams Completed
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <FileCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2 mt-3">
              <span className="text-3xl font-black text-slate-900">{totalSubmissions}</span>
              <span className="text-xs text-blue-600 font-bold">Assessments</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Average Score
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2 mt-3">
              <span className="text-3xl font-black text-slate-900">{avgScore}%</span>
              <span className="text-xs text-slate-400 font-medium">Mean Mark</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Highest Score
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Award className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2 mt-3">
              <span className="text-3xl font-black text-purple-700">{highestScore}%</span>
              <span className="text-xs text-slate-400 font-medium">Personal Best</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Integrity Record
              </span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2 mt-3">
              <span className="text-3xl font-black text-teal-700">
                {totalSubmissions > 0 ? `${cleanStrikesCount}/${totalSubmissions}` : 'Clean'}
              </span>
              <span className="text-xs text-teal-600 font-bold">Zero Violations</span>
            </div>
          </div>
        </div>

        {/* Search & Filter Header */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search assessment title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                All ({exams.length})
              </button>
              <button
                onClick={() => setStatusFilter('released')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'released' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                Released ({exams.filter((e) => e.is_review_released).length})
              </button>
              <button
                onClick={() => setStatusFilter('locked')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'locked' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                Locked ({exams.filter((e) => !e.is_review_released).length})
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchStudentExams}
              className="rounded-xl border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Exams List / Cards */}
        {isLoading ? (
          <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center shadow-xs">
            <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-500 font-medium">Loading your assessments...</p>
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {searchQuery ? 'No Matching Assessments' : 'No Submitted Exams Yet'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
              {searchQuery
                ? `No submissions found matching "${searchQuery}".`
                : 'When you take an examination and submit it on the platform, your final scores and question breakdowns will appear right here.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredExams.map((exam) => {
              const isPassing = (exam.percentage || 0) >= 60;
              const isLocked = !exam.is_review_released;

              return (
                <div
                  key={exam.attempt_id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden"
                >
                  <div className="p-5 space-y-4">
                    {/* Top Row: Title & Release Status Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-base font-bold text-slate-900 leading-snug">
                          {exam.exam_title}
                        </h3>
                        {exam.exam_description && (
                          <p className="text-xs text-slate-500 line-clamp-2">
                            {exam.exam_description}
                          </p>
                        )}
                      </div>

                      {isLocked ? (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold flex-shrink-0">
                          <Lock className="w-3 h-3 text-amber-600" />
                          <span>Review Locked</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold flex-shrink-0">
                          <Unlock className="w-3 h-3 text-emerald-600" />
                          <span>Solutions Released</span>
                        </span>
                      )}
                    </div>

                    {/* Score Bar & Percentage */}
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                          Total Score
                        </span>
                        <div className="flex items-baseline space-x-1.5 mt-0.5">
                          <span className="text-xl font-black text-slate-900">
                            {exam.total_score}
                          </span>
                          <span className="text-xs text-slate-400 font-semibold">
                            / {exam.max_possible_score} pts
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                          Result
                        </span>
                        <span
                          className={`text-xl font-black mt-0.5 inline-block ${
                            (exam.percentage || 0) >= 75
                              ? 'text-emerald-600'
                              : (exam.percentage || 0) >= 50
                              ? 'text-blue-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {exam.percentage}%
                        </span>
                      </div>
                    </div>

                    {/* Metadata Items */}
                    <div className="space-y-2 text-xs text-slate-600 pt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center space-x-1.5 text-slate-500">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Submitted:</span>
                        </span>
                        <span className="font-semibold text-slate-800">
                          {exam.submitted_at ? formatDate(exam.submitted_at) : 'N/A'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center space-x-1.5 text-slate-500">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Scheduled Window End:</span>
                        </span>
                        <span className="font-semibold text-slate-800">
                          {formatDate(exam.exam_end_time)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center space-x-1.5 text-slate-500">
                          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                          <span>Proctoring Integrity:</span>
                        </span>
                        <span
                          className={`font-semibold ${
                            exam.strike_count === 0 ? 'text-teal-700' : 'text-amber-700'
                          }`}
                        >
                          {exam.strike_count === 0
                            ? '0 Strikes • Verified'
                            : `${exam.strike_count} Strike${exam.strike_count > 1 ? 's' : ''} logged`}
                        </span>
                      </div>
                    </div>

                    {/* Explanatory callout if locked */}
                    {isLocked && (
                      <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-900 leading-relaxed">
                        🔒 <strong>Academic Integrity Policy:</strong> Full question-by-question solutions and correct answers will unlock automatically after all students finish at{' '}
                        <strong>{formatDate(exam.exam_end_time)}</strong>.
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Action */}
                  <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
                    {isLocked ? (
                      <div className="w-full flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-medium flex items-center space-x-1">
                          <Lock className="w-3.5 h-3.5" />
                          <span>Answers Locked</span>
                        </span>
                        <Button
                          disabled
                          size="sm"
                          variant="outline"
                          className="rounded-xl border-slate-200 text-slate-400 cursor-not-allowed text-xs font-semibold"
                        >
                          Review Locked
                        </Button>
                      </div>
                    ) : (
                      <div className="w-full flex items-center justify-between">
                        <span className="text-[11px] text-emerald-700 font-bold flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Ready for Review</span>
                        </span>
                        <Button
                          size="sm"
                          onClick={() => navigate(`/student/exam/${exam.attempt_id}/review`)}
                          className="rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs cursor-pointer shadow-xs"
                        >
                          <span>Review Exam Answers</span>
                          <ChevronRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StudentDashboardLayout>
  );
};
