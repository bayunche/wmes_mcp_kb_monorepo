import { describe, expect, test } from "bun:test";
import { HybridRetriever, InMemoryChunkRepository, ChunkRecord } from "../retrieval";
import { ChunkSchema, DocumentSchema } from "@kb/shared-schemas";
import { QueryTransformer, SemanticReranker } from "../semantic-ranking";
import { VectorClient } from "../vector";
import { randomUUID } from "node:crypto";

class StubVectorClient extends VectorClient {
  override async embedText(input: string | Array<string>): Promise<Array<{ vector: number[]; model: string }>> {
    const values = Array.isArray(input) ? input : [input];
    return values.map((_, index) => {
      if (index === 0) {
        return { vector: [1, 0], model: "stub" };
      }
      return { vector: [0.1, 0.9], model: "stub" };
    });
  }

  override async rerank(_query: string, documents: string[]): Promise<number[]> {
    return documents.map((_, index) => (index === 0 ? 0.2 : 0.1));
  }
}

class StubQueryTransformer implements QueryTransformer {
  async rewrite(query: string) {
    return { original: query, rewritten: "支付条款" };
  }
}

class StubSemanticReranker implements SemanticReranker {
  async rerank(_query: string, documents: Array<{ id: string; text: string }>) {
    return documents.map((_, index) => (index === 0 ? 0.1 : 0.9));
  }
}

describe("HybridRetriever with query rewrite and semantic rerank", () => {
  test("applies query rewrite and reorders by semantic rerank weight", async () => {
    const doc = DocumentSchema.parse({
      docId: randomUUID(),
      title: "示例文档",
      ingestStatus: "indexed",
      tenantId: "default",
      libraryId: "default"
    });

    const records: ChunkRecord[] = [
      {
        chunk: ChunkSchema.parse({
          chunkId: randomUUID(),
          docId: doc.docId,
          hierPath: ["合同", "付款"],
          contentText: "第一条付款说明",
          contentType: "text"
        }),
        document: {
          docId: doc.docId,
          title: doc.title,
          sourceUri: "kb://doc/1",
          tenantId: doc.tenantId,
          libraryId: doc.libraryId,
          ingestStatus: doc.ingestStatus,
          tags: doc.tags
        },
        neighbors: [],
        bm25Score: 1
      },
      {
        chunk: ChunkSchema.parse({
          chunkId: randomUUID(),
          docId: doc.docId,
          hierPath: ["合同", "支付"],
          contentText: "第二条支付条款，包含更详细的描述",
          contentType: "text"
        }),
        document: {
          docId: doc.docId,
          title: doc.title,
          sourceUri: "kb://doc/1",
          tenantId: doc.tenantId,
          libraryId: doc.libraryId,
          ingestStatus: doc.ingestStatus,
          tags: doc.tags
        },
        neighbors: [],
        bm25Score: 0.1
      }
    ];

    const retriever = new HybridRetriever({
      vectorClient: new StubVectorClient(),
      repo: new InMemoryChunkRepository(records),
      config: { semanticWeight: 0.6 }
    });

    const result = await retriever.search(
      { query: "付款条款", limit: 2, includeNeighbors: false },
      {
        queryTransformer: new StubQueryTransformer(),
        semanticReranker: new StubSemanticReranker(),
        semanticWeight: 0.6
      }
    );

    expect(result.queryRewrite?.rewritten).toBe("支付条款");
    expect(result.semanticRerankApplied).toBe(true);
    expect(result.results[0].chunk.chunkId).toBe(records[1].chunk.chunkId);
    expect(result.results[1].chunk.chunkId).toBe(records[0].chunk.chunkId);
  });
});
