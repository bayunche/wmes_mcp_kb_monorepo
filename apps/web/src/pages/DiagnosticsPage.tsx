import { VectorLogPanel } from "../components/VectorLogPanel";
import { StructureTree } from "../components/StructureTree";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";

export default function DiagnosticsPage() {
  return (
    <div className="space-y-4">
      <GlassCard className="p-6 space-y-2">
        <SectionHeader
          eyebrow="STEP 05"
          title="实时诊断"
          description="查看向量日志、OCR/语义处理记录，或输入 Doc ID 读取语义结构树来定位问题。"
        />
        <p className="text-sm text-slate-600">
          适用于排查入库/检索异常，结合结构树查看分块层级，向量日志排查召回问题。
        </p>
      </GlassCard>
      <VectorLogPanel />
      <StructureTree />
    </div>
  );
}
