import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchChunk } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "../components/ui/Toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import { Separator } from "../components/ui/Separator";
import { ScrollArea } from "../components/ui/ScrollArea";
import { ArrowLeft, RefreshCw, FileText, Calendar, Hash, Layers } from "lucide-react";

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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link to="/chunks">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {record?.chunk.semanticTitle ?? record?.chunk.sectionTitle ?? chunkId ?? "Chunk"}
          </h1>
          <p className="text-sm text-muted-foreground">
            分块详情与元数据视图
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loadTask.status.message && (
            <Badge variant={statusTone as any}>{loadTask.status.message}</Badge>
          )}
          <Button variant="outline" onClick={loadTask.run} disabled={loadTask.status.phase === "loading"}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadTask.status.phase === "loading" ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                正文内容
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadTask.status.phase === "loading" ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ) : record?.chunk.contentText ? (
                <div className="bg-slate-50 p-4 rounded-md text-sm leading-relaxed whitespace-pre-wrap font-mono">
                  {record.chunk.contentText}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">暂无内容</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">上下文摘要</CardTitle>
            </CardHeader>
            <CardContent>
              {record?.chunk.contextSummary ? (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {record.chunk.contextSummary}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">无摘要信息</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">元数据</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground uppercase">Chunk ID</span>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{chunkId}</code>
                </div>
              </div>

              {record?.chunk.docId && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase">所属文档</span>
                  <div className="flex items-center justify-between">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{record.chunk.docId}</code>
                    <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                      <Link to={`/documents/${record.chunk.docId}`}>查看</Link>
                    </Button>
                  </div>
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                    <Hash className="h-3 w-3" /> 页码
                  </span>
                  <p className="text-sm">{record?.chunk.pageNo ?? "-"}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> 创建时间
                  </span>
                  <p className="text-sm">
                    {record?.chunk.createdAt ? new Date(record.chunk.createdAt).toLocaleDateString() : "-"}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                  <Layers className="h-3 w-3" /> 层级路径
                </span>
                <p className="text-sm text-muted-foreground break-all">
                  {record?.chunk.hierPath?.join(" / ") ?? "-"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">标签体系</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGroup label="Topic 标签" items={record?.chunk.topicLabels} />
              <FieldGroup label="语义标签" items={record?.chunk.semanticTags} />
              <FieldGroup label="环境标签" items={record?.chunk.envLabels} />
              <FieldGroup label="关键词" items={record?.chunk.keywords} />
              <Separator />
              <FieldGroup
                label="NER 实体"
                items={nerEntities?.map((ner) => `${ner.name}${ner.type ? ` (${ner.type})` : ""}`)}
              />
              <FieldGroup label="业务实体" items={record?.chunk.bizEntities} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ label, items }: { label: string; items?: (string | undefined | null)[] }) {
  if (!items?.length) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground uppercase">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.filter(Boolean).map((item) => (
          <Badge key={`${label}-${item}`} variant="secondary" className="text-xs font-normal">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
