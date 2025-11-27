import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import IngestionDashboard from "./pages/IngestionDashboard";
import QueueMonitorPage from "./pages/QueueMonitorPage";
import DocumentsList from "./pages/DocumentsList";
import DocumentDetail from "./pages/DocumentDetail";
import DocumentEdit from "./pages/DocumentEdit";
import SearchPage from "./pages/SearchPage";
import ChunkListPage from "./pages/ChunkListPage";
import ChunkDetailPage from "./pages/ChunkDetailPage";
import GovernancePage from "./pages/GovernancePage";
import DiagnosticsPage from "./pages/DiagnosticsPage";
import McpPage from "./pages/McpPage";
import ModelSettingsPage from "./pages/ModelSettingsPage";
import MetadataEditorPage from "./pages/MetadataEditorPage";
import FlowGuide from "./components/FlowGuide";
import { ToastProvider } from "./components/ui/Toast";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      "glass-sidebar-link flex items-center gap-2 text-sm justify-between",
      isActive && "bg-white/80 text-[rgb(var(--c-text))] border-slate-200 shadow-sm"
    );

  const navGroups = [
    {
      label: "运营",
      items: [
        { to: "/ingestion", label: "入库总览", emoji: "📥" },
        { to: "/queue", label: "队列进度", emoji: "⏱️" },
        { to: "/search", label: "检索与预览", emoji: "🔍" },
        { to: "/metadata", label: "元数据治理", emoji: "🧭" }
      ]
    },
    {
      label: "知识资产",
      items: [
        { to: "/documents", label: "文档列表", emoji: "📚" },
        { to: "/chunks", label: "分块管理", emoji: "🧩" },
        { to: "/governance", label: "治理策略", emoji: "🛡️" }
      ]
    },
    {
      label: "诊断与配置",
      items: [
        { to: "/diagnostics", label: "健康诊断", emoji: "🩺" },
        { to: "/mcp", label: "MCP / 指标", emoji: "📈" },
        { to: "/settings", label: "模型配置", emoji: "⚙️" }
      ]
    }
  ];

  const spotlightCards = [
    {
      title: "实时入库队列",
      desc: "跟踪上传→切分→向量→持久化全链路，异常可快速重试。",
      action: () => navigate("/queue"),
      cta: "查看队列"
    },
    {
      title: "Hybrid 检索 + 预览",
      desc: "向量 + BM25 融合，支持元数据筛选与 chunk 预览、关联段落。",
      action: () => navigate("/search"),
      cta: "进入检索"
    },
    {
      title: "元数据治理",
      desc: "编辑标签/主题/关键词/摘要，保障语义召回质量。",
      action: () => navigate("/metadata"),
      cta: "管理元数据"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 text-[rgb(var(--c-text))]">
      <div className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-white/65 border-b border-white/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/85 shadow-sm border border-slate-200 flex items-center justify-center text-sm font-semibold text-slate-700">
              KB
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.08em] text-slate-500">WMES Knowledge Base</div>
              <div className="text-lg font-semibold text-slate-900">企业级知识治理控制台</div>
              <p className="text-[11px] text-slate-500">Hybrid 检索 · 元数据治理 · 运营全链路</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm">
            <button className="glass-sidebar-link px-3 py-2" onClick={() => navigate("/search")}>
              全局检索
            </button>
            <button className="glass-sidebar-link px-3 py-2" onClick={() => navigate("/metadata")}>
              元数据编辑
            </button>
            <button className="glass-sidebar-link px-3 py-2" onClick={() => navigate("/queue")}>
              队列进度
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-24 pb-12 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="glass-sidebar h-fit backdrop-blur-2xl border border-white/60 shadow-lg sticky top-24">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{group.label}</p>
              <nav className="grid gap-1.5">
                {group.items.map((item) => (
                  <NavLink key={item.to} className={linkClass} to={item.to}>
                    <span className="flex items-center gap-2">
                      <span>{item.emoji}</span>
                      {item.label}
                    </span>
                    <span className="text-[10px] text-slate-400">→</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
          <div className="grid gap-2 text-sm text-slate-600 mt-4">
            <a
              className="glass-sidebar-link"
              href="https://github.com/wmes-labs/wmes_mcp_kb_monorepo/blob/main/docs/ingestion.md"
              target="_blank"
              rel="noreferrer"
            >
              Ingestion 文档
            </a>
            <a
              className="glass-sidebar-link"
              href="https://github.com/wmes-labs/wmes_mcp_kb_monorepo/blob/main/docs/retrieval.md"
              target="_blank"
              rel="noreferrer"
            >
              检索策略
            </a>
          </div>
        </aside>

        <section className="flex flex-col gap-6">
          <header className="glass-hero border border-white/60 shadow-lg">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="px-2 py-1 rounded-full bg-slate-900/5 text-slate-700">实时治理</span>
                <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">混合检索</span>
                <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">元数据全可视</span>
              </div>
              <h1 className="text-3xl font-semibold text-[rgb(var(--c-text))] tracking-tight">知识库运营中枢</h1>
              <p className="text-slate-600 leading-relaxed">
                上传 → 解析 → 章节级预分块 → LLM 精细切分 → 元数据 → 向量化 → Hybrid 检索 / MCP。
                进度、元数据、检索效果在同一控制台完成治理。
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="glass-sidebar-link px-3 py-2" onClick={() => navigate("/ingestion")}>
                  快速入库
                </button>
                <button className="glass-sidebar-link px-3 py-2" onClick={() => navigate("/search")}>
                  打开检索工作台
                </button>
                <button className="glass-sidebar-link px-3 py-2" onClick={() => navigate("/metadata")}>
                  元数据治理台
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full sm:w-auto">
              {spotlightCards.map((card) => (
                <div key={card.title} className="glass-card p-4 w-full">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{card.title}</p>
                  <p className="text-sm text-slate-700 leading-relaxed mt-1">{card.desc}</p>
                  <button
                    className="mt-3 inline-flex items-center gap-1 text-sm text-blue-700 font-medium"
                    onClick={card.action}
                  >
                    {card.cta} →
                  </button>
                </div>
              ))}
            </div>
          </header>

          <FlowGuide />

          <main className="w-full space-y-4">
            <div className="glass-card p-0 overflow-hidden">
              <Routes location={location}>
                <Route path="/" element={<Navigate to="/ingestion" replace />} />
                <Route path="/ingestion" element={<IngestionDashboard />} />
                <Route path="/queue" element={<QueueMonitorPage />} />
                <Route path="/documents" element={<DocumentsList />} />
                <Route path="/documents/:docId" element={<DocumentDetail />} />
                <Route path="/documents/:docId/edit" element={<DocumentEdit />} />
                <Route path="/chunks" element={<ChunkListPage />} />
                <Route path="/chunks/:chunkId" element={<ChunkDetailPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/governance" element={<GovernancePage />} />
                <Route path="/metadata" element={<MetadataEditorPage />} />
                <Route path="/diagnostics" element={<DiagnosticsPage />} />
                <Route path="/mcp" element={<McpPage />} />
                <Route path="/settings" element={<ModelSettingsPage />} />
                <Route path="*" element={<p className="text-slate-500 text-sm p-6">未找到该页面</p>} />
              </Routes>
            </div>
          </main>

          <footer className="text-sm text-slate-500">
            API 与 Token 可在 `.env` / `.env.local` 配置 `VITE_API_BASE`、`VITE_API_TOKEN`。
          </footer>
        </section>
      </div>
    </div>
  );
}
