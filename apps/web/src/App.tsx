import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import IngestionDashboard from "./pages/IngestionDashboard";
import DocumentsList from "./pages/DocumentsList";
import DocumentDetail from "./pages/DocumentDetail";
import DocumentEdit from "./pages/DocumentEdit";
import SearchPage from "./pages/SearchPage";
import McpPage from "./pages/McpPage";
import GovernancePage from "./pages/GovernancePage";
import ModelSettingsPage from "./pages/ModelSettingsPage";
import FlowGuide from "./components/FlowGuide";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">WMES Knowledge Base</p>
          <h1>运营控制台</h1>
          <p>上传原始文档、观察队列状态并在本地验证检索/MCP 工具链。</p>
        </div>
        <div className="hero-actions">
          <a href="https://github.com/wmes-labs/wmes_mcp_kb_monorepo/blob/main/docs/ingestion.md" target="_blank" rel="noreferrer">Ingestion 文档</a>
          <a href="https://github.com/wmes-labs/wmes_mcp_kb_monorepo/blob/main/docs/retrieval.md" target="_blank" rel="noreferrer">检索策略</a>
        </div>
      </header>
      <nav className="primary-nav">
        <NavLink to="/ingestion">入库</NavLink>
        <NavLink to="/documents">文档</NavLink>
        <NavLink to="/search">检索</NavLink>
         <NavLink to="/governance">治理</NavLink>
        <NavLink to="/mcp">MCP & 指标</NavLink>
        <NavLink to="/settings">配置</NavLink>
      </nav>
      <FlowGuide />
      <main className="tab-content">
        <div key={location.pathname} className="page-transition">
          <Routes location={location}>
            <Route path="/" element={<Navigate to="/ingestion" replace />} />
            <Route path="/ingestion" element={<IngestionDashboard />} />
            <Route path="/documents" element={<DocumentsList />} />
            <Route path="/documents/:docId" element={<DocumentDetail />} />
            <Route path="/documents/:docId/edit" element={<DocumentEdit />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/governance" element={<GovernancePage />} />
            <Route path="/mcp" element={<McpPage />} />
            <Route path="/settings" element={<ModelSettingsPage />} />
            <Route path="*" element={<p className="placeholder">未找到该页面。</p>} />
          </Routes>
        </div>
      </main>
      <footer className="app-footer">
        <small>API 与 Token 可在 `.env` / `.env.local` 中配置 `VITE_API_BASE`、`VITE_API_TOKEN`。</small>
      </footer>
    </div>
  );
}
