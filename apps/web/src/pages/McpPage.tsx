import { McpSearchPanel } from "../components/McpSearchPanel";
import { MetricsPanel } from "../components/MetricsPanel";

export default function McpPage() {
  return (
    <div className="panel-grid">
      <McpSearchPanel />
      <MetricsPanel />
    </div>
  );
}
