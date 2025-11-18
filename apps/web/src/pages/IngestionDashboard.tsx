import { useState } from "react";
import { UploadForm } from "../components/UploadForm";
import { MetadataEditor } from "../components/MetadataEditor";
import { IngestionStatusPanel } from "../components/IngestionStatusPanel";
import { VectorLogPanel } from "../components/VectorLogPanel";
import { StructureTree } from "../components/StructureTree";
import { ProcessOverview } from "../components/ProcessOverview";

export default function IngestionDashboard() {
  const [refresh, setRefresh] = useState(0);
  return (
    <div className="panel-grid single-column">
      <ProcessOverview />
      <div className="step-callout">
        <span className="step-indicator">STEP 01</span>
        <div>
          <h3>上传原始文档</h3>
          <p>支持多租户与自定义标签；未填写标签时，Worker 会在解析后自动生成主题词。</p>
        </div>
      </div>
      <UploadForm onUploaded={() => setRefresh((flag) => flag + 1)} />
      <div className="step-callout">
        <span className="step-indicator">STEP 02</span>
        <div>
          <h3>监控队列与自动标签</h3>
          <p>查看排队任务、自动生成的标签与重新索引状态，确保文档已向量化。</p>
        </div>
      </div>
      <IngestionStatusPanel refreshSignal={refresh} />
      <div className="step-callout">
        <span className="step-indicator">STEP 03</span>
        <div>
          <h3>微调标签（可选）</h3>
          <p>如果自动标签不符合预期，可在此对单个文档进行编辑。</p>
        </div>
      </div>
      <MetadataEditor refreshToken={refresh} />
      <div className="step-callout">
        <span className="step-indicator">STEP 04</span>
        <div>
          <h3>实时诊断</h3>
          <p>查看 OCR、语义、向量化日志，快速定位每个文档的处理阶段。</p>
        </div>
      </div>
      <VectorLogPanel />
      <div className="step-callout">
        <span className="step-indicator">STEP 05</span>
        <div>
          <h3>结构树 / 章节视图</h3>
          <p>输入 Doc ID 查看 LLM 构建的章节树，检阅 chunk 的上下文归属。</p>
        </div>
      </div>
      <StructureTree />
    </div>
  );
}
