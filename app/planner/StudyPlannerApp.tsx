import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import { ApiError, apiRequest } from "./api";
import { AssistantPanel } from "./AssistantPanel";
import { AuthScreen } from "./AuthScreen";
import type {
  AppView,
  DashboardData,
  KimiScheduleSuggestion,
  LongTermPhaseSuggestion,
  LongTermScheduleSuggestion,
  OptimizedPlan,
  Profile,
  ScheduleSuggestion,
  StudyPlan,
  StudySession,
  Subject,
} from "./types";


const emptyDashboard: DashboardData = {
  totalStudyMinutes: 0,
  weekStudyMinutes: 0,
  averageWeeklyMinutes: 0,
  totalTasks: 0,
  completedTasks: 0,
  openTasks: 0,
  completionRate: 0,
  subjects: [],
  weakSubjects: [],
};

const navigation: Array<{ id: AppView; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "plans", label: "Study plans", icon: "✓" },
  { id: "subjects", label: "Subjects", icon: "◇" },
  { id: "sessions", label: "Study sessions", icon: "◷" },
  { id: "assistant", label: "Kimi coach", icon: "✦" },
  { id: "profile", label: "Profile", icon: "○" },
];

const today = new Date().toISOString().slice(0, 10);
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// i keep the colors here so kimi and the calendar use the same small palette.
// it also stops every project from becoming a wall of random neon colors.
const phaseColors = [
  "#7563D9",
  "#3B82F6",
  "#2FA97C",
  "#F28C52",
  "#D85B8B",
  "#C59A28",
];

type EditableLongTermPhase = LongTermPhaseSuggestion & { draftId: string };
type EditableLongTermSuggestion = Omit<LongTermScheduleSuggestion, "phases"> & {
  phases: EditableLongTermPhase[];
};

function toLocalDateTimeInput(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function initialScheduleDeadline() {
  const value = new Date();
  value.setDate(value.getDate() + 2);
  value.setHours(20, 0, 0, 0);
  return toLocalDateTimeInput(value);
}

function createDraftId() {
  return globalThis.crypto?.randomUUID?.() || `phase-${Date.now()}-${Math.random()}`;
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return calendarDateKey(date);
}

function effortLabel(minutes: number) {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

function validateLongTermDraft(
  suggestion: EditableLongTermSuggestion,
  projectStart: string,
  deadline: string,
) {
  if (!suggestion.projectTitle.trim()) return "Add a project title before approval.";
  if (!suggestion.phases.length) return "Keep at least one project phase.";
  let previousEnd = "";
  for (const [index, phase] of suggestion.phases.entries()) {
    if (!phase.title.trim() || !phase.objective.trim()) {
      return `Phase ${index + 1} needs a title and measurable outcome.`;
    }
    if (!phase.startDate || !phase.endDate || phase.endDate < phase.startDate) {
      return `Phase ${index + 1} has an invalid date range.`;
    }
    if (phase.startDate < projectStart || phase.endDate > deadline.slice(0, 10)) {
      return `Phase ${index + 1} must stay inside the project dates.`;
    }
    if (previousEnd && phase.startDate <= previousEnd) {
      return `Phase ${index + 1} overlaps the previous phase.`;
    }
    if (phase.estimatedMinutes < 15) {
      return `Phase ${index + 1} needs at least 15 minutes of estimated effort.`;
    }
    previousEnd = phase.endDate;
  }
  return null;
}

function calendarDateKey(value: Date | string) {
  if (typeof value === "string") return value.slice(0, 10);
  const dateValue = value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${dateValue.getFullYear()}-${pad(dateValue.getMonth() + 1)}-${pad(dateValue.getDate())}`;
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatTimer(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function dateLabel(value: string | null) {
  if (!value) return "No deadline";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <span className="brand-mark">S</span>
      <p>Loading your planner data…</p>
    </main>
  );
}

export function StudyPlannerApp() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [loadingData, setLoadingData] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [optimizedPlans, setOptimizedPlans] = useState<OptimizedPlan[] | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [schedulerDraft, setSchedulerDraft] = useState({
    task: "",
    subjectId: "",
    deadline: initialScheduleDeadline(),
    durationMinutes: "60",
    longTerm: false,
    projectStart: calendarDateKey(new Date()),
    weeklyMinutes: "300",
    preferredWindow: "Weekdays after 16:00; weekends after 09:00",
  });
  const [scheduleSuggestion, setScheduleSuggestion] =
    useState<ScheduleSuggestion | null>(null);
  const [longTermSuggestion, setLongTermSuggestion] =
    useState<EditableLongTermSuggestion | null>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerError, setSchedulerError] = useState<string | null>(null);

  const [subjectEditingId, setSubjectEditingId] = useState<number | null>(null);
  const [subjectDraft, setSubjectDraft] = useState({
    name: "",
    level: "HL",
    teacher: "",
    targetGrade: "",
  });
  const [planEditingId, setPlanEditingId] = useState<number | null>(null);
  const [planDraft, setPlanDraft] = useState({
    title: "",
    subjectId: "",
    deadline: "",
    priority: "medium",
    status: "pending",
    description: "",
  });
  const [sessionDraft, setSessionDraft] = useState({
    subjectId: "",
    date: today,
    durationMinutes: "45",
    notes: "",
  });
  const [timerSubjectId, setTimerSubjectId] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem("studyplanner_token"));
    setCheckingSession(false);
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => setTimerSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    if (!token) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    setLoadingData(true);
    Promise.all([
      apiRequest<Profile>("/api/profile", { token }),
      apiRequest<Subject[]>("/api/subjects", { token }),
      apiRequest<StudyPlan[]>("/api/plans", { token }),
      apiRequest<StudySession[]>("/api/sessions", { token }),
      apiRequest<DashboardData>("/api/dashboard", { token }),
    ])
      .then(([nextProfile, nextSubjects, nextPlans, nextSessions, nextDashboard]) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setSubjects(nextSubjects);
        setPlans(nextPlans);
        setSessions(nextSessions);
        setDashboard(nextDashboard);
        setPageError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          window.localStorage.removeItem("studyplanner_token");
          setToken(null);
        } else {
          setPageError(error instanceof Error ? error.message : "Unable to load planner data.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function refreshData() {
    if (!token) return;
    const [nextProfile, nextSubjects, nextPlans, nextSessions, nextDashboard] = await Promise.all([
      apiRequest<Profile>("/api/profile", { token }),
      apiRequest<Subject[]>("/api/subjects", { token }),
      apiRequest<StudyPlan[]>("/api/plans", { token }),
      apiRequest<StudySession[]>("/api/sessions", { token }),
      apiRequest<DashboardData>("/api/dashboard", { token }),
    ]);
    setProfile(nextProfile);
    setSubjects(nextSubjects);
    setPlans(nextPlans);
    setSessions(nextSessions);
    setDashboard(nextDashboard);
  }

  function showFlash(message: string) {
    setFlash(message);
    window.setTimeout(() => setFlash(null), 2800);
  }

  async function mutate(action: () => Promise<unknown>, successMessage: string) {
    setPageError(null);
    try {
      await action();
      await refreshData();
      setOptimizedPlans(null);
      showFlash(successMessage);
      return true;
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "The change could not be saved.");
      return false;
    }
  }

  function authenticated(nextToken: string) {
    window.localStorage.setItem("studyplanner_token", nextToken);
    setToken(nextToken);
  }

  async function logout() {
    if (token) {
      try {
        await apiRequest<null>("/api/auth/logout", { method: "POST", token });
      } catch {
        // Local logout still succeeds if the backend is temporarily unavailable.
      }
    }
    window.localStorage.removeItem("studyplanner_token");
    setToken(null);
    setActiveView("overview");
  }

  async function submitSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const path = subjectEditingId ? `/api/subjects/${subjectEditingId}` : "/api/subjects";
    const saved = await mutate(
      () => apiRequest(path, {
        method: subjectEditingId ? "PATCH" : "POST",
        token,
        body: subjectDraft,
      }),
      subjectEditingId ? "Subject updated" : "Subject added",
    );
    if (saved) {
      setSubjectEditingId(null);
      setSubjectDraft({ name: "", level: "HL", teacher: "", targetGrade: "" });
    }
  }

  function editSubject(subject: Subject) {
    setSubjectEditingId(subject.id);
    setSubjectDraft({
      name: subject.name,
      level: subject.level,
      teacher: subject.teacher || "",
      targetGrade: subject.target_grade ? String(subject.target_grade) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const path = planEditingId ? `/api/plans/${planEditingId}` : "/api/plans";
    const saved = await mutate(
      () => apiRequest(path, {
        method: planEditingId ? "PATCH" : "POST",
        token,
        body: planDraft,
      }),
      planEditingId ? "Plan updated" : "Plan created",
    );
    if (saved) {
      setPlanEditingId(null);
      setPlanDraft({ title: "", subjectId: "", deadline: "", priority: "medium", status: "pending", description: "" });
    }
  }

  function editPlan(plan: StudyPlan) {
    setPlanEditingId(plan.id);
    setPlanDraft({
      title: plan.title,
      subjectId: plan.subject_id ? String(plan.subject_id) : "",
      deadline: plan.deadline?.slice(0, 10) || "",
      priority: plan.priority,
      status: plan.status,
      description: plan.description || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const saved = await mutate(
      () => apiRequest("/api/sessions", { method: "POST", token, body: sessionDraft }),
      "Study session saved",
    );
    if (saved) setSessionDraft((current) => ({ ...current, durationMinutes: "45", notes: "" }));
  }

  async function stopTimer() {
    if (!token || !timerSubjectId || timerSeconds === 0) return;
    setTimerRunning(false);
    const minutes = Math.max(1, Math.round(timerSeconds / 60));
    const saved = await mutate(
      () => apiRequest("/api/sessions", {
        method: "POST",
        token,
        body: {
          subjectId: timerSubjectId,
          date: today,
          durationMinutes: minutes,
          notes: "Recorded with focus timer",
        },
      }),
      `${formatMinutes(minutes)} focus session saved`,
    );
    if (saved) setTimerSeconds(0);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !profile) return;
    await mutate(
      () => apiRequest("/api/profile", {
        method: "PATCH",
        token,
        body: { name: profile.name, grade: profile.grade, studyGoals: profile.study_goals },
      }),
      "Profile updated",
    );
  }

  async function loadOptimizedPlans() {
    if (!token) return;
    try {
      const result = await apiRequest<OptimizedPlan[]>("/api/plans/optimized", { token });
      setOptimizedPlans(result);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not optimize the plan.");
    }
  }

  async function askKimiToSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSchedulerLoading(true);
    setSchedulerError(null);
    setScheduleSuggestion(null);
    setLongTermSuggestion(null);

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: schedulerDraft.task,
          deadline: schedulerDraft.deadline,
          durationMinutes: Number(schedulerDraft.durationMinutes),
          longTerm: schedulerDraft.longTerm,
          projectStart: schedulerDraft.projectStart,
          weeklyMinutes: Number(schedulerDraft.weeklyMinutes),
          preferredWindow: schedulerDraft.preferredWindow,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          busyPlans: plans
            .filter(
              (plan) =>
                (plan.scheduled_start && plan.scheduled_end) ||
                (plan.span_start && plan.span_end),
            )
            .map((plan) => ({
              title: plan.title,
              scheduledStart: plan.scheduled_start,
              scheduledEnd: plan.scheduled_end,
              spanStart: plan.span_start,
              spanEnd: plan.span_end,
            })),
        }),
      });
      const result = (await response.json()) as {
        code: number;
        message: string;
        data: KimiScheduleSuggestion | null;
      };
      if (!response.ok || !result.data) {
        throw new Error(result.message || "Kimi could not find a suitable time.");
      }
      if (result.data.mode === "longTerm") {
        setLongTermSuggestion({
          ...result.data,
          phases: result.data.phases.map((phase) => ({
            ...phase,
            draftId: createDraftId(),
          })),
        });
      } else {
        setScheduleSuggestion(result.data);
      }
    } catch (error) {
      setSchedulerError(
        error instanceof Error ? error.message : "Kimi could not schedule this task.",
      );
    } finally {
      setSchedulerLoading(false);
    }
  }

  async function addKimiSuggestionToCalendar() {
    if (!token || !scheduleSuggestion) return;
    const suggestion = scheduleSuggestion;
    const saved = await mutate(
      () =>
        apiRequest("/api/plans", {
          method: "POST",
          token,
          body: {
            title: schedulerDraft.task,
            subjectId: schedulerDraft.subjectId,
            deadline: schedulerDraft.deadline,
            priority: suggestion.priority,
            status: "pending",
            scheduledStart: suggestion.start,
            scheduledEnd: suggestion.end,
            description: `Kimi scheduled · ${suggestion.reason}`,
          },
        }),
      "Kimi's study block was added to your calendar",
    );

    if (saved) {
      const scheduledDate = new Date(suggestion.start);
      setCalendarMonth(
        new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), 1),
      );
      setScheduleSuggestion(null);
      setSchedulerDraft((current) => ({
        ...current,
        task: "",
        deadline: initialScheduleDeadline(),
      }));
    }
  }

  function updateLongTermPhase(
    draftId: string,
    updates: Partial<LongTermPhaseSuggestion>,
  ) {
    setLongTermSuggestion((current) =>
      current
        ? {
            ...current,
            phases: current.phases.map((phase) =>
              phase.draftId === draftId ? { ...phase, ...updates } : phase,
            ),
          }
        : current,
    );
  }

  function removeLongTermPhase(draftId: string) {
    setLongTermSuggestion((current) =>
      current
        ? {
            ...current,
            phases: current.phases.filter((phase) => phase.draftId !== draftId),
          }
        : current,
    );
  }

  function addLongTermPhase() {
    setLongTermSuggestion((current) => {
      if (!current || current.phases.length >= 12) return current;
      const previous = current.phases.at(-1);
      const deadlineDate = schedulerDraft.deadline.slice(0, 10);
      const proposedStart = previous ? addDays(previous.endDate, 1) : schedulerDraft.projectStart;
      const startDate = proposedStart > deadlineDate ? deadlineDate : proposedStart;
      return {
        ...current,
        phases: [
          ...current.phases,
          {
            draftId: createDraftId(),
            title: "New project phase",
            objective: "Define one measurable result for this phase.",
            startDate,
            endDate: startDate,
            estimatedMinutes: 60,
            priority: "medium",
            color: phaseColors[current.phases.length % phaseColors.length],
          },
        ],
      };
    });
  }

  async function approveLongTermProject() {
    if (!token || !longTermSuggestion) return;
    const validationError = validateLongTermDraft(
      longTermSuggestion,
      schedulerDraft.projectStart,
      schedulerDraft.deadline,
    );
    if (validationError) {
      setSchedulerError(validationError);
      return;
    }

    // kimi's answer stays in the browser until this button is pressed.
    // this is important because the student should own the final plan, not the ai.
    const suggestion = longTermSuggestion;
    const saved = await mutate(
      () =>
        apiRequest<StudyPlan[]>("/api/plans/batch", {
          method: "POST",
          token,
          body: {
            projectId: globalThis.crypto?.randomUUID?.(),
            projectTitle: suggestion.projectTitle,
            subjectId: schedulerDraft.subjectId,
            deadline: schedulerDraft.deadline,
            phases: suggestion.phases.map(({ draftId: _, ...phase }) => phase),
          },
        }),
      `${suggestion.phases.length} approved phases were added to your calendar`,
    );

    if (saved) {
      const firstPhase = suggestion.phases[0];
      const scheduledDate = new Date(`${firstPhase.startDate}T12:00:00`);
      setCalendarMonth(
        new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), 1),
      );
      setLongTermSuggestion(null);
      setSchedulerDraft((current) => ({
        ...current,
        task: "",
        projectStart: calendarDateKey(new Date()),
        deadline: initialScheduleDeadline(),
      }));
    }
  }

  const upcomingPlans = useMemo(
    () => plans.filter((plan) => plan.status !== "completed").slice(0, 5),
    [plans],
  );

  if (checkingSession) return <LoadingScreen />;
  if (!token) return <AuthScreen onAuthenticated={authenticated} />;
  if (!profile) return <LoadingScreen />;
  const currentProfile = profile;

  function renderOverview() {
    const maxSubjectMinutes = Math.max(...dashboard.subjects.map((subject) => subject.total_minutes), 1);
    const visibleCalendarDays = calendarDays(calendarMonth);
    const longTermValidationError = longTermSuggestion
      ? validateLongTermDraft(
          longTermSuggestion,
          schedulerDraft.projectStart,
          schedulerDraft.deadline,
        )
      : null;
    return (
      <div className="view-stack">
        <section className="welcome-strip">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {currentProfile.name.split(" ")[0]}.</h1>
            <p>This page puts the calendar, unfinished work and study time together. Check the nearest deadline first, then choose one small thing you can actually finish.</p>
          </div>
          <button className="button button-primary" onClick={() => setActiveView("sessions")}>Start a study timer <span>→</span></button>
        </section>

        <section className="metric-grid">
          <article className="metric-card metric-dark">
            <span className="metric-icon">◷</span>
            <p>Study time this week</p>
            <strong>{formatMinutes(dashboard.weekStudyMinutes)}</strong>
            <small>Your normal weekly average is {formatMinutes(dashboard.averageWeeklyMinutes)}</small>
          </article>
          <article className="metric-card">
            <span className="metric-icon metric-lilac">✓</span>
            <p>Finished plans</p>
            <strong>{dashboard.completedTasks}<em> / {dashboard.totalTasks}</em></strong>
            <div className="progress-track"><i style={{ width: `${dashboard.completionRate}%` }} /></div>
          </article>
          <article className="metric-card">
            <span className="metric-icon metric-mint">◇</span>
            <p>Subjects in this planner</p>
            <strong>{subjects.length}</strong>
            <small>{dashboard.weakSubjects.length ? `${dashboard.weakSubjects.length} may need more study time` : "The workload looks balanced now"}</small>
          </article>
          <article className="metric-card">
            <span className="metric-icon metric-peach">↗</span>
            <p>Tasks not finished</p>
            <strong>{dashboard.openTasks}</strong>
            <small>{dashboard.totalStudyMinutes ? `${formatMinutes(dashboard.totalStudyMinutes)} of study is saved in total` : "No study session is saved yet"}</small>
          </article>
        </section>

        <section className="calendar-scheduler-grid">
          <article className="panel calendar-panel">
            <header className="calendar-heading">
              <div>
                <p className="eyebrow">Calendar</p>
                <h2>
                  {calendarMonth.toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
              </div>
              <div className="calendar-controls">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setCalendarMonth(
                      new Date(
                        calendarMonth.getFullYear(),
                        calendarMonth.getMonth() - 1,
                        1,
                      ),
                    )
                  }
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = new Date();
                    setCalendarMonth(
                      new Date(current.getFullYear(), current.getMonth(), 1),
                    );
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setCalendarMonth(
                      new Date(
                        calendarMonth.getFullYear(),
                        calendarMonth.getMonth() + 1,
                        1,
                      ),
                    )
                  }
                >
                  →
                </button>
              </div>
            </header>
            <div className="calendar-weekdays">
              {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="calendar-grid">
              {visibleCalendarDays.map((day) => {
                const key = calendarDateKey(day);
                const dayPlans = plans.filter((plan) => {
                  // long projects are date ranges, so the same phase belongs to
                  // every day between its start and end (not only the first day).
                  if (plan.span_start && plan.span_end) {
                    return key >= plan.span_start && key <= plan.span_end;
                  }
                  const calendarValue = plan.scheduled_start || plan.deadline;
                  return calendarValue ? calendarDateKey(calendarValue) === key : false;
                });
                const isOutsideMonth = day.getMonth() !== calendarMonth.getMonth();
                const isToday = key === calendarDateKey(new Date());
                return (
                  <div
                    className={`calendar-day ${isOutsideMonth ? "outside" : ""} ${isToday ? "today" : ""}`}
                    key={key}
                  >
                    <span className="calendar-day-number">{day.getDate()}</span>
                    <div className="calendar-events">
                      {dayPlans.slice(0, 2).map((plan) => {
                        const isProjectPhase = Boolean(plan.span_start && plan.span_end);
                        const isSpanStart = isProjectPhase &&
                          (key === plan.span_start || day.getDay() === 0);
                        const isSpanEnd = isProjectPhase &&
                          (key === plan.span_end || day.getDay() === 6);
                        const eventClass = isProjectPhase
                          ? `project-span ${isSpanStart ? "span-start" : ""} ${isSpanEnd ? "span-end" : ""}`
                          : plan.scheduled_start
                            ? "scheduled"
                            : "deadline";
                        return (
                          <button
                            type="button"
                            className={eventClass}
                            key={plan.id}
                            title={
                              isProjectPhase
                                ? `${plan.project_title}: ${plan.title}`
                                : plan.title
                            }
                            style={
                              isProjectPhase
                                ? ({ "--phase-color": plan.phase_color || "#7563D9" } as CSSProperties)
                                : undefined
                            }
                            onClick={() => {
                              editPlan(plan);
                              setActiveView("plans");
                            }}
                          >
                            <span>
                              {isProjectPhase
                                ? `P${plan.phase_order || ""}`
                                : plan.scheduled_start
                                  ? timeLabel(plan.scheduled_start)
                                  : "Due"}
                            </span>
                            {plan.title}
                          </button>
                        );
                      })}
                      {dayPlans.length > 2 ? <small>+{dayPlans.length - 2} more</small> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <aside className="kimi-scheduler">
            <header>
              <span className="assistant-orb">✦</span>
              <div>
                <p className="eyebrow eyebrow-light">Kimi schedule helper</p>
                <h2>Put the work into a realistic time.</h2>
              </div>
            </header>
            <p className="scheduler-intro">
              {schedulerDraft.longTerm
                ? "Use this for an IA, EE, exam revision or another project that cannot be done in one sitting. Kimi makes smaller measurable phases across different days. They stay as drafts until you check and approve them."
                : "Use this for one piece of work. Give the real deadline and how long you need. Kimi checks the existing calendar and suggests an available time before the work is due."}
            </p>
            <form className="scheduler-form" onSubmit={askKimiToSchedule}>
              <div className="schedule-mode-switch" role="group" aria-label="Schedule type">
                <button
                  type="button"
                  className={!schedulerDraft.longTerm ? "active" : ""}
                  onClick={() => {
                    setSchedulerDraft({ ...schedulerDraft, longTerm: false });
                    setLongTermSuggestion(null);
                    setSchedulerError(null);
                  }}
                >
                  One study block
                </button>
                <button
                  type="button"
                  className={schedulerDraft.longTerm ? "active" : ""}
                  onClick={() => {
                    setSchedulerDraft({ ...schedulerDraft, longTerm: true });
                    setScheduleSuggestion(null);
                    setSchedulerError(null);
                  }}
                >
                  Divide a long project
                </button>
              </div>
              <label>
                <span>Task</span>
                <small className="field-help">Write the actual result you need, not only the subject name. More detail normally gives a better schedule.</small>
                <input
                  value={schedulerDraft.task}
                  onChange={(event) =>
                    setSchedulerDraft({ ...schedulerDraft, task: event.target.value })
                  }
                  placeholder={
                    schedulerDraft.longTerm
                      ? "Complete my Biology IA"
                      : "Draft English IO outline"
                  }
                  required
                />
              </label>
              <label>
                <span>Subject</span>
                <small className="field-help">This connects the new plan to a subject. Keep General if the work does not belong to one subject.</small>
                <select
                  value={schedulerDraft.subjectId}
                  onChange={(event) =>
                    setSchedulerDraft({ ...schedulerDraft, subjectId: event.target.value })
                  }
                >
                  <option value="">General</option>
                  {subjects.map((subject) => (
                    <option value={subject.id} key={subject.id}>{subject.name}</option>
                  ))}
                </select>
              </label>
              {schedulerDraft.longTerm ? (
                <>
                  <div className="scheduler-form-row">
                    <label>
                      <span>Project start</span>
                      <small className="field-help">The first date when you can work on this project.</small>
                      <input
                        type="date"
                        min={calendarDateKey(new Date())}
                        max={schedulerDraft.deadline.slice(0, 10)}
                        value={schedulerDraft.projectStart}
                        onChange={(event) =>
                          setSchedulerDraft({
                            ...schedulerDraft,
                            projectStart: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                    <label>
                      <span>Final deadline</span>
                      <small className="field-help">The complete project must be ready before this date and time.</small>
                      <input
                        type="datetime-local"
                        min={toLocalDateTimeInput(new Date())}
                        value={schedulerDraft.deadline}
                        onChange={(event) =>
                          setSchedulerDraft({
                            ...schedulerDraft,
                            deadline: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                  </div>
                  <label>
                    <span>Weekly project budget</span>
                    <small className="field-help">Choose an honest amount of time you can give each week. Kimi uses it to keep every phase possible.</small>
                    <select
                      value={schedulerDraft.weeklyMinutes}
                      onChange={(event) =>
                        setSchedulerDraft({
                          ...schedulerDraft,
                          weeklyMinutes: event.target.value,
                        })
                      }
                    >
                      <option value="180">3 hours / week</option>
                      <option value="300">5 hours / week</option>
                      <option value="420">7 hours / week</option>
                      <option value="600">10 hours / week</option>
                    </select>
                  </label>
                </>
              ) : (
                <div className="scheduler-form-row">
                  <label>
                    <span>Deadline</span>
                    <small className="field-help">Kimi will only choose a study block before this time.</small>
                    <input
                      type="datetime-local"
                      min={toLocalDateTimeInput(new Date())}
                      value={schedulerDraft.deadline}
                      onChange={(event) =>
                        setSchedulerDraft({ ...schedulerDraft, deadline: event.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>Duration</span>
                    <small className="field-help">Estimate how much focused time this task needs in one sitting.</small>
                    <select
                      value={schedulerDraft.durationMinutes}
                      onChange={(event) =>
                        setSchedulerDraft({
                          ...schedulerDraft,
                          durationMinutes: event.target.value,
                        })
                      }
                    >
                      <option value="30">30 min</option>
                      <option value="45">45 min</option>
                      <option value="60">1 hour</option>
                      <option value="90">1.5 hours</option>
                      <option value="120">2 hours</option>
                    </select>
                  </label>
                </div>
              )}
              <label>
                <span>Preferred time</span>
                <small className="field-help">You can write normal language here, for example after school, not Friday, or before 9 pm.</small>
                <input
                  value={schedulerDraft.preferredWindow}
                  onChange={(event) =>
                    setSchedulerDraft({
                      ...schedulerDraft,
                      preferredWindow: event.target.value,
                    })
                  }
                  placeholder="After school, before 21:30"
                />
              </label>
              {schedulerError ? <p className="scheduler-error">{schedulerError}</p> : null}
              <button className="button button-light button-full" disabled={schedulerLoading}>
                {schedulerLoading
                  ? schedulerDraft.longTerm
                    ? "Kimi is designing the phases…"
                    : "Kimi is checking your calendar…"
                  : schedulerDraft.longTerm
                    ? "Ask Kimi to make the project phases"
                    : "Ask Kimi to find a free time"}
              </button>
            </form>

            {scheduleSuggestion ? (
              <div className="schedule-suggestion">
                <div className="suggestion-heading">
                  <span>✓</span>
                  <div><small>Kimi suggests this time</small><strong>{timeLabel(scheduleSuggestion.start)}–{timeLabel(scheduleSuggestion.end)}</strong></div>
                </div>
                <p>
                  {new Date(scheduleSuggestion.start).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <blockquote>{scheduleSuggestion.reason}</blockquote>
                <button
                  type="button"
                  className="button button-primary button-full"
                  onClick={() => void addKimiSuggestionToCalendar()}
                >
                  I checked it — add to calendar
                </button>
              </div>
            ) : null}

            {longTermSuggestion ? (
              <div className="long-term-approval">
                <div className="approval-heading">
                  <span>Check everything before it goes to the calendar</span>
                  <strong>{longTermSuggestion.phases.length} phases</strong>
                </div>
                <p className="approval-explanation">
                  Kimi made a first draft, but you make the final decision. You can
                  rename a phase, change its outcome and dates, choose another color,
                  add a missing phase or delete one that is not useful.
                </p>
                <label className="approval-project-field">
                  <span>Project title</span>
                  <small className="field-help">This title groups all of the phases as one long-term project.</small>
                  <input
                    aria-label="Project title"
                    value={longTermSuggestion.projectTitle}
                    onChange={(event) =>
                      setLongTermSuggestion({
                        ...longTermSuggestion,
                        projectTitle: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="approval-project-field">
                  <span>Why Kimi divided it this way</span>
                  <small className="field-help">Keep this explanation for reference, or edit it if your real method is different.</small>
                  <textarea
                    aria-label="Kimi's rationale"
                    rows={3}
                    value={longTermSuggestion.strategy}
                    onChange={(event) =>
                      setLongTermSuggestion({
                        ...longTermSuggestion,
                        strategy: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="phase-editor-list">
                  {longTermSuggestion.phases.map((phase, index) => (
                    <article
                      className="phase-editor"
                      key={phase.draftId}
                      style={{ "--phase-color": phase.color } as CSSProperties}
                    >
                      <header>
                        <span>Phase {index + 1}</span>
                        <div>
                          <label className="color-picker" title="Phase color">
                            <span className="sr-only">Phase {index + 1} color</span>
                            <input
                              aria-label={`Phase ${index + 1} color`}
                              type="color"
                              value={phase.color}
                              onChange={(event) =>
                                updateLongTermPhase(phase.draftId, {
                                  color: event.target.value.toUpperCase(),
                                })
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="phase-delete"
                            aria-label={`Delete phase ${index + 1}`}
                            onClick={() => removeLongTermPhase(phase.draftId)}
                          >
                            Delete
                          </button>
                        </div>
                      </header>
                      <label>
                        <span>Phase name</span>
                        <small className="field-help">Use a short name for this section of work.</small>
                        <input
                          aria-label={`Phase ${index + 1} name`}
                          value={phase.title}
                          onChange={(event) =>
                            updateLongTermPhase(phase.draftId, {
                              title: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Measurable outcome</span>
                        <small className="field-help">Write what must exist at the end, so you can clearly decide if this phase is finished.</small>
                        <textarea
                          aria-label={`Phase ${index + 1} measurable outcome`}
                          rows={3}
                          value={phase.objective}
                          onChange={(event) =>
                            updateLongTermPhase(phase.draftId, {
                              objective: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="phase-editor-row">
                        <label>
                          <span>Start</span>
                          <small className="field-help">First day for this phase.</small>
                          <input
                            aria-label={`Phase ${index + 1} start`}
                            type="date"
                            min={schedulerDraft.projectStart}
                            max={schedulerDraft.deadline.slice(0, 10)}
                            value={phase.startDate}
                            onChange={(event) =>
                              updateLongTermPhase(phase.draftId, {
                                startDate: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>End</span>
                          <small className="field-help">Last day for this phase.</small>
                          <input
                            aria-label={`Phase ${index + 1} end`}
                            type="date"
                            min={schedulerDraft.projectStart}
                            max={schedulerDraft.deadline.slice(0, 10)}
                            value={phase.endDate}
                            onChange={(event) =>
                              updateLongTermPhase(phase.draftId, {
                                endDate: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="phase-editor-row">
                        <label>
                          <span>Effort (minutes)</span>
                          <small className="field-help">Your estimate for the total focused work.</small>
                          <input
                            aria-label={`Phase ${index + 1} effort in minutes`}
                            type="number"
                            min="15"
                            step="15"
                            value={phase.estimatedMinutes}
                            onChange={(event) =>
                              updateLongTermPhase(phase.draftId, {
                                estimatedMinutes: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Priority</span>
                          <small className="field-help">Higher priority puts more attention on this phase.</small>
                          <select
                            aria-label={`Phase ${index + 1} priority`}
                            value={phase.priority}
                            onChange={(event) =>
                              updateLongTermPhase(phase.draftId, {
                                priority: event.target.value as LongTermPhaseSuggestion["priority"],
                              })
                            }
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </label>
                      </div>
                      <small className="phase-duration">
                        {phase.startDate} → {phase.endDate} · {effortLabel(phase.estimatedMinutes)} total
                      </small>
                    </article>
                  ))}
                </div>
                <button
                  type="button"
                  className="add-phase-button"
                  onClick={addLongTermPhase}
                  disabled={longTermSuggestion.phases.length >= 12}
                >
                  + Add one more phase manually
                </button>
                {longTermValidationError ? (
                  <p className="approval-warning">{longTermValidationError}</p>
                ) : (
                  <p className="approval-ready">
                    ✓ The dates are valid. These phases are still drafts and the calendar has not changed yet.
                  </p>
                )}
                <button
                  type="button"
                  className="button button-primary button-full"
                  disabled={Boolean(longTermValidationError)}
                  onClick={() => void approveLongTermProject()}
                >
                  I approve — add {longTermSuggestion.phases.length} phases to calendar
                </button>
              </div>
            ) : null}
          </aside>
        </section>

        <section className="overview-grid">
          <article className="panel progress-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Where the study time went</p><h2>Time saved for each subject</h2></div>
              <button className="text-button" onClick={() => setActiveView("subjects")}>Edit the subject list →</button>
            </div>
            {dashboard.subjects.length ? (
              <div className="subject-bars">
                {dashboard.subjects.map((subject) => (
                  <div className="subject-bar-row" key={subject.id}>
                    <div><strong>{subject.name}</strong><span>{subject.level} · {formatMinutes(subject.average_weekly_minutes)}/week</span></div>
                    <div className="subject-bar"><i style={{ width: `${Math.max(6, subject.total_minutes / maxSubjectMinutes * 100)}%` }} /></div>
                    <b>{formatMinutes(subject.total_minutes)}</b>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No subjects are added yet" text="Add your IB subjects first. Then the time from every saved study session will appear in this comparison." action="Go to subjects" onAction={() => setActiveView("subjects")} />}
          </article>

          <article className="panel upcoming-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">What should be done next</p><h2>Unfinished work</h2></div>
              <button className="text-button" onClick={() => setActiveView("plans")}>See and edit all plans →</button>
            </div>
            {upcomingPlans.length ? (
              <div className="compact-plan-list">
                {upcomingPlans.map((plan) => (
                  <button key={plan.id} onClick={() => { editPlan(plan); setActiveView("plans"); }}>
                    <span className={`priority-dot ${plan.priority}`} />
                    <span><strong>{plan.title}</strong><small>{plan.subject_name || "General"} · {dateLabel(plan.deadline)}</small></span>
                    <b>›</b>
                  </button>
                ))}
              </div>
            ) : <EmptyState title="There is no unfinished work here" text="You can add a normal study plan yourself, or give a task and deadline to Kimi on the calendar above." action="Create a plan" onAction={() => setActiveView("plans")} />}
          </article>
        </section>

        {dashboard.weakSubjects.length ? (
          <section className="attention-card">
            <span>!</span>
            <div><p className="eyebrow">Maybe check this before the other subjects</p><h3>{dashboard.weakSubjects.map((subject) => subject.name).join(", ")}</h3><p>The saved study time is lower than your average, or there are several unfinished tasks. This is only a reminder, not a judgement of your grade.</p></div>
            <button className="button button-light" onClick={() => setActiveView("assistant")}>Ask Kimi what to do</button>
          </section>
        ) : null}
      </div>
    );
  }

  function renderPlans() {
    return (
      <div className="view-stack">
        <PageHeading eyebrow="Plans and deadlines" title="Study plans" text="Put each piece of work here, even if it is small. A clear title, deadline and priority makes the overview more useful and also gives Kimi better information." />
        <section className="editor-grid">
          <form className="panel editor-card" onSubmit={submitPlan}>
            <div className="panel-heading"><div><p className="eyebrow">{planEditingId ? "Editing one saved plan" : "Add work manually"}</p><h2>{planEditingId ? "Change this plan" : "Make a study plan"}</h2></div></div>
            <div className="form-grid">
              <label className="span-2"><span>Title</span><small className="field-help">Say exactly what needs to be finished. “Write introduction” is easier to act on than only “English”.</small><input value={planDraft.title} onChange={(event) => setPlanDraft({ ...planDraft, title: event.target.value })} placeholder="Finish TOK essay outline" required /></label>
              <label><span>Subject</span><small className="field-help">This is used for calendar labels and subject statistics.</small><select value={planDraft.subjectId} onChange={(event) => setPlanDraft({ ...planDraft, subjectId: event.target.value })}><option value="">General</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>
              <label><span>Deadline</span><small className="field-help">Leave it empty only when there is really no due date.</small><input type="date" value={planDraft.deadline} onChange={(event) => setPlanDraft({ ...planDraft, deadline: event.target.value })} /></label>
              <label><span>Priority</span><small className="field-help">High means it should appear earlier when the queue is optimized.</small><select value={planDraft.priority} onChange={(event) => setPlanDraft({ ...planDraft, priority: event.target.value })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
              <label><span>Status</span><small className="field-help">Update this when you start or finish the work.</small><select value={planDraft.status} onChange={(event) => setPlanDraft({ ...planDraft, status: event.target.value })}><option value="pending">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></label>
              <label className="span-2"><span>Notes</span><small className="field-help">Add the success condition, materials or another detail that you may forget later.</small><textarea rows={3} value={planDraft.description} onChange={(event) => setPlanDraft({ ...planDraft, description: event.target.value })} placeholder="What does finished look like?" /></label>
            </div>
            <div className="form-actions">
              {planEditingId ? <button type="button" className="button button-ghost" onClick={() => { setPlanEditingId(null); setPlanDraft({ title: "", subjectId: "", deadline: "", priority: "medium", status: "pending", description: "" }); }}>Cancel</button> : null}
              <button className="button button-primary">{planEditingId ? "Save these changes" : "Add this plan"}</button>
            </div>
          </form>

          <aside className="panel optimization-card">
            <span className="assistant-orb dark">↗</span>
            <p className="eyebrow">Optional automatic order</p>
            <h2>Compare priority and deadline</h2>
            <p>This button does not change or delete any plan. It only scores unfinished work using the priority you selected and how close the deadline is, then shows a suggested order below.</p>
            <button className="button button-dark button-full" onClick={() => void loadOptimizedPlans()}>Show the suggested order</button>
            {optimizedPlans ? (
              <div className="optimization-results">
                {optimizedPlans.length ? optimizedPlans.slice(0, 4).map((plan, index) => (
                  <div key={plan.id}><b>{index + 1}</b><span><strong>{plan.title}</strong><small>Score {plan.urgencyScore} · {plan.reason}</small></span></div>
                )) : <p>Every saved plan is completed, so there is nothing to reorder now.</p>}
              </div>
            ) : null}
          </aside>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Everything saved in the planner</p><h2>{plans.length} plans</h2></div></div>
          {plans.length ? (
            <div className="plan-list">
              {plans.map((plan) => (
                <article className={`plan-row ${plan.status === "completed" ? "is-complete" : ""}`} key={plan.id}>
                  <button className={`completion-toggle ${plan.status === "completed" ? "checked" : ""}`} aria-label="Toggle completion" onClick={() => token && void mutate(() => apiRequest(`/api/plans/${plan.id}`, { method: "PATCH", token, body: { status: plan.status === "completed" ? "pending" : "completed" } }), plan.status === "completed" ? "Plan reopened" : "Plan completed")}>{plan.status === "completed" ? "✓" : ""}</button>
                  <div className="plan-main"><div><span className={`priority-label ${plan.priority}`}>{plan.priority}</span><span className="status-label">{plan.status.replace("_", " ")}</span></div><h3>{plan.title}</h3><p>{plan.subject_name || "General"}{plan.description ? ` · ${plan.description}` : ""}</p></div>
                  <div className="plan-deadline"><span>Deadline</span><strong>{dateLabel(plan.deadline)}</strong></div>
                  <div className="row-actions"><button onClick={() => editPlan(plan)}>Edit</button><button className="danger-link" onClick={() => token && void mutate(() => apiRequest(`/api/plans/${plan.id}`, { method: "DELETE", token }), "Plan deleted")}>Delete</button></div>
                </article>
              ))}
            </div>
          ) : <EmptyState title="No plan is saved yet" text="Use the form above for a normal task, or use Kimi on the overview if you want help choosing the time." />}
        </section>
      </div>
    );
  }

  function renderSubjects() {
    return (
      <div className="view-stack">
        <PageHeading eyebrow="Basic school information" title="Subjects" text="Add the subjects you actually study. The same list is used by study plans, the focus timer, dashboard statistics and the information sent to Kimi." />
        <section className="editor-grid subject-editor-grid">
          <form className="panel editor-card" onSubmit={submitSubject}>
            <div className="panel-heading"><div><p className="eyebrow">{subjectEditingId ? "Editing one subject" : "Make the subject list"}</p><h2>{subjectEditingId ? "Change this subject" : "Add one subject"}</h2></div></div>
            <div className="form-grid">
              <label className="span-2"><span>Subject name</span><small className="field-help">Use the normal short name you recognize in a calendar, for example Biology or English A.</small><input value={subjectDraft.name} onChange={(event) => setSubjectDraft({ ...subjectDraft, name: event.target.value })} placeholder="Biology" required /></label>
              <label><span>Level</span><small className="field-help">Choose HL, SL, or Other when the course is outside the IB level system.</small><select value={subjectDraft.level} onChange={(event) => setSubjectDraft({ ...subjectDraft, level: event.target.value })}><option>HL</option><option>SL</option><option>Other</option></select></label>
              <label><span>Target grade</span><small className="field-help">This is your goal, not the current grade. It gives the dashboard extra context.</small><select value={subjectDraft.targetGrade} onChange={(event) => setSubjectDraft({ ...subjectDraft, targetGrade: event.target.value })}><option value="">Not set</option>{[7, 6, 5, 4, 3, 2, 1].map((grade) => <option key={grade}>{grade}</option>)}</select></label>
              <label className="span-2"><span>Teacher</span><small className="field-help">This field is optional. It is just a quick reference for you.</small><input value={subjectDraft.teacher} onChange={(event) => setSubjectDraft({ ...subjectDraft, teacher: event.target.value })} placeholder="Ms Patel" /></label>
            </div>
            <div className="form-actions">
              {subjectEditingId ? <button type="button" className="button button-ghost" onClick={() => { setSubjectEditingId(null); setSubjectDraft({ name: "", level: "HL", teacher: "", targetGrade: "" }); }}>Cancel</button> : null}
              <button className="button button-primary">{subjectEditingId ? "Save the subject changes" : "Add this subject"}</button>
            </div>
          </form>
          <aside className="panel programme-note"><p className="eyebrow">Why this information is here</p><h2>Make the comparison understandable.</h2><p>The target grade is a personal goal. The study time and unfinished tasks show how much attention the subject is receiving. This does not predict your final result, but it can show a subject you forgot for too long.</p><div className="grade-scale">{[1, 2, 3, 4, 5, 6, 7].map((grade) => <span key={grade}>{grade}</span>)}</div></aside>
        </section>
        {subjects.length ? <section className="subject-card-grid">{subjects.map((subject, index) => { const progress = dashboard.subjects.find((item) => item.id === subject.id); return <article className={`subject-card accent-${index % 4}`} key={subject.id}><header><span>{subject.name.slice(0, 2).toUpperCase()}</span><div className="row-actions"><button onClick={() => editSubject(subject)}>Edit</button><button className="danger-link" onClick={() => token && void mutate(() => apiRequest(`/api/subjects/${subject.id}`, { method: "DELETE", token }), "Subject deleted")}>Delete</button></div></header><p>{subject.level}</p><h3>{subject.name}</h3><dl><div><dt>Teacher</dt><dd>{subject.teacher || "Not set"}</dd></div><div><dt>Target</dt><dd>{subject.target_grade ? `${subject.target_grade}/7` : "—"}</dd></div><div><dt>Study time</dt><dd>{formatMinutes(progress?.total_minutes || 0)}</dd></div><div><dt>Open tasks</dt><dd>{progress?.open_tasks || 0}</dd></div></dl></article>; })}</section> : <section className="panel"><EmptyState title="No subject is in the planner yet" text="Add the first subject above. The dashboard, timer, plan form and Kimi context all use this same list." /></section>}
      </div>
    );
  }

  function renderSessions() {
    return (
      <div className="view-stack">
        <PageHeading eyebrow="Real work completed" title="Study sessions" text="Use the timer while you study, or enter a finished session manually. Every saved minute is added to the subject totals on the overview." />
        <section className="timer-layout">
          <article className="timer-card">
            <p className="eyebrow eyebrow-light">Live focus timer</p>
            <div className="timer-display">{formatTimer(timerSeconds)}</div>
            <select value={timerSubjectId} onChange={(event) => setTimerSubjectId(event.target.value)} disabled={timerRunning}><option value="">Choose a subject</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select>
            <p className="timer-help">Choose the subject before starting. Pause keeps the current time. Stop &amp; save writes the completed minutes into the study log.</p>
            <div className="timer-actions">
              <button className="button button-light" disabled={!timerSubjectId} onClick={() => setTimerRunning((value) => !value)}>{timerRunning ? "Pause" : timerSeconds ? "Resume" : "Start focus"}</button>
              {timerSeconds ? <button className="button button-outline-light" onClick={() => void stopTimer()}>Stop & save</button> : null}
            </div>
          </article>
          <form className="panel editor-card" onSubmit={submitSession}>
            <div className="panel-heading"><div><p className="eyebrow">Manual entry</p><h2>Add study you already completed</h2></div></div>
            <div className="form-grid">
              <label><span>Subject</span><small className="field-help">The minutes will be counted under this subject.</small><select value={sessionDraft.subjectId} onChange={(event) => setSessionDraft({ ...sessionDraft, subjectId: event.target.value })} required><option value="">Choose subject</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>
              <label><span>Date</span><small className="field-help">Use the day when the study really happened.</small><input type="date" value={sessionDraft.date} onChange={(event) => setSessionDraft({ ...sessionDraft, date: event.target.value })} required /></label>
              <label><span>Duration (minutes)</span><small className="field-help">Enter focused study time, without a long break in the middle.</small><input type="number" min="1" value={sessionDraft.durationMinutes} onChange={(event) => setSessionDraft({ ...sessionDraft, durationMinutes: event.target.value })} required /></label>
              <label><span>Notes</span><small className="field-help">Optional: write the topic, result or something to continue next time.</small><input value={sessionDraft.notes} onChange={(event) => setSessionDraft({ ...sessionDraft, notes: event.target.value })} placeholder="Topics, result or a short reflection" /></label>
            </div>
            <div className="form-actions"><button className="button button-primary" disabled={!subjects.length}>Save this study session</button></div>
          </form>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Saved study history</p><h2>{formatMinutes(dashboard.totalStudyMinutes)} recorded in total</h2></div></div>
          {sessions.length ? <div className="session-list">{sessions.map((session) => <article key={session.id}><span className="session-date">{new Date(`${session.session_date}T12:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span><div><h3>{session.subject_name}</h3><p>{session.notes || "Focused study session"}</p></div><strong>{formatMinutes(session.duration_minutes)}</strong><button className="danger-link" onClick={() => token && void mutate(() => apiRequest(`/api/sessions/${session.id}`, { method: "DELETE", token }), "Session deleted")}>Delete</button></article>)}</div> : <EmptyState title="No study time is saved yet" text="Choose a subject and start the timer when you begin, or use the manual form for study you already completed." />}
        </section>
      </div>
    );
  }

  function renderProfile() {
    return (
      <div className="view-stack profile-view">
        <PageHeading eyebrow="Information about this account" title="Your profile" text="Keep the grade and study goals here. The planner shows this information on your account, and Kimi receives it as context when you ask a question." />
        <section className="profile-grid">
          <aside className="profile-summary"><div className="large-avatar">{currentProfile.name.slice(0, 2).toUpperCase()}</div><h2>{currentProfile.name}</h2><p>{currentProfile.email}</p><span>{currentProfile.grade || "Grade not set"}</span><small>Member since {new Date(currentProfile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</small></aside>
          <form className="panel editor-card" onSubmit={saveProfile}>
            <div className="panel-heading"><div><p className="eyebrow">Editable student information</p><h2>Profile and goals</h2></div></div>
            <div className="form-grid profile-form">
              <label><span>Name</span><small className="field-help">This is used in the greeting and the profile card.</small><input value={currentProfile.name} onChange={(event) => setProfile({ ...currentProfile, name: event.target.value })} required /></label>
              <label><span>Email</span><small className="field-help">The account email cannot be changed from this page.</small><input value={currentProfile.email} disabled /></label>
              <label className="span-2"><span>Grade / year</span><small className="field-help">For example IB DP1 or IB DP2. Kimi can use this to make advice closer to your course stage.</small><input value={currentProfile.grade || ""} onChange={(event) => setProfile({ ...currentProfile, grade: event.target.value })} placeholder="IB DP2" /></label>
              <label className="span-2"><span>Study goals</span><small className="field-help">Write concrete goals, weak areas or limits. Kimi receives this text with chat questions, so details here can improve the answer.</small><textarea rows={6} value={currentProfile.study_goals || ""} onChange={(event) => setProfile({ ...currentProfile, study_goals: event.target.value })} placeholder="For example: improve Biology data analysis and finish the EE draft before October." /></label>
            </div>
            <div className="form-actions"><button className="button button-primary">Save my profile information</button></div>
          </form>
        </section>
      </div>
    );
  }

  const activeContent = activeView === "overview" ? renderOverview() : activeView === "plans" ? renderPlans() : activeView === "subjects" ? renderSubjects() : activeView === "sessions" ? renderSessions() : activeView === "assistant" ? <AssistantPanel profile={currentProfile} subjects={subjects} plans={plans} /> : renderProfile();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>StudyOS</span></div>
        <nav>{navigation.map((item) => <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}><span>{item.icon}</span>{item.label}{item.id === "plans" && dashboard.openTasks ? <b>{dashboard.openTasks}</b> : null}</button>)}</nav>
        <div className="sidebar-coach"><span>✦</span><strong>Not sure what to do next?</strong><p>Kimi can read the saved subjects, goals and deadlines, then explain a possible next step.</p><button onClick={() => setActiveView("assistant")}>Open the Kimi chat →</button></div>
        <button className="sidebar-profile" onClick={() => setActiveView("profile")}><span>{currentProfile.name.slice(0, 2).toUpperCase()}</span><div><strong>{currentProfile.name}</strong><small>{currentProfile.grade || "IB student"}</small></div><b>›</b></button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="mobile-brand brand"><span className="brand-mark">S</span><span>StudyOS</span></div>
          <div className="backend-status"><i /> Data connected to SQLite</div>
          <div className="topbar-actions"><button className="icon-button" aria-label="Open Kimi coach" onClick={() => setActiveView("assistant")}>✦</button><button className="button button-ghost button-small" onClick={() => void logout()}>Sign out</button></div>
        </header>
        <nav className="mobile-nav">{navigation.map((item) => <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
        <div className="workspace-content">
          {pageError ? <div className="page-alert"><span>!</span><p>{pageError}</p><button onClick={() => setPageError(null)}>×</button></div> : null}
          {loadingData ? <div className="loading-line" /> : null}
          {activeContent}
        </div>
      </main>
      {flash ? <div className="toast"><span>✓</span>{flash}</div> : null}
    </div>
  );
}

function PageHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <header className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></header>;
}

function EmptyState({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span>◇</span><h3>{title}</h3><p>{text}</p>{action && onAction ? <button className="text-button" onClick={onAction}>{action} →</button> : null}</div>;
}
