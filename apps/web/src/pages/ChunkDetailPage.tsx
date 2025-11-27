import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchChunk } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "../components/ui/Toast";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatusPill } from "../components/ui/StatusPill";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";

interface ChunkRecord {
  chunk: {
    chunkId: string;
    docId: string;
    sectionTitle?: string;
    semanticTitle?: string;
    contentText?: string;
    hierPath?: string[];
    topicLabels?: string[];
    topics?: string[];
    keywords?: string[];
    semanticTags?: string[];
    envLabels?: string[];
    bizEntities?: string[];
    nerEntities?: { name: string; type?: string }[];
    parentSectionPath?: string[];
    pageNo?: number;
    createdAt?: string;
    contextSummary?: string;
  };
  document: {
    docId: string;
    title: string;
    tags?: string[];
  };
  neighbors?: unknown[];
}

export default function ChunkDetailPage() {
  const { chunkId } = useParams<{ chunkId: string }>();
  const toast = useToast();
  const [record, setRecord] = useState<ChunkRecord | null>(null);

  const loadTask = useAsyncTask(
    async () => {
      if (!chunkId) throw new Error("缺少 chunkId");
      const data = await fetchChunk(chunkId);
      setRecord(data);
      return data;
    },
    {
      loadingMessage: "加载分块详情...",
      errorMessage: (err) => err.message
    }
  );

  useEffect(() => {
    loadTask
      .run()
      .catch((error) => toast.push({ title: "加载失败", description: (error as Error).message, tone: "danger" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkId]);

  const statusTone =
    loadTask.status.phase === "error" ? "danger" : loadTask.status.phase === "success" ? "success" : "info";

  const nerEntities = useMemo(() => {
    if (!record?.chunk.nerEntities) return [];
    return Array.isArray(record.chunk.nerEntities)
      ? record.chunk.nerEntities
      : Object.values(record.chunk.nerEntities as Record<string, { name: string; type?: string }>);
  }, [record]);

  return (
    <div className="space-y-4">
      <GlassCard className="p-6 space-y-2">
        <SectionHeader
          eyebrow="分块详情"
          title={record?.chunk.semanticTitle ?? record?.chunk.sectionTitle ?? chunkId ?? "Chunk"}
          description="审阅分块正文、标签、主题、实体与层级路径，便于治理与调试检索效果。"
          status={loadTask.status.message ? <StatusPill tone={statusTone}>{loadTask.status.message}</StatusPill> : undefined}
        />

        <div className="flex flex-wrap gap-3 items-center text-sm text-slate-600">
          <span className="font-mono text-xs bg-slate-100/80 px-2 py-1 rounded-lg">Chunk ID: {chunkId}</span>
          {record?.chunk.docId && (
            <span className="font-mono text-xs bg-slate-100/80 px-2 py-1 rounded-lg">
              Doc ID: {record.chunk.docId}
            </span>
          )}
          {record?.chunk.pageNo !== undefined && <span>页码：{record.chunk.pageNo}</span>}
          {record?.chunk.createdAt && <span>生成时间：{new Date(record.chunk.createdAt).toLocaleString()}</span>}
          {record?.chunk.hierPath?.length ? <span>路径：{record.chunk.hierPath.join(" / ")}</span> : null}
          <div className="ml-auto flex gap-2">
            {record?.chunk.docId ? (
              <Button asChild variant="ghost">
                <Link to={`/documents/${record.chunk.docId}`}>查看文档</Link>
              </Button>
            ) : null}
            <Button variant="ghost" onClick={loadTask.run}>
              重新加载
            </Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-3">
        <h3 className="section-title">正文内容</h3>
        {loadTask.status.phase === "loading" && <Skeleton height="160px" />}
        {record?.chunk.contentText ? (
          <pre className="whitespace-pre-wrap text-sm leading-7 bg-white/60 rounded-xl p-4 border border-slate-200">
            {record.chunk.contentText}
          </pre>
        ) : (
          loadTask.status.phase === "success" && <p className="meta-muted">暂无内容</p>
        )}
      </GlassCard>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <GlassCard className="space-y-3">
          <h3 className="section-title">标签与主题</h3>
          <FieldGroup label="Topic 标签" items={record?.chunk.topicLabels} />
          <FieldGroup label="语义标签" items={record?.chunk.semanticTags} />
          <FieldGroup label="环境标签" items={record?.chunk.envLabels} />
          <FieldGroup label="关键词" items={record?.chunk.keywords} />
        </GlassCard>

        <GlassCard className="space-y-3">
          <h3 className="section-title">实体 / 上下文</h3>
          <FieldGroup
            label="NER 实体"
            items={nerEntities?.map((ner) => `${ner.name}${ner.type ? `（${ner.type}）` : ""}`)}
          />
          <FieldGroup label="业务实体" items={record?.chunk.bizEntities} />
          <FieldGroup label="上级路径" items={record?.chunk.parentSectionPath} />
          {record?.chunk.contextSummary && (
            <div className="text-sm text-slate-700">
              <div className="text-xs uppercase tracking-[0.08em] text-slate-500 mb-1">摘要</div>
              <p className="bg-white/60 rounded-xl p-3 border border-slate-200 leading-6">
                {record.chunk.contextSummary}
              </p>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function FieldGroup({ label, items }: { label: string; items?: (string | undefined | null)[] }) {
  if (!items?.length) {
    return (
      <div className="text-sm text-slate-500">
        <div className="text-xs uppercase tracking-[0.08em] text-slate-500 mb-1">{label}</div>
        <span className="meta-muted">-</span>
      </div>
    );
  }
  return (
    <div className="text-sm text-slate-700">
      <div className="text-xs uppercase tracking-[0.08em] text-slate-500 mb-1">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.filter(Boolean).map((item) => (
          <Badge key={`${label}-${item}`} tone="info">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
