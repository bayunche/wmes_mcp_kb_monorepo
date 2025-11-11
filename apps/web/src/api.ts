const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? "dev-token";

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

export async function listDocuments() {
  const response = await fetch(`${API_BASE}/documents`, { headers });
  return response.json();
}

export async function updateDocumentTags(docId: string, tags: string[]) {
  const response = await fetch(`${API_BASE}/documents/${docId}`, {
    method: "PATCH",
    headers,
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
