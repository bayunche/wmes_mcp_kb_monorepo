import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { deleteDocument, listDocuments, reindexDocument } from "../api";

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
    setStatus("加载详情中…");
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
    setStatus("重新入队中…");
    try {
      await reindexDocument(docId, document?.tenantId, document?.libraryId);
      setStatus("任务已入队");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!docId) return;
    if (!confirm("确定要删除该文档及其附件？")) return;
    setStatus("删除中…");
    try {
      await deleteDocument(docId);
      navigate("/documents");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  if (!docId) {
    return <p className="placeholder">缺少 docId。</p>;
  }

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="eyebrow">文档详情</p>
          <h2>{document?.title ?? docId}</h2>
        </div>
        {status && <span className="status-pill">{status}</span>}
      </header>
      {document ? (
        <div className="detail-grid">
          <div>
            <strong>Doc ID</strong>
            <p>{document.docId}</p>
          </div>
          <div>
            <strong>Tenant</strong>
            <p>{document.tenantId ?? "default"}</p>
          </div>
          <div>
            <strong>Library</strong>
            <p>{document.libraryId ?? "default"}</p>
          </div>
          <div>
            <strong>Status</strong>
            <p>{document.ingestStatus ?? "-"}</p>
          </div>
          <div>
            <strong>Tags</strong>
            <p>{document.tags?.length ? document.tags.join(", ") : "-"}</p>
          </div>
        </div>
      ) : (
        <p className="placeholder">暂无数据。</p>
      )}
      <div className="button-row">
        <Link to={`/documents/${docId}/edit`} className="link-btn">
          编辑标签
        </Link>
        <button type="button" className="ghost" onClick={handleReindex}>
          重新索引
        </button>
        <button type="button" className="danger" onClick={handleDelete}>
          删除
        </button>
      </div>
    </section>
  );
}
