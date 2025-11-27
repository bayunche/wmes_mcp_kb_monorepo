import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { GlassCard } from "./ui/GlassCard";
import { Button } from "./ui/Button";
import { SectionHeader } from "./ui/SectionHeader";

const STEPS = [
  { id: 1, title: "上传原始文档", description: "支持 PDF / DOCX / 图片，提交后自动创建 ingestion 任务并入库。", to: "/ingestion", cta: "去上传" },
  { id: 2, title: "队列监控", description: "查看解析 / 切分 / 向量化进度，必要时重试或重新索引。", to: "/queue", cta: "查看队列" },
  { id: 3, title: "数据治理", description: "管理 Chunk 元数据、标签与附件，可触发重建索引。", to: "/governance", cta: "进入治理" },
  { id: 4, title: "检索与预览", description: "组合检索、上下文预览与相关段落，验证搜索质量。", to: "/search", cta: "开始检索" },
  { id: 5, title: "实时诊断", description: "查看向量日志与结构树，定位处理节点与错误原因。", to: "/diagnostics", cta: "打开诊断" },
  { id: 6, title: "MCP & 指标", description: "通过 MCP 工具与实时指标，验证 Agent 接入与运行状态。", to: "/mcp", cta: "进入 MCP" }
];

export default function FlowGuide() {
  const location = useLocation();
  return (
    <GlassCard className="space-y-4">
      <SectionHeader eyebrow="流程引导" title="一步步完成上传、处理、检索与诊断" />
      <section className="flow-guide">
        {STEPS.map((step) => {
          const isActive = location.pathname.startsWith(step.to);
          return (
            <article key={step.id} className={`step-card${isActive ? " is-active" : ""}`}>
              <header className="flex items-center justify-between">
                <div>
                  <span className="step-index">0{step.id}</span>
                  <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
                </div>
                <Button asChild>
                  <Link to={step.to} className="no-underline">{step.cta}</Link>
                </Button>
              </header>
              <p className="muted-text leading-relaxed">{step.description}</p>
            </article>
          );
        })}
      </section>
    </GlassCard>
  );
}
