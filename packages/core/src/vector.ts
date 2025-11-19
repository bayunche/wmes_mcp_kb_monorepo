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
  enableLocalModels?: boolean;
  localTextModelId?: string;
  localImageModelId?: string;
  localRerankerModelId?: string;
  modelCacheDir?: string;
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

function normalizeEmbeddingResponse(result: unknown, fallbackModel: string): EmbeddingResult[] {
  if (Array.isArray(result)) {
    return result.map((item) => ({
      vector:
        (item as { vector?: number[]; embedding?: number[] }).vector ??
        (item as { vector?: number[]; embedding?: number[] }).embedding ??
        [],
      model: (item as { model?: string }).model ?? fallbackModel
    }));
  }

  if (result && typeof result === "object") {
    const data = (result as { data?: unknown[] }).data;
    if (Array.isArray(data)) {
      return data.map((item) => ({
        vector:
          (item as { vector?: number[]; embedding?: number[] }).vector ??
          (item as { vector?: number[]; embedding?: number[] }).embedding ??
          [],
        model: (item as { model?: string }).model ?? fallbackModel
      }));
    }

    const vector =
      (result as { vector?: number[]; embedding?: number[] }).vector ??
      (result as { vector?: number[]; embedding?: number[] }).embedding;
    if (Array.isArray(vector)) {
      return [{ vector, model: (result as { model?: string }).model ?? fallbackModel }];
    }
  }

  throw new Error("Unable to normalize embedding response");
}

function normalizeLocalVector(output: unknown): number[] {
  if (!output) return [];
  if (Array.isArray(output)) {
    if (typeof output[0] === "number") {
      return output as number[];
    }
    return (output as unknown[]).flatMap((value) => normalizeLocalVector(value));
  }

  if (output instanceof Float32Array || output instanceof Float64Array) {
    return Array.from(output);
  }

  const tensor = output as { data?: unknown };
  if (tensor?.data) {
    return normalizeLocalVector(tensor.data);
  }

  return [];
}

type TransformersPipeline = (input: unknown, options?: Record<string, unknown>) => Promise<unknown>;

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
  private readonly localModelsEnabled: boolean;
  private readonly localTextModelId?: string;
  private readonly localImageModelId?: string;
  private readonly localRerankerModelId?: string;
  private readonly modelCacheDir?: string;
  private textPipelinePromise?: Promise<TransformersPipeline>;
  private imagePipelinePromise?: Promise<TransformersPipeline>;
  private rerankPipelinePromise?: Promise<TransformersPipeline>;

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
    this.localModelsEnabled = options.enableLocalModels ?? false;
    this.localTextModelId = options.localTextModelId;
    this.localImageModelId = options.localImageModelId;
    this.localRerankerModelId = options.localRerankerModelId;
    this.modelCacheDir = options.modelCacheDir;
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

    if (this.localModelsEnabled) {
      const results = await this.embedTextLocally(normalized.map((item) => item.text));
      if (results.length === normalized.length) {
        return results;
      }
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
    if (this.localModelsEnabled) {
      const scores = await this.rerankLocally(query, documents);
      if (scores.length) {
        return scores;
      }
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

    if (this.localModelsEnabled) {
      const result = await this.embedImageLocally(bytes);
      if (result) {
        return result;
      }
    }

    const checksum = bytes.reduce((sum, value) => sum + value, 0);
    const vector = deterministicVector(String(checksum), this.fallbackDim);
    return { vector, model: this.imageModel };
  }

  private async embedTextLocally(texts: string[]): Promise<EmbeddingResult[]> {
    if (!texts.length) return [];
    try {
      const pipeline = await this.loadTextPipeline();
      const results: EmbeddingResult[] = [];
      for (const text of texts) {
        const output = await pipeline(text, { pooling: "mean", normalize: true });
        const vector = normalizeLocalVector(output);
        if (!vector.length) {
          return [];
        }
        results.push({
          vector,
          model: this.localTextModelId ?? this.textModel
        });
      }
      return results;
    } catch (error) {
      this.logger.warn?.(
        "Local text embedding failed",
        error instanceof Error ? error.message : error
      );
      return [];
    }
  }

  private async embedImageLocally(bytes: Uint8Array): Promise<EmbeddingResult | null> {
    try {
      const pipeline = await this.loadImagePipeline();
      const output = await pipeline(bytes, { pooling: "mean", normalize: true });
      const vector = normalizeLocalVector(output);
      if (!vector.length) {
        return null;
      }
      return {
        vector,
        model: this.localImageModelId ?? this.imageModel
      };
    } catch (error) {
      this.logger.warn?.(
        "Local image embedding failed",
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  private async loadTextPipeline() {
    if (!this.textPipelinePromise) {
      this.textPipelinePromise = this.loadPipeline(
        "feature-extraction",
        this.localTextModelId ?? this.textModel
      );
    }
    return this.textPipelinePromise;
  }

  private async loadImagePipeline() {
    if (!this.imagePipelinePromise) {
      this.imagePipelinePromise = this.loadPipeline(
        "feature-extraction",
        this.localImageModelId ?? this.imageModel
      );
    }
    return this.imagePipelinePromise;
  }

  private async loadRerankPipeline() {
    if (!this.rerankPipelinePromise) {
      this.rerankPipelinePromise = this.loadPipeline(
        "text-classification",
        this.localRerankerModelId ?? this.rerankerModel
      );
    }
    return this.rerankPipelinePromise;
  }

  private async rerankLocally(query: string, documents: string[]): Promise<number[]> {
    if (!documents.length) return [];
    try {
      const pipeline = await this.loadRerankPipeline();
      const scores: number[] = [];
      for (const doc of documents) {
        const output = await pipeline(
          { text: query, text_pair: doc },
          { topk: 1, function_to_apply: "none" }
        );
        const parsed = this.parseRerankScore(output);
        scores.push(parsed ?? 0);
      }
      return scores;
    } catch (error) {
      this.logger.warn?.(
        "Local reranker failed",
        error instanceof Error ? error.message : error
      );
      return [];
    }
  }

  private parseRerankScore(output: unknown): number | undefined {
    if (Array.isArray(output)) {
      const first = output[0];
      if (first && typeof first === "object" && "score" in first) {
        return Number((first as { score: number }).score);
      }
    }
    if (output && typeof output === "object" && "score" in output) {
      return Number((output as { score: number }).score);
    }
    return undefined;
  }

  private async loadPipeline(task: string, modelId: string): Promise<TransformersPipeline> {
    if (this.modelCacheDir && !process.env.TRANSFORMERS_CACHE) {
      process.env.TRANSFORMERS_CACHE = this.modelCacheDir;
    }
    const { pipeline } = await import("@xenova/transformers");
    return pipeline(task, modelId, { quantize: true });
  }
}

export function createVectorClientFromEnv(): VectorClient {
  return new VectorClient({
    textEndpoint: process.env.TEXT_EMBEDDING_ENDPOINT,
    rerankEndpoint: process.env.RERANK_ENDPOINT,
    imageEndpoint: process.env.IMAGE_EMBEDDING_ENDPOINT,
    apiKey: process.env.VECTOR_API_KEY,
    fallbackDim: Number(process.env.VECTOR_FALLBACK_DIM ?? "8"),
    enableLocalModels: parseBoolean(process.env.LOCAL_EMBEDDING_ENABLED),
    localTextModelId: process.env.LOCAL_TEXT_MODEL_ID ?? undefined,
    localImageModelId: process.env.LOCAL_IMAGE_MODEL_ID ?? undefined,
    localRerankerModelId: process.env.LOCAL_RERANK_MODEL_ID ?? undefined,
    modelCacheDir: process.env.MODELS_DIR
  });
}

function parseBoolean(value: string | undefined) {
  if (!value) return false;
  return ["true", "1", "yes"].includes(value.toLowerCase());
}
