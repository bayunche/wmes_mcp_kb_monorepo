import { UploadForm } from "../components/UploadForm";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatusPill } from "../components/ui/StatusPill";

export default function IngestionDashboard() {
  return (
    <div className="panel-grid single-column">
      <GlassCard>
        <SectionHeader
          eyebrow="STEP 01"
          title="上传原始文档"
          description="选择租户/知识库后上传文件，系统会自动生成标题与标签并创建 ingestion 任务。"
          status={<StatusPill tone="info">建议先完成模型配置</StatusPill>}
        />
        <p className="muted-text">
          提交后可前往“队列监控”查看进度，或在“数据治理 / 诊断”继续处理与排错。
        </p>
      </GlassCard>
      <UploadForm onUploaded={() => {}} />
    </div>
  );
}
