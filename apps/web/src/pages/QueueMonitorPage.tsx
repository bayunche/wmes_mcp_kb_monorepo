import { IngestionStatusPanel } from "../components/IngestionStatusPanel";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatusPill } from "../components/ui/StatusPill";

export default function QueueMonitorPage() {
  return (
    <div className="space-y-4">
      <GlassCard className="p-6 space-y-2">
        <SectionHeader
          eyebrow="STEP 02"
          title="入库队列监控"
          description="解析 / 切分 / 元数据 / 向量化 / 持久化 全链路进度，失败可重试或重建索引。"
          status={<StatusPill tone="info">实时刷新</StatusPill>}
        />
        <p className="text-sm text-slate-600">
          表格展示最新入库任务，含阶段进度条；点击重试/重建索引可快速处理异常。
        </p>
      </GlassCard>
      <GlassCard className="p-0">
        <IngestionStatusPanel />
      </GlassCard>
    </div>
  );
}
