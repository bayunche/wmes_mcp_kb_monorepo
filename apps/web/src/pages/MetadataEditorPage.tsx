import { MetadataEditor } from "../components/MetadataEditor";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";

export default function MetadataEditorPage() {
  return (
    <div className="space-y-4">
      <GlassCard className="p-6 space-y-2">
        <SectionHeader
          eyebrow="治理工作台"
          title="标签 / 主题 / 关键词 / 摘要编辑"
          description="选择租户/知识库/文档后，对 Chunk 元数据进行查看、编辑与重建索引，保障检索质量。"
        />
        <p className="text-sm text-slate-600">
          支持查看详情弹窗，编辑语义标题、摘要、语义标签、主题、关键词、父路径等后提交到后端。
        </p>
      </GlassCard>
      <GlassCard className="p-0">
        <MetadataEditor />
      </GlassCard>
    </div>
  );
}
