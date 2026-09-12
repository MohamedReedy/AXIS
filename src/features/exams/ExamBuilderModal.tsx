import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, AlertCircle, Sparkles, Eye, EyeOff, Image as ImageIcon, X, Upload, ChevronUp, ChevronDown, Loader2, Copy as CopyIcon, Edit3 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuestionType, Exam } from '@/types';
import { serializeExamConfig, parseExamConfig } from '@/lib/examConfig';
import { serializeQuestionContent, parseQuestionContent, compressImageFile } from '@/lib/utils';
import { MathText } from '@/components/ui/MathText';
import { supabase } from '@/lib/supabase';

interface QuestionDraft {
  id: string;
  order_index: number;
  question_text: string;
  question_type: QuestionType;
  points: number;
  choices: Array<{
    id: string;
    choice_text: string;
    is_correct: boolean;
  }>;
  image_url?: string;
}

interface ExamBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (examData: any, examId?: string) => Promise<void>;
  initialExam?: Exam | null;
  mode?: 'create' | 'edit' | 'copy';
}

export const ExamBuilderModal: React.FC<ExamBuilderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialExam,
  mode = 'create',
}) => {
  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('Maintain full-screen focus. Exiting or switching tabs triggers cheating strikes.');
  
  // Set default start time to now and end time to 24 hours from now
  const now = new Date();
  const defaultStart = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(tomorrow);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [maxStrikes, setMaxStrikes] = useState(3);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('published');
  const [showScoreToStudent, setShowScoreToStudent] = useState<boolean>(true);

  // Questions State
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    {
      id: 'q1',
      order_index: 1,
      question_text: 'What is the primary objective of browser-based lockdown in an exam?',
      question_type: 'multiple_choice',
      points: 1,
      choices: [
        { id: 'c1', choice_text: 'To prevent tab switching and unauthorized navigation', is_correct: true },
        { id: 'c2', choice_text: 'To make the internet faster', is_correct: false },
        { id: 'c3', choice_text: 'To turn off student monitors', is_correct: false },
        { id: 'c4', choice_text: 'To shut down the computer', is_correct: false },
      ],
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronize modal state on open, edit, or copy
  useEffect(() => {
    if (!isOpen) return;

    if (initialExam && (mode === 'edit' || mode === 'copy')) {
      const loadExamData = async () => {
        setIsLoadingData(true);
        setError(null);
        try {
          const config = parseExamConfig(initialExam.instructions);
          setTitle(mode === 'copy' ? `Copy of ${initialExam.title}` : initialExam.title);
          setDescription(initialExam.description || '');
          setInstructions(config.instructionsText || 'Maintain full-screen focus. Exiting or switching tabs triggers cheating strikes.');
          setShowScoreToStudent(config.showScoreToStudent);
          setMaxAttempts(config.maxAttemptsPerStudent);
          setDurationMinutes(initialExam.duration_minutes || 30);
          setMaxStrikes(initialExam.max_strikes || 3);
          setStatus(mode === 'copy' ? 'published' : initialExam.status);

          if (mode === 'copy') {
            const curNow = new Date();
            const curStart = new Date(curNow.getTime() - curNow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            const curTomorrow = new Date(curNow.getTime() + 24 * 60 * 60 * 1000 - curNow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            setStartTime(curStart);
            setEndTime(curTomorrow);
          } else {
            const dStart = new Date(initialExam.start_time);
            const dEnd = new Date(initialExam.end_time);
            setStartTime(new Date(dStart.getTime() - dStart.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
            setEndTime(new Date(dEnd.getTime() - dEnd.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
          }

          // Fetch questions and choices for this exam
          const { data: qData, error: qErr } = await supabase
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
            .eq('exam_id', initialExam.id)
            .order('order_index');

          if (qErr) throw qErr;

          if (qData && qData.length > 0) {
            const drafts: QuestionDraft[] = qData.map((q: any, qIdx: number) => {
              const { text: cleanText, imageUrl } = parseQuestionContent(q.question_text);
              const qId = mode === 'copy' ? `q_${Date.now()}_${qIdx}` : q.id;
              const rawChoices = (q.choices || []).sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));
              const choices = rawChoices.map((c: any, cIdx: number) => ({
                id: mode === 'copy' ? `c_${Date.now()}_${qIdx}_${cIdx}` : c.id,
                choice_text: c.choice_text,
                is_correct: Boolean(c.is_correct),
              }));

              return {
                id: qId,
                order_index: qIdx + 1,
                question_text: cleanText,
                question_type: q.question_type as QuestionType,
                points: Number(q.points) || 1,
                image_url: imageUrl || '',
                choices: choices.length > 0 ? choices : [
                  { id: `c_${Date.now()}_1`, choice_text: 'Option A', is_correct: true },
                  { id: `c_${Date.now()}_2`, choice_text: 'Option B', is_correct: false },
                ],
              };
            });
            setQuestions(drafts);
          }
        } catch (err: any) {
          console.error('Failed to load exam details:', err);
          setError('Failed to load exam details: ' + err?.message);
        } finally {
          setIsLoadingData(false);
        }
      };

      loadExamData();
    } else {
      // Reset for fresh create
      const curNow = new Date();
      const curStart = new Date(curNow.getTime() - curNow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const curTomorrow = new Date(curNow.getTime() + 24 * 60 * 60 * 1000 - curNow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setTitle('');
      setDescription('');
      setInstructions('Maintain full-screen focus. Exiting or switching tabs triggers cheating strikes.');
      setStartTime(curStart);
      setEndTime(curTomorrow);
      setDurationMinutes(30);
      setMaxStrikes(3);
      setMaxAttempts(1);
      setStatus('published');
      setShowScoreToStudent(true);
      setQuestions([
        {
          id: 'q1',
          order_index: 1,
          question_text: 'What is the primary objective of browser-based lockdown in an exam?',
          question_type: 'multiple_choice',
          points: 1,
          choices: [
            { id: 'c1', choice_text: 'To prevent tab switching and unauthorized navigation', is_correct: true },
            { id: 'c2', choice_text: 'To make the internet faster', is_correct: false },
            { id: 'c3', choice_text: 'To turn off student monitors', is_correct: false },
            { id: 'c4', choice_text: 'To shut down the computer', is_correct: false },
          ],
        },
      ]);
      setError(null);
      setIsLoadingData(false);
    }
  }, [isOpen, initialExam, mode]);

  // Add Question
  const handleAddQuestion = () => {
    const newId = `q_${Date.now()}`;
    setQuestions([
      ...questions,
      {
        id: newId,
        order_index: questions.length + 1,
        question_text: '',
        question_type: 'multiple_choice',
        points: 1,
        choices: [
          { id: `c_${Date.now()}_1`, choice_text: 'Option A', is_correct: true },
          { id: `c_${Date.now()}_2`, choice_text: 'Option B', is_correct: false },
        ],
      },
    ]);
  };

  // Remove Question
  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) return;
    const filtered = questions.filter((_, i) => i !== index);
    setQuestions(filtered.map((q, idx) => ({ ...q, order_index: idx + 1 })));
  };

  // Move Question Up / Down
  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const updated = [...questions];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setQuestions(updated.map((q, idx) => ({ ...q, order_index: idx + 1 })));
  };

  // Update Question Field
  const handleUpdateQuestion = (index: number, field: string, value: any) => {
    const updated = [...questions];
    (updated[index] as any)[field] = value;

    if (field === 'question_type') {
      if (value === 'true_false') {
        updated[index].choices = [
          { id: `c_${Date.now()}_t`, choice_text: 'True', is_correct: true },
          { id: `c_${Date.now()}_f`, choice_text: 'False', is_correct: false },
        ];
      } else if (value === 'short_answer') {
        updated[index].choices = [
          { id: `c_${Date.now()}_ans`, choice_text: 'Expected answer', is_correct: true },
        ];
      }
    }
    setQuestions(updated);
  };

  // Add Choice to Question
  const handleAddChoice = (qIndex: number) => {
    const updated = [...questions];
    updated[qIndex].choices.push({
      id: `c_${Date.now()}`,
      choice_text: `Option ${String.fromCharCode(65 + updated[qIndex].choices.length)}`,
      is_correct: false,
    });
    setQuestions(updated);
  };

  // Update Choice
  const handleChoiceTextChange = (qIndex: number, cIndex: number, text: string) => {
    const updated = [...questions];
    updated[qIndex].choices[cIndex].choice_text = text;
    setQuestions(updated);
  };

  // Set Correct Choice
  const handleSetCorrectChoice = (qIndex: number, cIndex: number) => {
    const updated = [...questions];
    updated[qIndex].choices.forEach((c, i) => {
      c.is_correct = i === cIndex;
    });
    setQuestions(updated);
  };

  // Remove Choice
  const handleRemoveChoice = (qIndex: number, cIndex: number) => {
    const updated = [...questions];
    if (updated[qIndex].choices.length <= 2) return;
    updated[qIndex].choices = updated[qIndex].choices.filter((_, i) => i !== cIndex);
    // Ensure at least one choice is correct
    if (!updated[qIndex].choices.some((c) => c.is_correct)) {
      updated[qIndex].choices[0].is_correct = true;
    }
    setQuestions(updated);
  };

  // Move Choice Up / Down
  const handleMoveChoice = (qIndex: number, cIndex: number, direction: 'up' | 'down') => {
    const choices = questions[qIndex].choices;
    const targetIndex = direction === 'up' ? cIndex - 1 : cIndex + 1;
    if (targetIndex < 0 || targetIndex >= choices.length) return;
    const updated = [...questions];
    const updatedChoices = [...choices];
    const temp = updatedChoices[cIndex];
    updatedChoices[cIndex] = updatedChoices[targetIndex];
    updatedChoices[targetIndex] = temp;
    updated[qIndex] = {
      ...updated[qIndex],
      choices: updatedChoices,
    };
    setQuestions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please provide an exam title');
      return;
    }

    if (new Date(endTime) <= new Date(startTime)) {
      setError('End date/time must be strictly after the start date/time');
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].question_text.trim()) {
        setError(`Question #${i + 1} is missing question text`);
        return;
      }
      if (questions[i].choices.length === 0) {
        setError(`Question #${i + 1} has no answers`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSave({
        title,
        description,
        instructions: serializeExamConfig(instructions, showScoreToStudent, maxAttempts),
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        duration_minutes: Number(durationMinutes),
        max_strikes: Number(maxStrikes),
        status,
        questions: questions.map((q, idx) => ({
          id: q.id,
          order_index: idx + 1,
          question_text: serializeQuestionContent(q.question_text, q.image_url),
          question_type: q.question_type,
          points: q.points,
          choices: q.choices.map((c, cIdx) => ({
            id: c.id,
            order_index: cIdx + 1,
            choice_text: c.choice_text,
            is_correct: c.is_correct,
          })),
        })),
      }, mode === 'edit' ? initialExam?.id : undefined);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save exam');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalTitle = mode === 'edit'
    ? `Edit Exam: ${initialExam?.title || 'Template'}`
    : mode === 'copy'
    ? `Copy & Reference: ${initialExam?.title || 'Template'}`
    : 'Create New Examination';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} maxWidth="4xl">
      {isLoadingData ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm font-semibold text-slate-700">Loading exam template, questions & choices...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'copy' && (
            <div className="p-3 rounded-xl bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-900 flex items-center space-x-2">
              <CopyIcon className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span>
                <strong>Reference Template:</strong> Pre-filled from <em>{initialExam?.title}</em>. You can edit questions, reorder options, and add new questions.
              </span>
            </div>
          )}
          {mode === 'edit' && (
            <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-xs text-blue-900 flex items-center space-x-2">
              <Edit3 className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span>
                <strong>Full Template Editing:</strong> Modify any settings, existing questions, answers, points, diagrams, or add new questions.
              </span>
            </div>
          )}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center space-x-2 text-red-400 text-xs font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

        {/* Basic Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Exam Title"
              placeholder="e.g. Q3 Software Engineering Certification"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Description (Optional)
            </label>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-axis-blue focus:outline-none focus:ring-2 focus:ring-axis-blue/15"
              rows={2}
              placeholder="Brief summary of what this assessment covers..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Input
              label="Scheduled Start Time"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>

          <div>
            <Input
              label="Scheduled End Time"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>

          <div>
            <Input
              label="Duration (Minutes per Student)"
              type="number"
              min={1}
              max={600}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              required
            />
          </div>

          <div>
            <Input
              label="Max Cheating Strikes Allowed"
              type="number"
              min={1}
              max={10}
              value={maxStrikes}
              onChange={(e) => setMaxStrikes(Number(e.target.value))}
              helperText="Exceeding this strike count auto-disqualifies the student."
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Max Attempts Per Student
            </label>
            <select
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium"
            >
              <option value={1}>1 Attempt (Strict • High Stakes)</option>
              <option value={2}>2 Attempts</option>
              <option value={3}>3 Attempts</option>
              <option value={5}>5 Attempts</option>
              <option value={0}>Unlimited Practice Attempts</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Limits how many times a candidate can take this exam using the same email.
            </p>
          </div>
        </div>

        {/* Student Score Visibility Toggle */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <div className="flex items-center space-x-1.5">
                {showScoreToStudent ? (
                  <Eye className="w-4 h-4 text-emerald-600" />
                ) : (
                  <EyeOff className="w-4 h-4 text-slate-500" />
                )}
                <span className="text-xs font-bold text-slate-900 block">
                  Release Score to Students Upon Submission
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {showScoreToStudent
                  ? 'Active: Students will immediately see their preliminary score and percentage when they submit.'
                  : 'Hidden: Scores are withheld. Students will only see an exam submission confirmation.'}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={showScoreToStudent}
                onChange={(e) => setShowScoreToStudent(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0052D4]"></div>
            </label>
          </div>
        </div>

        {/* Questions Section */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-base text-slate-900">Questions & Answers</h4>
              <p className="text-xs text-slate-500">Add questions and specify the correct answer for auto-grading.</p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={handleAddQuestion} className="flex items-center space-x-1">
              <Plus className="w-4 h-4" />
              <span>Add Question</span>
            </Button>
          </div>

          <div className="space-y-3.5">
            {questions.map((q, qIndex) => (
              <div key={q.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    {questions.length > 1 && (
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                        <button
                          type="button"
                          disabled={qIndex === 0}
                          onClick={() => handleMoveQuestion(qIndex, 'up')}
                          className="p-1 text-slate-500 hover:text-axis-blue hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
                          title="Move question up"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={qIndex === questions.length - 1}
                          onClick={() => handleMoveQuestion(qIndex, 'down')}
                          className="p-1 text-slate-500 hover:text-axis-blue hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
                          title="Move question down"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <span className="text-xs font-bold text-axis-blue uppercase tracking-wider">
                      Question #{qIndex + 1}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <select
                      className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-axis-blue"
                      value={q.question_type}
                      onChange={(e) => handleUpdateQuestion(qIndex, 'question_type', e.target.value)}
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      <option value="short_answer">Short Answer</option>
                    </select>

                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-slate-500 font-medium">Pts:</span>
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={q.points}
                        onChange={(e) => handleUpdateQuestion(qIndex, 'points', Number(e.target.value))}
                        className="w-14 bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-2 py-1"
                      />
                    </div>

                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(qIndex)}
                        className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <Input
                  placeholder="Enter the question text here (LaTeX supported, e.g. $\sigma(x) = \frac{1}{1 + e^{-x}}$)..."
                  value={q.question_text}
                  onChange={(e) => handleUpdateQuestion(qIndex, 'question_text', e.target.value)}
                  required
                />

                {/* Live Formula / LaTeX Preview for Question Text */}
                {Boolean(q.question_text && (q.question_text.includes('$') || q.question_text.includes('\\'))) && (
                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/70 text-xs space-y-1">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-blue-700 flex items-center space-x-1">
                      <Sparkles className="w-3 h-3 text-blue-600" />
                      <span>Live Formula Preview</span>
                    </div>
                    <div className="text-slate-900 font-medium leading-relaxed">
                      <MathText content={q.question_text} />
                    </div>
                  </div>
                )}

                {/* Optional Question Image / Diagram */}
                <div className="space-y-2">
                  {q.image_url ? (
                    <div className="relative inline-block border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs p-1">
                      <img
                        src={q.image_url}
                        alt={`Diagram for question #${qIndex + 1}`}
                        className="max-h-48 max-w-full rounded-lg object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateQuestion(qIndex, 'image_url', '')}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all cursor-pointer"
                        title="Remove Photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 shadow-2xs transition-colors cursor-pointer">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span>Upload Photo / Diagram</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const compressed = await compressImageFile(file);
                                handleUpdateQuestion(qIndex, 'image_url', compressed);
                              } catch (err: any) {
                                alert('Failed to read image: ' + err?.message);
                              }
                            }
                          }}
                        />
                      </label>
                      <span className="text-[11px] text-slate-400 font-medium">or</span>
                      <input
                        type="url"
                        placeholder="Paste image URL (https://...)"
                        value={q.image_url || ''}
                        onChange={(e) => handleUpdateQuestion(qIndex, 'image_url', e.target.value)}
                        className="flex-1 min-w-[200px] bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-axis-blue"
                      />
                    </div>
                  )}
                </div>

                {/* Choices */}
                <div className="space-y-2 pt-1 pl-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {q.question_type === 'short_answer' ? 'Accepted Exact Answer:' : 'Options (Select the correct answer):'}
                  </span>

                  {q.choices.map((choice, cIndex) => (
                    <div key={choice.id} className="flex items-center space-x-2">
                      {/* Reorder choice arrows */}
                      {q.choices.length > 1 && (
                        <div className="flex items-center bg-white border border-slate-200 rounded p-0.5 shadow-2xs flex-shrink-0">
                          <button
                            type="button"
                            disabled={cIndex === 0}
                            onClick={() => handleMoveChoice(qIndex, cIndex, 'up')}
                            className="p-0.5 text-slate-400 hover:text-axis-blue hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
                            title="Move choice up"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={cIndex === q.choices.length - 1}
                            onClick={() => handleMoveChoice(qIndex, cIndex, 'down')}
                            className="p-0.5 text-slate-400 hover:text-axis-blue hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
                            title="Move choice down"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {q.question_type !== 'short_answer' && (
                        <input
                          type="radio"
                          name={`correct_${q.id}`}
                          checked={choice.is_correct}
                          onChange={() => handleSetCorrectChoice(qIndex, cIndex)}
                          className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer flex-shrink-0"
                          title="Mark as correct answer"
                        />
                      )}
                      <input
                        type="text"
                        value={choice.choice_text}
                        onChange={(e) => handleChoiceTextChange(qIndex, cIndex, e.target.value)}
                        placeholder={`Option ${cIndex + 1}`}
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-axis-blue"
                        required
                      />
                      {Boolean(choice.choice_text && (choice.choice_text.includes('$') || choice.choice_text.includes('\\'))) && (
                        <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-xs text-blue-900 flex-shrink-0 max-w-[200px] truncate" title="Formula Preview">
                          <MathText content={choice.choice_text} />
                        </span>
                      )}
                      {choice.is_correct && (
                        <span className="text-[11px] text-emerald-700 font-bold px-2 py-0.5 bg-emerald-50 rounded border border-emerald-200">
                          Correct
                        </span>
                      )}
                      {q.question_type === 'multiple_choice' && q.choices.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveChoice(qIndex, cIndex)}
                          className="text-slate-400 hover:text-red-500 text-xs p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  {q.question_type === 'multiple_choice' && (
                    <button
                      type="button"
                      onClick={() => handleAddChoice(qIndex)}
                      className="text-xs text-axis-blue hover:text-blue-700 font-semibold pt-1 flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Option</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <label className="text-xs text-slate-600 font-semibold">
              {mode === 'edit' ? 'Exam Status:' : 'Initial Status:'}
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'draft' | 'published' | 'archived')}
              className="bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-1.5 focus:border-axis-blue cursor-pointer"
            >
              <option value="published">Published (Active)</option>
              <option value="draft">Draft (Unpublished)</option>
              {mode === 'edit' && <option value="archived">Archived</option>}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting} className="bg-blue-700 hover:bg-blue-600 text-white">
              {mode === 'edit'
                ? 'Update Examination'
                : mode === 'copy'
                ? 'Create Copied Exam'
                : 'Save & Create Exam'}
            </Button>
          </div>
        </div>
      </form>
      )}
    </Modal>
  );
};
