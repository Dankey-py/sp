import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

import type { Route } from "./+types/api.schedule";
import {
  client,
  isMoonshotConfigured,
  moonshotModel,
} from "../.server/moonshot";


const phaseColors = [
  "#7563D9",
  "#3B82F6",
  "#2FA97C",
  "#F28C52",
  "#D85B8B",
  "#C59A28",
] as const;

type BusyPlan = {
  title?: unknown;
  scheduledStart?: unknown;
  scheduledEnd?: unknown;
  spanStart?: unknown;
  spanEnd?: unknown;
};

type NormalizedBusyPlan = {
  title: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  spanStart?: string;
  spanEnd?: string;
};

type ScheduleRequest = {
  mode: "single" | "longTerm";
  task: string;
  deadline: string;
  durationMinutes: number;
  projectStart: string;
  weeklyMinutes: number;
  preferredWindow: string;
  timezone: string;
  busyPlans: NormalizedBusyPlan[];
};

type SingleScheduleSuggestion = {
  mode: "single";
  start: string;
  end: string;
  priority: "low" | "medium" | "high";
  reason: string;
};

type LongTermPhaseSuggestion = {
  title: string;
  objective: string;
  startDate: string;
  endDate: string;
  estimatedMinutes: number;
  priority: "low" | "medium" | "high";
  color: string;
};

type LongTermScheduleSuggestion = {
  mode: "longTerm";
  projectTitle: string;
  strategy: string;
  phases: LongTermPhaseSuggestion[];
};

function json(data: unknown, init?: ResponseInit) {
  const response = Response.json(data, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function parseRequest(value: unknown): ScheduleRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  const mode = body.longTerm === true || body.mode === "longTerm" ? "longTerm" : "single";
  const task = typeof body.task === "string" ? body.task.trim() : "";
  const deadline = typeof body.deadline === "string" ? body.deadline.trim() : "";
  const durationMinutes = Number(body.durationMinutes);
  const projectStart =
    typeof body.projectStart === "string" ? body.projectStart.trim() : "";
  const weeklyMinutes = Number(body.weeklyMinutes);
  const preferredWindow =
    typeof body.preferredWindow === "string" && body.preferredWindow.trim()
      ? body.preferredWindow.trim()
      : "Weekdays 16:00-21:30; weekends 09:00-21:30";
  const timezone =
    typeof body.timezone === "string" && body.timezone.trim()
      ? body.timezone.trim()
      : "Asia/Shanghai";

  if (
    !task ||
    task.length > 240 ||
    Number.isNaN(Date.parse(deadline)) ||
    (mode === "single" &&
      (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480)) ||
    (mode === "longTerm" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(projectStart) ||
        Number.isNaN(Date.parse(`${projectStart}T12:00:00`)) ||
        !Number.isInteger(weeklyMinutes) ||
        weeklyMinutes < 60 ||
        weeklyMinutes > 2_400))
  ) {
    return null;
  }

  const busyPlans = Array.isArray(body.busyPlans)
    ? body.busyPlans
        .slice(0, 80)
        .filter((item): item is BusyPlan => typeof item === "object" && item !== null)
        .map((item) => {
          const normalized: NormalizedBusyPlan = {
            title: typeof item.title === "string" ? item.title.slice(0, 120) : "Study task",
          };
          if (
            typeof item.scheduledStart === "string" &&
            typeof item.scheduledEnd === "string" &&
            !Number.isNaN(Date.parse(item.scheduledStart)) &&
            !Number.isNaN(Date.parse(item.scheduledEnd))
          ) {
            normalized.scheduledStart = item.scheduledStart;
            normalized.scheduledEnd = item.scheduledEnd;
          }
          if (
            typeof item.spanStart === "string" &&
            typeof item.spanEnd === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(item.spanStart) &&
            /^\d{4}-\d{2}-\d{2}$/.test(item.spanEnd)
          ) {
            normalized.spanStart = item.spanStart;
            normalized.spanEnd = item.spanEnd;
          }
          return normalized;
        })
        .filter((item) => item.scheduledStart || item.spanStart)
    : [];

  return {
    mode,
    task,
    deadline,
    durationMinutes: mode === "single" ? durationMinutes : 60,
    projectStart: mode === "longTerm" ? projectStart : "",
    weeklyMinutes: mode === "longTerm" ? weeklyMinutes : 0,
    preferredWindow,
    timezone,
    busyPlans,
  };
}

function extractJsonObject(content: string): Record<string, unknown> | null {
  const startIndex = content.indexOf("{");
  const endIndex = content.lastIndexOf("}");
  if (startIndex < 0 || endIndex <= startIndex) return null;
  try {
    const value = JSON.parse(content.slice(startIndex, endIndex + 1));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractSingleSuggestion(content: string): SingleScheduleSuggestion | null {
  const value = extractJsonObject(content);
  if (
    !value ||
    typeof value.start !== "string" ||
    typeof value.end !== "string" ||
    typeof value.reason !== "string" ||
    !["low", "medium", "high"].includes(String(value.priority))
  ) {
    return null;
  }
  return {
    mode: "single",
    start: value.start,
    end: value.end,
    reason: value.reason.trim().slice(0, 280),
    priority: value.priority as SingleScheduleSuggestion["priority"],
  };
}

function extractLongTermSuggestion(content: string): LongTermScheduleSuggestion | null {
  const value = extractJsonObject(content);
  if (
    !value ||
    typeof value.projectTitle !== "string" ||
    typeof value.strategy !== "string" ||
    !Array.isArray(value.phases) ||
    value.phases.length < 2 ||
    value.phases.length > 8
  ) {
    return null;
  }

  const phases: LongTermPhaseSuggestion[] = [];
  for (const [index, rawPhase] of value.phases.entries()) {
    if (typeof rawPhase !== "object" || rawPhase === null) return null;
    const phase = rawPhase as Record<string, unknown>;
    if (
      typeof phase.title !== "string" ||
      typeof phase.objective !== "string" ||
      typeof phase.startDate !== "string" ||
      typeof phase.endDate !== "string" ||
      !Number.isInteger(Number(phase.estimatedMinutes)) ||
      !["low", "medium", "high"].includes(String(phase.priority))
    ) {
      return null;
    }
    const requestedColor = String(phase.color || "").toUpperCase();
    phases.push({
      title: phase.title.trim().slice(0, 180),
      objective: phase.objective.trim().slice(0, 800),
      startDate: phase.startDate,
      endDate: phase.endDate,
      estimatedMinutes: Number(phase.estimatedMinutes),
      priority: phase.priority as LongTermPhaseSuggestion["priority"],
      color: phaseColors.includes(requestedColor as (typeof phaseColors)[number])
        ? requestedColor
        : phaseColors[index % phaseColors.length],
    });
  }

  return {
    mode: "longTerm",
    projectTitle: value.projectTitle.trim().slice(0, 240),
    strategy: value.strategy.trim().slice(0, 500),
    phases,
  };
}

function isValidSingleSuggestion(
  suggestion: SingleScheduleSuggestion,
  scheduleRequest: ScheduleRequest,
) {
  const start = new Date(suggestion.start);
  const end = new Date(suggestion.end);
  const deadline = new Date(scheduleRequest.deadline);
  const actualDuration = (end.getTime() - start.getTime()) / 60_000;

  return (
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    start.getTime() > Date.now() &&
    end.getTime() <= deadline.getTime() &&
    Math.abs(actualDuration - scheduleRequest.durationMinutes) <= 1 &&
    !scheduleRequest.busyPlans.some((plan) => {
      if (!plan.scheduledStart || !plan.scheduledEnd) return false;
      const busyStart = new Date(plan.scheduledStart).getTime();
      const busyEnd = new Date(plan.scheduledEnd).getTime();
      return start.getTime() < busyEnd && end.getTime() > busyStart;
    })
  );
}

function isValidLongTermSuggestion(
  suggestion: LongTermScheduleSuggestion,
  scheduleRequest: ScheduleRequest,
) {
  const deadlineDate = scheduleRequest.deadline.slice(0, 10);
  let previousEnd = "";
  return (
    Boolean(suggestion.projectTitle && suggestion.strategy) &&
    suggestion.phases.length >= 2 &&
    suggestion.phases.every((phase) => {
      const valid =
        Boolean(phase.title && phase.objective) &&
        /^\d{4}-\d{2}-\d{2}$/.test(phase.startDate) &&
        /^\d{4}-\d{2}-\d{2}$/.test(phase.endDate) &&
        phase.startDate >= scheduleRequest.projectStart &&
        phase.endDate >= phase.startDate &&
        phase.endDate <= deadlineDate &&
        (!previousEnd || phase.startDate > previousEnd) &&
        phase.estimatedMinutes >= 15 &&
        phase.estimatedMinutes <= 20_000;
      previousEnd = phase.endDate;
      return valid;
    })
  );
}

export function loader(_: Route.LoaderArgs) {
  return json(
    { code: 405, message: "Method not allowed. Use POST /api/schedule.", data: null },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return json(
      { code: 405, message: "Method not allowed.", data: null },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      { code: 400, message: "Request body must be valid JSON.", data: null },
      { status: 400 },
    );
  }

  const scheduleRequest = parseRequest(body);
  if (!scheduleRequest) {
    return json(
      {
        code: 400,
        message: "Add a task, a valid future deadline, and realistic time availability.",
        data: null,
      },
      { status: 400 },
    );
  }

  if (
    new Date(scheduleRequest.deadline).getTime() <= Date.now() ||
    (scheduleRequest.mode === "longTerm" &&
      scheduleRequest.projectStart > scheduleRequest.deadline.slice(0, 10))
  ) {
    return json(
      { code: 400, message: "The project dates must finish at a future deadline.", data: null },
      { status: 400 },
    );
  }

  if (!isMoonshotConfigured()) {
    return json(
      { code: 503, message: "Kimi API key is not configured.", data: null },
      { status: 503 },
    );
  }

  const localNow = new Intl.DateTimeFormat("sv-SE", {
    timeZone: scheduleRequest.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date())
    .replace(" ", "T");

  const singlePrompt = `You are Kimi acting as an IB student's scheduling assistant.
Choose one focused study block for the task below.

Current local wall-clock time: ${localNow}
Student timezone: ${scheduleRequest.timezone}
Task: ${scheduleRequest.task}
Deadline: ${scheduleRequest.deadline}
Exact duration: ${scheduleRequest.durationMinutes} minutes
Preferred availability: ${scheduleRequest.preferredWindow}
Already scheduled blocks: ${JSON.stringify(scheduleRequest.busyPlans)}

Rules:
- The block must start in the future and finish before the deadline.
- It must not overlap any scheduled block.
- Keep the exact requested duration and use a 15-minute boundary when possible.
- Prefer an earlier calm slot over the last possible moment.
- Infer priority from deadline urgency.
- Return ONLY one JSON object with this exact shape:
{"mode":"single","start":"YYYY-MM-DDTHH:mm:ss","end":"YYYY-MM-DDTHH:mm:ss","priority":"low|medium|high","reason":"one concise sentence"}
- Times must be local wall-clock times in ${scheduleRequest.timezone}, without a UTC suffix.`;

  // this mode is not just a longer timer. kimi needs to make actual checkpoints
  // so the student can tell if a week of work really produced something.
  const longTermPrompt = `You are Kimi designing a measurable IB long-term project plan.
Break the project into 3-7 sequential phases that a student can review before adding them to a calendar.

Current local wall-clock time: ${localNow}
Student timezone: ${scheduleRequest.timezone}
Project: ${scheduleRequest.task}
Project start date: ${scheduleRequest.projectStart}
Final deadline: ${scheduleRequest.deadline}
Weekly study budget: ${scheduleRequest.weeklyMinutes} minutes
Preferred availability: ${scheduleRequest.preferredWindow}
Existing calendar commitments: ${JSON.stringify(scheduleRequest.busyPlans)}

Rules:
- Infer an academically sensible workflow from the exact task. For an IA this may include question design, research, method, experiment/data collection, analysis, drafting, and revision, but adapt the phases to the task.
- Every phase needs one observable, measurable outcome that proves it is finished.
- Use sequential, non-overlapping date ranges. A phase may span several days.
- Start no earlier than ${scheduleRequest.projectStart}; finish every phase by ${scheduleRequest.deadline.slice(0, 10)}.
- Reserve meaningful time for final revision before the deadline and keep effort realistic for the weekly budget.
- Use a different color for adjacent phases, selected only from: ${phaseColors.join(", ")}.
- Return ONLY one JSON object with this exact shape:
{"mode":"longTerm","projectTitle":"concise title","strategy":"one concise planning rationale","phases":[{"title":"phase name","objective":"specific measurable completion criterion","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","estimatedMinutes":180,"priority":"low|medium|high","color":"#7563D9"}]}`;

  try {
    const completion = await client.chat.completions.create(
      {
        model: moonshotModel,
        max_tokens: scheduleRequest.mode === "longTerm" ? 2800 : 1024,
        messages: [
          {
            role: "system",
            content:
              "You create realistic, measurable study schedules and follow structured-output instructions exactly.",
          },
          {
            role: "user",
            content: scheduleRequest.mode === "longTerm" ? longTermPrompt : singlePrompt,
          },
        ],
        thinking: { type: "disabled" },
      } as ChatCompletionCreateParamsNonStreaming & {
        thinking: { type: "disabled" };
      },
      { timeout: 60_000, maxRetries: 0 },
    );
    const content = completion.choices[0]?.message.content || "";
    console.log('content:',content) // type whatever I need on the console
    if (scheduleRequest.mode === "longTerm") {
      const suggestion = extractLongTermSuggestion(content);
      if (!suggestion || !isValidLongTermSuggestion(suggestion, scheduleRequest)) {
        return json(
          {
            code: 422,
            message: "Kimi could not create a valid sequential project plan. Try a later deadline or larger weekly budget.",
            data: null,
          },
          { status: 422 },
        );
      }
      return json({ code: 0, message: "success", data: suggestion });
    }

    const suggestion = extractSingleSuggestion(content);
    if (!suggestion || !isValidSingleSuggestion(suggestion, scheduleRequest)) {
      return json(
        {
          code: 422,
          message: "Kimi did not return a valid free time before this deadline. Try a later deadline or shorter duration.",
          data: null,
        },
        { status: 422 },
      );
    }
    return json({ code: 0, message: "success", data: suggestion });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      return json(
        { code: error.status || 502, message: error.message, data: null },
        { status: error.status || 502 },
      );
    }
    return json(
      {
        code: 500,
        message: error instanceof Error ? error.message : "Unable to reach Kimi.",
        data: null,
      },
      { status: 500 },
    );
  }
}
