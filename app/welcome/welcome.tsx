import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatApiResponse = {
  code: number;
  message: string;
  data: {
    content: string;
  } | null;
};

const suggestions = [
  "Plan my study week",
  "Break down an assignment",
  "Quiz me on a topic",
];

function MarkdownMessage({
  content,
  isUser,
}: {
  content: string;
  isUser: boolean;
}) {
  return (
    <div className={`chat-markdown ${isUser ? "chat-markdown-user" : ""}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img"]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

export function Welcome() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function sendMessage(message: string) {
    const content = message.trim();

    if (!content || isSending) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const result = (await response.json()) as ChatApiResponse;

      if (!response.ok || !result.data) {
        throw new Error(result.message || "Kimi could not answer right now.");
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.data?.content ?? "" },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Kimi could not answer right now.",
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f3ee] text-slate-950">
      <div className="pointer-events-none fixed inset-0 opacity-70 [background-image:radial-gradient(circle_at_15%_15%,rgba(99,102,241,0.16),transparent_28%),radial-gradient(circle_at_85%_85%,rgba(20,184,166,0.12),transparent_30%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-200">
              SP
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Study Planner</p>
              <p className="text-xs text-slate-500">Your focused learning space</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
            <span className="size-2 rounded-full bg-emerald-500" />
            Backend online
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:py-14">
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">
              Kimi 国内版学习助手
            </div>
            <h1 className="text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-6xl">
              Make every study session count.
            </h1>
            <p className="mt-6 max-w-lg text-pretty text-lg leading-8 text-slate-600">
              Turn a busy syllabus into a clear next step. Ask Kimi to build a
              plan, explain a concept, or help you practice what you learned.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <span
                  key={suggestion}
                  className="rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-600 shadow-sm"
                >
                  {suggestion}
                </span>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-2xl">
            {!isChatOpen ? (
              <section className="relative overflow-hidden rounded-[2rem] border border-white bg-slate-950 p-8 text-white shadow-2xl shadow-slate-300/70 sm:p-10">
                <div className="absolute -right-16 -top-20 size-52 rounded-full bg-indigo-500/30 blur-3xl" />
                <div className="absolute -bottom-24 left-10 size-48 rounded-full bg-teal-400/20 blur-3xl" />

                <div className="relative">
                  <div className="mb-16 grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/10 text-lg">
                    ✦
                  </div>
                  <p className="text-sm font-medium text-indigo-200">
                    Your AI study companion is ready
                  </p>
                  <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                    What would you like to learn today?
                  </h2>
                  <p className="mt-4 max-w-lg leading-7 text-slate-300">
                    Start a private conversation with Kimi without leaving your
                    planner.
                  </p>

                  <button
                    type="button"
                    onClick={() => setIsChatOpen(true)}
                    className="mt-9 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-indigo-400/40 sm:w-auto"
                  >
                    Connect to backend
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </section>
            ) : (
              <section className="flex h-[650px] max-h-[72vh] min-h-[520px] flex-col overflow-hidden rounded-[2rem] border border-white bg-white/90 shadow-2xl shadow-slate-300/70 backdrop-blur">
                <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-2xl bg-slate-950 text-sm text-white">
                      ✦
                    </div>
                    <div>
                      <h2 className="font-semibold">与 Kimi 国内版对话</h2>
                      <p className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Ready to help you study
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(false)}
                    className="rounded-xl px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Close conversation"
                  >
                    Close
                  </button>
                </header>

                <div
                  className="flex-1 space-y-4 overflow-y-auto px-5 py-6 sm:px-6"
                  aria-live="polite"
                >
                  {messages.length === 0 ? (
                    <div className="flex gap-3">
                      <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-indigo-100 text-xs text-indigo-700">
                        K
                      </div>
                      <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
                        Hi! I’m Kimi. Tell me what you’re studying and how much
                        time you have, and I’ll help you make a focused plan.
                      </div>
                    </div>
                  ) : null}

                  {messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex gap-3 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-indigo-100 text-xs text-indigo-700">
                          K
                        </div>
                      ) : null}
                      <div
                        className={`max-w-[85%] overflow-hidden rounded-2xl px-4 py-3 text-sm leading-6 ${
                          message.role === "user"
                            ? "rounded-tr-md bg-indigo-600 text-white"
                            : "rounded-tl-md bg-slate-100 text-slate-700"
                        }`}
                      >
                        <MarkdownMessage
                          content={message.content}
                          isUser={message.role === "user"}
                        />
                      </div>
                    </div>
                  ))}

                  {isSending ? (
                    <div className="flex gap-3">
                      <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-indigo-100 text-xs text-indigo-700">
                        K
                      </div>
                      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-slate-100 px-4 py-4">
                        {[0, 1, 2].map((dot) => (
                          <span
                            key={dot}
                            className="size-1.5 animate-pulse rounded-full bg-slate-400"
                            style={{ animationDelay: `${dot * 160}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  ) : null}
                  <div ref={conversationEndRef} />
                </div>

                <form onSubmit={handleSubmit} className="border-t border-slate-100 p-4 sm:p-5">
                  <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm transition focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
                    <label htmlFor="kimi-message" className="sr-only">
                      Message Kimi
                    </label>
                    <textarea
                      id="kimi-message"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask Kimi about your studies…"
                      rows={2}
                      disabled={isSending}
                      className="max-h-32 min-h-12 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || isSending}
                      className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isSending ? "Sending…" : "Send"}
                    </button>
                  </div>
                  <p className="mt-2 text-center text-[11px] text-slate-400">
                    Enter to send · Shift + Enter for a new line
                  </p>
                </form>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
