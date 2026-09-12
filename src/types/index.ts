export type ExamStatus = 'draft' | 'published' | 'archived';
export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';
export type AttemptStatus = 'in_progress' | 'submitted' | 'disqualified' | 'expired';
export type ViolationType = 
  | 'fullscreen_exit'
  | 'tab_blur'
  | 'window_switch'
  | 'forbidden_shortcut'
  | 'context_menu'
  | 'copy_paste';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'student';
  student_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Exam {
  id: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  status: ExamStatus;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  max_strikes: number;
  max_attempts?: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Computed / aggregated fields
  question_count?: number;
  attempt_count?: number;
}

export interface QuestionChoice {
  id: string;
  question_id: string;
  order_index: number;
  choice_text: string;
  is_correct?: boolean; // Only visible to admin
}

export interface Question {
  id: string;
  exam_id: string;
  order_index: number;
  question_text: string;
  question_type: QuestionType;
  points: number;
  created_at: string;
  choices?: QuestionChoice[];
  image_url?: string | null;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id?: string | null;
  student_name: string;
  student_email: string;
  student_code?: string | null;
  started_at: string;
  deadline_at: string;
  submitted_at?: string | null;
  status: AttemptStatus;
  strike_count: number;
  total_score?: number | null;
  max_possible_score?: number | null;
  percentage?: number | null;
  created_at: string;
}

export interface Answer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_choice_id?: string | null;
  text_answer?: string | null;
  is_correct?: boolean | null;
  points_earned?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Violation {
  id: string;
  attempt_id: string;
  violation_type: ViolationType;
  details?: string | null;
  timestamp: string;
}

export interface GradeSheetStudentAnswer {
  selected_choice_id?: string | null;
  selected_choice_text?: string | null;
  text_answer?: string | null;
  is_correct?: boolean | null;
  points_earned?: number | null;
}

export interface GradeSheetStudentViolation {
  type: ViolationType;
  details?: string | null;
  timestamp: string;
}

export interface GradeSheetStudent {
  attempt_id: string;
  student_name: string;
  student_email: string;
  student_code?: string | null;
  started_at: string;
  submitted_at?: string | null;
  status: AttemptStatus;
  strike_count: number;
  total_score: number;
  max_possible_score: number;
  percentage: number;
  answers: Record<string, GradeSheetStudentAnswer>;
  violations: GradeSheetStudentViolation[];
}

export interface GradeSheetData {
  questions: Array<{
    id: string;
    order_index: number;
    question_text: string;
    question_type: QuestionType;
    points: number;
  }>;
  students: GradeSheetStudent[];
}

export interface StartExamResponse {
  attempt_id: string;
  exam_id: string;
  student_name: string;
  student_email: string;
  started_at: string;
  deadline_at: string;
  duration_minutes: number;
  max_strikes: number;
  strike_count: number;
  server_now: string;
}

export interface RecordViolationResponse {
  attempt_id: string;
  strike_count: number;
  max_strikes: number;
  status: AttemptStatus;
  is_disqualified: boolean;
}

export interface SubmitExamResponse {
  attempt_id: string;
  status: AttemptStatus;
  total_score: number;
  max_possible_score: number;
  percentage: number;
  submitted_at: string;
}
