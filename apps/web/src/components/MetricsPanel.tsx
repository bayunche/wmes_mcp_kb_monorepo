import { useEffect, useState } from "react";
import { fetchMetrics } from "../api";

export function MetricsPanel() {
  const [metrics, setMetrics] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);

  const load = async () => {
    setStatus("读取 /metrics…");
    try {
      const text = await fetchMetrics();
      setMetrics(text);
      setStatus("已更新");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="card">
      <h2>Prometheus Metrics</h2>
      <button type="button" onClick={load}>
        刷新
      </button>
      {status && <p>{status}</p>}
      <pre className="metrics-output">{metrics || "暂无数据"}</pre>
    </section>
  );
}
