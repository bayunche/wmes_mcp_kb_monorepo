import { ModelProvider } from "@kb/shared-schemas";
import OpenAI from "openai";

export interface TagModelConfig {
  provider: ModelProvider;
  baseUrl: string;
  modelName: string;
  apiKey?: string;
}

export interface TagModelInput {
  title: string;
  tags?: string[];
  snippets: string[];
  language?: string;
  limit?: number;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type JsonRecord = Record<string, unknown>;

function sanitizeText(input: string | undefined | null): string {
  if (!input) return "";
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export async function generateTagsViaModel(
  config: TagModelConfig,
  input: TagModelInput,
  fetchImpl: FetchLike = fetch
): Promise<string[]> {
  const limit = input.limit ?? 8;
  if (!config.baseUrl || !config.modelName) {
    return [];
  }
  const prompt = buildPrompt(input, limit);
  if (config.provider === "openai") {
    return requestOpenAi(config, prompt, limit);
  }
  return requestOllama(config, prompt, limit, fetchImpl);
}

async function requestOpenAi(
  config: TagModelConfig,
  prompt: string,
  limit: number
): Promise<string[]> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl
  });
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: config.modelName,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a text tag generator. Only return JSON {\"tags\": [\"tag1\", ...]} with no explanation."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });
      const content =
        (completion.choices?.[0]?.message?.content as string | null | undefined) ?? "";
      return normalizeTags(parseTags(content), limit);
    } catch (error) {
      const err = error as any;
      const status = err?.status ?? err?.response?.status;
      const body = err?.response?.data ?? err?.responseBody ?? err?.message;
      lastError = new Error(`OpenAI tagging failed (${status ?? "unknown"}) [attempt ${attempt} base=${config.baseUrl} model=${config.modelName}]: ${JSON.stringify(body)?.slice(0, 500)}`);
      if (attempt === 2) {
        throw lastError;
      }
    }
  }
  throw lastError ?? new Error("OpenAI tagging failed: unknown error");
}

async function requestOllama(
  config: TagModelConfig,
  prompt: string,
  limit: number,
  fetchImpl: FetchLike
): Promise<string[]> {
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
      prompt,
      stream: false
    })
  });
  if (!response.ok) {
    throw new Error(`Ollama tagging failed (${response.status})`);
  }
  const payload = (await response.json()) as JsonRecord;
  const raw = (payload.response as string | undefined) ?? (payload.output as string | undefined) ?? "";
  return normalizeTags(parseTags(raw), limit);
}

function buildPrompt(input: TagModelInput, limit: number): string {
  const snippets = input.snippets
    .filter((snippet) => snippet && snippet.trim().length)
    .map((snippet) => sanitizeText(snippet).replace(/\s+/g, " ").slice(0, 420))
    .slice(0, 6)
    .map((snippet, index) => `${index + 1}. ${snippet}`)
    .join("\n");
  const knownTags = input.tags?.length
    ? input.tags.map((t) => sanitizeText(t)).join("�?)
    : "�?;
  const language = input.language ?? "zh";
  return `语言: ${language}\n标题: ${sanitizeText(
    input.title
  )}\n已有标签: ${knownTags}\n正文片段:\n${snippets}\n\n请重新总结 ${limit} 个标签，越短越好，按重要性排序，仅输�?JSON {"tags":[...]}.`;
}

function parseTags(raw: string): string[] {
  if (!raw) return [];
  let content = raw.trim();
  const fenced = content.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced) {
    content = fenced[1].trim();
  }
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.map(String);
    }
    if (parsed && typeof parsed === "object") {
      const tags = (parsed as JsonRecord).tags;
      if (Array.isArray(tags)) {
        return tags.map(String);
      }
    }
  } catch {
    // fall through
  }
  return content
    .split(/\n|,/)
    .map((line) => line.replace(/^[-*\d\.\s]+/, "").trim())
    .filter(Boolean);
}

function normalizeTags(tags: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const cleaned = tag.trim();
    if (!cleaned.length) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}


