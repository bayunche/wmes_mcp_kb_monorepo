import { useCallback, useMemo, useState, useEffect } from "react";
import { fetchVectorLogs } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { GlassCard } from "./ui/GlassCard";
import { SectionHeader } from "./ui/SectionHeader";
import { StatusPill } from "./ui/StatusPill";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import { Skeleton } from "./ui/Skeleton";

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
  rerank: { label: "重排序", description: "可选 reranker" }
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition";

function summarizeStep(logs: VectorLogEntry[], role: string) {
  const entries = logs.filter((log) => log.modelRole === role);
  if (!entries.length) {
    return { status: "pending", duration: 0 } as const;
  }
  const failed = entries.some((log) => log.status === "failed");
  const duration = entries.reduce((acc, cur) => acc + cur.durationMs, 0);
  return { status: failed ? "failed" : "success", duration } as const;
}

export function VectorLogPanel() {
  const { tenants, libraries } = useOrgOptions();
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [docId, setDocId] = useState("");
  const [logs, setLogs] = useState<VectorLogEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setStatus("拉取向量日志中...");
    const response = await fetchVectorLogs({ tenantId, libraryId, docId: docId.trim() || undefined });
    setLogs(response.items ?? []);
    setStatus(`已获取 ${response.items?.length ?? 0} 条日志`);
  }, [tenantId, libraryId, docId]);

  useEffect(() => {
    loadLogs().catch((error) => setStatus(error.message));
  }, [loadLogs]);

  const summaries = useMemo(() => {
    return Object.keys(STEP_MAP).map((role) => ({
      role,
      ...STEP_MAP[role],
      ...summarizeStep(logs, role)
    }));
  }, [logs]);

  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        eyebrow="向量日志"
        title="处理链路健康与耗时"
        status={status ? <StatusPill tone="info">{status}</StatusPill> : null}
      />
      <div className="split">
        <Field label="租户">
          <select className={inputClass} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {(tenants.length ? tenants : [{ tenantId: "default", displayName: "default" }]).map((item) => (
              <option key={item.tenantId} value={item.tenantId}>
                {item.displayName ?? item.tenantId}
              </option>
            ))}
          </select>
        </Field>
        <Field label="知识库">
          <select className={inputClass} value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
            {(libraries.length ? libraries : [{ libraryId: "default", displayName: "default" }])
              .filter((lib) => !lib.tenantId || lib.tenantId === tenantId)
              .map((lib) => (
                <option key={lib.libraryId} value={lib.libraryId}>
                  {lib.displayName ?? lib.libraryId}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Doc ID（可选）" hint="留空则查看最近日志">
          <input className={inputClass} value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="过滤某个文档" />
        </Field>
        <div className="flex items-end gap-2">
          <Button onClick={loadLogs}>刷新</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {summaries.map((item) => (
          <div key={item.role} className="glass-card p-4 space-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">{item.label}</p>
                <p className="text-sm text-slate-700">{item.description}</p>
              </div>
              <StatusPill tone={item.status === "failed" ? "danger" : item.status === "success" ? "success" : "warning"}>
                {item.status === "success" ? "完成" : item.status === "failed" ? "失败" : "待处理"}
              </StatusPill>
            </div>
            <p className="muted-text">耗时：{item.duration ? `${item.duration} ms` : "-"}</p>
          </div>
        ))}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>步骤</th>
              <th>模型</th>
              <th>耗时</th>
              <th>状态</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {!logs.length && (
              <tr>
                <td colSpan={6} className="placeholder">暂无日志，点击刷新试试</td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.logId}>
                <td className="text-sm text-slate-700">{new Date(log.createdAt).toLocaleString()}</td>
                <td>{STEP_MAP[log.modelRole]?.label ?? log.modelRole}</td>
                <td>
                  <div className="doc-title">{log.modelName}</div>
                  <div className="meta-muted">{log.provider} · {log.driver}</div>
                </td>
                <td>{log.durationMs} ms</td>
                <td>
                  <StatusPill tone={log.status === "success" ? "success" : "danger"}>{log.status}</StatusPill>
                </td>
                <td className="text-sm text-slate-700 max-w-[280px] whitespace-pre-wrap">{log.errorMessage ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
