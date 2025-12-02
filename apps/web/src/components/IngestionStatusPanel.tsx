import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchIngestionStatus, fetchIngestionQueue, reindexDocument } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { AsyncPhase, useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "./ui/Toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/Table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/Select";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Skeleton } from "./ui/Skeleton";
import { Progress } from "./ui/Progress";
import { RefreshCw, RotateCcw, FileText, Activity, Clock } from "lucide-react";

type DocSummary = {
  docId: string;
  title: string;
  ingestStatus?: string;
  progress?: number;
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
    const queueResp = await fetchIngestionQueue({
      tenantId: tenant || undefined,
      libraryId: library || undefined
    });
    setDocuments(queueResp.items ?? []);
    setPendingJobs(queueResp.items?.filter((item: DocSummary) => item.ingestStatus !== "indexed").length ?? 0);
    return queueResp.items?.length ?? 0;
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

    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Select value={tenant} onValueChange={setTenant}>
              <SelectTrigger>
                <SelectValue placeholder="选择租户" />
              </SelectTrigger>
              <SelectContent>
                {(tenants.length ? tenants : [{ tenantId: "default", displayName: "default" }]).map((item) => (
                  <SelectItem key={item.tenantId} value={item.tenantId}>
                    {item.displayName ?? item.tenantId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Select value={library} onValueChange={setLibrary}>
              <SelectTrigger>
                <SelectValue placeholder="选择知识库" />
              </SelectTrigger>
              <SelectContent>
                {(libraries.length ? libraries : [{ libraryId: "default", displayName: "default" }])
                  .filter((lib) => !lib.tenantId || lib.tenantId === tenant)
                  .map((lib) => (
                    <SelectItem key={lib.libraryId} value={lib.libraryId}>
                      {lib.displayName ?? lib.libraryId}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center">
            <Button variant="ghost" onClick={refresh} disabled={orgLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${orgLoading ? "animate-spin" : ""}`} />
              刷新租户/库
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(["all", "uploaded", "parsed", "indexed", "failed"] as const).map((key) => (
            <Button
              key={key}
              variant={statusFilter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(key)}
            >
              {STATUS_LABELS[key]?.label ?? "全部"}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Doc ID</TableHead>
              <TableHead>标题</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-[140px]">进度</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>大小</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadTask.status.phase === "loading" ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={`skeleton-${idx}`}>
                  <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-[80px] ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length > 0 ? (
              filtered.map((doc) => {
                const label = STATUS_LABELS[doc.ingestStatus ?? "uploaded"] ?? STATUS_LABELS.uploaded;
                return (
                  <TableRow key={doc.docId}>
                    <TableCell className="font-mono text-xs">{doc.docId}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm truncate max-w-[200px]" title={doc.title}>
                          {doc.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {doc.tenantId ?? tenant} · {doc.libraryId ?? library}
                        </div>
                        {doc.errorMessage && <p className="text-xs text-destructive">{doc.errorMessage}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={label.tone === "danger" ? "destructive" : label.tone === "success" ? "default" : "secondary"}>
                        {label.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={doc.progress ?? 0} className="h-2" />
                        <span className="text-xs text-muted-foreground">{doc.progress ?? 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {doc.tags?.map((tag) => (
                          <Badge key={`${doc.docId}-${tag}`} variant="outline" className="text-[10px] px-1 py-0">
                            {tag}
                          </Badge>
                        )) || <span className="text-xs text-muted-foreground">-</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatBytes(doc.sizeBytes)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={reindexTask.status.phase === "loading"}
                          onClick={() =>
                            reindexTask.run(doc.docId).catch((error) =>
                              toastPush({ title: "重新排队失败", description: (error as Error).message, tone: "danger" })
                            )
                          }
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
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
                          <Activity className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  暂无记录，切换筛选后再试
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>待处理作业：<span className="font-medium text-foreground">{pendingJobs}</span></p>
        {orgLoading && <p>正在同步租户/知识库...</p>}
        {orgError && <p className="text-destructive">{orgError}</p>}
      </div>

      {selectedDoc && (
        <Card className="bg-muted/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  任务进度追踪
                </CardTitle>
                <CardDescription className="mt-1">
                  {selectedDoc.title} <span className="font-mono text-xs ml-2 opacity-70">{selectedDoc.docId}</span>
                </CardDescription>
              </div>
              {loadTimeline.status.message && (
                <Badge variant={loadTimeline.status.phase === "error" ? "destructive" : "secondary"}>
                  {loadTimeline.status.message}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loadTimeline.status.phase === "loading" && <Skeleton className="h-8 w-full" />}
              {timeline.length === 0 && loadTimeline.status.phase !== "loading" && (
                <p className="text-sm text-muted-foreground text-center py-4">暂无阶段日志，请稍后重试</p>
              )}
              <div className="space-y-2">
                {timeline
                  .slice()
                  .sort((a, b) => a.at.localeCompare(b.at))
                  .map((item) => (
                    <div
                      key={`${item.stage}-${item.at}`}
                      className="flex items-start gap-3 p-3 rounded-lg bg-background border text-sm"
                    >
                      <Badge variant="outline">{item.stage}</Badge>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{item.status}</span>
                          <span className="text-xs text-muted-foreground">{new Date(item.at).toLocaleString()}</span>
                        </div>
                        {item.meta && Object.keys(item.meta).length > 0 && (
                          <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto mt-2">
                            {JSON.stringify(item.meta, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

