import { useCallback, useMemo, useState, useEffect } from "react";
import { fetchVectorLogs } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
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
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { RefreshCw, Activity, Clock, Server, FileText } from "lucide-react";

interface VectorLogEntry {
  logId: string;
  chunkId?: string;
  docId: string;
  modelRole: string;
  provider: string;
  modelName: string;
  driver: "local" | "remote";
  status: "success" | "failed";
  durationMs: number;
  vectorDim?: number;
  inputChars?: number;
  ocrUsed?: boolean;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
}

const STEP_MAP: Record<string, { label: string; description: string }> = {
  ocr: { label: "OCR", description: "图片/PDF 转文本" },
  tagging: { label: "自动标签", description: "LLM 生成主题标签" },
  metadata: { label: "语义摘要", description: "上下文理解与环境标签" },
  embedding: { label: "向量化", description: "本地模型生成向量" },
  rerank: { label: "重排序", description: "可选 reranker" }
};



function summarizeStep(logs: VectorLogEntry[], role: string) {
  const entries = logs.filter((log) => log.modelRole === role);
  if (!entries.length) {
    return { status: "pending", duration: 0 } as const;
  }
  const failed = entries.some((log) => log.status === "failed");
  const duration = entries.reduce((acc, cur) => acc + cur.durationMs, 0);
  return { status: failed ? "failed" : "success", duration } as const;
}

export function VectorLogPanel() {
  const { tenants, libraries } = useOrgOptions();
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [docId, setDocId] = useState("");
  const [logs, setLogs] = useState<VectorLogEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setStatus("拉取向量日志中...");
    const response = await fetchVectorLogs({ tenantId, libraryId, docId: docId.trim() || undefined });
    setLogs(response.items ?? []);
    setStatus(`已获取 ${response.items?.length ?? 0} 条日志`);
  }, [tenantId, libraryId, docId]);

  useEffect(() => {
    loadLogs().catch((error) => setStatus(error.message));
  }, [loadLogs]);

  const summaries = useMemo(() => {
    return Object.keys(STEP_MAP).map((role) => ({
      role,
      ...STEP_MAP[role],
      ...summarizeStep(logs, role)
    }));
  }, [logs]);

  return (

    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              向量日志
            </CardTitle>
            <CardDescription>处理链路健康与耗时监控</CardDescription>
          </div>
          {status && (
            <Badge variant="outline" className="font-normal">
              {status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
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
              <Label>Doc ID (可选)</Label>
              <Input
                placeholder="过滤某个文档"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-end">
            <Button onClick={loadLogs}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          {summaries.map((item) => (
            <div key={item.role} className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{item.label}</span>
                <Badge variant={item.status === "failed" ? "destructive" : item.status === "success" ? "default" : "secondary"}>
                  {item.status === "success" ? "完成" : item.status === "failed" ? "失败" : "待处理"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">{item.description}</div>
              <div className="text-xs font-mono pt-2 border-t mt-2">
                耗时: {item.duration ? `${item.duration} ms` : "-"}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">时间</TableHead>
                <TableHead className="w-[100px]">步骤</TableHead>
                <TableHead>模型信息</TableHead>
                <TableHead className="w-[100px]">耗时</TableHead>
                <TableHead className="w-[100px]">状态</TableHead>
                <TableHead>说明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!logs.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    暂无日志，点击刷新试试
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.logId}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{STEP_MAP[log.modelRole]?.label ?? log.modelRole}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{log.modelName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Server className="h-3 w-3" />
                          {log.provider} · {log.driver}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.durationMs} ms</TableCell>
                    <TableCell>
                      <Badge variant={log.status === "success" ? "secondary" : "destructive"}>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate" title={log.errorMessage}>
                      {log.errorMessage || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
