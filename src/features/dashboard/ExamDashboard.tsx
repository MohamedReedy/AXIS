import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  CheckCircle,
  Clock,
  ShieldAlert,
  Percent,
  Table as TableIcon,
  Copy,
  Check,
  Activity,
  AlertCircle,
  Eye,
  ExternalLink,
  HelpCircle,
  Calendar,
  Edit3,
  Search,
  X,
  FileText,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Exam, ExamAttempt, Violation } from '@/types';
import { AdminLayout } from '@/layouts/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { formatDate, getExamSlug } from '@/lib/utils';
import { ExamQuestionsModal } from './ExamQuestionsModal';
import { EditScheduleModal } from './EditScheduleModal';

interface InspectedAnswer {
  id: string;
  question_id: string;
  selected_choice_id: string | null;
  text_answer: string | null;
  is_correct: boolean;
  points_earned: number;
  question_text?: string;
  max_points?: number;
  selected_choice_text?: string;
}

export const ExamDashboard: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [exam, setExam] = useState<Exam | null>(null);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [recentActivities, setRecentActivities] = useState<Array<{ id: string; text: string; time: string; type: 'submit' | 'violation' | 'start' }>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'in_progress' | 'disqualified'>('all');

  // Inspection states
  const [inspectAttempt, setInspectAttempt] = useState<ExamAttempt | null>(null);
  const [inspectViolations, setInspectViolations] = useState<Violation[]>([]);
  const [inspectAnswers, setInspectAnswers] = useState<InspectedAnswer[]>([]);
  const [inspectTab, setInspectTab] = useState<'violations' | 'answers'>('violations');
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);

  // Modals
  const [isQuestionsModalOpen, setIsQuestionsModalOpen] = useState<boolean>(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);

  // Load Exam, Submissions, and Historical Activities
  const loadDashboardData = async () => {
    if (!examId) return;
    try {
      // 1. Fetch Exam details
      const { data: examData, error: examErr } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .single();
      if (examErr) throw examErr;
      setExam(examData as Exam);

      // 2. Fetch Attempts
      const { data: attemptData, error: attemptErr } = await supabase
        .from('exam_attempts')
        .select('*')
        .eq('exam_id', examId)
        .order('started_at', { ascending: false });
      if (attemptErr) throw attemptErr;
      const loadedAttempts = (attemptData as ExamAttempt[]) || [];
      setAttempts(loadedAttempts);

      // 3. Pre-populate Live Proctoring Feed from DB (violations + exam events)
      const initialActivities: Array<{ id: string; text: string; time: string; timestamp: number; type: 'submit' | 'violation' | 'start' }> = [];

      // A. Fetch recent security violations for this exam
      const { data: recentViolations } = await supabase
        .from('violations')
        .select('id, attempt_id, violation_type, details, timestamp, exam_attempts!inner(student_name, exam_id)')
        .eq('exam_attempts.exam_id', examId)
        .order('timestamp', { ascending: false })
        .limit(25);

      if (recentViolations) {
        for (const v of recentViolations) {
          const sName = (v.exam_attempts as any)?.student_name || 'Candidate';
          const typeLabel = v.violation_type.replace(/_/g, ' ');
          initialActivities.push({
            id: `v_${v.id}`,
            text: `🚨 ${sName}: ${typeLabel} (${v.details || 'Warning incremented'})`,
            time: new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestamp: new Date(v.timestamp).getTime(),
            type: 'violation',
          });
        }
      }

      // B. Fetch submissions and disqualifications from attempts
      for (const att of loadedAttempts) {
        if (att.status === 'disqualified') {
          initialActivities.push({
            id: `dq_${att.id}`,
            text: `🛑 ${att.student_name} was DISQUALIFIED (Exceeded ${att.strike_count} strikes)`,
            time: new Date(att.submitted_at || att.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestamp: new Date(att.submitted_at || att.started_at).getTime(),
            type: 'violation',
          });
        } else if (att.status === 'submitted') {
          initialActivities.push({
            id: `sub_${att.id}`,
            text: `✅ ${att.student_name} submitted exam (Score: ${att.total_score}/${att.max_possible_score})`,
            time: new Date(att.submitted_at || att.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestamp: new Date(att.submitted_at || att.started_at).getTime(),
            type: 'submit',
          });
        }
        if (att.started_at) {
          initialActivities.push({
            id: `start_${att.id}`,
            text: `👤 ${att.student_name} entered exam environment`,
            time: new Date(att.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestamp: new Date(att.started_at).getTime(),
            type: 'start',
          });
        }
      }

      // Sort all activities chronologically descending
      initialActivities.sort((a, b) => b.timestamp - a.timestamp);
      setRecentActivities(initialActivities.slice(0, 25));
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();

    if (!examId) return;

    // Supabase Realtime Subscription
    const channel = supabase
      .channel(`exam_${examId}_realtime`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_attempts', filter: `exam_id=eq.${examId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newAttempt = payload.new as ExamAttempt;
            setAttempts((prev) => [newAttempt, ...prev]);
            setRecentActivities((prev) => [
              {
                id: `act_${Date.now()}`,
                text: `👤 ${newAttempt.student_name} began the exam`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                type: 'start',
              },
              ...prev.slice(0, 24),
            ]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ExamAttempt;
            setAttempts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));

            if (updated.status === 'submitted') {
              setRecentActivities((prev) => [
                {
                  id: `act_${Date.now()}`,
                  text: `✅ ${updated.student_name} submitted (Score: ${updated.total_score}/${updated.max_possible_score})`,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  type: 'submit',
                },
                ...prev.slice(0, 24),
              ]);
            } else if (updated.status === 'disqualified') {
              setRecentActivities((prev) => [
                {
                  id: `act_${Date.now()}`,
                  text: `🛑 ${updated.student_name} was DISQUALIFIED (Exceeded ${updated.strike_count} strikes)`,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  type: 'violation',
                },
                ...prev.slice(0, 24),
              ]);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'violations' },
        (payload) => {
          const v = payload.new as Violation;
          setAttempts((currentAttempts) => {
            const student = currentAttempts.find((a) => a.id === v.attempt_id);
            if (student) {
              setRecentActivities((prev) => [
                {
                  id: `v_${v.id}_${Date.now()}`,
                  text: `🚨 ${student.student_name}: ${v.violation_type.replace(/_/g, ' ')} (${v.details || 'Warning incremented'})`,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  type: 'violation',
                },
                ...prev.slice(0, 24),
              ]);
            }
            return currentAttempts;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [examId]);

  const handleCopyLink = async () => {
    if (!exam) return;
    const link = `${window.location.origin}/exam/${getExamSlug(exam.title) || exam.id}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInspectStudent = async (attempt: ExamAttempt) => {
    setInspectAttempt(attempt);
    setInspectTab('violations');
    setIsLoadingAudit(true);

    try {
      // 1. Fetch student violations
      const { data: vData } = await supabase
        .from('violations')
        .select('*')
        .eq('attempt_id', attempt.id)
        .order('timestamp', { ascending: true });
      setInspectViolations((vData as Violation[]) || []);

      // 2. Fetch answers with question details
      const { data: aData } = await supabase
        .from('answers')
        .select('id, question_id, selected_choice_id, text_answer, is_correct, points_earned, questions(question_text, points)')
        .eq('attempt_id', attempt.id);

      // Fetch selected choices text
      const choiceIds = (aData || [])
        .map((a: any) => a.selected_choice_id)
        .filter(Boolean);

      let choicesMap: Record<string, string> = {};
      if (choiceIds.length > 0) {
        const { data: cData } = await supabase
          .from('question_choices')
          .select('id, choice_text')
          .in('id', choiceIds);
        if (cData) {
          cData.forEach((c: any) => {
            choicesMap[c.id] = c.choice_text;
          });
        }
      }

      const formattedAnswers: InspectedAnswer[] = (aData || []).map((ans: any) => ({
        id: ans.id,
        question_id: ans.question_id,
        selected_choice_id: ans.selected_choice_id,
        text_answer: ans.text_answer,
        is_correct: ans.is_correct,
        points_earned: ans.points_earned,
        question_text: ans.questions?.question_text,
        max_points: ans.questions?.points,
        selected_choice_text: ans.selected_choice_id ? choicesMap[ans.selected_choice_id] : undefined,
      }));

      setInspectAnswers(formattedAnswers);
    } catch (err) {
      console.error('Failed to load audit data:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Metrics calculation
  const totalTakers = attempts.length;
  const completedCount = attempts.filter((a) => a.status === 'submitted').length;
  const inProgressCount = attempts.filter((a) => a.status === 'in_progress').length;
  const disqualifiedCount = attempts.filter((a) => a.status === 'disqualified').length;
  
  const avgScore =
    completedCount > 0
      ? (
          attempts
            .filter((a) => a.status === 'submitted' && a.percentage != null)
            .reduce((acc, a) => acc + (a.percentage || 0), 0) / completedCount
        ).toFixed(1)
      : '0.0';

  const passRate =
    completedCount > 0
      ? (
          (attempts.filter((a) => a.status === 'submitted' && (a.percentage || 0) >= 60).length /
            completedCount) *
          100
        ).toFixed(0)
      : '0';

  // Client-side filtering
  const filteredAttempts = attempts.filter((att) => {
    if (statusFilter !== 'all' && att.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = att.student_name?.toLowerCase().includes(q);
      const emailMatch = att.student_email?.toLowerCase().includes(q);
      const codeMatch = att.student_code?.toLowerCase().includes(q);
      return nameMatch || emailMatch || codeMatch;
    }
    return true;
  });

  const studentLink = exam ? `${window.location.origin}/exam/${getExamSlug(exam.title) || exam.id}` : '';

  return (
    <AdminLayout title={exam?.title || 'Exam Dashboard'} subtitle="Realtime proctoring, live submissions, and anti-cheat telemetry">
      <div className="space-y-6">
        {/* Navigation & Actions Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/admin')}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
              title="Back to Hub"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-slate-900">{exam?.title || 'Exam Dashboard'}</h1>
                {exam?.status && (
                  <span className={`badge-pill ${exam.status === 'published' ? 'badge-ok' : 'badge-warn'}`}>
                    {exam.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Realtime candidate proctoring and server-authoritative scoring.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-blue-600" />}
              <span>{copied ? 'Link Copied' : 'Copy Student Link'}</span>
            </button>

            <button
              onClick={() => setIsQuestionsModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
              <span>Questions & Answers</span>
            </button>

            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              <span>Edit Schedule & Time</span>
            </button>

            <button
              onClick={() => navigate(`/admin/exam/${examId}/grades`)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Question Grade Sheet</span>
            </button>
          </div>
        </div>

        {/* Schedule & Metadata Banner */}
        {exam && (
          <div className="hero-axis flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-slate-600">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>
                  <strong className="text-slate-900">Active Window:</strong>{' '}
                  {formatDate(exam.start_time)} &rarr; {formatDate(exam.end_time)}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span>
                  <strong className="text-slate-900">Duration:</strong> {exam.duration_minutes} minutes
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-rose-500 flex-shrink-0" />
                <span>
                  <strong className="text-slate-900">Max Violations:</strong> {exam.max_strikes} strikes
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer border border-blue-200 self-start md:self-auto"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Schedule</span>
            </button>
          </div>
        )}

        {/* Prototype 6-Column Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>Total Takers</span>
            </span>
            <span className="text-2xl font-black text-slate-900 font-mono">{totalTakers}</span>
            <span className="text-[10px] text-slate-400 font-medium">All attempts registered</span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Completed</span>
            </span>
            <span className="text-2xl font-black text-emerald-600 font-mono">{completedCount}</span>
            <span className="text-[10px] text-slate-400 font-medium">Fully submitted exams</span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>In Progress</span>
            </span>
            <span className="text-2xl font-black text-amber-600 font-mono">{inProgressCount}</span>
            <span className="text-[10px] text-slate-400 font-medium">Currently taking exam</span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              <span>Disqualified</span>
            </span>
            <span className="text-2xl font-black text-rose-600 font-mono">{disqualifiedCount}</span>
            <span className="text-[10px] text-slate-400 font-medium">Exceeded security strikes</span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
              <Percent className="w-3.5 h-3.5 text-blue-600" />
              <span>Avg Score</span>
            </span>
            <span className="text-2xl font-black text-slate-900 font-mono">{avgScore}%</span>
            <span className="text-[10px] text-slate-400 font-medium">
              {completedCount > 0 ? `From ${completedCount} submission${completedCount > 1 ? 's' : ''}` : 'No submissions yet'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
              <Percent className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pass Rate</span>
            </span>
            <span className="text-2xl font-black text-emerald-600 font-mono">{passRate}%</span>
            <span className="text-[10px] text-slate-400 font-medium">Passing mark ≥ 60%</span>
          </div>
        </div>

        {/* Live Activity & Submissions Split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Submissions Table (2 columns) */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-bold text-base text-slate-900">Student Submissions</h3>
              <span className="text-xs text-slate-500 font-medium flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Telemetry Active</span>
              </span>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({attempts.length})
                </button>
                <button
                  onClick={() => setStatusFilter('submitted')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                    statusFilter === 'submitted'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${statusFilter === 'submitted' ? 'bg-white' : 'bg-emerald-500'}`} />
                  <span>Submitted ({completedCount})</span>
                </button>
                <button
                  onClick={() => setStatusFilter('in_progress')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                    statusFilter === 'in_progress'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${statusFilter === 'in_progress' ? 'bg-white' : 'bg-amber-500'}`} />
                  <span>In Progress ({inProgressCount})</span>
                </button>
                <button
                  onClick={() => setStatusFilter('disqualified')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                    statusFilter === 'disqualified'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${statusFilter === 'disqualified' ? 'bg-white' : 'bg-rose-500'}`} />
                  <span>Disqualified ({disqualifiedCount})</span>
                </button>
              </div>

              {/* Candidate Search Box */}
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all placeholder:text-slate-400 font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="table-wrap-axis">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] border-b border-slate-200 text-slate-600 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Strikes</th>
                      <th className="px-4 py-3">Grade</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAttempts.length > 0 ? (
                      filteredAttempts.map((att) => (
                        <tr key={att.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900">{att.student_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono flex items-center space-x-1.5">
                              <span>{att.student_email}</span>
                              {att.student_code && (
                                <>
                                  <span>•</span>
                                  <span>ID: {att.student_code}</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {att.status === 'submitted' && <span className="badge-pill badge-ok">Submitted</span>}
                            {att.status === 'in_progress' && <span className="badge-pill badge-warn">Taking Exam</span>}
                            {att.status === 'disqualified' && <span className="badge-pill badge-bad">Disqualified</span>}
                            {att.status === 'expired' && <span className="badge-pill badge-info">Expired</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`font-bold font-mono px-2 py-0.5 rounded-md ${
                                att.strike_count > 0
                                  ? att.strike_count >= (exam?.max_strikes || 3)
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200 font-black'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'text-slate-500'
                              }`}
                            >
                              {att.strike_count} / {exam?.max_strikes || 3}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {att.status === 'submitted' ? (
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 font-mono text-sm">
                                  {att.total_score} / {att.max_possible_score}
                                </span>
                                <span
                                  className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                                    (att.percentage || 0) >= 60
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}
                                >
                                  {Math.round(att.percentage || 0)}%
                                </span>
                              </div>
                            ) : att.status === 'disqualified' ? (
                              <div className="flex flex-col">
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-bold text-rose-600 font-mono">0 / {att.max_possible_score || 3}</span>
                                  <span className="badge-pill badge-bad text-[9px] uppercase font-bold py-0.5 px-1.5">Voided</span>
                                </div>
                                {Number(att.total_score || 0) > 0 && (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    (Earned {att.total_score}/{att.max_possible_score} before DQ)
                                  </span>
                                )}
                              </div>
                            ) : att.status === 'in_progress' ? (
                              <span className="inline-flex items-center space-x-1.5 text-amber-600 font-medium text-xs bg-amber-50/60 px-2 py-0.5 rounded-md border border-amber-200/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span>Taking Exam...</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">Timed Out (0%)</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleInspectStudent(att)}
                              className="text-blue-700 hover:text-blue-800 font-bold inline-flex items-center space-x-1 cursor-pointer hover:underline px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Audit</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                          {searchQuery || statusFilter !== 'all'
                            ? 'No candidates match your active search or filter.'
                            : 'No student has started or submitted this exam yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Live Activity Feed (1 column) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-600 animate-pulse" />
                <h3 className="font-bold text-base text-slate-900">Live Proctoring Feed</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono font-medium">Auto-Streaming</span>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs space-y-2.5 max-h-[580px] overflow-y-auto">
              {recentActivities.length > 0 ? (
                recentActivities.map((act) => (
                  <div
                    key={act.id}
                    className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-2.5 transition-all ${
                      act.type === 'violation'
                        ? 'bg-rose-50/70 border-rose-200/80 text-rose-900'
                        : act.type === 'submit'
                        ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="font-medium leading-relaxed">{act.text}</span>
                    <span className="text-[10px] text-slate-400 font-mono flex-shrink-0 mt-0.5">{act.time}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 text-center py-12">
                  Live events (violations, exam starts, and submissions) will stream here in real time.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Student Audit Modal */}
        {inspectAttempt && (
          <Modal
            isOpen={!!inspectAttempt}
            onClose={() => setInspectAttempt(null)}
            title={`Integrity Audit & Responses: ${inspectAttempt.student_name}`}
            maxWidth="2xl"
          >
            <div className="space-y-5">
              {/* Student Metadata Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-2xl text-xs border border-slate-200">
                <div>
                  <span className="text-slate-500 block font-semibold text-[11px]">Email:</span>
                  <span className="text-slate-900 font-mono">{inspectAttempt.student_email}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-semibold text-[11px]">Student ID:</span>
                  <span className="text-slate-900 font-medium">{inspectAttempt.student_code || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-semibold text-[11px]">Total Score:</span>
                  <span className="text-emerald-600 font-black font-mono">
                    {inspectAttempt.total_score} / {inspectAttempt.max_possible_score} ({inspectAttempt.percentage}%)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-semibold text-[11px]">Cheating Strikes:</span>
                  <span className={`font-bold ${inspectAttempt.strike_count > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                    {inspectAttempt.strike_count} / {exam?.max_strikes || 3} strikes
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-semibold text-[11px]">Status:</span>
                  <span className="font-bold uppercase text-[11px] text-slate-800">{inspectAttempt.status}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-semibold text-[11px]">Started:</span>
                  <span className="text-slate-700">{formatDate(inspectAttempt.started_at)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-semibold text-[11px]">Submitted:</span>
                  <span className="text-slate-700">{formatDate(inspectAttempt.submitted_at)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-semibold text-[11px]">Grade Sheet:</span>
                  <button
                    onClick={() => {
                      setInspectAttempt(null);
                      navigate(`/admin/exam/${examId}/grades`);
                    }}
                    className="text-blue-600 hover:text-blue-800 font-bold hover:underline inline-flex items-center space-x-1"
                  >
                    <span>View Matrix</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Tabs: Violations vs Answers */}
              <div className="flex border-b border-slate-200 space-x-4 text-xs font-bold">
                <button
                  onClick={() => setInspectTab('violations')}
                  className={`pb-2 flex items-center space-x-1.5 transition-colors cursor-pointer border-b-2 ${
                    inspectTab === 'violations'
                      ? 'border-rose-600 text-rose-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Security & Violation Log ({inspectViolations.length})</span>
                </button>

                <button
                  onClick={() => setInspectTab('answers')}
                  className={`pb-2 flex items-center space-x-1.5 transition-colors cursor-pointer border-b-2 ${
                    inspectTab === 'answers'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Submitted Responses ({inspectAnswers.length})</span>
                </button>
              </div>

              {isLoadingAudit ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading candidate audit details...</div>
              ) : inspectTab === 'violations' ? (
                /* Violations Tab */
                <div className="space-y-3">
                  {inspectViolations.length > 0 ? (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {inspectViolations.map((v) => (
                        <div
                          key={v.id}
                          className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-xs flex items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold text-rose-700 uppercase tracking-wider text-[10px]">
                              {v.violation_type.replace(/_/g, ' ')}
                            </div>
                            <div className="text-slate-700">{v.details}</div>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                            {formatDate(v.timestamp)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-800 bg-emerald-50 p-4 rounded-xl border border-emerald-200 font-medium text-center">
                      Clean session: Zero anti-cheat violations detected for this candidate.
                    </p>
                  )}
                </div>
              ) : (
                /* Answers Tab */
                <div className="space-y-3">
                  {inspectAnswers.length > 0 ? (
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {inspectAnswers.map((ans, idx) => (
                        <div
                          key={ans.id}
                          className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                            ans.is_correct
                              ? 'bg-emerald-50/50 border-emerald-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">
                              Question {idx + 1}: {ans.question_text || 'Assessment Question'}
                            </span>
                            <span className="flex items-center space-x-1 font-mono font-bold">
                              {ans.is_correct ? (
                                <span className="text-emerald-700 flex items-center space-x-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>+{ans.points_earned} Pts</span>
                                </span>
                              ) : (
                                <span className="text-slate-500 flex items-center space-x-1">
                                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                  <span>0 / {ans.max_points || 1} Pts</span>
                                </span>
                              )}
                            </span>
                          </div>

                          <div className="text-slate-600 bg-white p-2 rounded-lg border border-slate-100 font-medium">
                            <span className="text-slate-400 text-[11px] block">Candidate Choice:</span>
                            <span>{ans.selected_choice_text || ans.text_answer || 'No response recorded (submitted blank)'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                      No response items recorded for this candidate attempt yet.
                    </p>
                  )}
                </div>
              )}
            </div>
          </Modal>
        )}

        {/* Exam Questions Modal */}
        {exam && (
          <ExamQuestionsModal
            isOpen={isQuestionsModalOpen}
            onClose={() => setIsQuestionsModalOpen(false)}
            examId={exam.id}
            examTitle={exam.title}
          />
        )}

        {/* Edit Schedule Modal */}
        {exam && (
          <EditScheduleModal
            isOpen={isScheduleModalOpen}
            onClose={() => setIsScheduleModalOpen(false)}
            exam={exam}
            onUpdated={loadDashboardData}
          />
        )}
      </div>
    </AdminLayout>
  );
};
