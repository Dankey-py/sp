import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { backendUrl } from "./api";


type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatResponse = {
  code: number;
  message: string;
  data: { content: string } | null;
};
type ChatStreamEvent =
  | { type: "delta"; content: string }
  | { type: "done"; finishReason: string | null }
  | { type: "error"; message: string };

const starterPrompts = [
  "Please check which task I should do first",
  "My weakest subject needs a simple study plan",
  "Please divide my deadlines into a realistic week",
];

export function AssistantPanel({
  token,
}: {
  token: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: sending ? "auto" : "smooth" });
  }, [messages, sending]);

  async function sendMessage(rawMessage: string) {
    const content = rawMessage.trim();
    if (!content || sending) return;

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
        body: JSON.stringify({ messages: nextMessages, stream: true }),
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

  return (
    <section className="assistant-layout">
      <aside className="assistant-intro">
        <span className="assistant-orb">✦</span>
        <p className="eyebrow eyebrow-light">Ask Kimi</p>
        <h2>Explain what I should do next.</h2>
        <p>
          When you send a message, Kimi also receives the subject names, goals and
          current deadlines from this planner. This means the answer can use your
          real workload instead of giving only a general study tip.
        </p>
        <div className="assistant-prompts">
          {starterPrompts.map((prompt) => (
            <button type="button" key={prompt} onClick={() => void sendMessage(prompt)}>
              {prompt}<span>↗</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="chat-panel">
        <header className="chat-header">
          <div>
            <strong>Kimi can read this planner information</strong>
            <span><i /> {sending ? "Kimi is writing the answer now" : "Ready for a question"}</span>
          </div>
          {messages.length ? (
            <button className="button button-ghost button-small" type="button" disabled={sending} onClick={() => setMessages([])}>
              Clear this chat
            </button>
          ) : null}
        </header>
        <div className="chat-messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <span>✦</span>
              <h3>What do you need help with?</h3>
              <p>
                You can ask about one subject, one difficult deadline, or the whole
                week. Give more detail if you want a more useful and measurable answer.
              </p>
            </div>
          ) : null}
          {messages.map((message, index) => (
            <div className={`chat-row ${message.role}`} key={`${message.role}-${index}`}>
              {message.role === "assistant" ? <span className="chat-avatar">K</span> : null}
              <div className="chat-bubble">
                <div className={`chat-markdown ${message.role === "user" ? "chat-markdown-user" : ""} ${sending && index === messages.length - 1 && message.role === "assistant" ? "is-streaming" : ""}`}>
                  <Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={["img"]}>
                    {message.content}
                  </Markdown>
                </div>
              </div>
            </div>
          ))}
          {error ? <p className="form-message form-error chat-error">{error}</p> : null}
          <div ref={endRef} />
        </div>
        <form className="chat-composer" onSubmit={submit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write the problem, deadline and any limit Kimi should know…"
            rows={2}
          />
          <button className="button button-primary" disabled={sending || !input.trim()}>
            {sending ? "Receiving answer…" : "Send message"} <span>↑</span>
          </button>
        </form>
      </div>
    </section>
  );
}
