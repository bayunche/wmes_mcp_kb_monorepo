import { useEffect, useMemo, useState, useCallback } from "react";
import { fetchLibraryChunks, reindexDocument } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "../components/ui/Toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/Table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/Select";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { RefreshCw, FileText, Layers, Hash, RotateCcw } from "lucide-react";

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

    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <span>治理 (Governance)</span>
            {loadTask.status.message && (
              <Badge variant={loadTask.status.phase === "error" ? "destructive" : "secondary"}>
                {loadTask.status.message}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            筛选库内 Chunk，补充标签、主题或重新索引，保障检索与召回质量。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>租户</Label>
                <Select value={tenantId} onValueChange={setTenantId}>
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
                <Label>知识库</Label>
                <Select value={libraryId} onValueChange={setLibraryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择知识库" />
                  </SelectTrigger>
                  <SelectContent>
                    {(libraries.length ? libraries : [{ libraryId: "default", displayName: "default" }])
                      .filter((lib) => !lib.tenantId || lib.tenantId === tenantId)
                      .map((lib) => (
                        <SelectItem key={lib.libraryId} value={lib.libraryId}>
                          {lib.displayName ?? lib.libraryId}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Doc ID 过滤</Label>
                <Input
                  placeholder="留空为全部"
                  value={docFilter}
                  onChange={(e) => setDocFilter(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={loadTask.run} disabled={loadTask.status.phase === "loading"}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loadTask.status.phase === "loading" ? "animate-spin" : ""}`} />
                刷新
              </Button>
              <Button variant="outline" onClick={refreshOrgOptions} disabled={orgLoading}>
                刷新租户/库
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chunk 列表与重索引</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Chunk</TableHead>
                <TableHead className="w-[200px]">文档</TableHead>
                <TableHead>主题/标签</TableHead>
                <TableHead>附件</TableHead>
                <TableHead className="w-[100px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadTask.status.phase === "loading" ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={`skeleton-${idx}`}>
                    <TableCell><Skeleton className="h-4 w-3/4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-1/2" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-1/3" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length > 0 ? (
                filtered.map((item) => (
                  <TableRow key={item.chunk.chunkId}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm truncate max-w-[240px]" title={item.chunk.hierPath?.join(" / ")}>
                          {item.chunk.hierPath?.join(" / ") ?? item.chunk.chunkId}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {item.chunk.contentType} · {item.chunk.createdAt}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm truncate max-w-[180px]" title={item.document?.title}>
                          {item.document?.title ?? item.document?.docId}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.document?.tenantId ?? tenantId} · {item.document?.libraryId ?? libraryId}
                        </div>
                        {item.document?.tags?.length ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.document.tags.slice(0, 2).map((tag) => (
                              <Badge key={`${item.document?.docId}-${tag}`} variant="outline" className="text-[10px] px-1 py-0">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.chunk.topicLabels?.length ? (
                          item.chunk.topicLabels.slice(0, 3).map((tag) => (
                            <Badge key={`${item.chunk.chunkId}-${tag}`} variant="secondary" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">暂无主题</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.attachments?.length ? (
                        <div className="text-xs text-muted-foreground space-y-1">
                          {item.attachments.map((att) => (
                            <div key={att.assetId} className="truncate max-w-[150px]" title={att.objectKey}>
                              {att.assetType} · {att.objectKey}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!item.document?.docId || reindexTask.status.phase === "loading"}
                        onClick={() =>
                          item.document?.docId &&
                          reindexTask.run(item.document.docId).catch((error) =>
                            toast.push({ title: "重新索引失败", description: (error as Error).message, tone: "danger" })
                          )
                        }
                      >
                        <RotateCcw className="mr-2 h-3 w-3" />
                        重索引
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    暂无记录，调整筛选后再试
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {orgLoading && <p className="text-xs text-muted-foreground text-center">正在同步租户/知识库...</p>}
      {orgError && <p className="text-xs text-destructive text-center">{orgError}</p>}
    </div>
  );
}
