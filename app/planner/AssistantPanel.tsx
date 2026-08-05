import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { apiRequest, backendUrl } from "./api";
import type { StudyPlan, Subject } from "./types";


type ChatMessage = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  applied_task_id?: number | null;
  applied_task_action?: "create" | "update" | "delete" | null;
  applied_task_title?: string | null;
  applied_task_deadline?: string | null;
};
type ChatResponse = {
  code: number;
  message: string;
  data: { content: string } | null;
};
type ChatStreamEvent =
  | { type: "delta"; content: string }
  | { type: "done"; finishReason: string | null; messageId: number | null }
  | { type: "error"; message: string };

type PlannerTaskDraft = {
  action: "create" | "update" | "delete";
  taskId: number | null;
  title: string;
  description: string;
  subjectId: number | null;
  priority: StudyPlan["priority"];
  status: StudyPlan["status"];
  deadline: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  rationale: string;
};

type PlannerApplyResult = {
  action: PlannerTaskDraft["action"];
  plan: StudyPlan | null;
  taskTitle: string;
  taskDeadline: string | null;
  alreadyApplied: boolean;
};

const starterPrompts = [
  "Show my unfinished tasks ordered by deadline",
  "Help me add one new planner task",
  "Help me update or delete an existing task",
];

export function AssistantPanel({
  token,
  subjects,
  onPlannerChanged,
  onOpenCalendar,
  onOpenPlans,
}: {
  token: string;
  subjects: Subject[];
  onPlannerChanged: () => Promise<void>;
  onOpenCalendar: (deadline: string | null) => void;
  onOpenPlans: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<number, PlannerTaskDraft>>({});
  const [preparingMessageId, setPreparingMessageId] = useState<number | null>(null);
  const [applyingMessageId, setApplyingMessageId] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: sending ? "auto" : "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    setError(null);
    setTaskDrafts({});

    apiRequest<ChatMessage[]>("/api/conversations", { token })
      .then((savedMessages) => {
        if (!cancelled) setMessages(savedMessages);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The saved conversation could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function sendMessage(rawMessage: string) {
    const content = rawMessage.trim();
    if (!content || sending || loadingHistory) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    const assistantMessageIndex = nextMessages.length;
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);
    setError(null);

    let streamedContent = "";

    try {
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: content, stream: true }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as ChatResponse | null;
        throw new Error(result?.message || "Kimi could not answer right now.");
      }

      if (!response.body) {
        throw new Error("The Kimi stream did not start.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function applyStreamEvent(block: string) {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        if (!data || data === "[DONE]") return;

        const event = JSON.parse(data) as ChatStreamEvent;

        if (event.type === "error") {
          throw new Error(event.message);
        }

        if (event.type === "delta" && event.content) {
          streamedContent += event.content;
          setMessages((current) => {
            if (current[assistantMessageIndex]?.role !== "assistant") return current;

            const updated = [...current];
            updated[assistantMessageIndex] = {
              role: "assistant",
              content: streamedContent,
            };
            return updated;
          });
        }

        if (event.type === "done" && event.messageId) {
          const messageId = event.messageId;
          setMessages((current) => {
            if (current[assistantMessageIndex]?.role !== "assistant") return current;

            const updated = [...current];
            updated[assistantMessageIndex] = {
              ...updated[assistantMessageIndex],
              id: messageId,
            };
            return updated;
          });
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";
        blocks.forEach(applyStreamEvent);

        if (done) break;
      }

      if (buffer.trim()) applyStreamEvent(buffer);
      if (!streamedContent) throw new Error("Kimi returned an empty answer.");
    } catch (requestError) {
      if (!streamedContent) {
        setMessages((current) =>
          current.filter((_, index) => index !== assistantMessageIndex),
        );
      }
      setError(requestError instanceof Error ? requestError.message : "Kimi is unavailable.");
    } finally {
      setSending(false);
    }
  }

  async function clearChat() {
    if (sending || clearing) return;
    setClearing(true);
    setError(null);
    try {
      await apiRequest<null>("/api/conversations", { method: "DELETE", token });
      setMessages([]);
      setTaskDrafts({});
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The saved conversation could not be cleared.",
      );
    } finally {
      setClearing(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  async function prepareTask(messageId: number) {
    if (preparingMessageId || applyingMessageId) return;
    setPreparingMessageId(messageId);
    setError(null);
    try {
      const draft = await apiRequest<PlannerTaskDraft>(
        `/api/conversations/${messageId}/task-draft`,
        { method: "POST", token },
      );
      setTaskDrafts((current) => ({ ...current, [messageId]: draft }));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Kimi could not prepare a planner task from this answer.",
      );
    } finally {
      setPreparingMessageId(null);
    }
  }

  function updateTaskDraft(messageId: number, changes: Partial<PlannerTaskDraft>) {
    setTaskDrafts((current) => {
      const draft = current[messageId];
      if (!draft) return current;
      return { ...current, [messageId]: { ...draft, ...changes } };
    });
  }

  async function applyTask(messageId: number) {
    const draft = taskDrafts[messageId];
    if (!draft || applyingMessageId || preparingMessageId) return;
    setApplyingMessageId(messageId);
    setError(null);
    try {
      const result = await apiRequest<PlannerApplyResult>(
        `/api/conversations/${messageId}/apply-task`,
        { method: "POST", token, body: draft },
      );
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                applied_task_id: result.plan?.id ?? null,
                applied_task_action: result.action,
                applied_task_title: result.taskTitle,
                applied_task_deadline: result.taskDeadline,
              }
            : message,
        ),
      );
      setTaskDrafts((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
      await onPlannerChanged();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The planner task could not be saved.",
      );
    } finally {
      setApplyingMessageId(null);
    }
  }

  return (
    <section className="assistant-layout">
      <aside className="assistant-intro">
        <span className="assistant-orb">✦</span>
        <p className="eyebrow eyebrow-light">Kimi task agent</p>
        <h2>Manage my planner tasks.</h2>
        <p>
          Kimi reads your current task list and can help you find, add, change or
          delete one planner task. Every database change waits for your confirmation.
        </p>
        <div className="agent-scope-card" role="note" aria-label="Task agent capability limits">
          <strong>Task agent only</strong>
          <p>Supported: query, add, update and delete planner tasks.</p>
          <p>Not supported: subjects, profile, study sessions, tutoring, files, web research, email or other actions.</p>
        </div>
        <div className="assistant-prompts">
          {starterPrompts.map((prompt) => (
            <button type="button" key={prompt} disabled={sending || loadingHistory} onClick={() => void sendMessage(prompt)}>
              {prompt}<span>↗</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="chat-panel">
        <header className="chat-header">
          <div>
            <strong>Kimi can only work with planner tasks</strong>
            <span><i /> {loadingHistory ? "Loading the saved conversation" : sending ? "Kimi is writing the answer now" : "Ready for a question"}</span>
          </div>
          {messages.length ? (
            <button className="button button-ghost button-small" type="button" disabled={sending || clearing} onClick={() => void clearChat()}>
              {clearing ? "Clearing…" : "Clear this chat"}
            </button>
          ) : null}
        </header>
        <div className="chat-messages" aria-live="polite">
          {loadingHistory ? (
            <div className="empty-chat">
              <span>✦</span>
              <h3>Loading your saved conversation…</h3>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-chat">
              <span>✦</span>
              <h3>What task should the agent manage?</h3>
              <p>
                Ask it to find tasks, add one task, change one existing task or delete
                one task. Other request types will be declined.
              </p>
            </div>
          ) : null}
          {messages.map((message, index) => {
            const messageId = message.id;
            const taskDraft = messageId ? taskDrafts[messageId] : null;
            const isCurrentStream = sending && index === messages.length - 1 && message.role === "assistant";
            const appliedAction = message.applied_task_action ?? (message.applied_task_id ? "update" : null);

            return (
              <div className={`chat-row ${message.role}`} key={message.id ?? `${message.role}-${index}`}>
                {message.role === "assistant" ? <span className="chat-avatar">K</span> : null}
                <div className="chat-bubble">
                  <div className={`chat-markdown ${message.role === "user" ? "chat-markdown-user" : ""} ${isCurrentStream ? "is-streaming" : ""}`}>
                    <Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={["img"]}>
                      {message.content}
                    </Markdown>
                  </div>

                  {message.role === "assistant" && appliedAction ? (
                    <div className={`chat-task-applied ${appliedAction === "delete" ? "is-delete" : ""}`}>
                      <strong>{appliedAction === "delete" ? "✓ Deleted from your planner" : "✓ Saved to your planner"}</strong>
                      <span>
                        {appliedAction === "delete"
                          ? `${message.applied_task_title || "The task"} was removed.`
                          : "This task is now visible in both Calendar and Study plans."}
                      </span>
                      <div>
                        {appliedAction !== "delete" ? <button type="button" onClick={() => onOpenCalendar(message.applied_task_deadline ?? null)}>View calendar</button> : null}
                        <button type="button" onClick={onOpenPlans}>View study plans</button>
                      </div>
                    </div>
                  ) : taskDraft && messageId ? (
                    <div className="chat-task-card">
                      <header>
                        <div>
                          <strong>Review planner task</strong>
                          <span>{taskDraft.action === "delete" ? "Delete an existing task" : taskDraft.action === "update" ? "Update an existing task" : "Add a new task"}</span>
                        </div>
                        <span className={`chat-task-badge ${taskDraft.action === "delete" ? "is-delete" : ""}`}>{taskDraft.action === "delete" ? "Confirm deletion" : "Confirm before saving"}</span>
                      </header>
                      {taskDraft.action === "delete" ? (
                        <div className="chat-task-delete-summary">
                          <strong>{taskDraft.title}</strong>
                          <span>{subjects.find((subject) => subject.id === taskDraft.subjectId)?.name || "General"} · {taskDraft.status.replace("_", " ")} · {taskDraft.priority} priority</span>
                          <span>{taskDraft.deadline ? `Deadline ${taskDraft.deadline.slice(0, 16).replace("T", " ")}` : "No deadline"}</span>
                          <p>This permanently removes the task from Calendar and Study plans.</p>
                        </div>
                      ) : <div className="chat-task-grid">
                        <label className="span-2">
                          <span>Task title</span>
                          <input value={taskDraft.title} onChange={(event) => updateTaskDraft(messageId, { title: event.target.value })} />
                        </label>
                        <label>
                          <span>Subject</span>
                          <select value={taskDraft.subjectId ?? ""} onChange={(event) => updateTaskDraft(messageId, { subjectId: event.target.value ? Number(event.target.value) : null })}>
                            <option value="">General</option>
                            {subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
                          </select>
                        </label>
                        <label>
                          <span>Deadline</span>
                          <input type="datetime-local" value={taskDraft.deadline?.slice(0, 16) ?? ""} onChange={(event) => updateTaskDraft(messageId, { deadline: event.target.value || null })} />
                        </label>
                        <label>
                          <span>Priority</span>
                          <select value={taskDraft.priority} onChange={(event) => updateTaskDraft(messageId, { priority: event.target.value as StudyPlan["priority"] })}>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                        </label>
                        <label>
                          <span>Status</span>
                          <select value={taskDraft.status} onChange={(event) => updateTaskDraft(messageId, { status: event.target.value as StudyPlan["status"] })}>
                            <option value="pending">Pending</option>
                            <option value="in_progress">In progress</option>
                            <option value="completed">Completed</option>
                          </select>
                        </label>
                        <label className="span-2">
                          <span>Notes</span>
                          <textarea rows={2} value={taskDraft.description} onChange={(event) => updateTaskDraft(messageId, { description: event.target.value })} />
                        </label>
                      </div>}
                      {taskDraft.rationale ? <p>{taskDraft.rationale}</p> : null}
                      <div className="chat-task-actions">
                        <button type="button" onClick={() => setTaskDrafts((current) => {
                          const next = { ...current };
                          delete next[messageId];
                          return next;
                        })}>Cancel</button>
                        <button className={`button ${taskDraft.action === "delete" ? "button-danger" : "button-primary"}`} type="button" disabled={!taskDraft.title.trim() || applyingMessageId === messageId} onClick={() => void applyTask(messageId)}>
                          {applyingMessageId === messageId ? "Applying…" : taskDraft.action === "delete" ? "Delete task permanently" : taskDraft.action === "update" ? "Update calendar & study plans" : "Add to calendar & study plans"}
                        </button>
                      </div>
                    </div>
                  ) : message.role === "assistant" && messageId && !isCurrentStream ? (
                    <div className="chat-task-tools">
                      <button type="button" disabled={preparingMessageId === messageId || Boolean(applyingMessageId)} onClick={() => void prepareTask(messageId)}>
                        {preparingMessageId === messageId ? "Preparing action…" : "Review task change"} <span>＋</span>
                      </button>
                      <small>For add, update or delete requests only. Queries need no confirmation.</small>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {error ? <p className="form-message form-error chat-error">{error}</p> : null}
          <div ref={endRef} />
        </div>
        <form className="chat-composer" onSubmit={submit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find, add, update or delete a planner task…"
            rows={2}
            disabled={sending || loadingHistory}
          />
          <button className="button button-primary" disabled={sending || loadingHistory || !input.trim()}>
            {loadingHistory ? "Loading history…" : sending ? "Receiving answer…" : "Send message"} <span>↑</span>
          </button>
        </form>
      </div>
    </section>
  );
}
