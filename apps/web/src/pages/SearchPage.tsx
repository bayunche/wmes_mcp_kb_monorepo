import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import SearchPanel from "../components/SearchPanel";

export default function SearchPage() {
  return (
    <div className="space-y-4">
      <GlassCard className="p-6 space-y-2">
        <SectionHeader
          eyebrow="检索工作台"
          title="Hybrid 检索 · 预览 · 关联段落"
          description="向量 + BM25 融合，支持元数据筛选、Chunk 预览与关联段落，便于验证召回质量。"
        />
        <p className="text-sm text-slate-600">
          左侧为结果列表与详情弹窗，右侧展示预览与相关段落，适合运营/标注同屏协作。
        </p>
      </GlassCard>
      <SearchPanel />
    </div>
  );
}
