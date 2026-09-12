import React, { useState, useEffect } from 'react';
import { Calendar, Clock, ShieldAlert, AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Exam } from '@/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseExamConfig, serializeExamConfig } from '@/lib/examConfig';

interface EditScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: Exam;
  onUpdated: () => void;
}

export const EditScheduleModal: React.FC<EditScheduleModalProps> = ({
  isOpen,
  onClose,
  exam,
  onUpdated,
}) => {
  const formatForInput = (isoString?: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const initialConfig = parseExamConfig(exam.instructions);

  const [title, setTitle] = useState(exam.title);
  const [description, setDescription] = useState(exam.description || '');
  const [instructionsText, setInstructionsText] = useState(initialConfig.instructionsText);
  const [showScoreToStudent, setShowScoreToStudent] = useState(initialConfig.showScoreToStudent);
  const [startTime, setStartTime] = useState(formatForInput(exam.start_time));
  const [endTime, setEndTime] = useState(formatForInput(exam.end_time));
  const [durationMinutes, setDurationMinutes] = useState(exam.duration_minutes);
  const [maxStrikes, setMaxStrikes] = useState(exam.max_strikes || 3);
  const [status, setStatus] = useState(exam.status);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (exam) {
      const config = parseExamConfig(exam.instructions);
      setTitle(exam.title);
      setDescription(exam.description || '');
      setInstructionsText(config.instructionsText);
      setShowScoreToStudent(config.showScoreToStudent);
      setStartTime(formatForInput(exam.start_time));
      setEndTime(formatForInput(exam.end_time));
      setDurationMinutes(exam.duration_minutes);
      setMaxStrikes(exam.max_strikes || 3);
      setStatus(exam.status);
    }
  }, [exam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (new Date(endTime) <= new Date(startTime)) {
      setError('End date/time must be strictly after start date/time');
      return;
    }

    setIsLoading(true);
    try {
      const serializedInstructions = serializeExamConfig(instructionsText, showScoreToStudent);

      const { error: updateErr } = await supabase
        .from('exams')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          instructions: serializedInstructions,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          duration_minutes: Number(durationMinutes),
          max_strikes: Number(maxStrikes),
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', exam.id);

      if (updateErr) throw updateErr;

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onUpdated();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Update failed:', err);
      setError(err?.message || 'Failed to update schedule');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Exam Schedule & Settings" maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center space-x-2 text-red-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Input
          label="Exam Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <div className="space-y-1.5 text-left">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            Description
          </label>
          <textarea
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-axis-blue focus:outline-none focus:ring-2 focus:ring-axis-blue/15"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Start Date & Time"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />

          <Input
            label="End Date & Time"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />

          <Input
            label="Duration (Minutes)"
            type="number"
            min={1}
            max={600}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            required
          />

          <Input
            label="Max Cheating Strikes"
            type="number"
            min={1}
            max={10}
            value={maxStrikes}
            onChange={(e) => setMaxStrikes(Number(e.target.value))}
            required
          />
        </div>

        <div className="space-y-1.5 text-left">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            Exam Status
          </label>
          <select
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 focus:outline-none focus:border-axis-blue focus:ring-2 focus:ring-axis-blue/15"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="published">Published (Accepting Submissions)</option>
            <option value="draft">Draft (Hidden from students)</option>
            <option value="archived">Archived</option>
          </select>
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

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          {success ? (
            <span className="text-xs font-bold text-emerald-600 flex items-center space-x-1">
              <Check className="w-4 h-4" />
              <span>Schedule updated successfully!</span>
            </span>
          ) : <span />}

          <div className="flex items-center space-x-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isLoading}>
              Save Schedule Changes
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
