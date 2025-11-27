import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLibraryChunks } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { useToast } from "../components/ui/Toast";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatusPill } from "../components/ui/StatusPill";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";

interface ChunkListItem {
  chunk: {
    chunkId: string;
    docId: string;
    sectionTitle?: string;
    semanticTitle?: string;
    hierPath?: string[];
    topicLabels?: string[];
    semanticTags?: string[];
    envLabels?: string[];
    keywords?: string[];
    pageNo?: number;
    createdAt?: string;
    contentText?: string;
  };
  document: {
    docId: string;
    title: string;
    tags?: string[];
    ingestStatus?: string;
  };
  attachments?: { assetType?: string; filename?: string }[];
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition";

export default function ChunkListPage() {
  const toast = useToast();
  const { tenants, libraries } = useOrgOptions();
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [docId, setDocId] = useState("");
  const [items, setItems] = useState<ChunkListItem[]>([]);

  const loadTask = useAsyncTask(
    async () => {
      const data = await fetchLibraryChunks(libraryId || "default", {
        tenantId: tenantId || undefined,
        docId: docId.trim() || undefined,
        limit: 100
      });
      setItems(data.items ?? []);
      return data.total ?? data.items?.length ?? 0;
    },
    {
      loadingMessage: "加载分块�?..",
      successMessage: (total) => `�?${total} 个分块`,
      errorMessage: (err) => err.message
    }
  );

  useEffect(() => {
    loadTask
      .run()
      .catch((error) =>
        toast.push({ title: "加载失败", description: (error as Error).message, tone: "danger" })
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, libraryId, docId]);

  const statusTone =
    loadTask.status.phase === "error" ? "danger" : loadTask.status.phase === "success" ? "success" : "info";

  const filtered = useMemo(() => items, [items]);

  return (
    <div className="panel-grid single-column">
      <GlassCard className="space-y-4">
        <SectionHeader
          eyebrow="分块列表"
          title="查看分块、路径与标签"
          status={
            loadTask.status.message ? (
              <StatusPill tone={statusTone}>{loadTask.status.message}</StatusPill>
            ) : undefined
          }
        />

        <div className="split gap-3">
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
            <input
              className={inputClass}
              placeholder="�?Doc ID 过滤（可选）"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
            />
            <Button variant="ghost" onClick={loadTask.run}>
              刷新
            </Button>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Chunk ID</th>
                <th>标题/路径</th>
                <th>所属文�?/th>
                <th>标签</th>
                <th>页码</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loadTask.status.phase === "loading"
                ? Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={`s-${idx}`}>
                      <td><Skeleton width="80%" /></td>
                      <td><Skeleton width="90%" /></td>
                      <td><Skeleton width="70%" /></td>
                      <td><Skeleton width="80%" /></td>
                      <td><Skeleton width="40%" /></td>
                      <td><Skeleton width="60%" /></td>
                    </tr>
                  ))
                : filtered.map((item) => (
                    <tr key={item.chunk.chunkId}>
                      <td className="font-mono text-xs">{item.chunk.chunkId}</td>
                      <td>
                        <div className="doc-title">{item.chunk.semanticTitle ?? item.chunk.sectionTitle ?? "未命�?}</div>
                        <div className="meta-muted">
                          {item.chunk.hierPath?.join(" / ") || "无层�?} ·{" "}
                          {item.chunk.createdAt ? new Date(item.chunk.createdAt).toLocaleString() : ""}
                        </div>
                      </td>
                      <td>
                        <div className="doc-title">{item.document.title}</div>
                        <div className="meta-muted">{item.document.docId}</div>
                      </td>
                      <td>
                        <div className="tag-inline">
                          {(item.chunk.topicLabels ?? item.chunk.semanticTags ?? []).slice(0, 4).map((tag) => (
                            <Badge key={`${item.chunk.chunkId}-${tag}`} tone="info">
                              {tag}
                            </Badge>
                          ))}
                          {item.chunk.envLabels?.slice(0, 2).map((env) => (
                            <Badge key={`${item.chunk.chunkId}-env-${env}`} tone="neutral">
                              {env}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td>{item.chunk.pageNo ?? "-"}</td>
                      <td>
                        <Button asChild variant="ghost">
                          <Link to={/chunks/}>详情</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
              {!filtered.length && loadTask.status.phase !== "loading" && (
                <tr>
                  <td colSpan={6} className="placeholder">
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




