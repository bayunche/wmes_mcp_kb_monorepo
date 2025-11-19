import { IngestionStatusPanel } from "../components/IngestionStatusPanel";

export default function QueueMonitorPage() {
  return (
    <div className="panel-grid single-column">
      <div className="step-callout">
        <span className="step-indicator">STEP 02</span>
        <div>
          <h3>监控队列与任务</h3>
          <p>实时了解文档解析/嵌入进度，必要时可手动重试或重新索引。</p>
        </div>
      </div>
      <IngestionStatusPanel />
    </div>
  );
}
