const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? "dev-token";
const PREVIEW_BASE = import.meta.env.VITE_PREVIEW_BASE ?? "";

const headers = {
  "content-type": "application/json",
  Authorization: `Bearer ${API_TOKEN}`
};

export async function createDocument(payload: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}/documents`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function uploadDocument(input: {
  file: File;
  title?: string;
  tenantId?: string;
  tags?: string[];
}) {
  const formData = new FormData();
  formData.append("file", input.file);
  if (input.title) formData.append("title", input.title);
  if (input.tenantId) formData.append("tenantId", input.tenantId);
  input.tags?.forEach((tag) => formData.append("tags[]", tag));
  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    body: formData
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function listDocuments(tenantId?: string) {
  const response = await fetch(`${API_BASE}/documents`, {
    headers: tenantId ? { ...headers, "x-tenant-id": tenantId } : headers
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

export async function searchDocuments(query: string) {
  const response = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, limit: 5, includeNeighbors: true })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function previewChunk(chunkId: string) {
  const response = await fetch(`${API_BASE}/mcp/preview`, {
    method: "POST",
    headers,
    body: JSON.stringify({ chunkId })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function mcpSearch(payload: { query: string; limit?: number; filters?: Record<string, unknown> }) {
  const response = await fetch(`${API_BASE}/mcp/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchStats(tenantId?: string) {
  const response = await fetch(`${API_BASE}/stats${tenantId ? `?tenantId=${tenantId}` : ""}`, {
    method: "GET",
    headers: tenantId
      ? {
          ...headers,
          "x-tenant-id": tenantId
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

export async function reindexDocument(docId: string, tenantId?: string) {
  const response = await fetch(`${API_BASE}/documents/${docId}/reindex`, {
    method: "POST",
    headers: tenantId ? { ...headers, "x-tenant-id": tenantId } : headers
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function relatedChunks(chunkId: string, limit = 5) {
  const response = await fetch(`${API_BASE}/mcp/related`, {
    method: "POST",
    headers,
    body: JSON.stringify({ chunkId, limit })
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

export function buildAttachmentUrl(objectKey: string) {
  if (!PREVIEW_BASE) return null;
  return `${PREVIEW_BASE.replace(/\/$/, "")}/${objectKey}`;
}
