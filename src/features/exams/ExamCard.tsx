import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  ShieldAlert,
  HelpCircle,
  Copy,
  Check,
  BarChart3,
  Table,
  Globe,
  Archive,
  Trash2,
  Edit3,
} from 'lucide-react';
import { Exam } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { ExamQuestionsModal } from '../dashboard/ExamQuestionsModal';
import { EditScheduleModal } from '../dashboard/EditScheduleModal';

interface ExamCardProps {
  exam: Exam;
  onStatusChange: (id: string, status: 'draft' | 'published' | 'archived') => void;
  onDelete: (id: string) => void;
  onUpdated?: () => void;
}

export const ExamCard: React.FC<ExamCardProps> = ({ exam, onStatusChange, onDelete, onUpdated }) => {
  const [copied, setCopied] = useState(false);
  const [isQuestionsModalOpen, setIsQuestionsModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const navigate = useNavigate();

  const studentLink = `${window.location.origin}/exam/${exam.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(studentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const getStatusBadge = () => {
    switch (exam.status) {
      case 'published':
        return <span className="badge-pill badge-ok">Published</span>;
      case 'archived':
        return <span className="badge-pill badge-info">Archived</span>;
      default:
        return <span className="badge-pill badge-warn">Draft</span>;
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-6 transition-all shadow-xs hover:shadow-md flex flex-col justify-between space-y-5">
      {/* Top Details */}
      <div className="space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3
              onClick={() => navigate(`/admin/exam/${exam.id}`)}
              className="font-bold text-base text-slate-900 hover:text-blue-700 transition-colors line-clamp-1 cursor-pointer"
              title="Click to open exam dashboard"
            >
              {exam.title}
            </h3>
            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
              {exam.description || 'No description provided.'}
            </p>
          </div>
          <div>{getStatusBadge()}</div>
        </div>

        {/* Schedule & Metadata Grid */}
        <div className="grid grid-cols-2 gap-2.5 py-3 border-y border-slate-100 text-xs">
          <div className="flex items-center space-x-1.5 text-slate-600">
            <Clock className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <span>{exam.duration_minutes} mins duration</span>
          </div>
          <div className="flex items-center space-x-1.5 text-slate-600">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
            <span>Max {exam.max_strikes} violations</span>
          </div>
          <div className="flex items-center justify-between col-span-2 text-slate-600">
            <div className="flex items-center space-x-1.5 truncate">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span className="truncate">
                {formatDate(exam.start_time)} &rarr; {formatDate(exam.end_time)}
              </span>
            </div>
            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="text-[11px] text-blue-700 hover:text-blue-800 font-bold flex items-center space-x-1 flex-shrink-0 cursor-pointer ml-2 hover:underline"
              title="Edit Schedule & Time"
            >
              <Edit3 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>
        </div>

        {/* Shareable Link Box */}
        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 truncate">
            <Globe className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <span className="text-xs text-slate-500 truncate font-mono select-all">
              {studentLink}
            </span>
          </div>
          <button
            onClick={handleCopyLink}
            className="flex-shrink-0 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors cursor-pointer border border-blue-200"
            title="Copy Student Shareable Link"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-bold">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => navigate(`/admin/exam/${exam.id}`)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsQuestionsModalOpen(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 text-slate-700 bg-white border-slate-200 hover:bg-slate-50"
            title="View Questions & Answers"
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
            <span>Questions</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/exam/${exam.id}/grades`)}
            className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 text-slate-700 bg-white border-slate-200 hover:bg-slate-50"
            title="Question-by-Question Grade Sheet"
          >
            <Table className="w-3.5 h-3.5 text-emerald-600" />
            <span>Grades</span>
          </Button>
        </div>

        <div className="flex items-center space-x-1 self-end sm:self-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsScheduleModalOpen(true)}
            title="Edit Schedule & Time"
            className="text-xs text-slate-500 hover:text-blue-700 p-1.5 hover:bg-blue-50"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </Button>

          {exam.status !== 'published' && (
            <button
              onClick={() => onStatusChange(exam.id, 'published')}
              title="Publish Exam"
              className="px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200 cursor-pointer"
            >
              Publish
            </button>
          )}

          {exam.status === 'published' && (
            <button
              onClick={() => onStatusChange(exam.id, 'archived')}
              title="Archive Exam"
              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => onDelete(exam.id)}
            title="Delete Exam"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Questions Modal */}
      <ExamQuestionsModal
        isOpen={isQuestionsModalOpen}
        onClose={() => setIsQuestionsModalOpen(false)}
        examId={exam.id}
        examTitle={exam.title}
      />

      {/* Edit Schedule Modal */}
      <EditScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        exam={exam}
        onUpdated={() => {
          if (onUpdated) onUpdated();
        }}
      />
    </div>
  );
};
