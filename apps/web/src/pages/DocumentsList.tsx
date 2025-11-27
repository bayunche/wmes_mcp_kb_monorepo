import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listDocuments } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "../components/ui/Toast";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatusPill } from "../components/ui/StatusPill";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { Badge } from "../components/ui/Badge";

interface DocItem {
  docId: string;
  title: string;
  ingestStatus?: string;
  tags?: string[];
  libraryId?: string;
  tenantId?: string;
}

const STATUS_LABELS: Record<string, { label: string; tone: "info" | "success" | "warning" | "danger" }> = {
  uploaded: { label: "待入库", tone: "warning" },
  parsed: { label: "解析完成", tone: "info" },
  indexed: { label: "已入库", tone: "success" },
  failed: { label: "失败", tone: "danger" }
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition";

export default function DocumentsList() {
  const { tenants, libraries } = useOrgOptions();
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [items, setItems] = useState<DocItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "uploaded" | "parsed" | "indexed" | "failed">("all");
  const toast = useToast();

  const loadTask = useAsyncTask(
    async () => {
      const data = await listDocuments(tenantId || undefined, libraryId || "default");
      setItems(data.items ?? []);
      return data.items?.length ?? 0;
    },
    {
      loadingMessage: "加载文档列表中...",
      successMessage: (total) => `共 ${total} 篇文档`,
      errorMessage: (error) => error.message
    }
  );

  useEffect(() => {
    loadTask
      .run()
      .catch((error) => toast.push({ title: "加载失败", description: (error as Error).message, tone: "danger" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, libraryId]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((item) => (item.ingestStatus ?? "uploaded") === statusFilter);
  }, [items, statusFilter]);

  const statusTone = loadTask.status.phase === "error" ? "danger" : loadTask.status.phase === "success" ? "success" : "info";

  return (
    <div className="space-y-4">
      <GlassCard className="p-6 space-y-3">
        <SectionHeader
          eyebrow="文档资产"
          title="文档列表与状态"
          description="按租户/知识库筛选，查看解析/入库状态与标签，支持跳转详情/编辑。"
          status={loadTask.status.message ? <StatusPill tone={statusTone}>{loadTask.status.message}</StatusPill> : undefined}
        />
        <p className="text-sm text-slate-600">
          支持状态过滤：待入库 / 解析完成 / 已入库 / 失败；方便运营侧快速定位文档。
        </p>
      </GlassCard>
      <GlassCard className="space-y-4">
        <div className="split">
          <div className="flex flex-wrap items-center gap-2">
            <select className={inputClass} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              {(tenants.length ? tenants : [{ tenantId: "default", displayName: "default" }]).map((item) => (
                <option key={item.tenantId} value={item.tenantId}>
                  {item.displayName ?? item.tenantId}
                </option>
              ))}
            </select>
            <select className={inputClass} value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
              {(libraries.length ? libraries : [{ libraryId: "default", displayName: "default" }])
                .filter((lib) => !lib.tenantId || lib.tenantId === tenantId)
                .map((lib) => (
                  <option key={lib.libraryId} value={lib.libraryId}>
                    {lib.displayName ?? lib.libraryId}
                  </option>
                ))}
            </select>
            <Button variant="ghost" onClick={loadTask.run}>
              刷新
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
                    </tr>
                  ))
                : filtered.map((item) => {
                    const label = STATUS_LABELS[item.ingestStatus ?? "uploaded"] ?? STATUS_LABELS.uploaded;
                    return (
                      <tr key={item.docId}>
                        <td>{item.docId}</td>
                        <td>
                          <div className="doc-title">{item.title}</div>
                          <div className="meta-muted">
                            {item.tenantId ?? tenantId} · {item.libraryId ?? libraryId}
                          </div>
                        </td>
                        <td>
                          <StatusPill tone={label.tone}>{label.label}</StatusPill>
                        </td>
                        <td>
                          <div className="tag-inline">
                            {item.tags?.length ? (
                              item.tags.map((tag) => (
                                <Badge key={`${item.docId}-${tag}`} tone="info">
                                  {tag}
                                </Badge>
                              ))
                            ) : (
                              <span className="meta-muted">-</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <Button asChild variant="ghost">
                            <Link to={`/documents/${item.docId}`}>查看</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              {!filtered.length && loadTask.status.phase !== "loading" && (
                <tr>
                  <td colSpan={5} className="placeholder">
                    暂无记录，请调整筛选后再试
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
