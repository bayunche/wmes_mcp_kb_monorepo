import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listDocuments } from "../api";
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
import { Button } from "../components/ui/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { AlertCircle, CheckCircle2, FileText, RefreshCw, Search } from "lucide-react";
import { Input } from "../components/ui/Input";

interface DocItem {
  docId: string;
  title: string;
  ingestStatus?: string;
  tags?: string[];
  libraryId?: string;
  tenantId?: string;
  errorMessage?: string;
}

const STATUS_CONFIG: Record<string, { label: string; tone: "info" | "success" | "warning" | "danger"; desc: string }> = {
  uploaded: { label: "待处理", tone: "warning", desc: "等待进入解析队列" },
  parsed: { label: "解析完成", tone: "info", desc: "结构化解析已完成，等待切分" },
  indexed: { label: "已入库", tone: "success", desc: "可被检索" },
  failed: { label: "处理失败", tone: "danger", desc: "需人工介入" }
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

  // Auto-select tenant/library
  useEffect(() => {
    if (tenants.length > 0 && (tenantId === "default" || !tenants.some(t => t.tenantId === tenantId))) {
      setTenantId(tenants[0].tenantId);
    }
  }, [tenants, tenantId]);

  useEffect(() => {
    const availableLibs = libraries.filter(l => !l.tenantId || l.tenantId === tenantId);
    if (availableLibs.length > 0 && (libraryId === "default" || !availableLibs.some(l => l.libraryId === libraryId))) {
      setLibraryId(availableLibs[0].libraryId);
    }
  }, [libraries, tenantId, libraryId]);

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

  const statusTone = loadTask.status.phase === "error" ? "destructive" : loadTask.status.phase === "success" ? "success" : "default";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">知识资产</h2>
          <p className="text-muted-foreground">
            管理已入库的文档资产。只有状态为“已入库”的文档才能被搜索到。
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>筛选与管理</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[200px_200px_1fr_auto]">
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

            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="搜索文档标题..." className="pl-8" />
            </div>

            <Button variant="outline" onClick={loadTask.run} disabled={loadTask.status.phase === "loading"}>
              <RefreshCw className={`mr- mr-2 h-4 w-4 ${loadTask.status.phase === "loading" ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="w-full">
          <div className="px-6 pt-6">
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="uploaded">待处理</TabsTrigger>
              <TabsTrigger value="parsed">解析完成</TabsTrigger>
              <TabsTrigger value="indexed">已入库</TabsTrigger>
              <TabsTrigger value="failed">失败</TabsTrigger>
            </TabsList>
          </div>

          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">文档标题</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>标签</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadTask.status.phase === "loading" ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length ? (
                  filtered.map((item) => {
                    const config = STATUS_CONFIG[item.ingestStatus ?? "uploaded"] ?? STATUS_CONFIG.uploaded;
                    return (
                      <TableRow key={item.docId}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              {item.title}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              ID: {item.docId.slice(0, 8)}
                            </span>
                            {item.errorMessage && (
                              <div className="flex items-center gap-1 text-xs text-destructive mt-1 bg-destructive/10 px-2 py-1 rounded w-fit">
                                <AlertCircle className="h-3 w-3" />
                                {item.errorMessage}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={config.tone as any}>{config.label}</Badge>
                          <div className="text-[10px] text-muted-foreground mt-1">{config.desc}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {item.tags?.length ? (
                              item.tags.map((tag) => (
                                <Badge key={`${item.docId}-${tag}`} variant="secondary" className="text-xs font-normal">
                                  {tag}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/documents/${item.docId}`}>详情</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      暂无文档
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
