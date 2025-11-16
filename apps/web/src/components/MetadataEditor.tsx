import { useEffect, useState } from "react";
import {
  deleteDocument,
  fetchStats,
  listDocuments,
  reindexDocument,
  updateDocumentTags
} from "../api";

export function MetadataEditor() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState("default");
  const [stats, setStats] = useState<{ documents: number; attachments: number; chunks: number; pendingJobs: number } | null>(null);

  const refresh = async () => {
    const response = await listDocuments(tenantId || undefined);
    setDocuments(response.items ?? []);
  };

  const refreshStats = async () => {
    const data = await fetchStats(tenantId || undefined);
    setStats(data);
  };

  useEffect(() => {
    refresh();
    refreshStats();
  }, [tenantId]);

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setStatus("更新中…");
    try {
      await updateDocumentTags(
        selectedId,
        tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        tenantId || undefined
      );
      await refresh();
      setStatus("更新成功");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) {
      setStatus("请选择要删除的文档");
      return;
    }
    setStatus("删除中…");
    try {
      await deleteDocument(selectedId, tenantId || undefined);
      setSelectedId("");
      setTags("");
      await refresh();
      await refreshStats();
      setStatus("文档已删除");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const handleReindex = async () => {
    if (!selectedId) {
      setStatus("请选择要重索引的文档");
      return;
    }
    setStatus("重索引中…");
    try {
      await reindexDocument(selectedId, tenantId || undefined);
      setStatus("任务已入队");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <section className="card">
      <h2>元数据管理</h2>
      <div>
        <label>
          Tenant ID
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="default" />
        </label>
        <button type="button" onClick={() => { refresh(); refreshStats(); }}>
          刷新列表/统计
        </button>
      </div>
      {stats && (
        <div className="stats">
          <strong>统计</strong>
          <ul>
            <li>Documents: {stats.documents}</li>
            <li>Attachments: {stats.attachments}</li>
            <li>Chunks: {stats.chunks}</li>
            <li>Pending Jobs: {stats.pendingJobs}</li>
          </ul>
        </div>
      )}
      <form onSubmit={handleUpdate}>
        <label>
          选择文档
          <select
            value={selectedId}
            onChange={(e) => {
              const docId = e.target.value;
              setSelectedId(docId);
              const doc = documents.find((d) => d.docId === docId);
              setTags((doc?.tags ?? []).join(","));
            }}
          >
            <option value="">请选择</option>
            {documents.map((doc) => (
              <option key={doc.docId} value={doc.docId}>
                {doc.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          标签（逗号分隔）
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <button type="submit" disabled={!selectedId}>
          更新
        </button>
        <button type="button" onClick={handleReindex} disabled={!selectedId}>
          重新索引
        </button>
        <button type="button" onClick={handleDelete} disabled={!selectedId}>
          删除文档
        </button>
        {status && <p>{status}</p>}
      </form>
    </section>
  );
}
