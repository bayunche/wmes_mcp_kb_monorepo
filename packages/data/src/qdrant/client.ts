import type { VectorIndex } from "../types";

export interface QdrantVectorIndexOptions {
  url: string;
  collection: string;
  apiKey?: string;
}

export class QdrantVectorIndex implements VectorIndex {
  constructor(private readonly options: QdrantVectorIndexOptions) {}

  async upsert(
    chunks: Array<{ chunkId: string; vector: number[]; payload: Record<string, unknown> }>
  ): Promise<void> {
    if (!chunks.length) return;
    const body = {
      points: chunks.map((chunk) => ({
        id: chunk.chunkId,
        vector: chunk.vector,
        payload: chunk.payload
      }))
    };

    await this.request(`/collections/${this.options.collection}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify(body)
    }).then(async (res) => {
      if (!res.ok) {
        throw new Error(`Qdrant upsert failed (${res.status})`);
      }
    });
  }

  async search(
    queryVector: number[],
    limit: number
  ): Promise<Array<{ chunkId: string; score: number }>> {
    const body = {
      vector: queryVector,
      limit
    };
    const response = await this.request(`/collections/${this.options.collection}/points/search`, {
      method: "POST",
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`Qdrant search failed (${response.status})`);
    }
    const data = (await response.json()) as {
      result?: Array<{ id: string | { uuid: string }; score: number }>;
    };
    return (
      data.result?.map((item) => ({
        chunkId: typeof item.id === "string" ? item.id : item.id.uuid,
        score: item.score
      })) ?? []
    );
  }

  async deleteByChunkIds(chunkIds: string[]): Promise<void> {
    if (!chunkIds.length) return;
    const body = {
      points: chunkIds
    };
    const response = await this.request(
      `/collections/${this.options.collection}/points/delete?wait=true`,
      {
        method: "POST",
        body: JSON.stringify(body)
      }
    );
    if (!response.ok) {
      throw new Error(`Qdrant delete failed (${response.status})`);
    }
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(init.headers as Record<string, string>)
    };
    if (this.options.apiKey) {
      headers["api-key"] = this.options.apiKey;
    }
    const url = new URL(path, this.options.url);
    return fetch(url, { ...init, headers });
  }
}
