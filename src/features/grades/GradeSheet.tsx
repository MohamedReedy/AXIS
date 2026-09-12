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
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { GradeSheetData, GradeSheetStudent, Question } from '@/types';
import { AdminLayout } from '@/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatDate } from '@/lib/utils';

export const GradeSheet: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [examTitle, setExamTitle] = useState<string>('');
  const [data, setData] = useState<GradeSheetData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<GradeSheetStudent | null>(null);

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
            title={`Detailed Submission: ${selectedStudent.student_name}`}
            maxWidth="2xl"
          >
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl text-xs border border-slate-200">
                <div>
                  <span className="text-slate-500 block font-semibold">Candidate:</span>
                  <span className="text-slate-900 font-bold">{selectedStudent.student_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-semibold">Email:</span>
                  <span className="text-slate-700 font-mono">{selectedStudent.student_email}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-semibold">Status:</span>
                  <span className={selectedStudent.status === 'submitted' ? 'badge-pill badge-ok' : 'badge-pill badge-bad'}>
                    {selectedStudent.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-semibold">Overall Score:</span>
                  <span className="text-emerald-600 font-black text-sm">
                    {selectedStudent.total_score} / {selectedStudent.max_possible_score} ({selectedStudent.percentage}%)
                  </span>
                </div>
              </div>

              {/* Question-by-Question Breakdown */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-slate-900">Answer Breakdown</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {data?.questions.map((q, idx) => {
                    const ans = selectedStudent.answers[q.id];
                    return (
                      <div
                        key={q.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            Q{idx + 1}: {q.question_text}
                          </span>
                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                              ans?.is_correct
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {ans ? `${ans.points_earned}/${q.points} pts` : `0/${q.points} pts`}
                          </span>
                        </div>
                        <div className="text-slate-600">
                          Selected:{' '}
                          <strong className="text-slate-900">
                            {ans?.selected_choice_text || ans?.text_answer || 'None / Not Answered'}
                          </strong>
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
