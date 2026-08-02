export type Profile = {
  id: number;
  name: string;
  email: string;
  grade: string | null;
  study_goals: string | null;
  created_at: string;
};

export type Subject = {
  id: number;
  name: string;
  level: "HL" | "SL" | "Other";
  teacher: string | null;
  target_grade: number | null;
  created_at: string;
};

export type StudySession = {
  id: number;
  subject_id: number;
  subject_name: string;
  session_date: string;
  duration_minutes: number;
  notes: string | null;
  created_at: string;
};

export type StudyPlan = {
  id: number;
  subject_id: number | null;
  subject_name: string | null;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  deadline: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  project_id: string | null;
  project_title: string | null;
  phase_color: string | null;
  phase_order: number | null;
  span_start: string | null;
  span_end: string | null;
  estimated_minutes: number | null;
  created_at: string;
  updated_at: string;
};

export type SubjectProgress = {
  id: number;
  name: string;
  level: string;
  target_grade: number | null;
  total_minutes: number;
  session_count: number;
  open_tasks: number;
  average_weekly_minutes: number;
  is_weak: boolean;
};

export type DashboardData = {
  totalStudyMinutes: number;
  weekStudyMinutes: number;
  averageWeeklyMinutes: number;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  completionRate: number;
  subjects: SubjectProgress[];
  weakSubjects: SubjectProgress[];
};

export type OptimizedPlan = {
  id: number;
  title: string;
  priority: StudyPlan["priority"];
  status: StudyPlan["status"];
  subject_name: string | null;
  deadline: string | null;
  daysLeft: number | null;
  urgencyScore: number;
  reason: string;
};

export type ScheduleSuggestion = {
  mode: "single";
  start: string;
  end: string;
  priority: StudyPlan["priority"];
  reason: string;
};

export type LongTermPhaseSuggestion = {
  title: string;
  objective: string;
  startDate: string;
  endDate: string;
  estimatedMinutes: number;
  priority: StudyPlan["priority"];
  color: string;
};

export type LongTermScheduleSuggestion = {
  mode: "longTerm";
  projectTitle: string;
  strategy: string;
  phases: LongTermPhaseSuggestion[];
};

export type KimiScheduleSuggestion =
  | ScheduleSuggestion
  | LongTermScheduleSuggestion;

export type AppView =
  | "overview"
  | "plans"
  | "subjects"
  | "sessions"
  | "assistant"
  | "profile";
