import OpenAI from "openai";
import { QueryRewrite } from "@kb/shared-schemas";

export interface QueryTransformer {
  rewrite(query: string): Promise<QueryRewrite>;
}

export interface SemanticRerankerInput {
  id: string;
  text: string;
  title?: string;
}

export interface SemanticReranker {
  rerank(query: string, documents: SemanticRerankerInput[]): Promise<number[]>;
}

export interface OpenAiClientConfig {
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
}

function sanitizeText(input: string | undefined | null, max = 400): string {
  if (!input) return "";
  const stripped = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return stripped.slice(0, max);
}

export class OpenAIQueryTransformer implements QueryTransformer {
  private readonly client: OpenAI;
  private readonly modelName: string;

  constructor(config: OpenAiClientConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.modelName = config.modelName;
  }

  async rewrite(query: string): Promise<QueryRewrite> {
    const trimmed = query.trim();
    if (!trimmed.length) {
      return { original: query, rewritten: query };
    }
    const completion = await this.client.chat.completions.create({
      model: this.modelName,
      temperature: 0,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content:
            "你是检索前的查询改写器，请将用户查询转换为语义清晰、包含核心实体/意图的短句，用于向量检索和 BM25。禁止增加无关信息。仅输出改写后的查询文本。"
        },
        { role: "user", content: trimmed }
      ]
    });
    const rewritten = completion.choices?.[0]?.message?.content?.trim();
    return {
      original: query,
      rewritten: rewritten && rewritten.length > 0 ? rewritten : query,
      model: this.modelName
    };
  }
}

export class OpenAISemanticReranker implements SemanticReranker {
  private readonly client: OpenAI;
  private readonly modelName: string;

  constructor(config: OpenAiClientConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.modelName = config.modelName;
  }

  async rerank(query: string, documents: SemanticRerankerInput[]): Promise<number[]> {
    if (!documents.length) return [];
    const compactDocs = documents
      .map(
        (doc, index) =>
          `#${index} ${doc.title ?? ""}\n${sanitizeText(doc.text, 600)}`
      )
      .join("\n\n");
    const completion = await this.client.chat.completions.create({
      model: this.modelName,
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "你是检索结果语义重排器。请依据查询相关性为候选片段打分（0-1，越高越相关），输出 JSON 对象 {\"scores\":[number,...]}，scores 顺序与输入编号一致，不要返回其它文字。"
        },
        {
          role: "user",
          content: `查询：${sanitizeText(query, 400)}\n候选列表：\n${compactDocs}\n请仅输出 JSON。`
        }
      ]
    });
    const content = completion.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(content) as { scores?: unknown };
      if (Array.isArray(parsed.scores)) {
        return parsed.scores.map((value) => (typeof value === "number" ? value : 0));
      }
    } catch {
      // fall through
    }
    const fallback = documents.map((doc) => Math.min(1, sanitizeText(doc.text, 100).length / 500));
    return fallback;
  }
}
