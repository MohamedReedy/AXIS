import React, { useState, useEffect } from 'react';
import { HelpCircle, CheckCircle, Award } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Question } from '@/types';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { parseQuestionContent } from '@/lib/utils';
import { MathText } from '@/components/ui/MathText';

interface ExamQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  examId: string;
  examTitle: string;
}

export const ExamQuestionsModal: React.FC<ExamQuestionsModalProps> = ({
  isOpen,
  onClose,
  examId,
  examTitle,
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen || !examId) return;

    const fetchQuestions = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('questions')
          .select(`
            id,
            exam_id,
            order_index,
            question_text,
            question_type,
            points,
            created_at,
            choices:question_choices(id, question_id, order_index, choice_text, is_correct)
          `)
          .eq('exam_id', examId)
          .order('order_index');

        if (error) throw error;
        setQuestions((data as Question[]) || []);
      } catch (err) {
        console.error('Failed to load questions:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuestions();
  }, [isOpen, examId]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Exam Questions: ${examTitle}`} maxWidth="2xl">
      <div className="space-y-5">
        <div className="flex items-center justify-between text-xs text-slate-500 pb-3 border-b border-slate-100">
          <span>
            Total Items: <strong className="text-slate-900 font-bold">{questions.length}</strong>
          </span>
          <span>
            Total Points:{' '}
            <strong className="text-emerald-600 font-bold">
              {questions.reduce((sum, q) => sum + Number(q.points), 0)} pts
            </strong>
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-slate-100 border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : questions.length > 0 ? (
          <div className="space-y-3.5 max-h-[550px] overflow-y-auto pr-1">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-lg bg-sky-100 text-axis-blue font-bold text-xs flex items-center justify-center border border-sky-200">
                      {idx + 1}
                    </span>
                    <span className="badge-pill badge-info text-[10px] uppercase tracking-wider font-bold">
                      {q.question_type.replace('_', ' ')}
                    </span>
                  </div>

                  <span className="text-xs font-bold text-emerald-600 flex items-center space-x-1">
                    <Award className="w-3.5 h-3.5" />
                    <span>{q.points} Pts</span>
                  </span>
                </div>

                {(() => {
                  const { text: cleanText, imageUrl } = parseQuestionContent(q.question_text);
                  const effectiveImage = q.image_url || imageUrl;
                  return (
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-slate-900 leading-relaxed">
                        <MathText content={cleanText} />
                      </h4>
                      {effectiveImage && (
                        <div className="inline-block border border-slate-200 rounded-lg p-1 bg-white shadow-2xs">
                          <img
                            src={effectiveImage}
                            alt="Question diagram"
                            className="max-h-36 rounded-md object-contain"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Choices List */}
                <div className="space-y-1.5 pt-1">
                  {q.choices && q.choices.length > 0 ? (
                    q.choices.map((choice) => (
                      <div
                        key={choice.id}
                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                          choice.is_correct
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] flex-shrink-0 ${
                            choice.is_correct ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-slate-400'
                          }`}>
                            {choice.is_correct ? '✓' : '•'}
                          </span>
                          <span className="truncate">
                            <MathText content={choice.choice_text} />
                          </span>
                        </div>
                        {choice.is_correct && (
                          <span className="text-[10px] uppercase font-bold text-emerald-700 px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300">
                            Correct
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No choices defined</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center py-10 text-xs text-slate-400">
            No questions found for this exam.
          </p>
        )}
      </div>
    </Modal>
  );
};
