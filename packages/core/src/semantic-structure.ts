import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { ModelProvider } from "@kb/shared-schemas";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SemanticStructureConfig {
  provider: ModelProvider;
  baseUrl: string;
  modelName: string;
  apiKey?: string;
}

export interface SemanticStructureInput {
  title: string;
  text: string;
  language?: string;
  maxSections?: number;
}

export interface SemanticSection {
  id: string;
  title: string;
  content: string;
  level?: number;
  path?: string[];
}

function sanitizeText(input: string | undefined | null): string {
  if (!input) return "";
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export async function generateStructureViaModel(
  config: SemanticStructureConfig,
  input: SemanticStructureInput,
  fetchImpl: FetchLike = fetch
): Promise<SemanticSection[]> {
  const trimmed = sanitizeText(input.text).trim();
  if (!trimmed.length) {
    return [];
  }
  const normalizedText = trimmed.slice(0, 12000);
  const prompt = buildPrompt(sanitizeText(input.title), normalizedText, input.language, input.maxSections ?? 20);
  const raw =
    config.provider === "openai"
      ? await requestOpenAi(config, prompt)
      : await requestOllama(config, prompt, fetchImpl);
  return normalizeSections(raw, normalizedText);
}

async function requestOpenAi(config: SemanticStructureConfig, prompt: string) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl
  });
  const completion = await client.chat.completions.create({
    model: config.modelName,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是结构化文档分析器。请输出 JSON 对象 {\"sections\":[{\"title\":...,\"level\":1,\"path\":[...],\"content\":...}]}，最多20条。"
      },
      { role: "user", content: prompt }
    ]
  });
  const content =
    (completion.choices?.[0]?.message?.content as string | null | undefined) ?? "{}";
  return content;
}

async function requestOllama(
  config: SemanticStructureConfig,
  prompt: string,
  fetchImpl: FetchLike
) {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  const response = await fetchImpl(config.baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.modelName,
      prompt: `${prompt}\n\n仅输出 JSON 对象 {\"sections\": [...]}`,
      stream: false
    })
  });
  if (!response.ok) {
    throw new Error(`Ollama structure request failed (${response.status})`);
  }
  const payload = (await response.json()) as { response?: string; output?: string };
  return payload.response ?? payload.output ?? "{}";
}

function buildPrompt(title: string, text: string, language = "zh", limit: number) {
  return `文档标题: ${title}
语言: ${language}
正文(截断):
${text}

请分析全文的章/节/小节层级，并输出不超过 ${limit} 条 section。每条包含:
- title: 标题
- level: 层级数字
- path: 标题路径数组
- content: 该节内容（可截断）

仅输出 JSON 对象 {"sections":[...]}。`;
}

function normalizeSections(raw: string, fallbackText: string): SemanticSection[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(extractJson(raw)) : raw;
    const sections = Array.isArray(parsed.sections)
      ? parsed.sections
      : Array.isArray(parsed)
        ? parsed
        : [];
    if (!Array.isArray(sections) || !sections.length) {
      return fallbackSections(fallbackText);
    }
    return sections
      .map((section, index) => normalizeSection(section, index))
      .filter((section): section is SemanticSection => Boolean(section));
  } catch {
    return fallbackSections(fallbackText);
  }
}

function normalizeSection(section: unknown, index: number): SemanticSection | null {
  if (!section || typeof section !== "object") {
    return null;
  }
  const record = section as Record<string, unknown>;
  const title =
    typeof record.title === "string" && record.title.trim().length
      ? sanitizeText(record.title.trim())
      : `Section ${index + 1}`;
  const content =
    typeof record.content === "string" && record.content.trim().length
      ? sanitizeText(record.content.trim())
      : undefined;
  if (!content) {
    return null;
  }
  const level = typeof record.level === "number" ? record.level : undefined;
  const path = Array.isArray(record.path)
    ? (record.path as unknown[])
        .map((item) => sanitizeText(String(item)))
        .filter((item) => item.trim().length)
    : undefined;
  return {
    id: randomUUID(),
    title,
    content,
    level,
    path
  };
}

function extractJson(payload: string) {
  const fenced = payload.match(/```(?:json)?([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : payload.trim();
}

function fallbackSections(text: string): SemanticSection[] {
  const cleaned = sanitizeText(text.trim());
  if (!cleaned.length) {
    return [];
  }
  return [
    {
      id: randomUUID(),
      title: "全文",
      content: cleaned,
      level: 1,
      path: []
    }
  ];
}
