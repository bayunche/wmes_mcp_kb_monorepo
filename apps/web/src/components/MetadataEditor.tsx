import { useEffect, useMemo, useState } from "react";
import {
  deleteDocument,
  fetchDocumentChunks,
  listDocuments,
  reindexDocument,
  updateChunkMetadata
} from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { useToast } from "./ui/Toast";
import { GlassCard } from "./ui/GlassCard";
import { SectionHeader } from "./ui/SectionHeader";
import { Field } from "./ui/Field";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Skeleton } from "./ui/Skeleton";

type ChunkItem = {
  chunk: {
    chunkId: string;
    hierPath?: string[];
    contentText?: string;
    contentType: string;
    topicLabels?: string[];
    createdAt?: string;
    semanticMetadata?: {
      title?: string;
      contextSummary?: string;
      semanticTags?: string[];
      topics?: string[];
      keywords?: string[];
      entities?: Array<{ name: string; type?: string }>;
      parentSectionPath?: string[];
    };
  };
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition";

export function MetadataEditor() {
  const toast = useToast();
  const { tenants, libraries, loading: orgLoading, error: orgError, refresh: refreshOrgOptions } = useOrgOptions();
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [documents, setDocuments] = useState<Array<{ docId: string; title?: string }>>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [chunkEdits, setChunkEdits] = useState<Record<string, string>>({});
  const [metadataEdits, setMetadataEdits] = useState<
    Record<
      string,
      {
        semanticTags: string;
        topics: string;
        keywords: string;
        summary: string;
        title: string;
        parentPath: string;
      }
    >
  >({});
  const [modalChunk, setModalChunk] = useState<ChunkItem | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const scopedLibraries = useMemo(
    () => libraries.filter((lib) => !lib.tenantId || lib.tenantId === tenantId),
    [libraries, tenantId]
  );

  useEffect(() => {
    if (!tenants.length) return;
    if (!tenants.some((item) => item.tenantId === tenantId)) {
      setTenantId(tenants[0].tenantId);
    }
  }, [tenants, tenantId]);

  useEffect(() => {
    if (!scopedLibraries.length) return;
    if (!scopedLibraries.some((item) => item.libraryId === libraryId)) {
      setLibraryId(scopedLibraries[0].libraryId);
    }
  }, [scopedLibraries, libraryId]);

  useEffect(() => {
    const loadDocs = async () => {
      setLoadingDocs(true);
      try {
        const res = await listDocuments(tenantId || undefined, libraryId || undefined);
        setDocuments(res.items ?? []);
      } catch (error) {
        toast.push({ title: "拉取文档失败", description: (error as Error).message, tone: "danger" });
      } finally {
        setLoadingDocs(false);
      }
    };
    loadDocs().catch(() => null);
    setSelectedDocId("");
    setChunks([]);
    setChunkEdits({});
  }, [tenantId, libraryId, toast]);

  const loadChunks = async (docId: string) => {
    if (!docId) {
      setChunks([]);
      setChunkEdits({});
      return;
    }
    setLoadingChunks(true);
    try {
      const res = await fetchDocumentChunks(docId, { tenantId: tenantId || undefined, libraryId: libraryId || undefined });
      const items = (res.items ?? []) as ChunkItem[];
      setChunks(items);
      const initial: Record<string, string> = {};
      const metaInitial: Record<string, any> = {};
      items.forEach((item) => {
        initial[item.chunk.chunkId] = (item.chunk.topicLabels ?? []).join(", ");
        metaInitial[item.chunk.chunkId] = {
          semanticTags: (item.chunk.semanticMetadata?.semanticTags ?? []).join(", "),
          topics: (item.chunk.semanticMetadata?.topics ?? []).join(", "),
          keywords: (item.chunk.semanticMetadata?.keywords ?? []).join(", "),
          summary: item.chunk.semanticMetadata?.contextSummary ?? "",
          title: item.chunk.semanticMetadata?.title ?? "",
          parentPath: (item.chunk.semanticMetadata?.parentSectionPath ?? []).join(" / ")
        };
      });
      setChunkEdits(initial);
      setMetadataEdits(metaInitial);
    } catch (error) {
      toast.push({ title: "拉取 Chunk 失败", description: (error as Error).message, tone: "danger" });
    } finally {
      setLoadingChunks(false);
    }
  };

  const handleSave = async (chunkId: string) => {
    const tags =
      chunkEdits[chunkId]
        ?.split(",")
        .map((t) => t.trim())
        .filter(Boolean) ?? [];
    const meta = metadataEdits[chunkId] ?? {};
    const semanticTags =
      meta.semanticTags
        ?.split(",")
        .map((t: string) => t.trim())
        .filter(Boolean) ?? [];
    const topics =
      meta.topics
        ?.split(",")
        .map((t: string) => t.trim())
        .filter(Boolean) ?? [];
    const keywords =
      meta.keywords
        ?.split(",")
        .map((t: string) => t.trim())
        .filter(Boolean) ?? [];
    const parentSectionPath =
      meta.parentPath
        ?.split("/")
        .map((t: string) => t.trim())
        .filter(Boolean) ?? [];
    setSavingId(chunkId);
    try {
      await updateChunkMetadata(
        chunkId,
        {
          topicLabels: tags,
          semanticTags,
          topics,
          keywords,
          contextSummary: meta.summary ?? "",
          semanticTitle: meta.title ?? "",
          parentSectionPath
        },
        { tenantId: tenantId || undefined, libraryId: libraryId || undefined }
      );
      await loadChunks(selectedDocId);
      toast.push({ title: "已保存标签", description: tags.join(", ") || "已清空", tone: "success" });
    } catch (error) {
      toast.push({ title: "保存失败", description: (error as Error).message, tone: "danger" });
    } finally {
      setSavingId(null);
    }
  };

  const handleReindex = async () => {
    if (!selectedDocId) return;
    toast.push({ title: "已提交重索引", description: "等待任务入队", tone: "info" });
    try {
      await reindexDocument(selectedDocId, tenantId || undefined, libraryId || undefined);
      toast.push({ title: "重索引已入队", tone: "success" });
    } catch (error) {
      toast.push({ title: "重索引失败", description: (error as Error).message, tone: "danger" });
    }
  };

  const handleDelete = async () => {
    if (!selectedDocId) return;
    try {
      await deleteDocument(selectedDocId, tenantId || undefined);
      toast.push({ title: "文档已删除", tone: "success" });
      setSelectedDocId("");
      setChunks([]);
      setChunkEdits({});
      const res = await listDocuments(tenantId || undefined, libraryId || undefined);
      setDocuments(res.items ?? []);
    } catch (error) {
      toast.push({ title: "删除失败", description: (error as Error).message, tone: "danger" });
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-4">
        <SectionHeader
          eyebrow="标签 / 元数据"
          title="块标签与文档操作"
          description="先选择租户/知识库与目标文档，再编辑 Chunk 标签或重建索引"
          status={orgLoading ? "同步租户/知识库中…" : undefined}
        />
        {orgError && <p className="text-sm text-amber-600">{orgError}</p>}
        <div className="grid gap-3 lg:grid-cols-4">
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
              {(scopedLibraries.length ? scopedLibraries : [{ libraryId: "default", displayName: "default" }]).map((lib) => (
                <option key={lib.libraryId} value={lib.libraryId}>
                  {lib.displayName ?? lib.libraryId}
                </option>
              ))}
            </select>
          </Field>
          <Field label="目标文档">
            <select
              className={inputClass}
              value={selectedDocId}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedDocId(next);
                loadChunks(next).catch(() => null);
              }}
            >
              <option value="">{loadingDocs ? "加载中…" : "请选择"}</option>
              {documents.map((doc) => (
                <option key={doc.docId} value={doc.docId}>
                  {doc.title ?? doc.docId}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <Button variant="ghost" onClick={refreshOrgOptions}>刷新租户/库</Button>
            <Button variant="secondary" onClick={() => {
              setSelectedDocId("");
              setChunks([]);
              setChunkEdits({});
              setLoadingDocs(true);
              listDocuments(tenantId || undefined, libraryId || undefined)
                .then((res) => setDocuments(res.items ?? []))
                .catch((error) => toast.push({ title: "刷新失败", description: (error as Error).message, tone: "danger" }))
                .finally(() => setLoadingDocs(false));
            }}>刷新文档</Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleReindex} disabled={!selectedDocId}>重建索引</Button>
          <Button variant="danger" onClick={handleDelete} disabled={!selectedDocId}>删除文档</Button>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <SectionHeader eyebrow="Chunk 标签" title="为 Chunk 编辑主题 / 标签" />
        {loadingChunks && (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`s-${idx}`} className="border border-slate-200 rounded-xl p-3 bg-white/70">
                <Skeleton width="70%" />
                <Skeleton width="90%" />
                <Skeleton width="60%" />
              </div>
            ))}
          </div>
        )}
        {!loadingChunks && !selectedDocId && <p className="meta-muted">请选择文档后开始编辑 Chunk 标签。</p>}
        {!loadingChunks && selectedDocId && !chunks.length && <p className="meta-muted">该文档暂无 Chunk。</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {chunks.map((item) => (
            <div key={item.chunk.chunkId} className="border border-slate-200 rounded-xl p-3 bg-white/80 shadow-sm space-y-3">
              <div>
                <p className="text-xs text-slate-500">{item.chunk.hierPath?.join(" / ") ?? "未命名段落"}</p>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-[rgb(var(--c-text))]">
                    {item.chunk.semanticMetadata?.title ?? item.chunk.contentType}
                  </h3>
                  <Badge tone="neutral">{item.chunk.contentType}</Badge>
                </div>
                <p className="text-sm text-slate-700 line-clamp-3">
                  {item.chunk.semanticMetadata?.contextSummary ?? item.chunk.contentText ?? "暂无内容"}
                </p>
                <Button variant="ghost" onClick={() => setModalChunk(item)}>
                  查看详情
                </Button>
              </div>
              <Field label="Chunk 标签（逗号分隔）" hint="保存后立即写入后端">
                <input
                  className={inputClass}
                  value={chunkEdits[item.chunk.chunkId] ?? ""}
                  onChange={(e) => setChunkEdits((prev) => ({ ...prev, [item.chunk.chunkId]: e.target.value }))}
                  placeholder="例如：关键字1, 关键字2"
                />
              </Field>
              <Field label="语义标签（逗号分隔）">
                <input
                  className={inputClass}
                  value={metadataEdits[item.chunk.chunkId]?.semanticTags ?? ""}
                  onChange={(e) =>
                    setMetadataEdits((prev) => ({
                      ...prev,
                      [item.chunk.chunkId]: { ...(prev[item.chunk.chunkId] ?? {}), semanticTags: e.target.value }
                    }))
                  }
                />
              </Field>
              <Field label="主题（逗号分隔）">
                <input
                  className={inputClass}
                  value={metadataEdits[item.chunk.chunkId]?.topics ?? ""}
                  onChange={(e) =>
                    setMetadataEdits((prev) => ({
                      ...prev,
                      [item.chunk.chunkId]: { ...(prev[item.chunk.chunkId] ?? {}), topics: e.target.value }
                    }))
                  }
                />
              </Field>
              <Field label="关键词（逗号分隔）">
                <input
                  className={inputClass}
                  value={metadataEdits[item.chunk.chunkId]?.keywords ?? ""}
                  onChange={(e) =>
                    setMetadataEdits((prev) => ({
                      ...prev,
                      [item.chunk.chunkId]: { ...(prev[item.chunk.chunkId] ?? {}), keywords: e.target.value }
                    }))
                  }
                />
              </Field>
              <Field label="摘要（可编辑）">
                <textarea
                  className={`${inputClass} min-h-[80px]`}
                  value={metadataEdits[item.chunk.chunkId]?.summary ?? ""}
                  onChange={(e) =>
                    setMetadataEdits((prev) => ({
                      ...prev,
                      [item.chunk.chunkId]: { ...(prev[item.chunk.chunkId] ?? {}), summary: e.target.value }
                    }))
                  }
                />
              </Field>
              <Field label="语义标题（可选）">
                <input
                  className={inputClass}
                  value={metadataEdits[item.chunk.chunkId]?.title ?? ""}
                  onChange={(e) =>
                    setMetadataEdits((prev) => ({
                      ...prev,
                      [item.chunk.chunkId]: { ...(prev[item.chunk.chunkId] ?? {}), title: e.target.value }
                    }))
                  }
                  placeholder="不填则保留原有标题"
                />
              </Field>
              <Field label="父路径（/ 分隔）" hint="例如：合同/第3条/付款">
                <input
                  className={inputClass}
                  value={metadataEdits[item.chunk.chunkId]?.parentPath ?? ""}
                  onChange={(e) =>
                    setMetadataEdits((prev) => ({
                      ...prev,
                      [item.chunk.chunkId]: { ...(prev[item.chunk.chunkId] ?? {}), parentPath: e.target.value }
                    }))
                  }
                />
              </Field>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                {(item.chunk.semanticMetadata?.semanticTags ?? []).map((tag) => (
                  <Badge key={`${item.chunk.chunkId}-tag-${tag}`} tone="info">
                    {tag}
                  </Badge>
                ))}
                {(item.chunk.semanticMetadata?.topics ?? []).map((tag) => (
                  <Badge key={`${item.chunk.chunkId}-topic-${tag}`} tone="subtle">
                    {tag}
                  </Badge>
                ))}
                {(item.chunk.semanticMetadata?.keywords ?? []).map((kw) => (
                  <Badge key={`${item.chunk.chunkId}-kw-${kw}`} tone="neutral">
                    {kw}
                  </Badge>
                ))}
                {(item.chunk.semanticMetadata?.parentSectionPath ?? []).length ? (
                  <span className="meta-muted">
                    路径：{item.chunk.semanticMetadata?.parentSectionPath?.join(" / ")}
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleSave(item.chunk.chunkId)} disabled={savingId === item.chunk.chunkId}>
                  {savingId === item.chunk.chunkId ? "保存中…" : "保存标签"}
                </Button>
                <Button variant="ghost" onClick={() => setModalChunk(item)}>
                  查看详情
                </Button>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {modalChunk && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setModalChunk(null)}
        >
          <div
            className="max-w-4xl w-full bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 overflow-y-auto max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Chunk 详情</p>
                <h3 className="text-xl font-semibold text-slate-900">
                  {modalChunk.chunk.semanticMetadata?.title ??
                    modalChunk.chunk.semanticMetadata?.contextSummary?.slice(0, 24) ??
                    modalChunk.chunk.chunkId}
                </h3>
                <p className="meta-muted text-sm">
                  {modalChunk.chunk.hierPath?.join(" / ") ?? "-"} · {modalChunk.chunk.chunkId}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setModalChunk(null)}>
                关闭
              </Button>
            </div>
            <div className="tag-inline">
              {(modalChunk.chunk.semanticMetadata?.semanticTags ?? []).map((tag) => (
                <Badge key={`${modalChunk.chunk.chunkId}-tag-${tag}`} tone="info">
                  {tag}
                </Badge>
              ))}
              {(modalChunk.chunk.semanticMetadata?.topics ?? []).map((tag) => (
                <Badge key={`${modalChunk.chunk.chunkId}-topic-${tag}`} tone="subtle">
                  {tag}
                </Badge>
              ))}
            </div>
            {modalChunk.chunk.semanticMetadata?.keywords?.length ? (
              <div className="tag-inline">
                {modalChunk.chunk.semanticMetadata.keywords.map((kw) => (
                  <Badge key={`${modalChunk.chunk.chunkId}-kw-${kw}`} tone="neutral">
                    {kw}
                  </Badge>
                ))}
              </div>
            ) : null}
            {modalChunk.chunk.semanticMetadata?.entities?.length ? (
              <div className="tag-inline">
                {modalChunk.chunk.semanticMetadata.entities.map((e) => (
                  <Badge key={`${modalChunk.chunk.chunkId}-entity-${e.name}`} tone="warning">
                    {e.name}
                    {e.type ? `(${e.type})` : ""}
                  </Badge>
                ))}
              </div>
            ) : null}
            {modalChunk.chunk.semanticMetadata?.contextSummary ? (
              <p className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-slate-800 leading-6">
                {modalChunk.chunk.semanticMetadata.contextSummary}
              </p>
            ) : null}
            <pre className="whitespace-pre-wrap bg-slate-50 rounded-xl p-3 border border-slate-200 text-sm leading-6">
              {modalChunk.chunk.contentText}
            </pre>
            {modalChunk.chunk.semanticMetadata?.parentSectionPath?.length ? (
              <p className="meta-muted text-xs">
                上级路径：{modalChunk.chunk.semanticMetadata.parentSectionPath.join(" / ")}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
