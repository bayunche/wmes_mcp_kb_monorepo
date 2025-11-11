import { HybridRetriever } from "../../packages/core/src/retrieval";
import { InMemoryApiRepository } from "./repository/in-memory";
import {
  DocumentSchema,
  SearchRequestSchema,
  SearchResponseSchema
} from "@kb/shared-schemas";

export interface ApiRoutesDeps {
  repo: InMemoryApiRepository;
  retriever: HybridRetriever;
}

export async function handleRequest(
  request: Request,
  deps: ApiRoutesDeps
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/documents") {
    return Response.json({ items: deps.repo.listDocuments() });
  }

  if (request.method === "POST" && url.pathname === "/documents") {
    const payload = await request.json();
    const doc = DocumentSchema.parse(payload);
    deps.repo.saveDocument(doc);
    return new Response(JSON.stringify(doc), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  }

  const documentMatch = url.pathname.match(/^\/documents\/(.+)/);
  if (request.method === "PATCH" && documentMatch) {
    const docId = documentMatch[1];
    const body = await request.json();
    if (!Array.isArray(body.tags)) {
      return new Response("tags is required", { status: 400 });
    }
    const updated = deps.repo.updateDocumentTags(docId, body.tags);
    if (!updated) {
      return new Response("Not Found", { status: 404 });
    }
    return Response.json(updated);
  }

  if (request.method === "POST" && url.pathname === "/search") {
    const body = await request.json();
    const parsed = SearchRequestSchema.parse(body);
    const result = await deps.retriever.search(parsed);
    return new Response(JSON.stringify(SearchResponseSchema.parse(result)), {
      headers: { "content-type": "application/json" }
    });
  }

  const chunkMatch = url.pathname.match(/^\/chunks\/(.+)/);
  if (request.method === "GET" && chunkMatch) {
    const chunkId = chunkMatch[1];
    const record = deps.repo.findChunk(chunkId);
    if (!record) {
      return new Response("Not Found", { status: 404 });
    }
    return Response.json(record);
  }

  return new Response("Not Found", { status: 404 });
}
