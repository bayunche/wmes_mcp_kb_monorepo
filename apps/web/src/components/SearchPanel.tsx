import { useEffect, useMemo, useState } from "react";
import { buildAttachmentUrl, previewChunk, relatedChunks, searchDocuments } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "./ui/Toast";
import { GlassCard } from "./ui/GlassCard";
import { SectionHeader } from "./ui/SectionHeader";
import { Field } from "./ui/Field";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { StatusPill } from "./ui/StatusPill";
import { Skeleton } from "./ui/Skeleton";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition";

type SearchResult = {
  chunk: {
    chunkId: string;
    hierPath?: string[];
    contentText?: string;
    sourceUri?: string;
    semanticMetadata?: {
      contextSummary?: string;
      semanticTags?: string[];
      envLabels?: string[];
    };
  };
  document?: {
    docId: string;
    title?: string;
    tags?: string[];
    ingestStatus?: string;
    sourceUri?: string;
    libraryId?: string;
  };
  attachments?: any[];
  score?: number;
};

export default function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [semanticTags, setSemanticTags] = useState("");
  const [envLabels, setEnvLabels] = useState("");
  const [metadataKey, setMetadataKey] = useState("");
  const [metadataValue, setMetadataValue] = useState("");
  const [onlyWithAttachments, setOnlyWithAttachments] = useState(false);
  const { tenants, libraries, loading: orgLoading, error: orgError, refresh: refreshOrgOptions } = useOrgOptions();
  const toast = useToast();

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

  const searchTask = useAsyncTask(
    async () => {
      const filters: Record<string, unknown> = { libraryId };
      if (semanticTags.trim()) filters.semanticTags = semanticTags.split(",").map((t) => t.trim()).filter(Boolean);
      if (envLabels.trim()) filters.envLabels = envLabels.split(",").map((t) => t.trim()).filter(Boolean);
      if (metadataKey.trim() && metadataValue.trim()) filters[metadataKey.trim()] = metadataValue.trim();
      if (onlyWithAttachments) filters.hasAttachments = true;
      const response = await searchDocuments({ query, limit: 8, filters, includeNeighbors: true }, libraryId);
      setResults(response.results ?? []);
      setPreview(null);
      setRelated([]);
      return response.total ?? response.results?.length ?? 0;
    },
    {
      loadingMessage: "检索中...",
      successMessage: (total) => `共 ${total} 条结果`,
      errorMessage: (error) => error.message
    }
  );

  const previewTask = useAsyncTask(
    async (chunkId: string) => {
      const response = await previewChunk(chunkId, libraryId || "default");
      setPreview(response);
    },
    {
      loadingMessage: "加载预览...",
      errorMessage: (error) => error.message
    }
  );

  const relatedTask = useAsyncTask(
    async (chunkId: string) => {
      const response = await relatedChunks(chunkId, 5, libraryId || "default");
      setRelated(response.related ?? []);
      return response.related?.length ?? 0;
    },
    {
      loadingMessage: "加载相关段落...",
      successMessage: (total) => `找到 ${total} 条相关段落`,
      errorMessage: (error) => error.message
    }
  );

  const statusTone = useMemo(() => (searchTask.status.phase === "error" ? "danger" : "info"), [searchTask.status.phase]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await searchTask.run();
  };

  const handlePreview = async (chunkId: string) => {
    try {
      await previewTask.run(chunkId);
    } catch (error) {
      toast.push({ title: "预览失败", description: (error as Error).message, tone: "danger" });
    }
  };

  const handleRelated = async (chunkId: string) => {
    try {
      await relatedTask.run(chunkId);
    } catch (error) {
      toast.push({ title: "关联段落失败", description: (error as Error).message, tone: "danger" });
    }
  };

  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        eyebrow="检索与预览"
        title="语义检索 / 预览 / 关联"
        status={
          searchTask.status.message ? (
            <StatusPill tone={statusTone}>{searchTask.status.message}</StatusPill>
          ) : null
        }
      />

      <form onSubmit={handleSearch} className="stacked-form">
        <Field label="查询" hint="输入检索词，支持中文/英文/多关键词">
          <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例如：合同违约责任" required />
        </Field>
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
          <Field label="语义标签（逗号分隔）">
            <input className={inputClass} value={semanticTags} onChange={(e) => setSemanticTags(e.target.value)} placeholder="合规, 财报" />
          </Field>
          <Field label="环境标签（逗号分隔）">
            <input className={inputClass} value={envLabels} onChange={(e) => setEnvLabels(e.target.value)} placeholder="prod, cn" />
          </Field>
          <Field label="元数据键/值" hint="可选：如 source=contract">
            <div className="grid grid-cols-2 gap-2">
              <input className={inputClass} value={metadataKey} onChange={(e) => setMetadataKey(e.target.value)} placeholder="键" />
              <input className={inputClass} value={metadataValue} onChange={(e) => setMetadataValue(e.target.value)} placeholder="值" />
            </div>
          </Field>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                checked={onlyWithAttachments}
                onChange={(e) => setOnlyWithAttachments(e.target.checked)}
              />
              仅含附件
            </label>
          </div>
        </div>
        <div className="button-row">
          <Button type="submit">执行检索</Button>
          <Button type="button" variant="ghost" onClick={refreshOrgOptions}>
            刷新租户/库
          </Button>
        </div>
      </form>

      <div className="search-grid">
        <div className="search-left">
          <div className="result-list space-y-3">
            {searchTask.status.phase === "loading"
              ? Array.from({ length: 4 }).map((_, idx) => (
                  <article key={`skeleton-${idx}`} className="result-card">
                    <Skeleton width="30%" />
                    <Skeleton width="60%" style={{ marginTop: "8px" }} />
                    <Skeleton width="80%" height={12} style={{ marginTop: "6px" }} />
                  </article>
                ))
              : results.map((item) => (
                  <article
                    key={item.chunk.chunkId}
                    className={`result-card${preview?.chunkId === item.chunk.chunkId ? " is-active" : ""}`}
                    onClick={() => handlePreview(item.chunk.chunkId)}
                  >
                    <header className="button-row compact" style={{ justifyContent: "space-between" }}>
                      <div>
                        <p className="meta-muted">{item.chunk.hierPath?.join(" / ") ?? "暂无层级"}</p>
                        <h4>{item.document?.title ?? item.chunk.chunkId}</h4>
                      </div>
                      <div className="tag-inline">
                        {item.document?.tags?.map((tag) => (
                          <Badge key={`${item.chunk.chunkId}-${tag}`} tone="info">
                            {tag}
                          </Badge>
                        )) ?? null}
                      </div>
                    </header>
                    <p className="meta-muted">{item.chunk.semanticMetadata?.contextSummary ?? item.chunk.contentText?.slice(0, 180)}</p>
                    <div className="button-row compact" style={{ justifyContent: "space-between" }}>
                      <small className="meta-muted">{item.document?.libraryId ?? libraryId}</small>
                      <Button variant="ghost" onClick={(e) => { e.stopPropagation(); handleRelated(item.chunk.chunkId); }}>
                        关联段落
                      </Button>
                    </div>
                  </article>
                ))}
            {!results.length && searchTask.status.phase !== "loading" && (
              <p className="placeholder">暂无搜索结果，输入查询后执行。</p>
            )}
          </div>
        </div>
        <div className="search-right space-y-3">
          <GlassCard className="space-y-3">
            <SectionHeader eyebrow="预览" title="上下文 / 附件" />
            {previewTask.status.phase === "loading" && <p className="status-text">加载中...</p>}
            {previewTask.status.phase === "loading" && (
              <div className="space-y-2">
                <Skeleton width="50%" />
                <Skeleton width="90%" height={12} />
                <Skeleton width="80%" height={12} />
              </div>
            )}
            {preview ? (
              <div className="glass-card p-4 space-y-2">
                <h4>{preview.title ?? preview.chunkId}</h4>
                <p className="meta-muted">
                  {preview.hierPath?.join(" / ") ?? "-"} · {preview.libraryId ?? libraryId}
                </p>
                <p className="text-sm text-slate-800 leading-relaxed">{preview.contentText}</p>
                {preview.attachments?.length ? (
                  <div className="attachment-chips">
                    {preview.attachments.map((att: any) => (
                      <a key={att.assetId} href={buildAttachmentUrl(att)} className="chip" target="_blank" rel="noreferrer">
                        <span>{att.assetType}</span>
                        <span className="meta-muted">{att.objectKey}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              previewTask.status.phase !== "loading" && <p className="placeholder">尚未选择 Chunk</p>
            )}
          </GlassCard>

          <GlassCard className="space-y-2">
            <SectionHeader eyebrow="相关段落" title="Related Chunks" />
            {relatedTask.status.message && <p className="status-text">{relatedTask.status.message}</p>}
            {relatedTask.status.phase === "loading"
              ? Array.from({ length: 3 }).map((_, idx) => (
                  <div key={`related-skeleton-${idx}`} className="result-card">
                    <Skeleton width="40%" />
                    <Skeleton width="75%" height={12} style={{ marginTop: "6px" }} />
                  </div>
                ))
              : related.map((item) => (
                  <div key={item.chunk.chunkId} className="result-card">
                    <div className="button-row compact" style={{ justifyContent: "space-between" }}>
                      <div>
                        <p className="meta-muted">{item.chunk.hierPath?.join(" / ") ?? "-"}</p>
                        <strong>{item.document?.title ?? item.chunk.chunkId}</strong>
                      </div>
                      <small className="meta-muted">{(item.score ?? 0).toFixed(3)}</small>
                    </div>
                    <p className="meta-muted">{item.chunk.contentText?.slice(0, 160)}</p>
                  </div>
                ))}
            {!related.length && relatedTask.status.phase !== "loading" && (
              <p className="placeholder">暂无相关段落</p>
            )}
          </GlassCard>
        </div>
      </div>
      {orgLoading && <p className="muted-text">正在同步租户/知识库...</p>}
      {orgError && <p className="muted-text">{orgError}</p>}
    </GlassCard>
  );
}
