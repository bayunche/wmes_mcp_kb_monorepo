import { useEffect, useState } from "react";
import {
  deleteDocument,
  fetchDocumentChunks,
  fetchStats,
  listDocuments,
  reindexDocument,
  updateChunkTags
} from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";

export function MetadataEditor({ refreshToken }: { refreshToken: number }) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [chunks, setChunks] = useState<any[]>([]);
  const [chunkEdits, setChunkEdits] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [stats, setStats] = useState<{ documents: number; attachments: number; chunks: number; pendingJobs: number } | null>(null);
  const { tenants, libraries, loading: orgLoading, error: orgError, refresh: refreshOrgOptions } = useOrgOptions();

  const refreshDocuments = async () => {
    const response = await listDocuments(tenantId || undefined, libraryId || undefined);
    setDocuments(response.items ?? []);
  };

  const refreshStats = async () => {
    const data = await fetchStats(tenantId || undefined, libraryId || undefined);
    setStats(data);
  };

  useEffect(() => {
    refreshDocuments();
    refreshStats();
    setSelectedId("");
    setChunks([]);
    setChunkEdits({});
  }, [tenantId, libraryId, refreshToken]);

  useEffect(() => {
    if (!tenants.length) return;
    if (!tenants.some((tenant) => tenant.tenantId === tenantId)) {
      setTenantId(tenants[0].tenantId);
    }
  }, [tenants, tenantId]);

  useEffect(() => {
    if (!libraries.length) return;
    const scoped = libraries.filter((lib) => !lib.tenantId || lib.tenantId === tenantId);
    if (scoped.length && !scoped.some((lib) => lib.libraryId === libraryId)) {
      setLibraryId(scoped[0].libraryId);
    }
  }, [libraries, tenantId, libraryId]);

  const loadChunks = async (docId: string) => {
    if (!docId) {
      setChunks([]);
      setChunkEdits({});
      return;
    }
    try {
      const response = await fetchDocumentChunks(docId, {
        tenantId: tenantId || undefined,
        libraryId: libraryId || undefined
      });
      setChunks(response.items ?? []);
      const initial: Record<string, string> = {};
      (response.items ?? []).forEach((item: any) => {
        initial[item.chunk.chunkId] = (item.chunk.topicLabels ?? []).join(",");
      });
      setChunkEdits(initial);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const handleChunkSave = async (chunkId: string) => {
    const tags = chunkEdits[chunkId]
      ?.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean) ?? [];
    setStatus("更新块标签中…");
    try {
      await updateChunkTags(chunkId, tags, { tenantId: tenantId || undefined, libraryId: libraryId || undefined });
      await loadChunks(selectedId);
      setStatus("块标签已更新");
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
      await refreshDocuments();
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
      await reindexDocument(selectedId, tenantId || undefined, libraryId || undefined);
      setStatus("任务已入队");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="eyebrow">治理面板</p>
          <h2>元数据管理</h2>
        </div>
        {status && <span className="status-pill">{status}</span>}
      </header>
      <div className="toolbar">
        <label>
          租户
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {tenants.length
              ? tenants.map((tenant) => (
                  <option key={tenant.tenantId} value={tenant.tenantId}>
                    {tenant.displayName ?? tenant.tenantId}（{tenant.tenantId}）
                  </option>
                ))
              : <option value="default">默认租户</option>}
          </select>
        </label>
        <label>
          知识库
          <select value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
            {libraries
              .filter((lib) => !lib.tenantId || lib.tenantId === tenantId)
              .map((lib) => (
                <option key={lib.libraryId} value={lib.libraryId}>
                  {lib.displayName ?? lib.libraryId}（{lib.libraryId}）
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            refreshDocuments();
            refreshStats();
          }}
        >
          刷新列表/统计
        </button>
        <button type="button" className="ghost" onClick={refreshOrgOptions}>
          刷新配置
        </button>
      </div>
      {orgLoading && <p className="muted-text">同步租户/库列表中…</p>}
      {orgError && <p className="muted-text">{orgError}</p>}
      {stats && (
        <div className="stat-grid">
          <div className="stat-card">
            <span>Documents</span>
            <strong>{stats.documents}</strong>
          </div>
          <div className="stat-card">
            <span>Attachments</span>
            <strong>{stats.attachments}</strong>
          </div>
          <div className="stat-card">
            <span>Chunks</span>
            <strong>{stats.chunks}</strong>
          </div>
          <div className="stat-card">
            <span>Pending Jobs</span>
            <strong>{stats.pendingJobs}</strong>
          </div>
        </div>
      )}
      <div className="stacked-form">
        <label>
          选择文档
          <select
            value={selectedId}
            onChange={(e) => {
              const docId = e.target.value;
              setSelectedId(docId);
              loadChunks(docId);
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
        <div className="button-row">
          <button type="button" className="ghost" onClick={handleReindex} disabled={!selectedId}>
            重新索引文档
          </button>
          <button type="button" className="danger" onClick={handleDelete} disabled={!selectedId}>
            删除文档
          </button>
        </div>
      </div>
      {chunks.length ? (
        <div className="chunk-grid">
          {chunks.map((item) => (
            <article key={item.chunk.chunkId} className="result-card compact">
              <header>
                <div>
                  <p className="eyebrow">{item.chunk.hierPath?.join(" / ") ?? "未命名段落"}</p>
                  <h3>{item.chunk.contentType}</h3>
                </div>
                <span className="badge subtle">{item.chunk.contentType}</span>
              </header>
              <p className="result-snippet">{item.chunk.contentText ?? "-"}</p>
              <label>
                块标签（逗号分隔）
                <input
                  value={chunkEdits[item.chunk.chunkId] ?? ""}
                  onChange={(e) =>
                    setChunkEdits((prev) => ({ ...prev, [item.chunk.chunkId]: e.target.value }))
                  }
                />
              </label>
              <div className="button-row">
                <button type="button" onClick={() => handleChunkSave(item.chunk.chunkId)}>
                  保存块标签
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="placeholder">选择文档后可编辑各文本块标签。</p>
      )}
    </section>
  );
}
