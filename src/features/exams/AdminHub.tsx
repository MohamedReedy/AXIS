import React, { useState, useEffect } from 'react';
import { PlusCircle, Search, Sparkles, Filter, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Exam } from '@/types';
import { AdminLayout } from '@/layouts/AdminLayout';
import { ExamCard } from './ExamCard';
import { ExamBuilderModal } from './ExamBuilderModal';
import { Button } from '@/components/ui/button';

export const AdminHub: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [builderState, setBuilderState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit' | 'copy';
    exam: Exam | null;
  }>({
    isOpen: false,
    mode: 'create',
    exam: null,
  });
  const [activeTab, setActiveTab] = useState<'all' | 'published' | 'draft' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fetchExams = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('exams')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchErr) {
        throw fetchErr;
      }

      setExams((data as Exam[]) || []);
    } catch (err: any) {
      console.error('Failed to load exams:', err);
      setError(err?.message || 'Could not fetch exams from database');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const handleSaveExam = async (examData: any, examId?: string, mode?: 'create' | 'edit' | 'copy') => {
    const { questions, ...examFields } = examData;

    if (mode === 'edit' && examId) {
      // 1. Update Exam record
      const { error: examError } = await supabase
        .from('exams')
        .update({
          title: examFields.title,
          description: examFields.description,
          instructions: examFields.instructions,
          start_time: examFields.start_time,
          end_time: examFields.end_time,
          duration_minutes: examFields.duration_minutes,
          max_strikes: examFields.max_strikes,
          status: examFields.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', examId);

      if (examError) throw examError;

      // 2. Fetch current DB questions to reconcile
      const { data: dbQuestions, error: fetchQErr } = await supabase
        .from('questions')
        .select('id')
        .eq('exam_id', examId);

      if (fetchQErr) throw fetchQErr;

      const dbQIds = new Set((dbQuestions || []).map((q) => q.id));
      const activeQIds = new Set(questions.filter((q: any) => !q.id.startsWith('q_')).map((q: any) => q.id));

      // Delete questions removed in builder
      const questionsToDelete = [...dbQIds].filter((id) => !activeQIds.has(id));
      if (questionsToDelete.length > 0) {
        const { error: delQErr } = await supabase
          .from('questions')
          .delete()
          .in('id', questionsToDelete);
        if (delQErr) throw delQErr;
      }

      // Update or insert each question
      for (const q of questions) {
        const isExistingQ = !q.id.startsWith('q_') && dbQIds.has(q.id);
        let targetQuestionId = q.id;

        if (isExistingQ) {
          const { error: updateQErr } = await supabase
            .from('questions')
            .update({
              order_index: q.order_index,
              question_text: q.question_text,
              question_type: q.question_type,
              points: q.points,
            })
            .eq('id', q.id);
          if (updateQErr) throw updateQErr;
        } else {
          const { data: newQ, error: insertQErr } = await supabase
            .from('questions')
            .insert([{
              exam_id: examId,
              order_index: q.order_index,
              question_text: q.question_text,
              question_type: q.question_type,
              points: q.points,
            }])
            .select()
            .single();

          if (insertQErr) throw insertQErr;
          targetQuestionId = newQ.id;
        }

        // Synchronize choices for targetQuestionId
        if (isExistingQ) {
          const { data: dbChoices, error: fetchCErr } = await supabase
            .from('question_choices')
            .select('id')
            .eq('question_id', targetQuestionId);

          if (fetchCErr) throw fetchCErr;

          const dbCIds = new Set((dbChoices || []).map((c) => c.id));
          const activeCIds = new Set((q.choices || []).filter((c: any) => !c.id.startsWith('c_')).map((c: any) => c.id));

          // Delete removed choices
          const choicesToDelete = [...dbCIds].filter((id) => !activeCIds.has(id));
          if (choicesToDelete.length > 0) {
            await supabase.from('question_choices').delete().in('id', choicesToDelete);
          }

          // Update existing or insert new
          for (const c of (q.choices || [])) {
            if (!c.id.startsWith('c_') && dbCIds.has(c.id)) {
              await supabase
                .from('question_choices')
                .update({
                  order_index: c.order_index,
                  choice_text: c.choice_text,
                  is_correct: c.is_correct,
                })
                .eq('id', c.id);
            } else {
              await supabase
                .from('question_choices')
                .insert([{
                  question_id: targetQuestionId,
                  order_index: c.order_index,
                  choice_text: c.choice_text,
                  is_correct: c.is_correct,
                }]);
            }
          }
        } else {
          // New question: insert all choices
          if (q.choices && q.choices.length > 0) {
            const choiceRows = q.choices.map((c: any) => ({
              question_id: targetQuestionId,
              order_index: c.order_index,
              choice_text: c.choice_text,
              is_correct: c.is_correct,
            }));
            const { error: insertCErr } = await supabase
              .from('question_choices')
              .insert(choiceRows);
            if (insertCErr) throw insertCErr;
          }
        }
      }
    } else {
      // 1. Insert Exam
      const { data: createdExam, error: examError } = await supabase
        .from('exams')
        .insert([examFields])
        .select()
        .single();

      if (examError) throw examError;

      // 2. Insert Questions & Choices
      for (const q of questions) {
        const { data: createdQuestion, error: qError } = await supabase
          .from('questions')
          .insert([{
            exam_id: createdExam.id,
            order_index: q.order_index,
            question_text: q.question_text,
            question_type: q.question_type,
            points: q.points,
          }])
          .select()
          .single();

        if (qError) throw qError;

        if (q.choices && q.choices.length > 0) {
          const choiceRows = q.choices.map((c: any) => ({
            question_id: createdQuestion.id,
            order_index: c.order_index,
            choice_text: c.choice_text,
            is_correct: c.is_correct,
          }));

          const { error: cError } = await supabase
            .from('question_choices')
            .insert(choiceRows);

          if (cError) throw cError;
        }
      }
    }

    await fetchExams();
  };

  const handleStatusChange = async (id: string, newStatus: 'draft' | 'published' | 'archived') => {
    try {
      const { error } = await supabase
        .from('exams')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setExams(exams.map((e) => (e.id === id ? { ...e, status: newStatus } : e)));
    } catch (err: any) {
      console.error('Failed to update status:', err);
      alert('Error updating status: ' + err?.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this exam? All student attempts and results will be permanently removed.')) {
      return;
    }

    try {
      const { error } = await supabase.from('exams').delete().eq('id', id);
      if (error) throw error;
      setExams(exams.filter((e) => e.id !== id));
    } catch (err: any) {
      console.error('Failed to delete exam:', err);
      alert('Error deleting exam: ' + err?.message);
    }
  };

  const filteredExams = exams.filter((exam) => {
    const matchesTab = activeTab === 'all' || exam.status === activeTab;
    const matchesSearch =
      exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exam.description && exam.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  return (
    <AdminLayout onOpenCreate={() => setBuilderState({ isOpen: true, mode: 'create', exam: null })}>
      <div className="space-y-6">
        {/* Prototype Hero Banner */}
        <div className="hero-axis">
          <div className="eyebrow-axis">AXIS AI EXCELLENCE SPRINT • GOVERNED ASSESSMENT</div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 mb-2 tracking-tight">
            Question Bank & Examination Core
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
            Standard topic and difficulty blueprinting, server-authoritative timer locks, and live anti-cheat proctoring.
            Only published examinations can be accessed by enrolled candidates.
          </p>
          <div className="goal-pill">
            <span>◆ Author &rarr; Blueprint &rarr; Scheduled Window &rarr; Lockdown Fullscreen &rarr; Question-by-Question Grade Sheet</span>
          </div>
        </div>

        {/* Prototype KPI Metric Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <span className="badge-pill badge-axis">All Exams</span>
            <div className="text-2xl font-black text-slate-900 mt-2 font-mono">{exams.length}</div>
            <p className="text-[11px] text-slate-500 mt-1">Total managed test definitions</p>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <span className="badge-pill badge-ok">Published</span>
            <div className="text-2xl font-black text-emerald-600 mt-2 font-mono">
              {exams.filter((e) => e.status === 'published').length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Open for candidate submissions</p>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <span className="badge-pill badge-warn">In Draft</span>
            <div className="text-2xl font-black text-amber-600 mt-2 font-mono">
              {exams.filter((e) => e.status === 'draft').length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Under authoring or review</p>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <span className="badge-pill badge-info">Archived</span>
            <div className="text-2xl font-black text-sky-600 mt-2 font-mono">
              {exams.filter((e) => e.status === 'archived').length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Historical closed examinations</p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start space-x-3 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Database Notice</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-1.5 w-full sm:w-auto overflow-x-auto">
            {(['all', 'published', 'draft', 'archived'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-blue-700 to-indigo-700 text-white shadow-xs shadow-blue-700/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search exams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchExams}
              className="flex items-center space-x-1.5"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Exams Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-64 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : filteredExams.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredExams.map((exam) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onUpdated={fetchExams}
                onEdit={(targetExam) => setBuilderState({ isOpen: true, mode: 'edit', exam: targetExam })}
                onCopy={(targetExam) => setBuilderState({ isOpen: true, mode: 'copy', exam: targetExam })}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-3xl space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto text-blue-600">
              <Sparkles className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">No examinations found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery
                  ? 'No exams matched your search query.'
                  : 'Get started by creating your first scheduled locked examination.'}
              </p>
            </div>
            <Button size="sm" onClick={() => setBuilderState({ isOpen: true, mode: 'create', exam: null })} className="mt-2 bg-blue-700 hover:bg-blue-600 text-white">
              <PlusCircle className="w-4 h-4 mr-1.5" />
              <span>Create First Exam</span>
            </Button>
          </div>
        )}
      </div>

      {/* Exam Builder Modal */}
      <ExamBuilderModal
        isOpen={builderState.isOpen}
        mode={builderState.mode}
        sourceExam={builderState.exam}
        onClose={() => setBuilderState({ isOpen: false, mode: 'create', exam: null })}
        onSave={handleSaveExam}
      />
    </AdminLayout>
  );
};
