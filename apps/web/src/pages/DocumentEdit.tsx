import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { listDocuments, updateDocumentTags } from "../api";

export default function DocumentEdit() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [title, setTitle] = useState("...");

  useEffect(() => {
    const load = async () => {
      if (!docId) return;
      try {
        const response = await listDocuments();
        const doc = (response.items ?? []).find((item: any) => item.docId === docId);
        if (doc) {
          setTitle(doc.title ?? docId);
          setTags((doc.tags ?? []).join(","));
        } else {
          setStatus("未找到文档");
        }
      } catch (error) {
        setStatus((error as Error).message);
      }
    };
    load();
  }, [docId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!docId) return;
    setStatus("更新中…");
    try {
      await updateDocumentTags(
        docId,
        tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      );
      setStatus("已保存");
      navigate(`/documents/${docId}`);
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
          <p className="eyebrow">编辑</p>
          <h2>文档标签 · {title}</h2>
        </div>
        {status && <span className="status-pill">{status}</span>}
      </header>
      <form onSubmit={handleSubmit} className="stacked-form">
        <label>
          标签（使用逗号分隔）
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="合同, 财务" />
        </label>
        <div className="button-row">
          <button type="submit">保存</button>
        </div>
      </form>
    </section>
  );
}
