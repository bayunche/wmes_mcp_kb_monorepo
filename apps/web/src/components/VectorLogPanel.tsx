import { useCallback, useMemo, useState, useEffect } from "react";
import { fetchVectorLogs } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";

interface VectorLogEntry {
  logId: string;
  chunkId?: string;
  docId: string;
  modelRole: string;
  provider: string;
  modelName: string;
  driver: "local" | "remote";
  status: "success" | "failed";
  durationMs: number;
  vectorDim?: number;
  inputChars?: number;
  ocrUsed?: boolean;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
}

const STEP_MAP: Record<string, { label: string; description: string }> = {
  ocr: { label: "OCR", description: "图片/PDF 转文本" },
  tagging: { label: "自动标签", description: "LLM 生成主题标签" },
  metadata: { label: "语义摘要", description: "上下文理解与环境标签" },
  embedding: { label: "向量化", description: "本地模型生成向量" },
  rerank: { label: "重排", description: "可选 reranker" }
};

function summarizeStep(logs: VectorLogEntry[], role: string) {
  const entries = logs.filter((log) => log.modelRole === role);
  if (!entries.length) {
    return { status: "pending", duration: 0 } as const;
  }
  const failed = entries.some((entry) => entry.status === "failed");
  const duration = entries.reduce((sum, entry) => sum + entry.durationMs, 0);
  return { status: failed ? "failed" : "done", duration } as const;
}

export function VectorLogPanel() {
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [docId, setDocId] = useState("");
  const [chunkId, setChunkId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [logs, setLogs] = useState<VectorLogEntry[]>([]);
  const { tenants, libraries, loading: orgLoading, error: orgError, refresh: refreshOrgOptions } = useOrgOptions();

  const loadLogs = useCallback(async () => {
    if (!docId.trim().length && !chunkId.trim().length) {
      setStatus("请输入 Doc ID 或 Chunk ID");
      return;
    }
    setStatus("拉取日志中…");
    try {
      const response = await fetchVectorLogs({
        tenantId: tenantId || undefined,
        libraryId: libraryId || undefined,
        docId: docId.trim() || undefined,
        chunkId: chunkId.trim() || undefined,
        limit: 200
      });
      setLogs(response.items ?? []);
      setStatus(`共 ${response.items?.length ?? 0} 条`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [tenantId, libraryId, docId, chunkId]);

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

  const timeline = useMemo(() => {
    return Object.entries(STEP_MAP).map(([role, meta]) => {
      const summary = summarizeStep(logs, role);
      return {
        role,
        label: meta.label,
        description: meta.description,
        status: summary.status,
        duration: summary.duration
      };
    });
  }, [logs]);

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="eyebrow">流程实时追踪</p>
          <h2>向量化 / 语义日志</h2>
        </div>
        {status && <span className="status-pill info">{status}</span>}
      </header>
      <form
        className="stacked-form"
        onSubmit={(event) => {
          event.preventDefault();
          loadLogs();
        }}
      >
        <div className="split">
          <label>
            租户
            <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
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
            <select value={libraryId} onChange={(event) => setLibraryId(event.target.value)}>
              {libraries
                .filter((lib) => !lib.tenantId || lib.tenantId === tenantId)
                .map((lib) => (
                  <option key={lib.libraryId} value={lib.libraryId}>
                    {lib.displayName ?? lib.libraryId}（{lib.libraryId}）
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="split">
          <label>
            Doc ID
            <input value={docId} onChange={(event) => setDocId(event.target.value)} placeholder="必填其一" />
          </label>
          <label>
            Chunk ID (可选)
            <input value={chunkId} onChange={(event) => setChunkId(event.target.value)} placeholder="仅查看指定 chunk" />
          </label>
        </div>
        <div className="button-row">
          <button type="submit">加载日志</button>
          <button type="button" className="ghost" onClick={refreshOrgOptions}>
            刷新租户/知识库
          </button>
        </div>
      </form>
      {orgLoading && <p className="muted-text">同步租户/知识库中…</p>}
      {orgError && <p className="muted-text">{orgError}</p>}
      <div className="timeline">
        {timeline.map((item) => (
          <div key={item.role} className={`timeline-step status-${item.status}`}>
            <div className="timeline-indicator" />
            <div>
              <p className="eyebrow">{item.label}</p>
              <h3>{item.status === "pending" ? "等待" : item.status === "failed" ? "失败" : "完成"}</h3>
              <p className="meta-muted">{item.description}</p>
              {item.duration > 0 && <small className="meta-muted">耗时 {item.duration} ms</small>}
            </div>
          </div>
        ))}
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>阶段</th>
              <th>模型</th>
              <th>耗时</th>
              <th>状态</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.logId}>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
                <td>{STEP_MAP[log.modelRole]?.label ?? log.modelRole}</td>
                <td>
                  <div className="doc-title">{log.modelName}</div>
                  <small className="meta-muted">{log.provider}</small>
                </td>
                <td>{log.durationMs} ms</td>
                <td>
                  <span className={`status-pill ${log.status === "success" ? "success" : "danger"}`}>
                    {log.status === "success" ? "成功" : "失败"}
                  </span>
                </td>
                <td>
                  {log.errorMessage ? (
                    <span className="meta-muted">{log.errorMessage}</span>
                  ) : log.metadata ? (
                    <code className="code-inline">{JSON.stringify(log.metadata)}</code>
                  ) : (
                    <span className="meta-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan={6} className="placeholder">
                  暂无日志，请输入 Doc ID 或 Chunk ID 后查询。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
