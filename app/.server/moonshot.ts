import OpenAI from "openai";

const DEFAULT_MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";

export function isMoonshotConfigured() {
  return Boolean(process.env.MOONSHOT_API_KEY?.trim());
}

function getMoonshotApiKey() {
  const apiKey = process.env.MOONSHOT_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Moonshot API key is not configured. Set MOONSHOT_API_KEY in the server environment.",
    );
  }

  return apiKey;
}

/**
 * Kimi 国内开放平台的 OpenAI 兼容客户端。该模块仅在服务端加载，
 * MOONSHOT_API_KEY 不会进入浏览器构建产物。
 */
export const client = new OpenAI({
  apiKey: async () => getMoonshotApiKey(),
  baseURL: process.env.MOONSHOT_BASE_URL || DEFAULT_MOONSHOT_BASE_URL,
});

export const moonshotModel = process.env.MOONSHOT_MODEL || "kimi-k2.6";

export const studyPlannerSystemPrompt =
  process.env.MOONSHOT_SYSTEM_PROMPT ||
  "你是 Kimi，由 Moonshot AI 提供的人工智能学习助手。你擅长使用中文和英文帮助学生制定清晰、可执行的学习计划，解释知识点并设计练习。回答应准确、简洁且有条理。Moonshot AI 为专有名词，不可翻译。";
