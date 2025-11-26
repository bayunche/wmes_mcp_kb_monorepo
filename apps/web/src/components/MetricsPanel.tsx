import { useEffect, useState } from "react";
import { fetchMetrics } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "./ui/Toast";
import { GlassCard } from "./ui/GlassCard";
import { SectionHeader } from "./ui/SectionHeader";
import { Button } from "./ui/Button";
import { StatusPill } from "./ui/StatusPill";
import { Skeleton } from "./ui/Skeleton";

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
    <GlassCard>
      <SectionHeader
        eyebrow="可观测"
        title="Prometheus Metrics"
        status={
          metricsTask.status.message ? (
            <StatusPill tone={statusTone}>{metricsTask.status.message}</StatusPill>
          ) : null
        }
      />
      <div className="button-row">
        <Button type="button" variant="ghost" onClick={metricsTask.run}>
          刷新
        </Button>
      </div>
      {metricsTask.status.phase === "loading" ? (
        <div className="metrics-output">
          <Skeleton width="90%" />
          <Skeleton width="80%" style={{ marginTop: "6px" }} />
          <Skeleton width="85%" style={{ marginTop: "6px" }} />
        </div>
      ) : (
        <pre className="metrics-output">{metrics || "暂无数据"}</pre>
      )}
    </GlassCard>
  );
}
