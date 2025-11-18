import { describe, expect, test } from "bun:test";
import {
  DocumentSchema,
  ChunkSchema,
  SearchRequestSchema,
  IngestionTaskSchema,
  KnowledgeBundleSchema
} from "../index";

describe("@kb/shared-schemas", () => {
  test("document schema accepts minimal payload", () => {
    const result = DocumentSchema.safeParse({
      docId: crypto.randomUUID(),
      title: "示例文档",
      ingestStatus: "uploaded",
      tenantId: "default"
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.libraryId).toBe("default");
    }
  });

  test("chunk schema requires hierarchy path", () => {
    const result = ChunkSchema.safeParse({
      chunkId: crypto.randomUUID(),
      docId: crypto.randomUUID(),
      hierPath: ["章节一", "小节 A"],
      contentType: "text"
    });
    expect(result.success).toBe(true);
  });

  test("search request enforces limit constraints", () => {
    const valid = SearchRequestSchema.safeParse({ query: "付款节点", limit: 5 });
    expect(valid.success).toBe(true);

    const invalid = SearchRequestSchema.safeParse({ query: "付款节点", limit: 200 });
    expect(invalid.success).toBe(false);
  });

  test("ingestion task defaults priority and retryCount", () => {
    const parsed = IngestionTaskSchema.parse({
      jobId: crypto.randomUUID(),
      docId: crypto.randomUUID(),
      tenantId: "tenant-x"
    });
    expect(parsed.priority).toBe(5);
    expect(parsed.retryCount).toBe(0);
    expect(parsed.libraryId).toBe("default");
  });

  test("knowledge bundle nests document and chunks", () => {
    const parsed = KnowledgeBundleSchema.parse({
      document: {
        docId: crypto.randomUUID(),
        title: "合同",
        ingestStatus: "indexed",
        tenantId: "default"
      },
      chunks: [
        {
          chunkId: crypto.randomUUID(),
          docId: crypto.randomUUID(),
          hierPath: ["第 1 章"],
          contentType: "text"
        }
      ]
    });
    expect(parsed.chunks).toHaveLength(1);
  });
});
