import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import SearchPanel from "../components/SearchPanel";

export default function SearchPage() {
  return (
    <div className="panel-grid single-column">
      <GlassCard className="p-5">
        <SectionHeader
          eyebrow="检索"
          title="检索与预览"
          description="语义检索 + 上下文预览 + 关联段落，验证检索质量"
        />
      </GlassCard>
      <SearchPanel />
    </div>
  );
}
