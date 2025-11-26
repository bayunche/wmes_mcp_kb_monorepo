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
    setStatus("加载详情�?..");
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
  }, [docId]);

  const handleReindex = async () => {
    if (!docId) return;
    setStatus("重新入队重建索引...");
    try {
      await reindexDocument(docId, document?.tenantId, document?.libraryId);
      setStatus("任务已入�?);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!docId) return;
    if (!confirm("确定删除该文档及其附件吗�?)) return;
    setStatus("删除�?..");
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
    <GlassCard>
      <SectionHeader
        eyebrow="文档详情"
        title={document?.title ?? docId}
        status={status ? <StatusPill tone="info">{status}</StatusPill> : null}
      />
      {document ? (
        <div className="detail-grid">
          <div>
            <strong>Doc ID</strong>
            <p>{document.docId}</p>
          </div>
          <div>
            <strong>标签</strong>
            <p>{document.tags?.join(" / ") || "-"}</p>
          </div>
          <div>
            <strong>租户</strong>
            <p>{document.tenantId ?? "-"}</p>
          </div>
          <div>
            <strong>知识�?/strong>
            <p>{document.libraryId ?? "-"}</p>
          </div>
          <div>
            <strong>状�?/strong>
            <p>{document.ingestStatus ?? "-"}</p>
          </div>
        </div>
      ) : (
        <p className="placeholder">未找到该文档</p>
      )}
      <div className="button-row">
        <Button variant="ghost" onClick={handleReindex} disabled={!document}>
          重建索引
        </Button>
                <Button asChild>
          <Link to={/documents//edit}>编辑</Link>
        </Button>
        <Button variant="ghost" onClick={handleDelete}>
          删除
        </Button>
      </div>
    </GlassCard>
  );
}


