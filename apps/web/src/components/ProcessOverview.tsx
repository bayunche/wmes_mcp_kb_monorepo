import { useEffect, useState } from "react";
import { fetchStats } from "../api";

interface StatsPayload {
  documents?: number;
  attachments?: number;
  chunks?: number;
  pendingJobs?: number;
}

export function ProcessOverview() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setStatus("加载统计中…");
        const response = await fetchStats();
        setStats(response);
        setStatus(null);
      } catch (error) {
        setStatus((error as Error).message);
      }
    };
    load();
  }, []);

  const cards = [
    { label: "待处理任务", value: stats?.pendingJobs ?? 0, description: "队列中等待 OCR/解析的任务" },
    { label: "已解析文档", value: stats?.documents ?? 0, description: "完成 ingest 的文档数" },
    { label: "已生成段落", value: stats?.chunks ?? 0, description: "chunkDocument 阶段生成的段落" },
    { label: "附件/图像", value: stats?.attachments ?? 0, description: "可预览的附件数量" }
  ];

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="eyebrow">流程监控</p>
          <h2>MaxKB 风格概览</h2>
        </div>
        {status && <span className="status-pill info">{status}</span>}
      </header>
      <div className="process-grid">
        {cards.map((card) => (
          <article key={card.label} className="process-card">
            <p className="eyebrow">{card.label}</p>
            <h3>{card.value}</h3>
            <p className="meta-muted">{card.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
