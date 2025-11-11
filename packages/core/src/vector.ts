import { TextEncoder } from "node:util";

export interface EmbeddingPayload {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface VectorClientOptions {
  textEndpoint?: string;
  rerankEndpoint?: string;
  imageEndpoint?: string;
  apiKey?: string;
  fallbackDim?: number;
  textModelName?: string;
  rerankerModelName?: string;
  imageModelName?: string;
  logger?: {
    debug?: (message: string, payload?: unknown) => void;
    warn?: (message: string, payload?: unknown) => void;
  };
}

export interface EmbeddingResult {
  vector: number[];
  model: string;
}

const encoder = new TextEncoder();

function deterministicVector(value: string, dim: number): number[] {
  const bytes = encoder.encode(value);
  const vector = Array(dim).fill(0);
  bytes.forEach((byte, index) => {
    vector[index % dim] += byte / 255;
  });
  return vector.map((num) => Number(num.toFixed(6)));
}

async function callRemote<T>(endpoint: string, apiKey: string | undefined, payload: unknown): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Remote vector endpoint failed (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

function normalizeEmbeddingResponse(
  result: unknown,
  fallbackModel: string
): EmbeddingResult[] {
  if (Array.isArray(result)) {
    return result.map((item) => ({
      vector: (item as { vector?: number[]; embedding?: number[] }).vector ??
        (item as { vector?: number[]; embedding?: number[] }).embedding ??
        [],
      model: (item as { model?: string }).model ?? fallbackModel
    }));
  }

  if (result && typeof result === "object") {
    const data = (result as { data?: unknown[] }).data;
    if (Array.isArray(data)) {
      return data.map((item) => ({
        vector: (item as { vector?: number[]; embedding?: number[] }).vector ??
          (item as { vector?: number[]; embedding?: number[] }).embedding ??
          [],
        model: (item as { model?: string }).model ?? fallbackModel
      }));
    }

    const vector = (result as { vector?: number[]; embedding?: number[] }).vector ??
      (result as { vector?: number[]; embedding?: number[] }).embedding;
    if (Array.isArray(vector)) {
      return [{ vector, model: (result as { model?: string }).model ?? fallbackModel }];
    }
  }

  throw new Error("Unable to normalize embedding response");
}

export class VectorClient {
  private readonly textEndpoint?: string;
  private readonly rerankEndpoint?: string;
  private readonly imageEndpoint?: string;
  private readonly apiKey?: string;
  private readonly fallbackDim: number;
  private readonly textModel: string;
  private readonly rerankerModel: string;
  private readonly imageModel: string;
  private readonly logger: VectorClientOptions["logger"];

  constructor(options: VectorClientOptions = {}) {
    this.textEndpoint = options.textEndpoint;
    this.rerankEndpoint = options.rerankEndpoint;
    this.imageEndpoint = options.imageEndpoint;
    this.apiKey = options.apiKey;
    this.fallbackDim = options.fallbackDim ?? 8;
    this.textModel = options.textModelName ?? "bge-m3";
    this.rerankerModel = options.rerankerModelName ?? "bge-reranker-v2";
    this.imageModel = options.imageModelName ?? "openclip-vit-b-32";
    this.logger = options.logger ?? {};
  }

  async embedText(input: string | EmbeddingPayload | Array<string | EmbeddingPayload>): Promise<EmbeddingResult[]> {
    const values = Array.isArray(input) ? input : [input];
    const normalized = values.map((item) =>
      typeof item === "string" ? { text: item } : item
    );

    if (this.textEndpoint) {
      const payload = { input: normalized };
      this.logger.debug?.("Calling remote text endpoint", payload);
      const response = await callRemote(this.textEndpoint, this.apiKey, payload);
      return normalizeEmbeddingResponse(response, this.textModel);
    }

    return normalized.map((item) => ({
      vector: deterministicVector(item.text, this.fallbackDim),
      model: this.textModel
    }));
  }

  async rerank(query: string, documents: string[]): Promise<number[]> {
    if (this.rerankEndpoint) {
      this.logger.debug?.("Calling remote reranker endpoint", { query, documents });
      const response = await callRemote<{ scores: number[] }>(
        this.rerankEndpoint,
        this.apiKey,
        { query, documents }
      );
      if (!Array.isArray(response.scores)) {
        throw new Error("Invalid reranker response");
      }
      return response.scores;
    }

    return documents.map((doc) => doc.length * 0.01);
  }

  async embedImage(bytes: Uint8Array): Promise<EmbeddingResult> {
    if (this.imageEndpoint) {
      const payload = { image: Array.from(bytes) };
      this.logger.debug?.("Calling remote image endpoint", { length: bytes.length });
      const response = await callRemote(this.imageEndpoint, this.apiKey, payload);
      const [result] = normalizeEmbeddingResponse(response, this.imageModel);
      return result;
    }

    const checksum = bytes.reduce((sum, value) => sum + value, 0);
    const vector = deterministicVector(String(checksum), this.fallbackDim);
    return { vector, model: this.imageModel };
  }
}

export function createVectorClientFromEnv(): VectorClient {
  return new VectorClient({
    textEndpoint: process.env.TEXT_EMBEDDING_ENDPOINT,
    rerankEndpoint: process.env.RERANK_ENDPOINT,
    imageEndpoint: process.env.IMAGE_EMBEDDING_ENDPOINT,
    apiKey: process.env.VECTOR_API_KEY,
    fallbackDim: Number(process.env.VECTOR_FALLBACK_DIM ?? "8")
  });
}
