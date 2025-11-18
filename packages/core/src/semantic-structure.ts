import { randomUUID } from "node:crypto";
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

export async function generateStructureViaModel(
  config: SemanticStructureConfig,
  input: SemanticStructureInput,
  fetchImpl: FetchLike = fetch
): Promise<SemanticSection[]> {
  const trimmed = input.text.trim();
  if (!trimmed.length) {
    return [];
  }
  const normalizedText = trimmed.slice(0, 12000);
  const prompt = buildPrompt(input.title, normalizedText, input.language, input.maxSections ?? 20);
  const raw =
    config.provider === "openai"
      ? await requestOpenAi(config, prompt, fetchImpl)
      : await requestOllama(config, prompt, fetchImpl);
  return normalizeSections(raw, normalizedText);
}

async function requestOpenAi(
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
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是结构化文档分析器。请输出 JSON 对象 {\"sections\":[{\"title\":...,\"level\":1,\"path\":[...],\"content\":...}]}，最多 20 条。"
        },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`OpenAI structure request failed (${response.status})`);
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content ?? "{}";
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
      prompt: `${prompt}\n\n只输出 JSON 对象 {\"sections\": [...]}`,
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
  return `文档标题: ${title}\n语言: ${language}\n正文(截断):\n${text}\n\n请分析整篇文档的章节结构，输出不超过 ${limit} 个 section，包含 title/level/path/content，JSON 格式。`;
}

function normalizeSections(raw: string, fallbackText: string): SemanticSection[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(extractJson(raw)) : raw;
    const sections = Array.isArray(parsed.sections) ? parsed.sections : Array.isArray(parsed) ? parsed : [];
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
  const title = typeof record.title === "string" && record.title.trim().length ? record.title.trim() : `Section ${index + 1}`;
  const content = typeof record.content === "string" && record.content.trim().length ? record.content.trim() : undefined;
  if (!content) {
    return null;
  }
  const level = typeof record.level === "number" ? record.level : undefined;
  const path = Array.isArray(record.path)
    ? (record.path as unknown[]).map((item) => String(item)).filter((item) => item.trim().length)
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
  const cleaned = text.trim();
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
