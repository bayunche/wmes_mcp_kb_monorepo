import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import { ToastProvider } from "./components/ui/Toast";
import { MainLayout } from "./components/MainLayout";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <MainLayout>
          <Routes>
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
            <Route path="*" element={<p className="text-slate-500 text-sm p-6">Page Not Found</p>} />
          </Routes>
        </MainLayout>
      </ToastProvider>
    </BrowserRouter>
  );
}
