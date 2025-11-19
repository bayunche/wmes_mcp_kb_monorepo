import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listDocuments } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";

type DocSummary = {
  docId: string;
  title: string;
  ingestStatus?: string;
  tenantId?: string;
  libraryId?: string;
  tags?: string[];
  errorMessage?: string;
};

export default function DocumentsList() {
  const [tenantFilter, setTenantFilter] = useState("default");
  const [libraryFilter, setLibraryFilter] = useState("default");
  const [documents, setDocuments] = useState<DocSummary[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const { tenants, libraries, loading: orgLoading, error: orgError, refresh: refreshOrgOptions } = useOrgOptions();

  const load = async () => {
    setStatus("加载文档中…");
    try {
      const response = await listDocuments(tenantFilter || undefined, libraryFilter || undefined);
      setDocuments(response.items ?? []);
      setStatus(null);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, [tenantFilter, libraryFilter]);

  useEffect(() => {
    if (!tenants.length) return;
    if (!tenants.some((tenant) => tenant.tenantId === tenantFilter)) {
      setTenantFilter(tenants[0].tenantId);
    }
  }, [tenants, tenantFilter]);

  useEffect(() => {
    if (!libraries.length) return;
    const scoped = libraries.filter((lib) => !lib.tenantId || lib.tenantId === tenantFilter);
    if (scoped.length && !scoped.some((lib) => lib.libraryId === libraryFilter)) {
      setLibraryFilter(scoped[0].libraryId);
    }
  }, [libraries, tenantFilter, libraryFilter]);

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="eyebrow">档案</p>
          <h2>文档列表</h2>
        </div>
        {status && <span className="status-pill">{status}</span>}
      </header>
      <div className="toolbar">
        <label>
          租户
          <select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}>
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
          <select value={libraryFilter} onChange={(e) => setLibraryFilter(e.target.value)}>
            {libraries
              .filter((lib) => !lib.tenantId || lib.tenantId === tenantFilter)
              .map((lib) => (
                <option key={lib.libraryId} value={lib.libraryId}>
                  {lib.displayName ?? lib.libraryId}（{lib.libraryId}）
                </option>
              ))}
          </select>
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
              <th>ID</th>
              <th>标题</th>
              <th>库</th>
              <th>状态</th>
              <th>标签</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.docId}>
                <td>{doc.docId.slice(0, 8)}…</td>
                <td>{doc.title}</td>
                <td>{doc.libraryId ?? "default"}</td>
                <td>
                  {doc.ingestStatus ?? "-"}
                  {doc.ingestStatus === "failed" && doc.errorMessage && (
                    <div className="error-text">{doc.errorMessage}</div>
                  )}
                </td>
                <td>{doc.tags?.length ? doc.tags.join(", ") : "-"}</td>
                <td>
                  <Link to={`/documents/${doc.docId}`} className="link">详情</Link>
                  <Link to={`/documents/${doc.docId}/edit`} className="link">
                    编辑
                  </Link>
                </td>
              </tr>
            ))}
            {!documents.length && (
              <tr>
                <td colSpan={6} className="placeholder">
                  暂无数据，尝试上传新文档。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
