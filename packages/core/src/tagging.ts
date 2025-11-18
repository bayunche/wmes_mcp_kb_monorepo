import { ModelProvider } from "@kb/shared-schemas";

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
    return requestOpenAi(config, prompt, limit, fetchImpl);
  }
  return requestOllama(config, prompt, limit, fetchImpl);
}

async function requestOpenAi(
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
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是文本标签生成器。仅以 JSON 对象 {\"tags\": [\"标签1\", ...]} 返回，不要附加解释。"
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`OpenAI tagging failed (${response.status})`);
  }
  const payload = (await response.json()) as JsonRecord;
  const content = (((payload.choices as JsonRecord[] | undefined)?.[0]?.message as JsonRecord | undefined)?.content ?? "") as string;
  return normalizeTags(parseTags(content), limit);
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
    .map((snippet) => snippet.replace(/\s+/g, " ").slice(0, 420))
    .slice(0, 6)
    .map((snippet, index) => `${index + 1}. ${snippet}`)
    .join("\n");
  const knownTags = input.tags?.length ? input.tags.join("，") : "无";
  const language = input.language ?? "zh";
  return `语言: ${language}\n标题: ${input.title}\n已有标签: ${knownTags}\n正文片段:\n${snippets}\n\n请重新总结 ${limit} 个标签，越精炼越好，按照重要性排序。仅输出 JSON {"tags":[...]}。`;
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
