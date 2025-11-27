import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { deleteDocument, listDocuments, reindexDocument } from "../api";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatusPill } from "../components/ui/StatusPill";
import { Button } from "../components/ui/Button";

type DocSummary = {
  docId: string;
  title: string;
  ingestStatus?: string;
  tenantId?: string;
  libraryId?: string;
  tags?: string[];
};

export default function DocumentDetail() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocSummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = async () => {
    if (!docId) return;
    setStatus("加载详情中...");
    try {
      const response = await listDocuments();
      const target = (response.items ?? []).find((doc: DocSummary) => doc.docId === docId) ?? null;
      setDocument(target);
      setStatus(target ? null : "未找到该文档");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const handleReindex = async () => {
    if (!docId) return;
    setStatus("重新入队重建索引...");
    try {
      await reindexDocument(docId, document?.tenantId, document?.libraryId);
      setStatus("任务已入队");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!docId) return;
    if (!confirm("确定删除该文档及其附件吗？")) return;
    setStatus("删除中...");
    try {
      await deleteDocument(docId);
      navigate("/documents");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  if (!docId) {
    return <p className="placeholder">缺少 docId</p>;
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-6 space-y-2">
        <SectionHeader
          eyebrow="文档详情"
          title={document?.title ?? docId}
          description="查看文档元信息、状态与所属租户/知识库，可进行重建索引或删除。"
          status={status ? <StatusPill tone="info">{status}</StatusPill> : null}
        />
      </GlassCard>

      <GlassCard className="space-y-4">
        {document ? (
          <div className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="glass-card p-3">
              <p className="text-xs text-slate-500">Doc ID</p>
              <p className="font-medium text-slate-900">{document.docId}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-xs text-slate-500">标签</p>
              <p className="text-slate-800">{document.tags?.join(" / ") || "-"}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-xs text-slate-500">租户</p>
              <p className="text-slate-800">{document.tenantId ?? "-"}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-xs text-slate-500">知识库</p>
              <p className="text-slate-800">{document.libraryId ?? "-"}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-xs text-slate-500">状态</p>
              <p className="text-slate-800">{document.ingestStatus ?? "-"}</p>
            </div>
          </div>
        ) : (
          <p className="placeholder">未找到该文档</p>
        )}

        <div className="button-row">
          <Button variant="ghost" onClick={handleReindex} disabled={!document}>
            重新索引
          </Button>
          <Button asChild>
            <Link to={`/documents/${docId}/edit`}>编辑</Link>
          </Button>
          <Button variant="ghost" onClick={handleDelete}>
            删除
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
