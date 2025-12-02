import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLibraryChunks } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useOrgOptions } from "../hooks/useOrgOptions";
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
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/Select";
import { Label } from "../components/ui/Label";
import { RefreshCw, FileText, Layers, Hash } from "lucide-react";

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
      loadingMessage: "加载分块中...",
      successMessage: (total) => `共 ${total} 个分块`,
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <span>分块列表 (Vector View)</span>
            {loadTask.status.message && (
              <Badge variant={statusTone as any} className="text-xs font-normal">
                {loadTask.status.message}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            查看分块、层级路径与标签。按租户/知识库/文档筛选，审阅分块标题、父路径、标签与时间戳，便于治理与定位。
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
                <Label>文档 ID</Label>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="按 Doc ID 过滤"
                    value={docId}
                    onChange={(e) => setDocId(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-end">
              <Button onClick={loadTask.run} disabled={loadTask.status.phase === "loading"}>
                {loadTask.status.phase === "loading" ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                刷新列表
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Chunk ID</TableHead>
                <TableHead className="w-[300px]">标题/路径</TableHead>
                <TableHead className="w-[200px]">所属文档</TableHead>
                <TableHead>标签</TableHead>
                <TableHead className="w-[80px]">页码</TableHead>
                <TableHead className="w-[100px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadTask.status.phase === "loading" ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={`skeleton-${idx}`}>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length > 0 ? (
                filtered.map((item) => (
                  <TableRow key={item.chunk.chunkId}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.chunk.chunkId.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm">
                          {item.chunk.semanticTitle ?? item.chunk.sectionTitle ?? "未命名"}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Layers className="h-3 w-3" />
                          <span>{item.chunk.hierPath?.join(" / ") || "无层级"}</span>
                        </div>
                        {item.chunk.createdAt && (
                          <div className="text-[10px] text-muted-foreground/70">
                            {new Date(item.chunk.createdAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 font-medium text-sm">
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate max-w-[180px]" title={item.document.title}>
                            {item.document.title}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {item.document.docId}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(item.chunk.topicLabels ?? item.chunk.semanticTags ?? []).slice(0, 4).map((tag) => (
                          <Badge key={`${item.chunk.chunkId}-${tag}`} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                        {item.chunk.envLabels?.slice(0, 2).map((env) => (
                          <Badge key={`${item.chunk.chunkId}-env-${env}`} variant="outline" className="text-[10px]">
                            {env}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.chunk.pageNo ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/chunks/${item.chunk.chunkId}`}>详情</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    暂无记录，请调整筛选后再试
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
