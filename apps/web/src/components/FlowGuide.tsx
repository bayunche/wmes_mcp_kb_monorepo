import { Link, useLocation } from "react-router-dom";

const STEPS = [
  {
    id: 1,
    title: "上传文档",
    description: "支持 PDF / DOCX / 图片，提交后会写入对象存储并生成一个 ingestion 任务。",
    to: "/ingestion",
    cta: "前往入库"
  },
  {
    id: 2,
    title: "排队与切块",
    description: "Worker 会解析并生成文本块、预览、附件，然后写入 Postgres + Qdrant。",
    to: "/ingestion",
    cta: "查看队列"
  },
  {
    id: 3,
    title: "检索预览",
    description: "使用混合检索查看段落、附件和自动标签，验证召回质量。",
    to: "/search",
    cta: "开始检索"
  },
  {
    id: 4,
    title: "数据治理",
    description: "在治理页审阅块级元数据、自动标签与附件，并执行重新索引。",
    to: "/governance",
    cta: "查看治理"
  },
  {
    id: 5,
    title: "MCP & 指标",
    description: "通过 MCP 页面调用工具并查看实时指标。",
    to: "/mcp",
    cta: "进入 MCP"
  }
];

export default function FlowGuide() {
  const location = useLocation();
  return (
    <section className="flow-guide">
      {STEPS.map((step) => {
        const isActive = location.pathname.startsWith(step.to);
        return (
          <article key={step.id} className={`step-card${isActive ? " is-active" : ""}`}>
            <header>
              <span className="step-index">0{step.id}</span>
              <h3>{step.title}</h3>
            </header>
            <p>{step.description}</p>
            <Link to={step.to} className="step-cta">
              {step.cta}
            </Link>
          </article>
        );
      })}
    </section>
  );
}
