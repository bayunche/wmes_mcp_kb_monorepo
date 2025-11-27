import { McpSearchPanel } from "../components/McpSearchPanel";
import { MetricsPanel } from "../components/MetricsPanel";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";

export default function McpPage() {
  return (
    <div className="space-y-4">
      <GlassCard className="p-6 space-y-2">
        <SectionHeader
          eyebrow="MCP / 指标"
          title="MCP 工具检索与实时指标"
          description="测试 MCP 检索、查看请求日志与核心指标，确保 Agent 与 REST 行为一致。"
        />
      </GlassCard>
      <div className="panel-grid">
        <McpSearchPanel />
        <MetricsPanel />
      </div>
    </div>
  );
}
