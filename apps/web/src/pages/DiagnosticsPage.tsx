import { VectorLogPanel } from "../components/VectorLogPanel";
import { StructureTree } from "../components/StructureTree";

export default function DiagnosticsPage() {
  return (
    <div className="panel-grid single-column">
      <div className="step-callout">
        <span className="step-indicator">STEP 04</span>
        <div>
          <h3>实时诊断</h3>
          <p>查看 OCR、语义、向量化日志，或输入 Doc ID 检视章节树来定位问题。</p>
        </div>
      </div>
      <VectorLogPanel />
      <StructureTree />
    </div>
  );
}
