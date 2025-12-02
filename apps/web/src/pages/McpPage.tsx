import { McpSearchPanel } from "../components/McpSearchPanel";
import { MetricsPanel } from "../components/MetricsPanel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Server } from "lucide-react";

export default function McpPage() {
  return (

    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            MCP 工具检索与实时指标
          </CardTitle>
          <CardDescription>
            测试 MCP 检索、查看请求日志与核心指标，确保 Agent 与 REST 行为一致。
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <McpSearchPanel />
        <MetricsPanel />
      </div>
    </div>
  );
}
