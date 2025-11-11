import {
  SearchRequest,
  SearchResponse,
  Chunk,
  Document,
  SearchResultChunkSchema
} from "@kb/shared-schemas";
import { VectorClient } from "./vector";

export interface HybridRetrieverConfig {
  alpha?: number;
  beta?: number;
  gamma?: number;
  delta?: number;
  epsilon?: number;
  zeta?: number;
}

export interface ChunkRecord {
  chunk: Chunk;
  document: Pick<Document, "docId" | "title" | "sourceUri">;
  topicLabels?: string[];
  neighbors?: Chunk[];
  createdAt?: string;
}

export interface ChunkRepository {
  searchCandidates(request: SearchRequest): Promise<ChunkRecord[]>;
}

export interface HybridRetrieverDeps {
  vectorClient: VectorClient;
  repo: ChunkRepository;
  config?: HybridRetrieverConfig;
}

const defaultWeights: Required<HybridRetrieverConfig> = {
  alpha: 0.55,
  beta: 0.25,
  gamma: 0.1,
  delta: 0.05,
  epsilon: 0.03,
  zeta: 0.02
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

export class HybridRetriever {
  private readonly vectorClient: VectorClient;
  private readonly repo: ChunkRepository;
  private readonly weights: Required<HybridRetrieverConfig>;

  constructor(deps: HybridRetrieverDeps) {
    this.vectorClient = deps.vectorClient;
    this.repo = deps.repo;
    this.weights = { ...defaultWeights, ...deps.config };
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const candidates = await this.repo.searchCandidates(request);
    if (!candidates.length) {
      return { query: request.query, total: 0, results: [] };
    }

    const queryVector = normalizeVector((await this.vectorClient.embedText(request.query))[0].vector);
    const chunkTexts = candidates.map((record) => record.chunk.contentText ?? "");
    const chunkVectors = (await this.vectorClient.embedText(chunkTexts)).map((result) =>
      normalizeVector(result.vector)
    );

    const scored = candidates.map((record, index) => {
      const similarity = cosineSimilarity(queryVector, chunkVectors[index]);
      const keyword = keywordScore(request.query, record.chunk);
      const hierarchy = hierarchyScore(record.chunk, request.filters);
      const recency = recencyScore(record);
      const topic = topicScore(record, request.filters);
      const neighbors = neighborScore(record);

      const score =
        this.weights.alpha * similarity +
        this.weights.beta * keyword +
        this.weights.gamma * hierarchy +
        this.weights.delta * recency +
        this.weights.epsilon * topic +
        this.weights.zeta * neighbors;

      return { record, score: Number(score.toFixed(6)) };
    });

    const sorted = scored.sort((a, b) => b.score - a.score).slice(0, request.limit ?? 10);
    const results = sorted.map((item) =>
      SearchResultChunkSchema.parse({
        chunk: item.record.chunk,
        score: item.score,
        neighbors: request.includeNeighbors ? item.record.neighbors : undefined
      })
    );

    return { query: request.query, total: results.length, results };
  }
}

export class InMemoryChunkRepository implements ChunkRepository {
  constructor(private readonly data: ChunkRecord[]) {}

  async searchCandidates(_request: SearchRequest): Promise<ChunkRecord[]> {
    return this.data;
  }
}
