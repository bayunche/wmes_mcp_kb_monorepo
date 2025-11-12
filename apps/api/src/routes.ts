import { HybridRetriever } from "../../packages/core/src/retrieval";
import type {
  AttachmentRepository,
  DocumentRepository,
  ObjectStorage,
  QueueAdapter,
  VectorIndex
} from "@kb/data";
import type { ChunkRepository } from "@kb/core/src/retrieval";
import {
  Attachment,
  DocumentSchema,
  SearchRequestSchema,
  SearchResponseSchema
} from "@kb/shared-schemas";

export interface ApiRoutesDeps {
  documents: DocumentRepository;
  chunks: ChunkRepository;
  attachments: AttachmentRepository;
  queue: QueueAdapter;
  retriever: HybridRetriever;
  storage?: ObjectStorage;
  vectorIndex?: VectorIndex;
  defaultTenantId: string;
}

export async function handleRequest(request: Request, deps: ApiRoutesDeps): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/documents") {
    const tenantParam = url.searchParams.get("tenantId") ?? undefined;
    const tenantId = resolveTenant(request, deps.defaultTenantId, tenantParam ?? undefined);
    const items = await deps.documents.list(tenantId);
    return Response.json({ items });
  }

  if (request.method === "POST" && url.pathname === "/documents") {
    const payload = await request.json();
    const doc = DocumentSchema.parse(payload);
    const tenantId = resolveTenant(request, deps.defaultTenantId, doc.tenantId);
    const saved = await deps.documents.upsert({ ...doc, tenantId });
    await enqueueIngestion(deps.queue, saved.docId, tenantId);
    return json(saved, 201);
  }

  if (request.method === "POST" && url.pathname === "/upload") {
    return handleUpload(request, deps);
  }

  const reindexMatch = url.pathname.match(/^\/documents\/([^/]+)\/reindex$/);
  if (request.method === "POST" && reindexMatch) {
    return handleReindexDocument(request, deps, reindexMatch[1]);
  }

  const documentMatch = url.pathname.match(/^\/documents\/([^/]+)$/);
  if (documentMatch) {
    const docId = documentMatch[1];
    if (request.method === "PATCH") {
      return handleTagUpdate(request, deps, docId);
    }
    if (request.method === "DELETE") {
      return handleDeleteDocument(request, deps, docId);
    }
  }

  if (request.method === "GET" && url.pathname === "/stats") {
    const tenantParam = url.searchParams.get("tenantId") ?? undefined;
    const tenantId = resolveTenant(request, deps.defaultTenantId, tenantParam ?? undefined);
    const stats = await deps.documents.stats(tenantId);
    return json(stats);
  }

  if (request.method === "POST" && url.pathname === "/search") {
    const body = await request.json();
    const parsed = SearchRequestSchema.parse(body);
    const tenantId = resolveTenant(request, deps.defaultTenantId, parsed.filters?.tenantId);
    const searchFilters = { ...parsed.filters, tenantId };
    const result = await deps.retriever.search({ ...parsed, filters: searchFilters });
    const chunkIds = result.results.map((item) => item.chunk.chunkId);
    const attachments = chunkIds.length ? await deps.attachments.listByChunkIds(chunkIds) : [];
    const attachmentMap = groupAttachments(attachments);
    const filteredResults = result.results
      .map((item) => {
        if (
          searchFilters.contentTypes?.length &&
          !searchFilters.contentTypes.includes(item.chunk.contentType)
        ) {
          return null;
        }
        const chunkAttachments = attachmentMap.get(item.chunk.chunkId) ?? [];
        if (searchFilters.hasAttachments && chunkAttachments.length === 0) {
          return null;
        }
        if (
          searchFilters.attachmentTypes?.length &&
          !chunkAttachments.some((att) => searchFilters.attachmentTypes?.includes(att.assetType))
        ) {
          return null;
        }
        return {
          ...item,
          attachments: chunkAttachments,
          sourceUri: `kb://chunk/${item.chunk.chunkId}`
        };
      })
      .filter((item): item is typeof result.results[number] & { attachments: Attachment[] } => Boolean(item));

    const payload = SearchResponseSchema.parse({
      query: result.query,
      total: filteredResults.length,
      results: filteredResults
    });
    return json(payload);
  }

  const chunkMatch = url.pathname.match(/^\/chunks\/(.+)/);
  if (request.method === "GET" && chunkMatch) {
    const chunkId = chunkMatch[1];
    const record = await deps.chunks.get(chunkId);
    if (!record) {
      return new Response("Not Found", { status: 404 });
    }
    return Response.json(record);
  }

  return new Response("Not Found", { status: 404 });
}

async function handleUpload(request: Request, deps: ApiRoutesDeps): Promise<Response> {
  if (!deps.storage) {
    return new Response("Storage not configured", { status: 500 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return new Response("file is required", { status: 400 });
  }
  const explicitTenant = form.get("tenantId");
  const tenantId = resolveTenant(
    request,
    deps.defaultTenantId,
    typeof explicitTenant === "string" ? explicitTenant : undefined
  );
  const docId = crypto.randomUUID();
  const extension = guessExtension(file);
  const objectKey = buildRawObjectKey(tenantId, docId, extension);
  const buffer = new Uint8Array(await file.arrayBuffer());
  await deps.storage.putRawObject(objectKey, buffer, file.type || undefined);

  const tagsField = [...form.getAll("tags"), ...form.getAll("tags[]")];
  const tags =
    tagsField.length === 0
      ? undefined
      : tagsField.flatMap((value) =>
          typeof value === "string" && value.length ? value.split(",").map((tag) => tag.trim()) : []
        ).filter(Boolean);

  const docPayload = DocumentSchema.parse({
    docId,
    title: (form.get("title") as string) ?? file.name ?? docId,
    sourceUri: objectKey,
    mimeType: file.type || undefined,
    sizeBytes: file.size,
    ingestStatus: "uploaded",
    tenantId,
    tags,
    createdAt: new Date().toISOString()
  });
  const saved = await deps.documents.upsert(docPayload);
  await enqueueIngestion(deps.queue, docId, tenantId);
  return json(saved, 201);
}

async function handleTagUpdate(request: Request, deps: ApiRoutesDeps, docId: string) {
  const body = await request.json();
  if (!Array.isArray(body.tags)) {
    return new Response("tags is required", { status: 400 });
  }
  const updated = await deps.documents.updateTags(docId, body.tags);
  if (!updated) {
    return new Response("Not Found", { status: 404 });
  }
  return Response.json(updated);
}

async function handleDeleteDocument(request: Request, deps: ApiRoutesDeps, docId: string) {
  const doc = await deps.documents.get(docId);
  if (!doc) {
    return new Response("Not Found", { status: 404 });
  }
  const tenantId = resolveTenant(request, deps.defaultTenantId);
  if (doc.tenantId && doc.tenantId !== tenantId) {
    return new Response("Forbidden", { status: 403 });
  }

  const chunkRecords = (await deps.chunks.listByDocument?.(docId)) ?? [];
  const chunkIds = chunkRecords.map((record) => record.chunk.chunkId);
  const attachments = await deps.attachments.listByDocument(docId);

  if (deps.storage) {
    if (doc.sourceUri) {
      await deps.storage.deleteRawObject(doc.sourceUri);
    }
    const previewPrefix = doc.tenantId ? buildPreviewPrefix(doc.tenantId, docId) : undefined;
    const supportsPrefixDeletion =
      Boolean(previewPrefix) && typeof deps.storage.deletePreviewPrefix === "function";
    if (supportsPrefixDeletion && previewPrefix) {
      await deps.storage.deletePreviewPrefix!(previewPrefix);
    }
    const fallbackKeys =
      supportsPrefixDeletion && previewPrefix
        ? attachments
            .map((attachment) => attachment.objectKey)
            .filter((key) => !key.startsWith(previewPrefix))
        : attachments.map((attachment) => attachment.objectKey);
    if (fallbackKeys.length) {
      await Promise.all(fallbackKeys.map((key) => deps.storage!.deletePreviewObject(key)));
    }
  }

  await deps.attachments.deleteByDocId(docId);
  if (chunkIds.length) {
    await deps.vectorIndex?.deleteByChunkIds(chunkIds);
  }
  await deps.documents.delete(docId);
  return new Response(null, { status: 204 });
}

async function handleReindexDocument(request: Request, deps: ApiRoutesDeps, docId: string) {
  const doc = await deps.documents.get(docId);
  if (!doc) {
    return new Response("Not Found", { status: 404 });
  }
  const tenantId = resolveTenant(request, doc.tenantId ?? deps.defaultTenantId);
  if (doc.tenantId && doc.tenantId !== tenantId) {
    return new Response("Forbidden", { status: 403 });
  }
  await enqueueIngestion(deps.queue, doc.docId, tenantId);
  return json({ status: "queued", docId });
}

async function enqueueIngestion(queue: QueueAdapter, docId: string, tenantId: string) {
  await queue.enqueue({
    jobId: crypto.randomUUID(),
    docId,
    tenantId
  });
}

function guessExtension(file: File) {
  const name = file.name ?? "";
  const match = name.match(/\.([a-zA-Z0-9]+)$/);
  if (match) {
    return match[1];
  }
  const mime = file.type ?? "";
  if (mime.includes("/")) {
    return mime.split("/")[1];
  }
  return "bin";
}

function buildRawObjectKey(tenantId: string, docId: string, extension: string) {
  return `${tenantId}/${docId}/source.${extension}`;
}

function buildPreviewPrefix(tenantId: string, docId: string) {
  return `${tenantId}/${docId}/`;
}

function resolveTenant(request: Request, fallback: string, explicit?: string | null) {
  if (typeof explicit === "string") {
    const trimmed = explicit.trim();
    if (trimmed.length) {
      return trimmed;
    }
  }
  const header = request.headers.get("x-tenant-id")?.trim();
  if (header && header.length) {
    return header;
  }
  return fallback;
}

function groupAttachments(attachments: Attachment[]) {
  const map = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    if (!attachment.chunkId) continue;
    const current = map.get(attachment.chunkId) ?? [];
    current.push(attachment);
    map.set(attachment.chunkId, current);
  }
  return map;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
