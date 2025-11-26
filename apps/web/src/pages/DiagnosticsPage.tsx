import { VectorLogPanel } from "../components/VectorLogPanel";
import { StructureTree } from "../components/StructureTree";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";

export default function DiagnosticsPage() {
  return (
    <div className="panel-grid single-column">
      <GlassCard>
        <SectionHeader
          eyebrow="STEP 05"
          title="实时诊断"
          description="查看向量日志、OCR/语义处理记录，或输入 Doc ID 读取语义结构树来定位问题。"
        />
      </GlassCard>
      <VectorLogPanel />
      <StructureTree />
    </div>
  );
}
