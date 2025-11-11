import { useEffect, useState } from "react";
import { listDocuments, updateDocumentTags } from "../api";

export function MetadataEditor() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = async () => {
    const response = await listDocuments();
    setDocuments(response.items ?? []);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setStatus("更新中…");
    try {
      await updateDocumentTags(
        selectedId,
        tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      );
      await refresh();
      setStatus("更新成功");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <section className="card">
      <h2>元数据管理</h2>
      <form onSubmit={handleUpdate}>
        <label>
          选择文档
          <select
            value={selectedId}
            onChange={(e) => {
              const docId = e.target.value;
              setSelectedId(docId);
              const doc = documents.find((d) => d.docId === docId);
              setTags((doc?.tags ?? []).join(","));
            }}
          >
            <option value="">请选择</option>
            {documents.map((doc) => (
              <option key={doc.docId} value={doc.docId}>
                {doc.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          标签（逗号分隔）
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <button type="submit" disabled={!selectedId}>
          更新
        </button>
        {status && <p>{status}</p>}
      </form>
    </section>
  );
}
