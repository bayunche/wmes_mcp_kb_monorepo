import { describe, expect, test } from "bun:test";
import { VectorClient } from "../vector";

describe("VectorClient", () => {
  test("produces deterministic text embeddings without remote endpoint", async () => {
    const client = new VectorClient({ fallbackDim: 4 });
    const [first] = await client.embedText("Hello");
    const [second] = await client.embedText("Hello");
    expect(first.vector).toEqual(second.vector);
    expect(first.vector).toHaveLength(4);
  });

  test("calls remote text endpoint when provided", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (_url, _init) =>
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3], model: "remote" }]
        })
      )) as typeof fetch;

    const client = new VectorClient({
      textEndpoint: "https://api.example.com/embed",
      apiKey: "secret"
    });

    const [result] = await client.embedText("demo");
    expect(result.vector).toEqual([0.1, 0.2, 0.3]);
    expect(result.model).toBe("remote");

    globalThis.fetch = previousFetch;
  });

  test("rerank fallback scores documents by length", async () => {
    const client = new VectorClient();
    const scores = await client.rerank("query", ["短文本", "包含更多字符的文本"]);
    expect(scores[1]).toBeGreaterThan(scores[0]);
  });
});
