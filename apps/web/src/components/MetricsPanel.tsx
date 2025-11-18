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
      <header className="card-header">
        <div>
          <p className="eyebrow">可观测性</p>
          <h2>Prometheus Metrics</h2>
        </div>
        {status && <span className="status-pill">{status}</span>}
      </header>
      <div className="button-row">
        <button type="button" className="ghost" onClick={load}>
          刷新
        </button>
      </div>
      <pre className="metrics-output">{metrics || "暂无数据"}</pre>
    </section>
  );
}
