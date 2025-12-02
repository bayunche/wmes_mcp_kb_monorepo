// 优先使用运行时注入（适配容器/反向代理），其次取构建时环境变量，最后回退同源 /api
const isDev = import.meta.env.DEV;
const API_BASE =
  // 开发模式强制走同源 /api，避免浏览器 CORS，借助 Vite 代理转发
  (isDev && "/api") ||
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  import.meta.env.VITE_API_BASE ||
  "/api";
const API_TOKEN =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof window !== "undefined" && (window as any).__API_TOKEN__) ||
  import.meta.env.VITE_API_TOKEN ||
  "dev-token";
const PREVIEW_BASE = import.meta.env.VITE_PREVIEW_BASE ?? "";
const DEFAULT_LIBRARY = import.meta.env.VITE_LIBRARY_ID ?? "default";

export type ModelProvider = "openai" | "ollama" | "local";

const headers = {
  "content-type": "application/json",
  Authorization: `Bearer ${API_TOKEN}`,
  "x-library-id": DEFAULT_LIBRARY
};

export async function createDocument(payload: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}/documents`, {
    method: "POST",
    headers,
    body: JSON.stringify({ libraryId: DEFAULT_LIBRARY, ...payload })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function uploadDocuments(input: {
  files: File[];
  title?: string;
  titles?: string[];
  tenantId?: string;
  tags?: string[];
  libraryId?: string;
}) {
  const formData = new FormData();
  const fieldName = input.files.length > 1 ? "files" : "file";
  input.files.forEach((file) => formData.append(fieldName, file));
  input.titles?.forEach((title) => formData.append("titles[]", title));
  if (input.title) formData.append("title", input.title);
  if (input.tenantId) formData.append("tenantId", input.tenantId);
  formData.append("libraryId", input.libraryId ?? DEFAULT_LIBRARY);
  input.tags?.forEach((tag) => formData.append("tags[]", tag));
  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_TOKEN}`, "x-library-id": input.libraryId ?? DEFAULT_LIBRARY },
    body: formData
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function listDocuments(tenantId?: string, libraryId: string = DEFAULT_LIBRARY) {
  const url = new URL(`${API_BASE}/documents`);
  if (tenantId) url.searchParams.set("tenantId", tenantId);
  if (libraryId) url.searchParams.set("libraryId", libraryId);
  const response = await fetch(url, {
    headers: tenantId ? { ...headers, "x-tenant-id": tenantId, "x-library-id": libraryId } : { ...headers, "x-library-id": libraryId }
  });
  return response.json();
}

export async function updateDocumentTags(docId: string, tags: string[], tenantId?: string) {
  const response = await fetch(`${API_BASE}/documents/${docId}`, {
    method: "PATCH",
    headers: tenantId ? { ...headers, "x-tenant-id": tenantId } : headers,
    body: JSON.stringify({ tags })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function searchDocuments(
  payload: string | { query: string; limit?: number; filters?: Record<string, unknown>; includeNeighbors?: boolean },
  libraryId: string = DEFAULT_LIBRARY
) {
  const normalized =
    typeof payload === "string"
      ? { query: payload, limit: 5, includeNeighbors: true, filters: { libraryId } }
      : {
          limit: 5,
          includeNeighbors: true,
          ...payload,
          filters: { libraryId, ...(payload.filters ?? {}) }
        };
  const response = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(normalized)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function previewChunk(chunkId: string, libraryId: string = DEFAULT_LIBRARY) {
  const response = await fetch(`${API_BASE}/mcp/preview`, {
    method: "POST",
    headers,
    body: JSON.stringify({ chunkId, libraryId })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function mcpSearch(
  payload: { query: string; limit?: number; filters?: Record<string, unknown> },
  libraryId: string = DEFAULT_LIBRARY
) {
  const response = await fetch(`${API_BASE}/mcp/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, filters: { ...payload.filters, libraryId } })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchStats(tenantId?: string, libraryId: string = DEFAULT_LIBRARY) {
  const params = new URLSearchParams();
  if (tenantId) params.set("tenantId", tenantId);
  if (libraryId) params.set("libraryId", libraryId);
  const response = await fetch(`${API_BASE}/stats${params.toString() ? `?${params.toString()}` : ""}`, {
    method: "GET",
    headers: tenantId
      ? {
          ...headers,
          "x-tenant-id": tenantId,
          "x-library-id": libraryId
        }
      : headers
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function deleteDocument(docId: string, tenantId?: string) {
  const response = await fetch(`${API_BASE}/documents/${docId}`, {
    method: "DELETE",
    headers: tenantId ? { ...headers, "x-tenant-id": tenantId } : headers
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function reindexDocument(docId: string, tenantId?: string, libraryId: string = DEFAULT_LIBRARY) {
  const response = await fetch(`${API_BASE}/documents/${docId}/reindex`, {
    method: "POST",
    headers: tenantId ? { ...headers, "x-tenant-id": tenantId, "x-library-id": libraryId } : { ...headers, "x-library-id": libraryId }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function relatedChunks(chunkId: string, limit = 5, libraryId: string = DEFAULT_LIBRARY) {
  const response = await fetch(`${API_BASE}/mcp/related`, {
    method: "POST",
    headers,
    body: JSON.stringify({ chunkId, limit, libraryId })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchLibraryChunks(libraryId = DEFAULT_LIBRARY, options: { tenantId?: string; limit?: number; docId?: string } = {}) {
  const url = new URL(`${API_BASE}/libraries/${libraryId}/chunks`);
  if (options.tenantId) url.searchParams.set("tenantId", options.tenantId);
  if (options.limit) url.searchParams.set("limit", String(options.limit));
  if (options.docId) url.searchParams.set("docId", options.docId);
  const response = await fetch(url, {
    headers: options.tenantId
      ? { ...headers, "x-tenant-id": options.tenantId, "x-library-id": libraryId }
      : { ...headers, "x-library-id": libraryId }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchDocumentChunks(docId: string, options: { tenantId?: string; libraryId?: string } = {}) {
  const libraryId = options.libraryId ?? DEFAULT_LIBRARY;
  const response = await fetch(`${API_BASE}/documents/${docId}/chunks`, {
    headers: options.tenantId
      ? { ...headers, "x-tenant-id": options.tenantId, "x-library-id": libraryId }
      : { ...headers, "x-library-id": libraryId }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchDocumentStructure(docId: string, options: { tenantId?: string; libraryId?: string } = {}) {
  const libraryId = options.libraryId ?? DEFAULT_LIBRARY;
  const response = await fetch(`${API_BASE}/documents/${docId}/structure`, {
    headers: options.tenantId
      ? { ...headers, "x-tenant-id": options.tenantId, "x-library-id": libraryId }
      : { ...headers, "x-library-id": libraryId }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchVectorLogs(params: {
  tenantId?: string;
  libraryId?: string;
  docId?: string;
  chunkId?: string;
  limit?: number;
}) {
  const url = new URL(`${API_BASE}/vector-logs`);
  if (params.tenantId) url.searchParams.set("tenantId", params.tenantId);
  if (params.libraryId) url.searchParams.set("libraryId", params.libraryId);
  if (params.docId) url.searchParams.set("docId", params.docId);
  if (params.chunkId) url.searchParams.set("chunkId", params.chunkId);
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  const response = await fetch(url, {
    headers: params.tenantId
      ? { ...headers, "x-tenant-id": params.tenantId, "x-library-id": params.libraryId ?? DEFAULT_LIBRARY }
      : { ...headers, "x-library-id": params.libraryId ?? DEFAULT_LIBRARY }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchChunk(chunkId: string, options: { tenantId?: string; libraryId?: string } = {}) {
  const libraryId = options.libraryId ?? DEFAULT_LIBRARY;
  const response = await fetch(`${API_BASE}/chunks/${chunkId}`, {
    headers: options.tenantId
      ? { ...headers, "x-tenant-id": options.tenantId, "x-library-id": libraryId }
      : { ...headers, "x-library-id": libraryId }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function updateChunkMetadata(
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
    entities?: Array<{ name: string; type?: string }>;
  },
  options: { tenantId?: string; libraryId?: string } = {}
) {
  const libraryId = options.libraryId ?? DEFAULT_LIBRARY;
  const response = await fetch(`${API_BASE}/chunks/${chunkId}`, {
    method: "PATCH",
    headers: options.tenantId
      ? { ...headers, "x-tenant-id": options.tenantId, "x-library-id": libraryId }
      : { ...headers, "x-library-id": libraryId },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchModelSettings(params: { tenantId?: string; libraryId?: string; modelRole?: string } = {}) {
  const url = new URL(`${API_BASE}/model-settings`);
  if (params.tenantId) url.searchParams.set("tenantId", params.tenantId);
  if (params.libraryId) url.searchParams.set("libraryId", params.libraryId);
  if (params.modelRole) url.searchParams.set("modelRole", params.modelRole);
  const response = await fetch(url, {
    headers: params.tenantId
      ? { ...headers, "x-tenant-id": params.tenantId, "x-library-id": params.libraryId ?? DEFAULT_LIBRARY }
      : { ...headers, "x-library-id": params.libraryId ?? DEFAULT_LIBRARY }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function saveModelSettings(payload: {
  tenantId?: string;
  libraryId?: string;
  provider: ModelProvider;
  baseUrl: string;
  modelName: string;
  modelRole?: "embedding" | "tagging" | "metadata" | "ocr" | "rerank" | "structure" | "query_rewrite" | "semantic_rerank";
  displayName?: string;
  apiKey?: string;
  options?: Record<string, unknown>;
}) {
  const requestHeaders: Record<string, string> = {
    ...headers,
    "x-library-id": payload.libraryId ?? DEFAULT_LIBRARY
  };
  if (payload.tenantId) {
    requestHeaders["x-tenant-id"] = payload.tenantId;
  }
  const response = await fetch(`${API_BASE}/model-settings`, {
    method: "PUT",
    headers: requestHeaders,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchIngestionQueue(params: { tenantId?: string; libraryId?: string; limit?: number } = {}) {
  const url = new URL(`${API_BASE}/ingestion/queue`);
  if (params.tenantId) url.searchParams.set("tenantId", params.tenantId);
  if (params.libraryId) url.searchParams.set("libraryId", params.libraryId);
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  const response = await fetch(url, {
    headers: params.tenantId
      ? { ...headers, "x-tenant-id": params.tenantId, "x-library-id": params.libraryId ?? DEFAULT_LIBRARY }
      : { ...headers, "x-library-id": params.libraryId ?? DEFAULT_LIBRARY }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchModelSettingsList(params: { tenantId?: string; libraryId?: string } = {}) {
  const url = new URL(`${API_BASE}/model-settings/list`);
  if (params.tenantId) url.searchParams.set("tenantId", params.tenantId);
  if (params.libraryId) url.searchParams.set("libraryId", params.libraryId);
  const response = await fetch(url, {
    headers: params.tenantId
      ? { ...headers, "x-tenant-id": params.tenantId, "x-library-id": params.libraryId ?? DEFAULT_LIBRARY }
      : { ...headers, "x-library-id": params.libraryId ?? DEFAULT_LIBRARY }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchTenants() {
  const response = await fetch(`${API_BASE}/config/tenants`, {
    headers
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchLocalModels() {
  const response = await fetch(`${API_BASE}/models`, { headers });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function installModel(payload: { name: string }) {
  const response = await fetch(`${API_BASE}/models/install`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function saveTenant(payload: { tenantId: string; displayName: string; description?: string }) {
  const response = await fetch(`${API_BASE}/config/tenants`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function deleteTenant(tenantId: string) {
  const response = await fetch(`${API_BASE}/config/tenants/${tenantId}`, {
    method: "DELETE",
    headers
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function fetchLibraries(params: { tenantId?: string } = {}) {
  const url = new URL(`${API_BASE}/config/libraries`);
  if (params.tenantId) {
    url.searchParams.set("tenantId", params.tenantId);
  }
  const response = await fetch(url, {
    headers
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function saveLibrary(payload: { libraryId: string; tenantId?: string; displayName: string; description?: string }) {
  const response = await fetch(`${API_BASE}/config/libraries`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function deleteLibrary(libraryId: string) {
  const response = await fetch(`${API_BASE}/config/libraries/${libraryId}`, {
    method: "DELETE",
    headers
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function discoverModels(payload: { provider: "openai" | "ollama"; baseUrl: string; apiKey?: string }) {
  const response = await fetch(`${API_BASE}/model-settings/models`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchMetrics() {
  const response = await fetch(`${API_BASE}/metrics`, {
    method: "GET",
    headers
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.text();
}

export async function fetchIngestionStatus(docId: string) {
  const response = await fetch(`${API_BASE}/ingestion/${docId}/status`, {
    headers
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export function buildAttachmentUrl(objectKey: string) {
  if (!PREVIEW_BASE) return null;
  return `${PREVIEW_BASE.replace(/\/$/, "")}/${objectKey}`;
}
