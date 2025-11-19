import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStats, listDocuments, reindexDocument } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";

type DocSummary = {
  docId: string;
  title: string;
  ingestStatus?: string;
  tenantId?: string;
  libraryId?: string;
  updatedAt?: string;
  sizeBytes?: number;
  tags?: string[];
  errorMessage?: string;
};

const STATUS_LABELS: Record<string, { label: string; tone: "info" | "success" | "warning" | "danger" }> = {
  uploaded: { label: "等待入队", tone: "warning" },
  parsed: { label: "解析完成", tone: "info" },
  indexed: { label: "已入库", tone: "success" },
  failed: { label: "失败", tone: "danger" }
};

function formatBytes(value?: number) {
  if (!value || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function IngestionStatusPanel({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [tenant, setTenant] = useState("default");
  const [library, setLibrary] = useState("default");
  const { tenants, libraries, loading: orgLoading, error: orgError, refresh } = useOrgOptions();
  const [documents, setDocuments] = useState<DocSummary[]>([]);
  const [pendingJobs, setPendingJobs] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "uploaded" | "parsed" | "indexed" | "failed">("all");

  const load = useCallback(async () => {
    try {
      setStatus("同步状态中…");
      const [docResp, statsResp] = await Promise.all([
        listDocuments(tenant || undefined, library || undefined),
        fetchStats(tenant || undefined, library || undefined)
      ]);
      setDocuments(docResp.items ?? []);
      setPendingJobs(statsResp?.pendingJobs ?? 0);
      setStatus(null);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [tenant, library]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load, refreshSignal]);

  useEffect(() => {
    if (!tenants.length) return;
    if (!tenants.some((item) => item.tenantId === tenant)) {
      setTenant(tenants[0].tenantId);
    }
  }, [tenants, tenant]);

  useEffect(() => {
    if (!libraries.length) return;
    const scoped = libraries.filter((lib) => !lib.tenantId || lib.tenantId === tenant);
    if (scoped.length && !scoped.some((lib) => lib.libraryId === library)) {
      setLibrary(scoped[0].libraryId);
    }
  }, [libraries, tenant, library]);

  const orderedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    if (statusFilter === "all") return orderedDocuments;
    return orderedDocuments.filter((doc) => (doc.ingestStatus ?? "uploaded") === statusFilter);
  }, [orderedDocuments, statusFilter]);

  const handleRetry = async (doc: DocSummary) => {
    try {
      setStatus("重新排队中…");
      const effectiveTenant = doc.tenantId ?? (tenant || undefined);
      const effectiveLibrary = doc.libraryId ?? (library || undefined);
      await reindexDocument(doc.docId, effectiveTenant, effectiveLibrary);
      await load();
      setStatus("已重新排队");
      setTimeout(() => setStatus(null), 1500);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="eyebrow">队列</p>
          <h2>处理进度</h2>
        </div>
        {status && <span className="status-pill info">{status}</span>}
      </header>
      <div className="toolbar">
        <label>
          租户
          <select value={tenant} onChange={(event) => setTenant(event.target.value)}>
            {tenants.length
              ? tenants.map((item) => (
                  <option key={item.tenantId} value={item.tenantId}>
                    {item.displayName ?? item.tenantId}（{item.tenantId}）
                  </option>
                ))
              : <option value="default">默认租户</option>}
          </select>
        </label>
        <label>
          知识库
          <select value={library} onChange={(event) => setLibrary(event.target.value)}>
            {libraries
              .filter((lib) => !lib.tenantId || lib.tenantId === tenant)
              .map((lib) => (
                <option key={lib.libraryId} value={lib.libraryId}>
                  {lib.displayName ?? lib.libraryId}（{lib.libraryId}）
                </option>
              ))}
          </select>
        </label>
        <button type="button" className="ghost" onClick={load}>
          手动刷新
        </button>
        <button type="button" className="ghost" onClick={refresh}>
          刷新配置
        </button>
        <div className="stat-grid" style={{ flex: 1 }}>
          <div className="stat-card">
            <span>队列待处理</span>
            <strong>{pendingJobs}</strong>
          </div>
        </div>
      </div>
      {orgLoading && <p className="muted-text">同步租户/知识库列表中…</p>}
      {orgError && <p className="muted-text">{orgError}</p>}
      <p className="guide-hint">解析完成后会自动生成主题标签，方便在检索页过滤。</p>
      <div className="pill-switch">
        {[
          { key: "all", label: "全部" },
          { key: "uploaded", label: "待入队" },
          { key: "parsed", label: "解析完成" },
          { key: "indexed", label: "已入库" },
          { key: "failed", label: "失败" }
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            className={statusFilter === option.key ? "pill-option is-active" : "pill-option"}
            onClick={() => setStatusFilter(option.key as typeof statusFilter)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>文档 / 标签</th>
              <th>Tenant</th>
              <th>库</th>
              <th>大小</th>
              <th>状态</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.slice(0, 8).map((doc) => {
              const statusMeta = STATUS_LABELS[doc.ingestStatus ?? "uploaded"] ?? STATUS_LABELS.uploaded;
              const dateText = doc.updatedAt
                ? new Date(doc.updatedAt).toLocaleString()
                : "-";
              return (
                <tr key={doc.docId}>
                <td>
                  <div className="doc-title">{doc.title}</div>
                  {doc.ingestStatus === "failed" && doc.errorMessage && (
                    <div className="error-text">{doc.errorMessage}</div>
                  )}
                  <div className="tag-inline">
                    {doc.tags?.length ? (
                      doc.tags.slice(0, 4).map((tag) => (
                        <span key={`${doc.docId}-${tag}`} className="tag-chip subtle">
                          {tag}
                          </span>
                        ))
                      ) : (
                        <span className="meta-muted">等待自动标签…</span>
                      )}
                    </div>
                  </td>
                  <td>{doc.tenantId ?? "-"}</td>
                  <td>{doc.libraryId ?? "default"}</td>
                  <td>{formatBytes(doc.sizeBytes)}</td>
                  <td>
                    <span className={`status-pill ${statusMeta.tone}`}>{statusMeta.label}</span>
                  </td>
                  <td>{dateText}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => handleRetry(doc)}
                      disabled={!["indexed", "failed"].includes(doc.ingestStatus ?? "")}
                    >
                      重新索引
                    </button>
                  </td>
                </tr>
              );
            })}
            {!filteredDocuments.length && (
              <tr>
                <td colSpan={7} className="placeholder">
                  暂无记录，请尝试更换筛选条件或上传新文档。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
