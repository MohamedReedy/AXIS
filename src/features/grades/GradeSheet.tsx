import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  RefreshCw,
  CheckCircle2,
  Check,
  Edit3,
  Sparkles,
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { GradeSheetData, GradeSheetStudent, Question } from '@/types';
import { AdminLayout } from '@/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatDate, parseQuestionContent } from '@/lib/utils';
import { MathText } from '@/components/ui/MathText';

export const GradeSheet: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [examTitle, setExamTitle] = useState<string>('');
  const [data, setData] = useState<GradeSheetData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<GradeSheetStudent | null>(null);
  const [gradingQuestionId, setGradingQuestionId] = useState<string | null>(null);
  const [customPointsInput, setCustomPointsInput] = useState<Record<string, string>>({});

  const loadGradeSheet = async () => {
    if (!examId) return;
    setIsLoading(true);

    try {
      // 1. Fetch exam title
      const { data: examData } = await supabase
        .from('exams')
        .select('title')
        .eq('id', examId)
        .single();
      if (examData) setExamTitle(examData.title);

      // 2. Fetch using get_exam_grade_sheet RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_exam_grade_sheet', {
        p_exam_id: examId,
      });

      if (!rpcErr && rpcData) {
        setData(rpcData as GradeSheetData);
      } else {
        // Fallback: Fetch manually if RPC hasn't been created yet
        console.warn('RPC fallback triggered:', rpcErr?.message);
        await loadGradeSheetFallback();
      }
    } catch (err) {
      console.error('Failed to load grade sheet:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadGradeSheetFallback = async () => {
    // Manual join queries
    const { data: questions } = await supabase
      .from('questions')
      .select('id, order_index, question_text, question_type, points')
      .eq('exam_id', examId!)
      .order('order_index');

    const { data: attempts } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('exam_id', examId!)
      .order('started_at', { ascending: false });

    if (!attempts) return;

    const studentRows: GradeSheetStudent[] = [];

    for (const att of attempts) {
      const { data: answers } = await supabase
        .from('answers')
        .select('question_id, selected_choice_id, text_answer, is_correct, points_earned')
        .eq('attempt_id', att.id);

      const { data: violations } = await supabase
        .from('violations')
        .select('violation_type, details, timestamp')
        .eq('attempt_id', att.id);

      const answersMap: Record<string, any> = {};
      answers?.forEach((ans) => {
        answersMap[ans.question_id] = ans;
      });

      studentRows.push({
        attempt_id: att.id,
        student_name: att.student_name,
        student_email: att.student_email,
        student_code: att.student_code,
        started_at: att.started_at,
        submitted_at: att.submitted_at,
        status: att.status,
        strike_count: att.strike_count,
        total_score: att.total_score || 0,
        max_possible_score: att.max_possible_score || 0,
        percentage: att.percentage || 0,
        answers: answersMap,
        violations: (violations as any[]) || [],
      });
    }

    setData({
      questions: (questions as any[]) || [],
      students: studentRows,
    });
  };

  useEffect(() => {
    loadGradeSheet();
  }, [examId]);

  const handleOverrideGrade = async (
    questionId: string,
    pointsToAward: number,
    isCorrect: boolean
  ) => {
    if (!selectedStudent) return;

    setGradingQuestionId(questionId);

    try {
      // 1. Try secure RPC
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_override_grade', {
        p_attempt_id: selectedStudent.attempt_id,
        p_question_id: questionId,
        p_points_earned: pointsToAward,
        p_is_correct: isCorrect,
      });

      let updatedTotalScore: number;
      let updatedPercentage: number;
      let finalPointsEarned: number;
      let finalIsCorrect: boolean;

      if (!rpcErr && rpcRes && rpcRes.success) {
        updatedTotalScore = Number(rpcRes.total_score);
        updatedPercentage = Number(rpcRes.percentage);
        finalPointsEarned = Number(rpcRes.points_earned);
        finalIsCorrect = Boolean(rpcRes.is_correct);
      } else {
        // Fallback: direct updates
        const { error: ansErr } = await supabase.from('answers').upsert(
          {
            attempt_id: selectedStudent.attempt_id,
            question_id: questionId,
            points_earned: pointsToAward,
            is_correct: isCorrect,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'attempt_id,question_id' }
        );
        if (ansErr) throw ansErr;

        const currentAnsMap = { ...selectedStudent.answers };
        currentAnsMap[questionId] = {
          ...currentAnsMap[questionId],
          points_earned: pointsToAward,
          is_correct: isCorrect,
        };

        updatedTotalScore = Object.values(currentAnsMap).reduce(
          (sum: number, a: any) => sum + (Number(a.points_earned) || 0),
          0
        );
        const maxScore = selectedStudent.max_possible_score || 1;
        updatedPercentage = maxScore > 0 ? Math.round((updatedTotalScore / maxScore) * 10000) / 100 : 0;
        finalPointsEarned = pointsToAward;
        finalIsCorrect = isCorrect;

        await supabase
          .from('exam_attempts')
          .update({
            total_score: updatedTotalScore,
            percentage: updatedPercentage,
          })
          .eq('id', selectedStudent.attempt_id);
      }

      // Update selectedStudent
      const updatedAnswersMap = {
        ...selectedStudent.answers,
        [questionId]: {
          ...selectedStudent.answers[questionId],
          points_earned: finalPointsEarned,
          is_correct: finalIsCorrect,
        },
      };

      const updatedStudent: GradeSheetStudent = {
        ...selectedStudent,
        total_score: updatedTotalScore,
        percentage: updatedPercentage,
        answers: updatedAnswersMap,
      };

      setSelectedStudent(updatedStudent);

      // Update in data.students
      if (data) {
        setData({
          ...data,
          students: data.students.map((st) =>
            st.attempt_id === selectedStudent.attempt_id ? updatedStudent : st
          ),
        });
      }

      // Update custom input state
      setCustomPointsInput((prev) => ({
        ...prev,
        [questionId]: String(finalPointsEarned),
      }));
    } catch (err: any) {
      console.error('Failed to override grade in grade sheet:', err);
      alert(`Failed to update grade: ${err.message || 'Unknown error'}`);
    } finally {
      setGradingQuestionId(null);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!data) return;

    const rows = data.students.map((st) => {
      const row: Record<string, any> = {
        'Student Name': st.student_name,
        'Email Address': st.student_email,
        'Student ID': st.student_code || 'N/A',
        Status: st.status.toUpperCase(),
        'Strikes (Violations)': st.strike_count,
        'Started At': formatDate(st.started_at),
        'Submitted At': formatDate(st.submitted_at),
      };

      // Add each question
      data.questions.forEach((q, idx) => {
        const ans = st.answers[q.id];
        row[`Q${idx + 1}: Answer`] = ans ? ans.selected_choice_text || ans.text_answer || 'No Answer' : 'None';
        row[`Q${idx + 1}: Pts`] = ans ? `${ans.points_earned || 0}/${q.points}` : `0/${q.points}`;
      });

      row['Total Score'] = st.total_score;
      row['Max Score'] = st.max_possible_score;
      row['Percentage %'] = `${st.percentage}%`;

      return row;
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${examTitle || 'Exam'}_Grade_Sheet.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!data) return;

    const rows = data.students.map((st) => {
      const row: Record<string, any> = {
        'Student Name': st.student_name,
        'Email Address': st.student_email,
        'Student ID': st.student_code || 'N/A',
        Status: st.status.toUpperCase(),
        'Cheating Strikes': st.strike_count,
        'Started At': formatDate(st.started_at),
        'Submitted At': formatDate(st.submitted_at),
      };

      data.questions.forEach((q, idx) => {
        const ans = st.answers[q.id];
        row[`Q${idx + 1} Answer`] = ans ? ans.selected_choice_text || ans.text_answer || 'No Answer' : 'None';
        row[`Q${idx + 1} Points`] = ans ? Number(ans.points_earned || 0) : 0;
      });

      row['Total Score'] = Number(st.total_score);
      row['Max Possible'] = Number(st.max_possible_score);
      row['Percentage'] = `${st.percentage}%`;

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Grade Sheet');
    XLSX.writeFile(workbook, `${examTitle || 'Exam'}_Grade_Sheet.xlsx`);
  };

  const filteredStudents = (data?.students || []).filter((st) =>
    st.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    st.student_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Hero Banner */}
        <div className="hero-axis">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/admin/exam/${examId}`)}
                  className="p-1.5 h-8 w-8 rounded-lg"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-600" />
                </Button>
                <div className="eyebrow-axis">Grade Sheet & Assessment Matrix</div>
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {examTitle || 'Exam Grade Sheet'}
              </h2>
              <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                Per-candidate question responses, auto-graded marks breakdown, cheating incident audits, and tabular spreadsheet export.
              </p>
              <div className="goal-pill">
                ◆ Real-time Matrix • Question Accuracy • Anti-Cheat Verification • CSV / Excel Sync
              </div>
            </div>

            <div className="flex items-center space-x-2.5 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                onClick={loadGradeSheet}
                className="flex items-center space-x-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh Data</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCSV}
                className="flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5 text-axis-blue" />
                <span>Export CSV</span>
              </Button>

              <Button
                size="sm"
                onClick={handleExportExcel}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Excel (.xlsx)</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter candidate name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-axis-blue focus:bg-white transition-all"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing <strong className="text-slate-900 font-bold">{filteredStudents.length}</strong> evaluated candidates
          </div>
        </div>

        {/* Spreadsheet Matrix Grid */}
        <div className="table-wrap-axis">
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[11px]">
                <tr>
                  <th className="px-4 py-3.5 sticky left-0 z-30 bg-slate-50 border-r border-slate-200 font-bold">
                    Candidate
                  </th>
                  <th className="px-3 py-3.5 text-center border-r border-slate-200">Status</th>
                  <th className="px-3 py-3.5 text-center border-r border-slate-200">Strikes</th>

                  {/* Question Columns */}
                  {data?.questions.map((q, idx) => (
                    <th
                      key={q.id}
                      className="px-4 py-3.5 min-w-[130px] border-r border-slate-200 text-center"
                      title={q.question_text}
                    >
                      <div className="text-axis-blue font-bold">Q{idx + 1}</div>
                      <div className="text-[10px] text-slate-400 font-normal">({q.points} pts)</div>
                    </th>
                  ))}

                  <th className="px-4 py-3.5 text-center border-r border-slate-200">Total Score</th>
                  <th className="px-4 py-3.5 text-center border-r border-slate-200">Percentage</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((st) => (
                    <tr key={st.attempt_id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Candidate Name & Email (Sticky Column) */}
                      <td className="px-4 py-3.5 sticky left-0 z-10 bg-white border-r border-slate-200">
                        <div className="font-bold text-slate-900">{st.student_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{st.student_email}</div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3.5 text-center border-r border-slate-100">
                        {st.status === 'submitted' && <span className="badge-pill badge-ok">Submitted</span>}
                        {st.status === 'in_progress' && <span className="badge-pill badge-warn">In Progress</span>}
                        {st.status === 'disqualified' && <span className="badge-pill badge-bad">Disqualified</span>}
                        {st.status === 'expired' && <span className="badge-pill badge-axis">Expired</span>}
                      </td>

                      {/* Cheating Strikes */}
                      <td className="px-3 py-3.5 text-center border-r border-slate-100 font-bold">
                        <span className={st.strike_count > 0 ? 'text-red-600 font-black' : 'text-slate-400'}>
                          {st.strike_count}
                        </span>
                      </td>

                      {/* Question Cells */}
                      {data?.questions.map((q) => {
                        const ans = st.answers[q.id];
                        return (
                          <td key={q.id} className="px-3 py-2.5 text-center border-r border-slate-100">
                            {ans ? (
                              <div className="space-y-1">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                    ans.is_correct
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-red-50 text-red-700 border border-red-200'
                                  }`}
                                >
                                  {ans.is_correct ? (
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                  ) : (
                                    <XCircle className="w-3 h-3 mr-1" />
                                  )}
                                  <span>{ans.points_earned} pts</span>
                                </span>
                                <div className="text-[11px] text-slate-600 truncate max-w-[120px] mx-auto">
                                  {ans.selected_choice_text || ans.text_answer || '-'}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">-</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Total Score */}
                      <td className="px-4 py-3.5 text-center border-r border-slate-100 font-black text-slate-900">
                        {st.total_score} / {st.max_possible_score}
                      </td>

                      {/* Percentage */}
                      <td className="px-4 py-3.5 text-center border-r border-slate-100">
                        <span
                          className={`font-black text-xs ${
                            st.percentage >= 60 ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                        >
                          {st.percentage}%
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedStudent(st)}
                          className="text-axis-blue hover:text-blue-700 font-bold inline-flex items-center space-x-1 cursor-pointer text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={(data?.questions.length || 0) + 6}
                      className="px-4 py-12 text-center text-slate-400"
                    >
                      {isLoading ? 'Loading grade sheet matrix...' : 'No candidate records available.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Student Inspector Modal */}
        {selectedStudent && (
          <Modal
            isOpen={!!selectedStudent}
            onClose={() => setSelectedStudent(null)}
            title={`Submission Audit: ${selectedStudent.student_name}`}
            maxWidth="4xl"
          >
            <div className="space-y-5">
              {/* Overall Evaluation Card */}
              <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                      Candidate Current Grade
                    </span>
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className="text-2xl sm:text-3xl font-black text-slate-900">
                        {selectedStudent.total_score}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        / {selectedStudent.max_possible_score} pts
                      </span>
                      <span
                        className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                          (selectedStudent.percentage ?? 0) >= 75
                            ? 'bg-emerald-100 text-emerald-800'
                            : (selectedStudent.percentage ?? 0) >= 50
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {selectedStudent.percentage ?? 0}%
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 bg-white px-3.5 py-2 rounded-xl border border-slate-200 flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span>
                      <strong>Human-in-the-Loop:</strong> Award or withdraw question degrees below. Matrix updates automatically.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block font-semibold text-[10px] uppercase">Email:</span>
                    <span className="text-slate-900 font-mono font-medium">{selectedStudent.student_email}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold text-[10px] uppercase">Student ID:</span>
                    <span className="text-slate-900 font-medium">{selectedStudent.student_code || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold text-[10px] uppercase">Strikes:</span>
                    <span className={`font-bold ${selectedStudent.strike_count > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                      {selectedStudent.strike_count} strikes logged
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold text-[10px] uppercase">Status:</span>
                    <span className="font-bold uppercase text-slate-800">{selectedStudent.status}</span>
                  </div>
                </div>
              </div>

              {/* Question-by-Question Breakdown with Grading Overrides */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-slate-900 flex items-center justify-between">
                  <span>Questions & Candidate Responses ({data?.questions.length || 0})</span>
                  <span className="text-xs font-normal text-slate-400">Review subjective or non-MCQ answers</span>
                </h4>

                <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                  {data?.questions.map((q, idx) => {
                    const ans = selectedStudent.answers[q.id];
                    const isQuestionGrading = gradingQuestionId === q.id;
                    const { text: cleanPrompt, imageUrl } = parseQuestionContent(q.question_text);
                    const candidateSubmission = ans?.selected_choice_text || ans?.text_answer;
                    const isShortAnswer = q.question_type === 'short_answer';
                    const currentPoints = ans?.points_earned !== undefined ? Number(ans.points_earned) : 0;
                    const isCorrect = ans?.is_correct ?? false;

                    return (
                      <div
                        key={q.id}
                        className={`p-4 rounded-2xl border text-xs space-y-3 transition-all ${
                          isCorrect
                            ? 'bg-emerald-50/30 border-emerald-200'
                            : currentPoints > 0
                            ? 'bg-amber-50/30 border-amber-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-700 font-black text-[10px] flex items-center justify-center border border-blue-100">
                              {q.order_index || idx + 1}
                            </span>
                            <span className="font-bold text-slate-800 text-xs">
                              Question {q.order_index || idx + 1}
                            </span>
                            <span
                              className={`px-2 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isShortAnswer
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {isShortAnswer
                                ? 'Short Answer (Text)'
                                : q.question_type === 'true_false'
                                ? 'True / False'
                                : 'Multiple Choice'}
                            </span>
                          </div>

                          <span
                            className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full font-mono font-bold text-xs ${
                              isCorrect
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : currentPoints > 0
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {isCorrect ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            ) : currentPoints > 0 ? (
                              <Check className="w-3.5 h-3.5 text-amber-600" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                            )}
                            <span>
                              {currentPoints} / {q.points} Pts
                            </span>
                          </span>
                        </div>

                        {/* Prompt */}
                        <div className="text-slate-900 font-medium text-xs leading-relaxed">
                          <MathText content={cleanPrompt} />
                        </div>

                        {imageUrl && (
                          <div className="p-2 border border-slate-200 rounded-xl bg-slate-50 inline-block">
                            <img src={imageUrl} alt="Diagram" className="max-h-40 rounded-lg object-contain" />
                          </div>
                        )}

                        {/* Candidate response box */}
                        <div
                          className={`p-3 rounded-xl border ${
                            candidateSubmission
                              ? 'bg-slate-50/80 border-slate-200'
                              : 'bg-amber-50/40 border-amber-200'
                          }`}
                        >
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Candidate Submitted Response:
                          </span>
                          <div className="font-semibold text-slate-900 break-words">
                            {candidateSubmission ? (
                              <MathText content={candidateSubmission} />
                            ) : (
                              <span className="italic text-slate-400 font-normal">
                                Blank / No response submitted
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Grading Action Bar */}
                        <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 p-2.5 rounded-xl">
                          <div className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-500">
                            <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                            <span>Degree Override:</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Award Full Points */}
                            <button
                              type="button"
                              disabled={isQuestionGrading || (isCorrect && currentPoints === q.points)}
                              onClick={() => handleOverrideGrade(q.id, q.points, true)}
                              className={`px-3 py-1 rounded-xl font-bold text-xs flex items-center space-x-1 transition-all cursor-pointer ${
                                isCorrect && currentPoints === q.points
                                  ? 'bg-emerald-600 text-white shadow-xs cursor-default'
                                  : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 active:scale-95'
                              }`}
                              title="Award full points and mark correct"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Award Full ({q.points} pts)</span>
                            </button>

                            {/* Withdraw Points */}
                            <button
                              type="button"
                              disabled={isQuestionGrading || (!isCorrect && currentPoints === 0)}
                              onClick={() => handleOverrideGrade(q.id, 0, false)}
                              className={`px-3 py-1 rounded-xl font-bold text-xs flex items-center space-x-1 transition-all cursor-pointer ${
                                !isCorrect && currentPoints === 0
                                  ? 'bg-rose-600 text-white shadow-xs cursor-default'
                                  : 'bg-rose-100 text-rose-800 hover:bg-rose-200 active:scale-95'
                              }`}
                              title="Withdraw points and mark incorrect"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Withdraw (0 pts)</span>
                            </button>

                            {/* Custom partial credit */}
                            <div className="flex items-center space-x-1 pl-2 border-l border-slate-200">
                              <input
                                type="number"
                                min="0"
                                max={q.points}
                                step="0.5"
                                value={customPointsInput[q.id] ?? currentPoints}
                                onChange={(e) =>
                                  setCustomPointsInput((prev) => ({
                                    ...prev,
                                    [q.id]: e.target.value,
                                  }))
                                }
                                className="w-16 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-slate-800 text-center"
                                placeholder="Pts"
                              />
                              <button
                                type="button"
                                disabled={isQuestionGrading}
                                onClick={() => {
                                  const val = parseFloat(
                                    customPointsInput[q.id] ?? String(currentPoints)
                                  );
                                  if (!isNaN(val)) {
                                    handleOverrideGrade(q.id, val, val > 0);
                                  }
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer"
                              >
                                {isQuestionGrading ? '...' : 'Set'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AdminLayout>
  );
};
