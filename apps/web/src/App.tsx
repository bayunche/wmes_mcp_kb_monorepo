import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
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
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx("glass-sidebar-link", isActive && "bg-white/80 text-[rgb(var(--c-text))] border-slate-200 shadow-sm");

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="glass-sidebar h-fit backdrop-blur-xl">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-slate-500">WMES 知识库</p>
          <h2 className="text-xl font-semibold text-[rgb(var(--c-text))]">控制台</h2>
        </div>
        <nav className="grid gap-2">
          <NavLink className={linkClass} to="/ingestion">入库</NavLink>
          <NavLink className={linkClass} to="/queue">队列</NavLink>
          <NavLink className={linkClass} to="/documents">文档</NavLink>
          <NavLink className={linkClass} to="/chunks">分块</NavLink>
          <NavLink className={linkClass} to="/search">检索</NavLink>
          <NavLink className={linkClass} to="/governance">治理</NavLink>
          <NavLink className={linkClass} to="/diagnostics">诊断</NavLink>
          <NavLink className={linkClass} to="/mcp">MCP / 指标</NavLink>
          <NavLink className={linkClass} to="/settings">模型配置</NavLink>
        </nav>
        <div className="grid gap-2 text-sm text-slate-600">
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
        <header className="glass-hero">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-slate-500">WMES Knowledge Base</p>
            <h1 className="text-2xl font-semibold text-[rgb(var(--c-text))]">运营控制台</h1>
            <p className="text-slate-600 mt-2">
              上传原始文档、查看队列状态、检索与预览、验证 MCP 工具与搜索链路。
            </p>
          </div>
        </header>
        <FlowGuide />
        <main className="w-full">
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
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/mcp" element={<McpPage />} />
            <Route path="/settings" element={<ModelSettingsPage />} />
            <Route path="*" element={<p className="text-slate-500 text-sm">未找到该页面</p>} />
          </Routes>
        </main>
        <footer className="text-sm text-slate-500">
          API 与 Token 可在 `.env` / `.env.local` 配置 `VITE_API_BASE`、`VITE_API_TOKEN`。
        </footer>
      </section>
    </div>
  );
}
