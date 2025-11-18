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

export async function generateSemanticMetadataViaModel(
  config: SemanticMetadataModelConfig,
  input: SemanticMetadataInput,
  fetchImpl: FetchLike = fetch
): Promise<SemanticMetadata> {
  const prompt = buildPrompt(input);
  const raw =
    config.provider === "openai"
      ? await requestOpenAi(config, prompt, fetchImpl)
      : await requestOllama(config, prompt, fetchImpl);
  try {
    return SemanticMetadataSchema.parse(raw);
  } catch {
    return SemanticMetadataSchema.parse({
      title: input.sectionTitle ?? input.hierPath.at(-1),
      contextSummary: summarize(input.chunkText),
      semanticTags: input.tags?.slice(0, 5),
      topics: input.tags?.slice(0, 3),
      keywords: extractKeywords(input.chunkText),
      envLabels: input.envLabels?.slice(0, 3),
      parentSectionPath: input.parentPath
    });
  }
}

async function requestOpenAi(
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
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是企业知识库的语义摘要助手。根据段落生成 JSON 对象，字段包括 contextSummary(<=240字)、semanticTags(最多5个)、envLabels(最多3个)、bizEntities(最多5个)。"
        },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`Semantic metadata request failed (${response.status})`);
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content =
    payload.choices?.[0]?.message?.content ?? JSON.stringify({ contextSummary: summarize(prompt) });
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
      prompt: `${prompt}\n\n仅输出 JSON 结构。`,
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
  const tags = input.tags?.length ? input.tags.join("，") : "无";
  const env = input.envLabels?.length ? input.envLabels.join("，") : "未知";
  return `文档标题: ${input.title}
章节路径: ${input.hierPath.join(" > ")}
段落所属章节: ${input.sectionTitle ?? "未知"}
父章节: ${input.parentSectionTitle ?? "顶层"}
已有标签: ${tags}
环境标签: ${env}
语言: ${input.language ?? "zh"}
段落内容:
${input.chunkText.slice(0, 2000)}

请基于以上信息输出一个 JSON 对象，包含字段:
- title: 段落标题
- contextSummary: 段落摘要 (<=240 字)
- semanticTags: 标签数组 (<=5)
- topics: 主题分类数组 (<=5)
- keywords: 关键词数组 (<=10)
- envLabels: 环境标签 (<=3)
- bizEntities: 业务实体 (<=5)
- entities: NER 实体数组 [{name,type}]
- parentSectionPath: 父章节路径数组
`;
}

function normalizeSemanticResponse(raw: string): SemanticMetadata {
  const content = extractJson(raw);
  const parsed = typeof content === "string" ? safeParseJson(content) : content;
  return SemanticMetadataSchema.parse(parsed);
}

function extractJson(payload: string): string {
  const fenced = payload.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }
  return payload.trim();
}

function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return { contextSummary: summarize(raw) };
  }
}

function summarize(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 240);
}

function extractKeywords(text: string) {
  const tokens = text
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
