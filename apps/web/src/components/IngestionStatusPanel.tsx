import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchIngestionStatus, fetchStats, listDocuments, reindexDocument } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { AsyncPhase, useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "./ui/Toast";
import { GlassCard } from "./ui/GlassCard";
import { SectionHeader } from "./ui/SectionHeader";
import { StatusPill } from "./ui/StatusPill";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Skeleton } from "./ui/Skeleton";

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

type StageEntry = {
  stage: string;
  status: string;
  at: string;
  meta?: Record<string, unknown>;
};

const STATUS_LABELS: Record<string, { label: string; tone: "info" | "success" | "warning" | "danger" }> = {
  uploaded: { label: "待入库", tone: "warning" },
  parsed: { label: "解析完成", tone: "info" },
  indexed: { label: "已入库", tone: "success" },
  failed: { label: "失败", tone: "danger" }
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition";

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
  const [statusFilter, setStatusFilter] = useState<"all" | "uploaded" | "parsed" | "indexed" | "failed">("all");
  const [selectedDoc, setSelectedDoc] = useState<DocSummary | null>(null);
  const [timeline, setTimeline] = useState<StageEntry[]>([]);
  const { push: toastPush } = useToast();
  const reindexPhaseRef = useRef<AsyncPhase>("idle");
  const lastLoadKeyRef = useRef<string>("");

  const loadData = useCallback(async () => {
    const [docResp, statsResp] = await Promise.all([
      listDocuments(tenant || undefined, library || undefined),
      fetchStats(tenant || undefined, library || undefined)
    ]);
    setDocuments(docResp.items ?? []);
    setPendingJobs(statsResp?.pendingJobs ?? 0);
    return docResp.items?.length ?? 0;
  }, [tenant, library]);

  const loadTask = useAsyncTask(loadData, {
    loadingMessage: "同步队列状态中...",
    successMessage: (total) => `共 ${total} 篇文档`,
    errorMessage: (error) => error.message
  });

  useEffect(() => {
    const key = `${tenant}|${library}|${refreshSignal}`;
    if (lastLoadKeyRef.current === key && loadTask.status.phase !== "idle") return;
    lastLoadKeyRef.current = key;
    loadTask.run().catch((error) => {
      toastPush({ title: "获取队列失败", description: (error as Error).message, tone: "danger" });
    });
    // 仅在筛选条件变化或外部刷新信号时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, library, refreshSignal]);

  const reindexTask = useAsyncTask(
    async (docId: string) => {
      await reindexDocument(docId, tenant || undefined, library || undefined);
    },
    {
      loadingMessage: "重新排队重建索引...",
      successMessage: "任务已入队",
      errorMessage: (error) => error.message
    }
  );

  useEffect(() => {
    const { phase, message } = reindexTask.status;
    if (phase === reindexPhaseRef.current) return;
    reindexPhaseRef.current = phase;

    if (phase === "success" && message) {
      toastPush({ title: message, tone: "success" });
      loadTask.run().catch((error) =>
        toastPush({ title: "获取队列失败", description: (error as Error).message, tone: "danger" })
      );
    }
    if (phase === "error" && message) {
      toastPush({ title: "重新排队失败", description: message, tone: "danger" });
    }
  }, [reindexTask.status.phase, reindexTask.status.message, toastPush, loadTask.run]);

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

  const filtered = useMemo(() => {
    if (statusFilter === "all") return documents;
    return documents.filter((doc) => (doc.ingestStatus ?? "uploaded") === statusFilter);
  }, [documents, statusFilter]);

  const loadTimeline = useAsyncTask(
    async (docId: string) => {
      const resp = await fetchIngestionStatus(docId);
      const stages: StageEntry[] = resp.statusMeta?.stages ?? [];
      setTimeline(stages);
      return stages.length;
    },
    {
      loadingMessage: "同步进度...",
      successMessage: (count) => `共 ${count} 条进度`,
      errorMessage: (err) => err.message
    }
  );

  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        eyebrow="入库队列"
        title="解析 / 切分 / 向量化 状态面板"
        status={
          loadTask.status.message ? (
            <StatusPill tone={loadTask.status.phase === "error" ? "danger" : "info"}>
              {loadTask.status.message}
            </StatusPill>
          ) : undefined
        }
      />
      <div className="split">
        <div className="space-y-2">
          <select className={inputClass} value={tenant} onChange={(e) => setTenant(e.target.value)}>
            {(tenants.length ? tenants : [{ tenantId: "default", displayName: "default" }]).map((item) => (
              <option key={item.tenantId} value={item.tenantId}>
                {item.displayName ?? item.tenantId}
              </option>
            ))}
          </select>
          <select className={inputClass} value={library} onChange={(e) => setLibrary(e.target.value)}>
            {(libraries.length ? libraries : [{ libraryId: "default", displayName: "default" }])
              .filter((lib) => !lib.tenantId || lib.tenantId === tenant)
              .map((lib) => (
                <option key={lib.libraryId} value={lib.libraryId}>
                  {lib.displayName ?? lib.libraryId}
                </option>
              ))}
          </select>
          <Button variant="ghost" onClick={refresh}>
            刷新租户/库
          </Button>
        </div>
        <div className="pill-switch">
          {(["all", "uploaded", "parsed", "indexed", "failed"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`pill-option ${statusFilter === key ? "is-active" : ""}`}
              onClick={() => setStatusFilter(key)}
            >
              {STATUS_LABELS[key]?.label ?? "全部"}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Doc ID</th>
              <th>标题</th>
              <th>状态</th>
              <th>标签</th>
              <th>大小</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loadTask.status.phase === "loading"
              ? Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`}>
                    <td><Skeleton width="80%" /></td>
                    <td><Skeleton width="90%" /></td>
                    <td><Skeleton width="50%" /></td>
                    <td><Skeleton width="60%" /></td>
                    <td><Skeleton width="40%" /></td>
                    <td><Skeleton width="60%" /></td>
                  </tr>
                ))
              : filtered.map((doc) => {
                  const label = STATUS_LABELS[doc.ingestStatus ?? "uploaded"] ?? STATUS_LABELS.uploaded;
                  return (
                    <tr key={doc.docId}>
                      <td>{doc.docId}</td>
                      <td>
                        <div className="doc-title">{doc.title}</div>
                        <div className="meta-muted">
                          {doc.tenantId ?? tenant} · {doc.libraryId ?? library}
                        </div>
                        {doc.errorMessage && <p className="meta-muted">{doc.errorMessage}</p>}
                      </td>
                      <td>
                        <StatusPill tone={label.tone}>{label.label}</StatusPill>
                      </td>
                      <td>
                        <div className="tag-inline">
                          {doc.tags?.map((tag) => (
                            <Badge key={`${doc.docId}-${tag}`} tone="info">
                              {tag}
                            </Badge>
                          )) || <span className="meta-muted">-</span>}
                        </div>
                      </td>
                      <td>{formatBytes(doc.sizeBytes)}</td>
                      <td>
                        <div className="button-row compact">
                          <Button
                            variant="ghost"
                            disabled={reindexTask.status.phase === "loading"}
                            onClick={() =>
                              reindexTask.run(doc.docId).catch((error) =>
                                toastPush({ title: "重新排队失败", description: (error as Error).message, tone: "danger" })
                              )
                            }
                          >
                            重新索引
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setSelectedDoc(doc);
                              loadTimeline.run(doc.docId).catch((error) =>
                                toastPush({
                                  title: "获取进度失败",
                                  description: (error as Error).message,
                                  tone: "danger"
                                })
                              );
                            }}
                          >
                            进度
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            {!filtered.length && loadTask.status.phase !== "loading" && (
              <tr>
                <td colSpan={6} className="placeholder">
                  暂无记录，切换筛选后再试
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted-text" style={{ marginTop: "0.75rem" }}>
        待处理作业：<strong>{pendingJobs}</strong>
      </p>
      {orgLoading && <p className="muted-text">正在同步租户/知识库...</p>}
      {orgError && <p className="muted-text">{orgError}</p>}

      {selectedDoc && (
        <GlassCard className="space-y-3 bg-white/80">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">任务进度</div>
              <div className="doc-title">{selectedDoc.title}</div>
              <div className="meta-muted">{selectedDoc.docId}</div>
            </div>
            {loadTimeline.status.message && (
              <StatusPill tone={loadTimeline.status.phase === "error" ? "danger" : "info"}>
                {loadTimeline.status.message}
              </StatusPill>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {loadTimeline.status.phase === "loading" && <Skeleton height="24px" />}
            {timeline.length === 0 && loadTimeline.status.phase !== "loading" && (
              <p className="meta-muted text-sm">暂无阶段日志，请稍后重试</p>
            )}
            {timeline
              .slice()
              .sort((a, b) => a.at.localeCompare(b.at))
              .map((item) => (
                <div
                  key={`${item.stage}-${item.at}`}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm"
                >
                  <span className="badge info">{item.stage}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{item.status}</span>
                      <span className="text-xs text-slate-500">{new Date(item.at).toLocaleString()}</span>
                    </div>
                    {item.meta && Object.keys(item.meta).length > 0 && (
                      <div className="text-xs text-slate-600 mt-1">{JSON.stringify(item.meta)}</div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </GlassCard>
      )}
    </GlassCard>
  );
}

