import { useState } from "react";
import { uploadDocuments } from "../api";

export function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [title, setTitle] = useState("");
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [results, setResults] = useState<
    { docId: string; filename: string; status: string; message?: string }[]
  >([]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!files.length) {
      setStatus("请选择至少一个文件");
      return;
    }
    setStatus("上传中…");
    try {
      const payload = await uploadDocuments({
        files,
        title,
        tenantId,
        libraryId,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      });
      setStatus("上传完成");
      setResults(payload.items ?? []);
      setTitle("");
      setTags("");
      setFiles([]);
      onUploaded();
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="eyebrow">文档入口</p>
          <h2>上传文档</h2>
        </div>
        {status && <span className="status-pill">{status}</span>}
      </header>
      <form onSubmit={handleSubmit} className="stacked-form">
        <label>
          标题
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="示例合同" />
        </label>
        <div className="split">
          <label>
            Tenant ID
            <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="default" />
          </label>
          <label>
            Library ID
            <input value={libraryId} onChange={(e) => setLibraryId(e.target.value)} placeholder="default" />
          </label>
        <label>
          标签（逗号分隔）
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="合同, 2024" />
        </label>
        </div>
        <label className="file-input">
          文件
          <input
            type="file"
            multiple
            onChange={(event) => {
              const list = event.target.files ? Array.from(event.target.files) : [];
              setFiles(list);
              setResults([]);
            }}
          />
        </label>
        {files.length > 0 && (
          <ul className="file-preview">
            {files.map((file) => (
              <li key={file.name}>{file.name}</li>
            ))}
          </ul>
        )}
        <div className="button-row">
          <button type="submit">提交任务</button>
        </div>
      </form>
      {results.length > 0 && (
        <div className="upload-results">
          <table>
            <thead>
              <tr>
                <th>文件</th>
                <th>Doc ID</th>
                <th>状态</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={`${result.docId}-${result.filename}`}>
                  <td>{result.filename}</td>
                  <td>{result.docId}</td>
                  <td>{result.status}</td>
                  <td>{result.message ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
