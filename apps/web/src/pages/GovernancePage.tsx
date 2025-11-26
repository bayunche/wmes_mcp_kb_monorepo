import { useEffect, useMemo, useState, useCallback } from "react";
import { MetadataEditor } from "../components/MetadataEditor";
import { fetchLibraryChunks, reindexDocument } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "../components/ui/Toast";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Field } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { StatusPill } from "../components/ui/StatusPill";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";

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

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition";

export default function GovernancePage() {
  const [libraryId, setLibraryId] = useState("default");
  const [tenantId, setTenantId] = useState("default");
  const [docFilter, setDocFilter] = useState("");
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const { tenants, libraries, loading: orgLoading, error: orgError, refresh: refreshOrgOptions } = useOrgOptions();
  const toast = useToast();

  const loadChunks = useCallback(async () => {
    const response = await fetchLibraryChunks(libraryId || undefined, {
      tenantId: tenantId || undefined,
      docId: docFilter || undefined,
      limit: 100
    });
    setChunks(response.items ?? []);
    return response.total ?? 0;
  }, [libraryId, tenantId, docFilter]);

  const loadTask = useAsyncTask(loadChunks, {
    loadingMessage: "正在加载 Chunk 列表...",
    successMessage: (total) => `共 ${total} 条记录`,
    errorMessage: (error) => error.message
  });

  const reindexTask = useAsyncTask(
    async (docId: string) => {
      await reindexDocument(docId, tenantId || undefined, libraryId || undefined);
    },
    {
      loadingMessage: "重新排队重建索引...",
      successMessage: "任务已入队",
      errorMessage: (error) => error.message
    }
  );

  useEffect(() => {
    loadTask
      .run()
      .catch((error) => toast.push({ title: "加载失败", description: (error as Error).message, tone: "danger" }));
    // 依赖具体筛选条件，避免因 run 引用变化导致循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, libraryId, docFilter]);

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

  const filtered = useMemo(() => chunks, [chunks]);

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-4">
        <SectionHeader
          eyebrow="治理"
          title="Chunk 标签 / 主题 / 附件治理"
          description="筛选库内 Chunk，补充标签、主题或重新索引"
          status={
            loadTask.status.message ? (
              <StatusPill tone={loadTask.status.phase === "error" ? "danger" : "info"}>
                {loadTask.status.message}
              </StatusPill>
            ) : undefined
          }
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
          <Field label="Doc ID 过滤" hint="可选：仅查看某个文档的 Chunk">
            <input className={inputClass} value={docFilter} onChange={(e) => setDocFilter(e.target.value)} placeholder="留空为全部" />
          </Field>
          <div className="flex items-end gap-2">
            <Button onClick={loadTask.run}>刷新</Button>
            <Button variant="ghost" onClick={refreshOrgOptions}>刷新租户/库</Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <SectionHeader eyebrow="Chunk 列表" title="治理与重索引" />
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Chunk</th>
                <th>文档</th>
                <th>主题/标签</th>
                <th>附件</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loadTask.status.phase === "loading"
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={`skeleton-${idx}`}>
                      <td><Skeleton width="85%" /></td>
                      <td><Skeleton width="90%" /></td>
                      <td><Skeleton width="70%" /></td>
                      <td><Skeleton width="60%" /></td>
                      <td><Skeleton width="50%" /></td>
                    </tr>
                  ))
                : filtered.map((item) => (
                    <tr key={item.chunk.chunkId}>
                      <td>
                        <div className="doc-title">{item.chunk.hierPath?.join(" / ") ?? item.chunk.chunkId}</div>
                        <div className="meta-muted">{item.chunk.contentType} · {item.chunk.createdAt}</div>
                      </td>
                      <td>
                        <div className="doc-title">{item.document?.title ?? item.document?.docId}</div>
                        <div className="meta-muted">{item.document?.tenantId ?? tenantId} · {item.document?.libraryId ?? libraryId}</div>
                        {item.document?.tags?.length ? (
                          <div className="tag-inline">
                            {item.document.tags.map((tag) => (
                              <Badge key={`${item.document?.docId}-${tag}`} tone="info">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="tag-inline">
                          {item.chunk.topicLabels?.length ? item.chunk.topicLabels.map((tag) => (
                            <Badge key={`${item.chunk.chunkId}-${tag}`} tone="info">{tag}</Badge>
                          )) : <span className="meta-muted">暂无主题</span>}
                        </div>
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
                        <Button
                          variant="ghost"
                          disabled={!item.document?.docId || reindexTask.status.phase === "loading"}
                          onClick={() =>
                            item.document?.docId &&
                            reindexTask.run(item.document.docId).catch((error) =>
                              toast.push({ title: "重新索引失败", description: (error as Error).message, tone: "danger" })
                            )
                          }
                        >
                          重新索引
                        </Button>
                      </td>
                    </tr>
                  ))}
              {!filtered.length && loadTask.status.phase !== "loading" && (
                <tr>
                  <td colSpan={5} className="placeholder">
                    暂无记录，调整筛选后再试
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <SectionHeader eyebrow="标签/元数据编辑" title="Metadata Editor" description="选择目标 Chunk 后在右侧编辑" />
        <MetadataEditor chunks={chunks.map((item) => item.chunk)} tenants={tenants} libraries={libraries} />
      </GlassCard>

      {orgLoading && <p className="muted-text">正在同步租户/知识库...</p>}
      {orgError && <p className="muted-text">{orgError}</p>}
    </div>
  );
}
