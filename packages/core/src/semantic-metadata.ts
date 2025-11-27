import OpenAI from "openai";
import { SemanticMetadataSchema, type SemanticMetadata, ModelProvider } from "@kb/shared-schemas";

export interface SemanticMetadataModelConfig {
  provider: ModelProvider;
  baseUrl: string;
  modelName: string;
  apiKey?: string;
}

export interface SemanticMetadataInput {
  title: string;
  chunkText: string;
  hierPath: string[];
  tags?: string[];
  language?: string;
  envLabels?: string[];
  sectionTitle?: string;
  parentPath?: string[];
  parentSectionTitle?: string;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function sanitizeText(input: string | undefined | null): string {
  if (!input) return "";
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export async function generateSemanticMetadataViaModel(
  config: SemanticMetadataModelConfig,
  input: SemanticMetadataInput,
  fetchImpl: FetchLike = fetch
): Promise<SemanticMetadata> {
  const prompt = buildPrompt(input);
  const raw =
    config.provider === "openai"
      ? await requestOpenAi(config, prompt)
      : await requestOllama(config, prompt, fetchImpl);
  try {
    const parsed = SemanticMetadataSchema.parse(raw);
    return sanitizeMetadata(parsed);
  } catch {
    const fallback = SemanticMetadataSchema.parse({
      title: input.sectionTitle ?? input.hierPath.at(-1),
      contextSummary: summarize(input.chunkText),
      semanticTags: input.tags?.slice(0, 5)?.map(sanitizeText),
      topics: input.tags?.slice(0, 3)?.map(sanitizeText),
      keywords: extractKeywords(input.chunkText),
      envLabels: input.envLabels?.slice(0, 3)?.map(sanitizeText),
      parentSectionPath: input.parentPath
    });
    return sanitizeMetadata(fallback);
  }
}

async function requestOpenAi(config: SemanticMetadataModelConfig, prompt: string) {
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
          "你是企业知识库的语义摘要与标签生成器。请输出 JSON 对象，包含 title, contextSummary(<=240字符), semanticTags(<=5), topics(<=5), keywords(<=10), envLabels(<=3), bizEntities(<=5), entities(<=5), parentSectionPath。"
      },
      { role: "user", content: prompt }
    ]
  });
  const content =
    (completion.choices?.[0]?.message?.content as string | null | undefined) ??
    JSON.stringify({ contextSummary: summarize(prompt) });
  return normalizeSemanticResponse(content);
}

async function requestOllama(
  config: SemanticMetadataModelConfig,
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
      prompt: `${prompt}\n\n请仅输出 JSON 对象 {"title":...,"contextSummary":...,"semanticTags":[],...}`,
      stream: false
    })
  });
  if (!response.ok) {
    throw new Error(`Semantic metadata request failed (${response.status})`);
  }
  const payload = (await response.json()) as { response?: string; output?: string };
  const raw = payload.response ?? payload.output ?? "{}";
  return normalizeSemanticResponse(raw);
}

function buildPrompt(input: SemanticMetadataInput) {
  const tags = input.tags?.length ? input.tags.map(sanitizeText).join("，") : "无";
  const env = input.envLabels?.length ? input.envLabels.map(sanitizeText).join("，") : "未知";
  const chunk = sanitizeText(input.chunkText).slice(0, 2000);
  return `文档标题: ${sanitizeText(input.title)}
层级路径: ${input.hierPath.map(sanitizeText).join(" > ")}
当前段标题: ${sanitizeText(input.sectionTitle ?? "未知")}
父段标题: ${sanitizeText(input.parentSectionTitle ?? "顶层")}
已有标签: ${tags}
环境标签: ${env}
语言: ${input.language ?? "zh"}
段落内容:
${chunk}

请基于上述信息输出一个 JSON 对象，字段包括:
- title
- contextSummary (<=240 字符)
- semanticTags (<=5)
- topics (<=5)
- keywords (<=10)
- envLabels (<=3)
- bizEntities (<=5)
- entities: NER 列表 [{name,type}]
- parentSectionPath: 路径数组`;
}

function normalizeSemanticResponse(raw: string): SemanticMetadata {
  const content = extractJson(raw);
  const parsed = typeof content === "string" ? safeParseJson(content) : content;
  return sanitizeMetadata(SemanticMetadataSchema.parse(parsed));
}

function extractJson(payload: string): string {
  const fenced = payload.match(/```(?:json)?([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : payload.trim();
}

function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return { contextSummary: summarize(raw) };
  }
}

function summarize(text: string) {
  return sanitizeText(text).replace(/\s+/g, " ").slice(0, 240);
}

function extractKeywords(text: string) {
  const tokens = sanitizeText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token);
      keywords.push(token);
    }
    if (keywords.length >= 8) {
      break;
    }
  }
  return keywords;
}

function sanitizeMetadata(meta: SemanticMetadata): SemanticMetadata {
  return {
    ...meta,
    title: sanitizeText(meta.title),
    contextSummary: sanitizeText(meta.contextSummary),
    semanticTags: meta.semanticTags?.map(sanitizeText),
    topics: meta.topics?.map(sanitizeText),
    keywords: meta.keywords?.map(sanitizeText),
    envLabels: meta.envLabels?.map(sanitizeText),
    bizEntities: meta.bizEntities?.map(sanitizeText),
    entities: meta.entities?.map((e) => ({
      name: sanitizeText((e as any).name),
      type: sanitizeText((e as any).type)
    })),
    parentSectionPath: meta.parentSectionPath?.map(sanitizeText)
  };
}
