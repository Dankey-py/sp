import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

import type { Route } from "./+types/api.chat";
import {
  client,
  isMoonshotConfigured,
  moonshotModel,
  studyPlannerSystemPrompt,
} from "../.server/moonshot";

type TextMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "done"; finishReason: string | null }
  | { type: "error"; message: string };

const textMessageRoles = new Set<TextMessage["role"]>([
  "system",
  "user",
  "assistant",
]);

function isTextMessage(value: unknown): value is TextMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const message = value as Record<string, unknown>;

  return (
    typeof message.role === "string" &&
    textMessageRoles.has(message.role as TextMessage["role"]) &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

function parseMessages(body: unknown): ChatCompletionMessageParam[] | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const { message, messages } = body as Record<string, unknown>;

  if (typeof message === "string" && message.trim()) {
    return [{ role: "user", content: message.trim() }];
  }

  if (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(isTextMessage)
  ) {
    return messages;
  }

  return null;
}

function json(data: unknown, init?: ResponseInit) {
  const response = Response.json(data, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function apiErrorDetails(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    const status = error.status || 502;
    return {
      status,
      message:
        status === 401
          ? "Kimi 国内站 API Key 无效，请确认该 Key 创建于 platform.kimi.com。"
          : error.message,
    };
  }

  return {
    status: 500,
    message:
      error instanceof Error ? error.message : "无法连接 Kimi 国内站 API。",
  };
}

function encodeStreamEvent(encoder: TextEncoder, event: StreamEvent) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function loader(_: Route.LoaderArgs) {
  return json(
    {
      code: 405,
      message: "Method not allowed. Use POST /api/chat.",
      data: null,
    },
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

  const messages = parseMessages(body);
  const wantsStream =
    (typeof body === "object" &&
      body !== null &&
      (body as Record<string, unknown>).stream === true) ||
    request.headers.get("Accept")?.includes("text/event-stream");

  if (!messages) {
    return json(
      {
        code: 400,
        message:
          'Provide a non-empty "message" string or a non-empty "messages" array.',
        data: null,
      },
      { status: 400 },
    );
  }

  if (!isMoonshotConfigured()) {
    return json(
      {
        code: 503,
        message:
          "Kimi 国内站 API Key 尚未配置，请在服务端设置 MOONSHOT_API_KEY。",
        data: null,
      },
      { status: 503 },
    );
  }

  try {
    const conversation: ChatCompletionMessageParam[] =
      messages[0]?.role === "system"
        ? messages
        : [
            { role: "system", content: studyPlannerSystemPrompt },
            ...messages,
          ];
    const supportsThinkingSwitch =
      moonshotModel.startsWith("kimi-k2.6") ||
      moonshotModel.startsWith("kimi-k2.5");
    const fastChatMode = supportsThinkingSwitch
      ? { thinking: { type: "disabled" as const } }
      : {};

    if (wantsStream) {
      // This is the real Kimi stream. Every content delta is forwarded as soon
      // as Moonshot sends it, so the browser does not wait for the full answer.
      const completion = await client.chat.completions.create(
        {
          model: moonshotModel,
          messages: conversation,
          stream: true,
          ...fastChatMode,
        } as ChatCompletionCreateParamsStreaming & {
          thinking?: { type: "disabled" };
        },
      );
      const encoder = new TextEncoder();
      let cancelled = false;

      request.signal.addEventListener(
        "abort",
        () => {
          cancelled = true;
          completion.controller.abort();
        },
        { once: true },
      );

      const responseStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let finishReason: string | null = null;

          try {
            for await (const chunk of completion) {
              if (cancelled) return;

              const choice = chunk.choices[0];
              const content = choice?.delta.content;

              if (content) {
                controller.enqueue(
                  encodeStreamEvent(encoder, { type: "delta", content }),
                );
              }

              if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
              }
            }

            if (!cancelled) {
              controller.enqueue(
                encodeStreamEvent(encoder, { type: "done", finishReason }),
              );
            }
          } catch (error) {
            if (!cancelled) {
              controller.enqueue(
                encodeStreamEvent(encoder, {
                  type: "error",
                  message: apiErrorDetails(error).message,
                }),
              );
            }
          } finally {
            if (!cancelled) controller.close();
          }
        },
        cancel() {
          cancelled = true;
          completion.controller.abort();
        },
      });

      return new Response(responseStream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-store, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const completion = await client.chat.completions.create({
      model: moonshotModel,
      messages: conversation,
      ...fastChatMode,
    } as ChatCompletionCreateParamsNonStreaming & {
      thinking?: { type: "disabled" };
    });
    const choice = completion.choices[0];

    return json({
      code: 0,
      message: "success",
      data: {
        id: completion.id,
        model: completion.model,
        content: choice?.message.content ?? "",
        finishReason: choice?.finish_reason ?? null,
        usage: completion.usage ?? null,
      },
    });
  } catch (error) {
    const { status, message } = apiErrorDetails(error);

    return json(
      { code: status, message, data: null },
      { status },
    );
  }
}
