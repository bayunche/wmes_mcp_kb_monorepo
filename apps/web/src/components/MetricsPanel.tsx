import { useEffect, useState } from "react";
import { fetchMetrics } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "./ui/Toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/Card";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Skeleton } from "./ui/Skeleton";
import { BarChart, RefreshCw } from "lucide-react";

export function MetricsPanel() {
  const toast = useToast();
  const [metrics, setMetrics] = useState("");

  const metricsTask = useAsyncTask(
    async () => {
      const text = await fetchMetrics();
      setMetrics(text);
      return text;
    },
    {
      loadingMessage: "读取 /metrics...",
      successMessage: "已更新",
      errorMessage: (error) => error.message
    }
  );

  useEffect(() => {
    metricsTask.run();
    // 仅在首次挂载时触发，避免因函数引用变化导致无限触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (metricsTask.status.phase === "error" && metricsTask.status.message) {
      toast.push({ title: "获取指标失败", description: metricsTask.status.message, tone: "danger" });
    }
  }, [metricsTask.status, toast]);

  const statusTone =
    metricsTask.status.phase === "error" ? "danger" : metricsTask.status.phase === "success" ? "success" : "info";

  return (

    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart className="h-5 w-5" />
              Prometheus Metrics
            </CardTitle>
            <CardDescription>可观测性指标</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {metricsTask.status.message && (
              <Badge variant={statusTone === "danger" ? "destructive" : statusTone === "success" ? "default" : "secondary"}>
                {metricsTask.status.message}
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={metricsTask.run}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {metricsTask.status.phase === "loading" ? (
          <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-4 w-[85%]" />
          </div>
        ) : (
          <pre className="p-4 bg-muted/50 rounded-lg text-xs font-mono overflow-auto max-h-[400px]">
            {metrics || "暂无数据"}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
