import {
  SearchRequest,
  SearchResponse,
  Chunk,
  Document,
  SearchResultChunkSchema,
  QueryRewrite
} from "@kb/shared-schemas";
import { VectorClient } from "./vector";
import type { QueryTransformer, SemanticReranker } from "./semantic-ranking";

export interface HybridRetrieverConfig {
  alpha?: number;
  beta?: number;
  gamma?: number;
  delta?: number;
  epsilon?: number;
  zeta?: number;
  semanticWeight?: number;
}

export interface ChunkRecord {
  chunk: Chunk;
  document: Pick<Document, "docId" | "title" | "sourceUri" | "tags" | "ingestStatus" | "libraryId" | "tenantId">;
  topicLabels?: string[];
  neighbors?: Chunk[];
  createdAt?: string;
  bm25Score?: number;
}

export interface ChunkRepository {
  searchCandidates(request: SearchRequest, queryVector: number[]): Promise<ChunkRecord[]>;
  get(chunkId: string): Promise<ChunkRecord | null>;
  listByDocument?(docId: string): Promise<ChunkRecord[]>;
  listByLibrary?(libraryId: string, options?: { docId?: string; limit?: number }): Promise<ChunkRecord[]>;
  updateTopicLabels?(chunkId: string, labels: string[]): Promise<void>;
  updateMetadata?(
    chunkId: string,
    payload: {
      topicLabels?: string[];
      semanticTags?: string[];
      topics?: string[];
      keywords?: string[];
      contextSummary?: string;
      semanticTitle?: string;
      parentSectionPath?: string[];
      bizEntities?: string[];
      envLabels?: string[];
      nerEntities?: Array<{ name: string; type?: string }>;
    }
  ): Promise<void>;
}

export interface HybridRetrieverDeps {
  vectorClient: VectorClient;
  repo: ChunkRepository;
  queryTransformer?: QueryTransformer;
  semanticReranker?: SemanticReranker;
  config?: HybridRetrieverConfig;
}

const defaultWeights: Required<HybridRetrieverConfig> = {
  alpha: 0.55,
  beta: 0.25,
  gamma: 0.1,
  delta: 0.05,
  epsilon: 0.03,
  zeta: 0.02,
  semanticWeight: 0
};

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  const dot = a.reduce((sum, value, idx) => sum + value * b[idx], 0);
  return Number(dot.toFixed(6));
}

function keywordScore(query: string, chunk: Chunk): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = chunk.contentText?.toLowerCase() ?? "";
  if (!terms.length || !text.length) return 0;
  const matches = terms.reduce((sum, term) => (text.includes(term) ? sum + 1 : sum), 0);
  return matches / terms.length;
}

function hierarchyScore(chunk: Chunk, filters?: SearchRequest["filters"]) {
  if (!filters?.hierarchyPrefix?.length) return 0;
  const prefix = filters.hierarchyPrefix.join("/").toLowerCase();
  const path = chunk.hierPath.join("/").toLowerCase();
  return path.startsWith(prefix) ? 1 : 0;
}

function recencyScore(record: ChunkRecord) {
  if (!record.createdAt) return 0;
  const diff = Date.now() - Date.parse(record.createdAt);
  const days = diff / (1000 * 60 * 60 * 24);
  return Number((1 / (1 + days / 30)).toFixed(6));
}

function topicScore(record: ChunkRecord, filters?: SearchRequest["filters"]) {
  if (!filters?.topicLabels?.length) return 0;
  const labels = new Set((record.topicLabels ?? []).map((label) => label.toLowerCase()));
  const matches = filters.topicLabels.filter((label) => labels.has(label.toLowerCase()));
  return matches.length ? matches.length / filters.topicLabels.length : 0;
}

function neighborScore(record: ChunkRecord) {
  if (!record.neighbors?.length) return 0;
  return Math.min(record.neighbors.length * 0.05, 0.2);
}

function normalizeScores(scores: number[]): number[] {
  if (!scores.length) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) {
    return scores.map(() => 0.5);
  }
  return scores.map((value) => Number(((value - min) / (max - min)).toFixed(6)));
}

export class HybridRetriever {
  private readonly vectorClient: VectorClient;
  private readonly repo: ChunkRepository;
  private readonly weights: Required<HybridRetrieverConfig>;
  private readonly queryTransformer?: QueryTransformer;
  private readonly semanticReranker?: SemanticReranker;

  constructor(deps: HybridRetrieverDeps) {
    this.vectorClient = deps.vectorClient;
    this.repo = deps.repo;
    this.weights = { ...defaultWeights, ...deps.config };
    this.queryTransformer = deps.queryTransformer;
    this.semanticReranker = deps.semanticReranker;
  }

  async search(
    request: SearchRequest,
    overrides?: {
      queryTransformer?: QueryTransformer;
      semanticReranker?: SemanticReranker;
      semanticWeight?: number;
    }
  ): Promise<SearchResponse> {
    const activeQueryTransformer = overrides?.queryTransformer ?? this.queryTransformer;
    const activeSemanticReranker = overrides?.semanticReranker ?? this.semanticReranker;
    const semanticWeightRaw =
      overrides?.semanticWeight ?? this.weights.semanticWeight ?? defaultWeights.semanticWeight;
    const semanticWeight = Math.max(0, Math.min(1, semanticWeightRaw));

    let queryRewrite: QueryRewrite | undefined;
    let effectiveQuery = request.query;
    if (activeQueryTransformer) {
      try {
        const rewritten = await activeQueryTransformer.rewrite(request.query);
        if (rewritten.rewritten?.trim()) {
          queryRewrite = rewritten;
          effectiveQuery = rewritten.rewritten.trim();
        }
      } catch (error) {
        // ignore rewrite failures, fall back to original query
        console.warn("Query rewrite failed", error);
      }
    }

    const queryVector = normalizeVector((await this.vectorClient.embedText(effectiveQuery))[0].vector);
    const candidates = await this.repo.searchCandidates({ ...request, query: effectiveQuery }, queryVector);
    if (!candidates.length) {
      return { query: request.query, total: 0, results: [] };
    }

    const chunkTexts = candidates.map((record) => record.chunk.contentText ?? "");
    const chunkVectors = (await this.vectorClient.embedText(chunkTexts)).map((result) =>
      normalizeVector(result.vector)
    );

    const bm25Scores = normalizeScores(candidates.map((record) => record.bm25Score ?? 0));

    const rerankTexts = candidates.map((record) => record.chunk.contentText ?? "");
    const rerankRaw = rerankTexts.length ? await this.vectorClient.rerank(effectiveQuery, rerankTexts) : [];
    const rerankScores = normalizeScores(rerankRaw);

    const scored = candidates.map((record, index) => {
      const similarity = cosineSimilarity(queryVector, chunkVectors[index]);
      const keyword = keywordScore(effectiveQuery, record.chunk);
      const keywordOrBm25 = bm25Scores[index] > 0 ? bm25Scores[index] : keyword;
      const hierarchy = hierarchyScore(record.chunk, request.filters);
      const recency = recencyScore(record);
      const topic = topicScore(record, request.filters);
      const neighbors = neighborScore(record);

      const hybridScore =
        this.weights.alpha * similarity +
        this.weights.beta * keywordOrBm25 +
        this.weights.gamma * hierarchy +
        this.weights.delta * recency +
        this.weights.epsilon * topic +
        this.weights.zeta * neighbors;

      const rerankBoost = rerankScores.length ? rerankScores[index] ?? 0 : 0;
      const baseScore = 0.6 * hybridScore + 0.4 * rerankBoost;

      return { record, score: Number(baseScore.toFixed(6)), hybridScore };
    });

    let semanticBoosts: number[] = [];
    if (activeSemanticReranker && semanticWeight > 0) {
      try {
        const semanticScores = await activeSemanticReranker.rerank(
          effectiveQuery,
          scored.map((item, idx) => ({
            id: item.record.chunk.chunkId ?? String(idx),
            text: item.record.chunk.contentText ?? "",
            title: item.record.chunk.sectionTitle ?? item.record.document.title ?? ""
          }))
        );
        semanticBoosts = normalizeScores(semanticScores);
      } catch (error) {
        console.warn("Semantic rerank failed", error);
        semanticBoosts = [];
      }
    }

    const scoredWithSemantic = scored.map((item, index) => {
      const semanticBoost = semanticBoosts.length ? semanticBoosts[index] ?? 0 : 0;
      const blendedScore =
        semanticWeight > 0
          ? (1 - semanticWeight) * item.score + semanticWeight * semanticBoost
          : item.score;
      return { ...item, score: Number(blendedScore.toFixed(6)) };
    });

    const sorted = scoredWithSemantic.sort((a, b) => b.score - a.score).slice(0, request.limit ?? 10);
    const results = sorted.map((item) =>
      SearchResultChunkSchema.parse({
        chunk: item.record.chunk,
        score: item.score,
        neighbors: request.includeNeighbors ? item.record.neighbors : undefined,
        document: item.record.document
      })
    );

    return {
      query: request.query,
      total: results.length,
      results,
      queryRewrite,
      semanticRerankApplied: Boolean(activeSemanticReranker && semanticWeight > 0)
    };
  }
}

export class InMemoryChunkRepository implements ChunkRepository {
  constructor(private readonly data: ChunkRecord[]) {}

  async searchCandidates(_request: SearchRequest, _queryVector: number[]): Promise<ChunkRecord[]> {
    return this.data;
  }

  async get(chunkId: string): Promise<ChunkRecord | null> {
    return this.data.find((record) => record.chunk.chunkId === chunkId) ?? null;
  }

  async listByDocument(docId: string): Promise<ChunkRecord[]> {
    return this.data.filter((record) => record.chunk.docId === docId);
  }
}
