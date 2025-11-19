import { useEffect, useState } from "react";
import { MetadataEditor } from "../components/MetadataEditor";
import { fetchLibraryChunks, reindexDocument } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";

interface ChunkItem {
  chunk: {
    chunkId: string;
    hierPath?: string[];
    contentText?: string;
    contentType: string;
    topicLabels?: string[];
    entities?: Record<string, unknown>;
    createdAt?: string;
  };
  document?: {
    docId: string;
    title?: string;
    libraryId?: string;
    tenantId?: string;
    tags?: string[];
  };
  attachments: { assetId: string; assetType: string; objectKey: string }[];
}

export default function GovernancePage() {
  const [libraryId, setLibraryId] = useState("default");
  const [tenantId, setTenantId] = useState("default");
  const [docFilter, setDocFilter] = useState("");
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const { tenants, libraries, loading: orgLoading, error: orgError, refresh: refreshOrgOptions } = useOrgOptions();

  const load = async () => {
    setStatus("加载块级元数据…");
    try {
      const response = await fetchLibraryChunks(libraryId || undefined, {
        tenantId: tenantId || undefined,
        docId: docFilter || undefined,
        limit: 100
      });
      setChunks(response.items ?? []);
      setStatus(`共 ${response.total ?? 0} 条记录`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, [libraryId, tenantId, docFilter]);

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

  const handleReindex = async (docId: string) => {
    try {
      setStatus("重新入队中…");
      await reindexDocument(docId, tenantId || undefined, libraryId || undefined);
      setStatus("任务已入队");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <div className="panel-grid single-column">
      <MetadataEditor refreshToken={0} />
      <section className="card card--tall">
        <header className="card-header">
          <div>
            <p className="eyebrow">治理</p>
            <h2>块级元数据</h2>
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
          <label>
            Doc ID（可选）
            <input value={docFilter} onChange={(e) => setDocFilter(e.target.value)} placeholder="按需筛选" />
          </label>
          <button type="button" className="ghost" onClick={load}>
            刷新
          </button>
          <button type="button" className="ghost" onClick={refreshOrgOptions}>
            刷新配置
          </button>
        </div>
        {orgLoading && <p className="muted-text">同步租户/知识库中…</p>}
        {orgError && <p className="muted-text">{orgError}</p>}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>块 ID</th>
                <th>所属文档</th>
                <th>层级</th>
                <th>标签 / 元数据</th>
                <th>附件</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {chunks.map((item) => (
                <tr key={item.chunk.chunkId}>
                  <td>{item.chunk.chunkId.slice(0, 8)}…</td>
                  <td>
                    <div className="doc-title">{item.document?.title ?? item.document?.docId ?? "-"}</div>
                    <div className="meta-muted">
                      {item.document?.tenantId ?? tenantId} · {item.document?.libraryId ?? libraryId}
                    </div>
                  </td>
                  <td>{item.chunk.hierPath?.join(" / ") ?? "-"}</td>
                  <td>
                    <div className="tag-inline">
                      {item.chunk.topicLabels?.length ? (
                        item.chunk.topicLabels.slice(0, 4).map((tag) => (
                          <span key={`${item.chunk.chunkId}-${tag}`} className="tag-chip">
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="meta-muted">暂无主题</span>
                      )}
                    </div>
                    {item.document?.tags?.length ? (
                      <div className="tag-inline">
                        {item.document.tags.map((tag) => (
                          <span key={`${item.document?.docId}-${tag}`} className="tag-chip subtle">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {item.attachments?.length ? (
                      <ul className="inline-list">
                        {item.attachments.map((att) => (
                          <li key={att.assetId}>{att.assetType} · {att.objectKey}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="meta-muted">-</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ghost"
                      disabled={!item.document?.docId}
                      onClick={() => item.document?.docId && handleReindex(item.document.docId)}
                    >
                      重新索引
                    </button>
                  </td>
                </tr>
              ))}
              {!chunks.length && (
                <tr>
                  <td colSpan={6} className="placeholder">
                    未找到记录，尝试调整筛选条件。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
