import { UploadForm } from "../components/UploadForm";

export default function IngestionDashboard() {
  return (
    <div className="panel-grid single-column">
      <div className="step-callout">
        <span className="step-indicator">STEP 01</span>
        <div>
          <h3>上传原始文档</h3>
          <p>选择租户/知识库后上传文件，系统会自动生成标题与标签。</p>
        </div>
      </div>
      <UploadForm onUploaded={() => {}} />
      <p className="muted-text">
        提交后可前往“队列监控”观察任务状态，或在“治理”“诊断”页面继续处理。
      </p>
    </div>
  );
}
