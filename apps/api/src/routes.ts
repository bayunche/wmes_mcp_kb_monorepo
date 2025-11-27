import { Buffer } from "node:buffer";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { HybridRetriever } from "../../../packages/core/src/retrieval";
import type {
  AttachmentRepository,
  DocumentRepository,
  ModelSettingsRepository,
  ObjectStorage,
  QueueAdapter,
  VectorIndex,
  VectorLogRepository,
  TenantConfigRepository,
  LibraryConfigRepository
} from "@kb/data";
import type { ChunkRepository } from "@kb/core/src/retrieval";
import {
  Attachment,
  Chunk,
  DocumentSchema,
  ModelSettingInputSchema,
  ModelSettingSecret,
  ModelRoleSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  TenantConfigInputSchema,
  LibraryConfigInputSchema,
  RemoteModelRequestSchema
} from "@kb/shared-schemas";
import type { RemoteModelRequest } from "@kb/shared-schemas";
import { DbMcpRepository } from "../../mcp/src/repository/db";
import { createSearchTool } from "../../mcp/src/tools/search";
import { createRelatedTool } from "../../mcp/src/tools/related";
import { createPreviewTool } from "../../mcp/src/tools/preview";
import type { McpToolContext } from "../../mcp/src/types";
import { loadModelCatalog } from "./modelCatalog";
import {
  modelManifest,
  ensureModelArtifact,
  listModelStatuses,
  listExtraModelFiles,
  findArtifact
} from "../../../packages/tooling/src/models";

const STREAM_THRESHOLD_BYTES = (() => {
  const mb = Number(process.env.API_UPLOAD_STREAM_THRESHOLD_MB ?? "256");
  return mb * 1024 * 1024;
})();

export interface ApiRoutesDeps {
  documents: DocumentRepository;
  chunks: ChunkRepository;
  attachments: AttachmentRepository;
  queue: QueueAdapter;
  retriever: HybridRetriever;
  storage?: ObjectStorage;
  vectorIndex?: VectorIndex;
  defaultTenantId: string;
  defaultLibraryId: string;
  modelSettings?: ModelSettingsRepository;
  vectorLogs?: VectorLogRepository;
  tenantConfigs?: TenantConfigRepository;
  libraryConfigs?: LibraryConfigRepository;
  modelsDir: string;
}

export async function handleRequest(request: Request, deps: ApiRoutesDeps): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true });
  }

  const ingestionStatusMatch = url.pathname.match(/^\/ingestion\/([^/]+)\/status$/);
  if (request.method === "GET" && ingestionStatusMatch) {
    const docId = ingestionStatusMatch[1];
    const doc = await deps.documents.get(docId);
    if (!doc) {
      return new Response("Not Found", { status: 404 });
    }
    return json({
      docId,
      ingestStatus: doc.ingestStatus,
      errorMessage: doc.errorMessage ?? null,
      statusMeta: (doc as any).statusMeta ?? null
    });
  }

  if (request.method === "GET" && url.pathname === "/ingestion/queue") {
    if (!deps.documents.listWithStatus) {
      return new Response("Document repository does not support queue listing", { status: 501 });
    }
    const tenantParam = url.searchParams.get("tenantId") ?? undefined;
    const libraryParam = url.searchParams.get("libraryId") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);
    const tenantId = resolveTenant(request, deps.defaultTenantId, tenantParam ?? undefined);
    const libraryId = resolveLibrary(request, deps.defaultLibraryId, libraryParam ?? undefined);
    const docs = await deps.documents.listWithStatus(tenantId, libraryId, limit);
    const items = docs.map((doc) => buildQueueItem(doc));
    return json({ items, tenantId, libraryId, total: items.length });
  }

  if (request.method === "GET" && url.pathname === "/documents") {
    const tenantParam = url.searchParams.get("tenantId") ?? undefined;
    const libraryParam = url.searchParams.get("libraryId") ?? undefined;
    const tenantId = resolveTenant(request, deps.defaultTenantId, tenantParam ?? undefined);
    const libraryId = resolveLibrary(request, deps.defaultLibraryId, libraryParam ?? undefined);
    const items = await deps.documents.list(tenantId, libraryId);
    return Response.json({ items });
  }

  if (request.method === "POST" && url.pathname === "/documents") {
    const payload = await request.json();
    const doc = DocumentSchema.parse(payload);
    const tenantId = resolveTenant(request, deps.defaultTenantId, doc.tenantId);
    const libraryId = resolveLibrary(request, deps.defaultLibraryId, doc.libraryId);
    const saved = await deps.documents.upsert({ ...doc, tenantId, libraryId });
    await enqueueIngestion(deps.queue, saved.docId, tenantId, libraryId);
    return json(saved, 201);
  }

  if (url.pathname === "/config/tenants") {
    if (!deps.tenantConfigs) {
      return new Response("Tenant config repository not configured", { status: 501 });
    }
    if (request.method === "GET") {
      const items = await deps.tenantConfigs.list();
      return json({ items });
    }
    if (request.method === "PUT") {
      return handleUpsertTenant(request, deps);
    }
  }

  const deleteTenantMatch = url.pathname.match(/^\/config\/tenants\/([^/]+)$/);
  if (deleteTenantMatch && request.method === "DELETE") {
    if (!deps.tenantConfigs) {
      return new Response("Tenant config repository not configured", { status: 501 });
    }
    await deps.tenantConfigs.delete(deleteTenantMatch[1]);
    return new Response(null, { status: 204 });
  }

  if (url.pathname === "/config/libraries") {
    if (!deps.libraryConfigs) {
      return new Response("Library config repository not configured", { status: 501 });
    }
    if (request.method === "GET") {
      const tenantFilter = url.searchParams.get("tenantId") ?? undefined;
      const items = await deps.libraryConfigs.list(tenantFilter ?? undefined);
      return json({ items });
    }
    if (request.method === "PUT") {
      return handleUpsertLibrary(request, deps);
    }
  }

  const deleteLibraryMatch = url.pathname.match(/^\/config\/libraries\/([^/]+)$/);
  if (deleteLibraryMatch && request.method === "DELETE") {
    if (!deps.libraryConfigs) {
      return new Response("Library config repository not configured", { status: 501 });
    }
    await deps.libraryConfigs.delete(deleteLibraryMatch[1]);
    return new Response(null, { status: 204 });
  }

  if (request.method === "GET" && url.pathname === "/models") {
    const items = listModelStatuses(deps.modelsDir);
    const extras = listExtraModelFiles(deps.modelsDir);
    return json({ dir: deps.modelsDir, items, extras });
  }

  if (request.method === "POST" && url.pathname === "/models/install") {
    const payload = await request.json().catch(() => null);
    const identifier = payload?.name ?? payload?.filename;
    if (!identifier) {
      return new Response("name is required", { status: 400 });
    }
    const artifact = findArtifact(identifier);
    if (!artifact) {
      return new Response("Model not found", { status: 404 });
    }
    await ensureModelArtifact(deps.modelsDir, artifact);
    const item = listModelStatuses(deps.modelsDir).find((status) => status.name === artifact.name);
    return json({ item });
  }

  if (request.method === "POST" && url.pathname === "/upload") {
    return handleUpload(request, deps);
  }

  if (request.method === "GET" && url.pathname === "/model-settings/list") {
    if (!deps.modelSettings) {
      return new Response("Model settings repository not configured", { status: 501 });
    }
    const url = new URL(request.url);
    const tenantParam = url.searchParams.get("tenantId") ?? undefined;
    const libraryParam = url.searchParams.get("libraryId") ?? undefined;
    const tenantId = resolveTenant(request, deps.defaultTenantId, tenantParam);
    const libraryId = resolveLibrary(request, deps.defaultLibraryId, libraryParam);
    const items = await deps.modelSettings.list(tenantId, libraryId);
    return json({ items: items.map((item) => sanitizeModelSetting(item)) });
  }

  if (request.method === "GET" && url.pathname === "/model-settings/catalog") {
    const catalog = await loadModelCatalog();
    return json({ items: catalog });
  }

  if (request.method === "POST" && url.pathname === "/model-settings/models") {
    return handleFetchRemoteModels(request);
  }

  if (url.pathname === "/model-settings") {
    if (request.method === "GET") {
      return handleGetModelSettings(request, deps);
    }
    if (request.method === "PUT") {
      return handleSaveModelSettings(request, deps);
    }
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

  const documentChunksMatch = url.pathname.match(/^\/documents\/([^/]+)\/chunks$/);
  if (documentChunksMatch) {
    const docId = documentChunksMatch[1];
    if (!deps.chunks.listByDocument) {
      return new Response("Chunk repository does not support document listing", { status: 501 });
    }
    if (request.method === "GET") {
      return handleListDocumentChunks(request, deps, docId);
    }
  }

  const documentStructureMatch = url.pathname.match(/^\/documents\/([^/]+)\/structure$/);
  if (documentStructureMatch && request.method === "GET") {
    return handleGetDocumentStructure(request, deps, documentStructureMatch[1]);
  }

  if (request.method === "GET" && url.pathname === "/stats") {
    const tenantParam = url.searchParams.get("tenantId") ?? undefined;
    const libraryParam = url.searchParams.get("libraryId") ?? undefined;
    const tenantId = resolveTenant(request, deps.defaultTenantId, tenantParam ?? undefined);
    const libraryId = resolveLibrary(request, deps.defaultLibraryId, libraryParam ?? undefined);
    const stats = await deps.documents.stats(tenantId, libraryId);
    return json({ ...stats, tenantId, libraryId });
  }

  const libraryChunksMatch = url.pathname.match(/^\/libraries\/([^/]+)\/chunks$/);
  if (request.method === "GET" && libraryChunksMatch) {
    if (!deps.chunks.listByLibrary) {
      return new Response("Chunk repository does not support library listing", { status: 501 });
    }
    const libraryId = decodeURIComponent(libraryChunksMatch[1]);
    const tenantParam = url.searchParams.get("tenantId") ?? undefined;
    const tenantId = resolveTenant(request, deps.defaultTenantId, tenantParam ?? undefined);
    const docFilter = url.searchParams.get("docId") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);
    const records = await deps.chunks.listByLibrary(libraryId, {
      docId: docFilter ?? undefined,
      limit
    });
    const filtered = tenantId
      ? records.filter((record) => record.document.tenantId === tenantId)
      : records;
    const chunkIds = filtered.map((record) => record.chunk.chunkId);
    const attachments = chunkIds.length
      ? await deps.attachments.listByChunkIds(chunkIds)
      : [];
    const attachmentMap = groupAttachments(attachments);
    return json({
      libraryId,
      tenantId,
      total: filtered.length,
      items: filtered.map((record) => ({
        chunk: record.chunk,
        document: record.document,
        attachments: attachmentMap.get(record.chunk.chunkId) ?? []
      }))
    });
  }

  if (request.method === "POST" && url.pathname === "/search") {
    const body = await request.json();
    const parsed = SearchRequestSchema.parse(body);
    const tenantId = resolveTenant(request, deps.defaultTenantId, parsed.filters?.tenantId);
    const libraryId = resolveLibrary(request, deps.defaultLibraryId, parsed.filters?.libraryId);
    const searchFilters = { ...parsed.filters, tenantId, libraryId };
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
        if (searchFilters.semanticTags?.length) {
          const chunkTags = gatherSemanticTags(item.chunk);
          const matchesSemantic = searchFilters.semanticTags.some((tag) =>
            chunkTags.has(tag.toLowerCase())
          );
          if (!matchesSemantic) {
            return null;
          }
        }
        if (searchFilters.envLabels?.length) {
          const envLabels = gatherEnvLabels(item.chunk);
          const matchesEnv = searchFilters.envLabels.some((label) =>
            envLabels.has(label.toLowerCase())
          );
          if (!matchesEnv) {
            return null;
          }
        }
        if (searchFilters.metadataQuery) {
          if (!matchesMetadataQuery(item.chunk, searchFilters.metadataQuery)) {
            return null;
          }
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

  if (request.method === "POST" && url.pathname === "/mcp/search") {
    return handleMcpSearch(request, deps);
  }

  if (request.method === "POST" && url.pathname === "/mcp/related") {
    return handleMcpRelated(request, deps);
  }

  if (request.method === "POST" && url.pathname === "/mcp/preview") {
    return handleMcpPreview(request, deps);
  }

  if (request.method === "GET" && url.pathname === "/vector-logs") {
    if (!deps.vectorLogs) {
      return new Response("Vector log repository not configured", { status: 501 });
    }
    const tenantParam = url.searchParams.get("tenantId") ?? undefined;
    const libraryParam = url.searchParams.get("libraryId") ?? undefined;
    const docId = url.searchParams.get("docId") ?? undefined;
    const chunkId = url.searchParams.get("chunkId") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "100") || 100, 200);
    const tenantId = resolveTenant(request, deps.defaultTenantId, tenantParam);
    const libraryId = resolveLibrary(request, deps.defaultLibraryId, libraryParam);
    const items = await deps.vectorLogs.list({ docId, chunkId, tenantId, libraryId, limit });
    return json({ items, total: items.length, tenantId, libraryId });
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

  if (request.method === "PATCH" && chunkMatch) {
    return handleUpdateChunk(request, deps, chunkMatch[1]);
  }

  return new Response("Not Found", { status: 404 });
}

async function handleUpload(request: Request, deps: ApiRoutesDeps): Promise<Response> {
  if (!deps.storage) {
    return new Response("Storage not configured", { status: 500 });
  }
  const form = await request.formData();
  const files = collectFiles(form);
  if (!files.length) {
    return new Response("file is required", { status: 400 });
  }
  const explicitTenant = form.get("tenantId");
  const explicitLibrary = form.get("libraryId");
  const explicitTitle = typeof form.get("title") === "string" ? (form.get("title") as string) : undefined;
  const titleOverrides = collectTitleOverrides(form);
  const tenantId = resolveTenant(
    request,
    deps.defaultTenantId,
    typeof explicitTenant === "string" ? explicitTenant : undefined
  );
  const libraryId = resolveLibrary(
    request,
    deps.defaultLibraryId,
    typeof explicitLibrary === "string" ? explicitLibrary : undefined
  );
  const tags = parseTagsField(form);

  const results = [];
  for (const [index, file] of files.entries()) {
    const docId = crypto.randomUUID();
    const title =
      titleOverrides[index] ??
      (files.length === 1 ? explicitTitle : undefined) ??
      file.name ??
      `Doc ${docId}`;
    try {
      const extension = guessExtension(file);
      const objectKey = buildRawObjectKey(tenantId, docId, extension);
      await persistUploadedFile(file, objectKey, deps.storage);
      const docPayload = DocumentSchema.parse({
        docId,
        title,
        sourceUri: objectKey,
        mimeType: file.type || undefined,
        sizeBytes: typeof file.size === "number" ? file.size : Number(file.size) || 0,
        ingestStatus: "uploaded",
        tenantId,
        libraryId,
        tags,
        createdAt: new Date().toISOString()
      });
      await deps.documents.upsert(docPayload);
      await enqueueIngestion(deps.queue, docId, tenantId, libraryId);
      results.push({
        docId,
        filename: file.name,
        title,
        status: "queued"
      });
    } catch (error) {
      results.push({
        docId,
        filename: file.name,
        title,
        status: "error",
        message: (error as Error).message
      });
    }
  }

  const successCount = results.filter((item) => item.status === "queued").length;
  const responseStatus =
    successCount === results.length ? 200 : successCount === 0 ? 500 : 207;
  return json({ items: results }, responseStatus);
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
  const libraryId = resolveLibrary(request, deps.defaultLibraryId, doc.libraryId);
  await deps.documents.updateStatus(doc.docId, "uploaded", undefined);
  await enqueueIngestion(deps.queue, doc.docId, tenantId, libraryId);
  return json({ status: "queued", docId, libraryId });
}

async function handleListDocumentChunks(request: Request, deps: ApiRoutesDeps, docId: string) {
  const doc = await deps.documents.get(docId);
  if (!doc) {
    return new Response("Not Found", { status: 404 });
  }
  const tenantId = resolveTenant(request, doc.tenantId ?? deps.defaultTenantId);
  if (doc.tenantId && doc.tenantId !== tenantId) {
    return new Response("Forbidden", { status: 403 });
  }
  const records = await deps.chunks.listByDocument!(docId);
  const chunkIds = records.map((record) => record.chunk.chunkId);
  const attachments = chunkIds.length ? await deps.attachments.listByChunkIds(chunkIds) : [];
  const attachmentMap = groupAttachments(attachments);
  return json({
    docId,
    libraryId: doc.libraryId,
    tenantId,
    items: records.map((record) => ({
      chunk: record.chunk,
      document: record.document,
      attachments: attachmentMap.get(record.chunk.chunkId) ?? []
    }))
  });
}

async function handleGetDocumentStructure(request: Request, deps: ApiRoutesDeps, docId: string) {
  const doc = await deps.documents.get(docId);
  if (!doc) {
    return new Response("Not Found", { status: 404 });
  }
  const tenantId = resolveTenant(request, doc.tenantId ?? deps.defaultTenantId);
  if (doc.tenantId && doc.tenantId !== tenantId) {
    return new Response("Forbidden", { status: 403 });
  }
  const sections = await deps.documents.listSections(docId);
  return json({ docId, sections });
}

async function handleUpdateChunk(request: Request, deps: ApiRoutesDeps, chunkId: string) {
  if (!deps.chunks.updateTopicLabels && !deps.chunks.updateMetadata) {
    return new Response("Chunk repository does not support updates", { status: 501 });
  }
  const record = await deps.chunks.get(chunkId);
  if (!record) {
    return new Response("Not Found", { status: 404 });
  }
  const tenantId = resolveTenant(request, deps.defaultTenantId, record.document.tenantId);
  if (record.document.tenantId && record.document.tenantId !== tenantId) {
    return new Response("Forbidden", { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const topicLabels = Array.isArray(body.topicLabels)
    ? body.topicLabels.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : undefined;
  const semanticTags = Array.isArray(body.semanticTags)
    ? body.semanticTags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : undefined;
  const topics = Array.isArray(body.topics)
    ? body.topics.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : undefined;
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : undefined;
  const parentSectionPath = Array.isArray(body.parentSectionPath)
    ? body.parentSectionPath.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : undefined;
  const bizEntities = Array.isArray(body.bizEntities)
    ? body.bizEntities.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : undefined;
  const envLabels = Array.isArray(body.envLabels)
    ? body.envLabels.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : undefined;
  const nerEntities = Array.isArray(body.entities)
    ? body.entities
        .map((e: { name?: string; type?: string }) => ({
          name: String(e?.name ?? "").trim(),
          type: e?.type ? String(e.type).trim() : undefined
        }))
        .filter((e) => e.name.length > 0)
    : undefined;
  const semanticTitle =
    typeof body.semanticTitle === "string" ? body.semanticTitle.trim() : undefined;
  const contextSummary =
    typeof body.contextSummary === "string" ? body.contextSummary.trim() : undefined;

  if (
    !topicLabels &&
    !semanticTags &&
    !topics &&
    !keywords &&
    !parentSectionPath &&
    !bizEntities &&
    !envLabels &&
    !nerEntities &&
    semanticTitle === undefined &&
    contextSummary === undefined
  ) {
    return new Response("No updatable fields provided", { status: 400 });
  }

  if (topicLabels?.length && deps.chunks.updateTopicLabels) {
    await deps.chunks.updateTopicLabels(chunkId, topicLabels);
  }
  if (deps.chunks.updateMetadata) {
    await deps.chunks.updateMetadata(chunkId, {
      topicLabels,
      semanticTags,
      topics,
      keywords,
      contextSummary,
      semanticTitle,
      parentSectionPath,
      bizEntities,
      envLabels,
      nerEntities
    });
  }
  const updated = await deps.chunks.get(chunkId);
  return json(updated ?? { chunkId, topicLabels: topicLabels ?? [] });
}

async function handleGetModelSettings(request: Request, deps: ApiRoutesDeps): Promise<Response> {
  if (!deps.modelSettings) {
    return new Response("Model settings repository not configured", { status: 501 });
  }
  const url = new URL(request.url);
  const tenantParam = url.searchParams.get("tenantId") ?? undefined;
  const libraryParam = url.searchParams.get("libraryId") ?? undefined;
  const roleParam = url.searchParams.get("modelRole") ?? undefined;
  const tenantId = resolveTenant(request, deps.defaultTenantId, tenantParam);
  const libraryId = resolveLibrary(request, deps.defaultLibraryId, libraryParam);
  const modelRole = roleParam ? ModelRoleSchema.parse(roleParam) : undefined;
  const setting = roleParam
    ? await deps.modelSettings.get(tenantId, libraryId, modelRole)
    : await deps.modelSettings.get(tenantId, libraryId, "tagging");
  return json({ setting: setting ? sanitizeModelSetting(setting) : null });
}

async function validateOcrEndpointInline(baseUrl: string, apiKey?: string) {
  if (!baseUrl || !baseUrl.trim()) {
    throw new Error("OCR 服务 URL 不能为空");
  }
  // 1x1 纯色 PNG（base64: iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=）
  const tinyPngBytes = Uint8Array.from([
    0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53,0xde,
    0x00,0x00,0x00,0x0a,0x49,0x44,0x41,0x54,0x08,0xd7,0x63,0x00,0x01,0x00,0x00,0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82
  ]);
  const attempts = [
    () => {
      const form = new FormData();
      form.append("file", new Blob([tinyPngBytes], { type: "image/png" }), "ping.png");
      return form;
    }
  ];
  const errors: string[] = [];
  for (const build of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        body: build(),
        signal: controller.signal
      });
      if (response.ok) {
        return;
      }
      const text = await response.text().catch(() => "");
      errors.push(text || `HTTP ${response.status}`);
    } catch (error) {
      errors.push((error as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }
  // 如果 /ocr 失败，尝试同源的 /health 作为兜底连通性检测
  try {
    const healthUrl = new URL(baseUrl);
    healthUrl.pathname = "/health";
    const res = await fetch(healthUrl.toString(), { method: "GET" });
    if (res.ok) {
      return;
    }
    errors.push(`健康检查失败 ${res.status}`);
  } catch (error) {
    errors.push((error as Error).message);
  }
  throw new Error(errors.filter(Boolean).join(" | ") || "OCR 服务不可用");
}

async function handleSaveModelSettings(request: Request, deps: ApiRoutesDeps): Promise<Response> {
  if (!deps.modelSettings) {
    return new Response("Model settings repository not configured", { status: 501 });
  }
  const payload = await request.json();
  const parsed = ModelSettingInputSchema.parse(payload);
  const tenantId = resolveTenant(request, deps.defaultTenantId, parsed.tenantId);
  const libraryId = resolveLibrary(request, deps.defaultLibraryId, parsed.libraryId);
  const normalizedApiKey = parsed.apiKey?.trim() ? parsed.apiKey.trim() : undefined;
  const modelRole = parsed.modelRole ?? "tagging";
  const displayName = parsed.displayName?.trim() ? parsed.displayName.trim() : undefined;
  if (modelRole === "ocr") {
    try {
      await validateOcrEndpointInline(parsed.baseUrl, normalizedApiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OCR endpoint validation failed";
      return new Response(message, { status: 502 });
    }
  }
  try {
    const saved = await deps.modelSettings.upsert({
      tenantId,
      libraryId,
      provider: parsed.provider,
      baseUrl: parsed.baseUrl,
      modelName: parsed.modelName,
      options: parsed.options,
      apiKey: normalizedApiKey,
      modelRole,
      displayName
    });
    return json({ setting: sanitizeModelSetting(saved) });
  } catch (error) {
    const mapped = mapModelSettingsError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

async function handleUpsertTenant(request: Request, deps: ApiRoutesDeps): Promise<Response> {
  if (!deps.tenantConfigs) {
    return new Response("Tenant config repository not configured", { status: 501 });
  }
  const payload = await request.json();
  const parsed = TenantConfigInputSchema.parse(payload);
  const saved = await deps.tenantConfigs.upsert(parsed);
  return json({ tenant: saved });
}

async function handleUpsertLibrary(request: Request, deps: ApiRoutesDeps): Promise<Response> {
  if (!deps.libraryConfigs) {
    return new Response("Library config repository not configured", { status: 501 });
  }
  const payload = await request.json();
  const parsed = LibraryConfigInputSchema.parse(payload);
  const saved = await deps.libraryConfigs.upsert(parsed);
  return json({ library: saved });
}

async function handleFetchRemoteModels(request: Request): Promise<Response> {
  try {
    const payload = await request.json();
    const parsed = RemoteModelRequestSchema.parse(payload);
    const items = await fetchRemoteModels(parsed);
    return json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load models";
    return new Response(message, { status: 502 });
  }
}

function sanitizeModelSetting(setting: ModelSettingSecret) {
  return {
    tenantId: setting.tenantId,
    libraryId: setting.libraryId,
    provider: setting.provider,
    baseUrl: setting.baseUrl,
    modelName: setting.modelName,
    modelRole: setting.modelRole ?? "tagging",
    displayName: setting.displayName ?? undefined,
    options: setting.options ?? undefined,
    updatedAt: setting.updatedAt,
    hasApiKey: Boolean(setting.apiKey),
    apiKeyPreview: maskKey(setting.apiKey)
  };
}

function mapModelSettingsError(error: unknown): Response | null {
  const typed = error as { code?: string; constraint?: string; message?: string };
  const isCheckViolation =
    typed?.constraint === "model_settings_provider_check" ||
    (typeof typed?.message === "string" && typed.message.includes("model_settings_provider_check")) ||
    typed?.code === "23514";
  if (isCheckViolation) {
    const hint =
      "model_settings.provider 约束未更新，无法保存 provider。请先运行数据库迁移（例如 bun run scripts/run-migrations.ts 或 make db:migrate）后重试。";
    return new Response(hint, { status: 400 });
  }
  return null;
}

function maskKey(apiKey?: string) {
  if (!apiKey) {
    return undefined;
  }
  if (apiKey.length <= 4) {
    return `***${apiKey}`;
  }
  const suffix = apiKey.slice(-4);
  return `${"*".repeat(Math.max(apiKey.length - 4, 0))}${suffix}`;
}

async function validateOcrEndpoint(baseUrl: string, apiKey?: string) {
  if (!baseUrl || !baseUrl.Trim()) {
    throw new Error("OCR 服务 URL 不能为空");
  }
  const form = new FormData();
  form.Append("file", new Blob(["ping"]), "ping.txt");
  form.Append("language", "chi_sim");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      body: form,
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `OCR 服务不可用 (${response.status})`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRemoteModels(input: RemoteModelRequest) {
  if (input.provider === "openai") {
    if (!input.apiKey) {
      throw new Error("OpenAI 模型列表需要提供 API Key");
    }
    const response = await fetch(buildOpenAiModelsUrl(input.baseUrl), {
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`OpenAI 模型列表请求失败 (${response.status})`);
    }
    const payload = await response.json();
    const list = Array.isArray(payload?.data) ? payload.data : [];
    return list
      .map((item: { id?: string }) => item?.id)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      .map((modelName) => ({ modelName, label: modelName, provider: "openai" }));
  }
  if (input.provider === "ollama") {
    const response = await fetch(buildOllamaModelsUrl(input.baseUrl));
    if (!response.ok) {
      throw new Error(`Ollama 模型列表请求失败 (${response.status})`);
    }
    const payload = await response.json();
    const list = Array.isArray(payload?.models) ? payload.models : [];
    return list
      .map((item: { name?: string; model?: string }) => item?.name ?? item?.model)
      .filter((name: unknown): name is string => typeof name === "string" && name.length > 0)
      .map((modelName) => ({ modelName, label: modelName, provider: "ollama" }));
  }
  return [];
}

function buildOpenAiModelsUrl(baseUrl: string): string {
  try {
    const target = new URL(baseUrl);
    // 若用户提供的已是完整 /v1/models 或其他路径，不强行改写，仅替换为官方列表接口
    target.pathname = "/v1/models";
    target.search = "";
    target.hash = "";
    return target.toString();
  } catch {
    // 非法 URL 原样返回，调用方会收到请求错误
    return baseUrl;
  }
}

function buildOllamaModelsUrl(baseUrl: string): string {
  const target = new URL(baseUrl);
  target.pathname = "/api/tags";
  target.search = "";
  target.hash = "";
  return target.toString();
}

function collectFiles(form: FormData): File[] {
  const multi = form.getAll("files").filter((value): value is File => value instanceof File);
  if (multi.length) {
    return multi;
  }
  const single = form.get("file");
  return single instanceof File ? [single] : [];
}

function collectTitleOverrides(form: FormData): Array<string | undefined> {
  return form.getAll("titles[]").map((value) =>
    typeof value === "string" && value.trim().length ? value.trim() : undefined
  );
}

function parseTagsField(form: FormData): string[] | undefined {
  const rawValues = [...form.getAll("tags"), ...form.getAll("tags[]")].filter(
    (value): value is string => typeof value === "string"
  );
  const tags = rawValues
    .flatMap((value) => value.split(","))
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (!tags.length) {
    return undefined;
  }
  const deduped = Array.from(new Set(tags.map((tag) => tag.toLowerCase()))).map((lowerTag) => {
    return tags.find((tag) => tag.toLowerCase() === lowerTag)!;
  });
  return deduped;
}

async function persistUploadedFile(file: File, objectKey: string, storage?: ObjectStorage) {
  if (!storage) {
    throw new Error("Storage not configured");
  }
  if (!STREAM_THRESHOLD_BYTES || file.size <= STREAM_THRESHOLD_BYTES) {
    const buffer = Buffer.from(await file.arrayBuffer());
    await storage.putRawObject(objectKey, buffer, file.type || undefined);
    return;
  }
  const tempDir = await fs.mkdtemp(join(tmpdir(), "kb-upload-"));
  const tempFile = join(tempDir, `${randomUUID()}-${sanitizeFileName(file.name)}`);
  try {
    const readable = Readable.fromWeb(file.stream());
    await pipeline(readable, createWriteStream(tempFile));
    await storage.putRawObject(objectKey, tempFile, file.type || undefined);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function sanitizeFileName(input?: string) {
  if (!input || !input.length) {
    return "upload.bin";
  }
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "upload.bin";
}

async function enqueueIngestion(
  queue: QueueAdapter,
  docId: string,
  tenantId: string,
  libraryId: string
) {
  await queue.enqueue({
    jobId: crypto.randomUUID(),
    docId,
    tenantId,
    libraryId
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

function buildQueueItem(doc: any) {
  const stageOrder: Record<string, number> = {
    parsing: 1,
    preprocess: 2,
    chunking: 3,
    tagging_meta: 4,
    embedding: 5,
    persisting: 6,
    completed: 7
  };
  const stages: Array<{ stage: string; status: string; at: string }> = doc.statusMeta?.stages ?? [];
  const maxStage = stages.reduce((max, curr) => Math.max(max, stageOrder[curr.stage] ?? 0), 0);
  const ingestStatus = doc.ingestStatus ?? "uploaded";
  const progress =
    ingestStatus === "indexed"
      ? 1
      : ingestStatus === "failed"
      ? 0
      : maxStage > 0
      ? Math.min(maxStage / 7, 1)
      : 0.1;

  return {
    docId: doc.docId,
    title: doc.title,
    ingestStatus,
    progress,
    tenantId: doc.tenantId,
    libraryId: doc.libraryId,
    tags: doc.tags ?? [],
    sizeBytes: doc.sizeBytes ?? null,
    errorMessage: doc.errorMessage ?? null,
    updatedAt: doc.updatedAt ?? null
  };
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

function resolveLibrary(request: Request, fallback: string, explicit?: string | null) {
  if (typeof explicit === "string") {
    const trimmed = explicit.trim();
    if (trimmed.length) {
      return trimmed;
    }
  }
  const header = request.headers.get("x-library-id")?.trim();
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

function gatherSemanticTags(chunk: Chunk) {
  const tags = new Set<string>();
  (chunk.semanticTags ?? []).forEach((tag) => tags.add(tag.toLowerCase()));
  chunk.semanticMetadata?.semanticTags?.forEach((tag) => tags.add(tag.toLowerCase()));
  (chunk.topicLabels ?? []).forEach((tag) => tags.add(tag.toLowerCase()));
  return tags;
}

function gatherEnvLabels(chunk: Chunk) {
  const labels = new Set<string>();
  (chunk.envLabels ?? []).forEach((label) => labels.add(label.toLowerCase()));
  chunk.semanticMetadata?.envLabels?.forEach((label) => labels.add(label.toLowerCase()));
  return labels;
}

function matchesMetadataQuery(chunk: Chunk, query: Record<string, unknown>) {
  if (!query || !Object.keys(query).length) {
    return true;
  }
  if (!chunk.semanticMetadata) {
    return false;
  }
  const metadata = {
    ...chunk.semanticMetadata.extra,
    contextSummary: chunk.semanticMetadata.contextSummary
  };
  return Object.entries(query).every(([key, value]) => {
    if (!(key in metadata)) {
      return false;
    }
    return metadata[key] === value;
  });
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function handleMcpSearch(request: Request, deps: ApiRoutesDeps) {
  const body = await request.json();
  const parsed = SearchRequestSchema.parse(body);
  const tenantId = resolveTenant(request, deps.defaultTenantId, parsed.filters?.tenantId);
  const libraryId = resolveLibrary(request, deps.defaultLibraryId, parsed.filters?.libraryId);
  const repo = new DbMcpRepository(deps.chunks, deps.attachments);
  const ctx: McpToolContext = { requestId: crypto.randomUUID(), tenantId, libraryId };
  const tool = createSearchTool(deps.retriever, repo);
  const result = await tool.handle({ ...parsed, filters: { ...parsed.filters, libraryId } }, ctx);
  return json(result);
}

async function handleMcpRelated(request: Request, deps: ApiRoutesDeps) {
  const payload = await request.json();
  if (!payload.chunkId) {
    return new Response("chunkId is required", { status: 400 });
  }
  const tenantId = resolveTenant(request, deps.defaultTenantId, payload.tenantId);
  const libraryId = resolveLibrary(request, deps.defaultLibraryId, payload.libraryId);
  const repo = new DbMcpRepository(deps.chunks, deps.attachments);
  const ctx: McpToolContext = { requestId: crypto.randomUUID(), tenantId, libraryId };
  const tool = createRelatedTool(repo);
  const result = await tool.handle(payload, ctx);
  return json(result);
}

async function handleMcpPreview(request: Request, deps: ApiRoutesDeps) {
  const payload = await request.json();
  if (!payload.chunkId) {
    return new Response("chunkId is required", { status: 400 });
  }
  const tenantId = resolveTenant(request, deps.defaultTenantId, payload.tenantId);
  const libraryId = resolveLibrary(request, deps.defaultLibraryId, payload.libraryId);
  const repo = new DbMcpRepository(deps.chunks, deps.attachments);
  const ctx: McpToolContext = { requestId: crypto.randomUUID(), tenantId, libraryId };
  const tool = createPreviewTool(repo);
  const result = await tool.handle(payload, ctx);
  return json(result);
}

