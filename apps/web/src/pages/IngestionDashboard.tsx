import { UploadForm } from "../components/UploadForm";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatusPill } from "../components/ui/StatusPill";

export default function IngestionDashboard() {
  return (
    <div className="space-y-4">
      <GlassCard className="p-6 space-y-2">
        <SectionHeader
          eyebrow="STEP 01"
          title="上传原始文档 · 触发入库流水线"
          description="选择租户/知识库后上传，系统将自动解析、章节预分块、语义切分、元数据生成并入索。"
          status={<StatusPill tone="info">建议先完成模型配置</StatusPill>}
        />
        <p className="text-sm text-slate-600">
          完成上传后，可在“队列监控”实时查看解析/切分/向量/持久化进度，失败可在诊断页重试。
        </p>
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-[1.1fr]">
        <GlassCard className="p-5">
          <SectionHeader eyebrow="上传入口" title="支持多文件批量上传" />
          <UploadForm onUploaded={() => {}} />
        </GlassCard>
      </div>
    </div>
  );
}
