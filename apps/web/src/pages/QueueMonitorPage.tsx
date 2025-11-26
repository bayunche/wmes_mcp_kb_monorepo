import { IngestionStatusPanel } from "../components/IngestionStatusPanel";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatusPill } from "../components/ui/StatusPill";

export default function QueueMonitorPage() {
  return (
    <div className="panel-grid single-column">
      <GlassCard>
        <SectionHeader
          eyebrow="STEP 02"
          title="队列监控与重试"
          description="实时查看解析 / 切分 / 向量化进度，必要时手动重试或重建索引。"
          status={<StatusPill tone="info">实时刷新</StatusPill>}
        />
      </GlassCard>
      <IngestionStatusPanel />
    </div>
  );
}
