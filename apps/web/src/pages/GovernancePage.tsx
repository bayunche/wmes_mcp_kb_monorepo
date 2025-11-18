import { useEffect, useState } from "react";
import { fetchLibraryChunks, reindexDocument } from "../api";

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
          Library ID
          <input value={libraryId} onChange={(e) => setLibraryId(e.target.value)} placeholder="default" />
        </label>
        <label>
          Tenant ID
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="default" />
        </label>
        <label>
          Doc ID
          <input value={docFilter} onChange={(e) => setDocFilter(e.target.value)} placeholder="按需筛选" />
        </label>
        <button type="button" className="ghost" onClick={load}>
          刷新
        </button>
      </div>
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
                    {item.document?.tenantId ?? "default"} · {item.document?.libraryId ?? libraryId}
                  </div>
                </td>
                <td>{item.chunk.hierPath?.join(" / ") ?? "-"}</td>
                <td>
                  <div className="tag-inline">
                    {item.chunk.topicLabels?.length
                      ? item.chunk.topicLabels.slice(0, 4).map((tag) => (
                          <span key={`${item.chunk.chunkId}-${tag}`} className="tag-chip">
                            {tag}
                          </span>
                        ))
                      : <span className="meta-muted">暂无主题</span>}
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
  );
}
