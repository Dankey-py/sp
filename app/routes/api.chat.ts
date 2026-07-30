import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

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

    const completion = await client.chat.completions.create({
      model: moonshotModel,
      messages: conversation,
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
    if (error instanceof OpenAI.APIError) {
      const status = error.status || 502;
      const message =
        status === 401
          ? "Kimi 国内站 API Key 无效，请确认该 Key 创建于 platform.kimi.com。"
          : error.message;

      return json(
        {
          code: status,
          message,
          data: null,
        },
        { status },
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "无法连接 Kimi 国内站 API。";

    return json(
      { code: 500, message, data: null },
      { status: 500 },
    );
  }
}
