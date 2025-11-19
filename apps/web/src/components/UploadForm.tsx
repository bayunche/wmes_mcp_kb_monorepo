import { useEffect, useMemo, useState } from "react";
import { uploadDocuments } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";

function deriveTitle(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex > 0) {
    return filename.slice(0, dotIndex);
  }
  return filename;
}

export function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const { tenants, libraries, loading: optionLoading, error: optionError, refresh } = useOrgOptions();
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [files, setFiles] = useState<File[]>([]);
  const [fileTitles, setFileTitles] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [results, setResults] = useState<
    { docId: string; filename: string; status: string; message?: string }[]
  >([]);

  const libraryOptions = useMemo(() => {
    if (!libraries.length) return [];
    return libraries.filter((lib) => !lib.tenantId || lib.tenantId === tenantId);
  }, [libraries, tenantId]);

  useEffect(() => {
    if (!tenants.length) return;
    if (!tenants.some((tenant) => tenant.tenantId === tenantId)) {
      setTenantId(tenants[0].tenantId);
    }
  }, [tenants, tenantId]);

  useEffect(() => {
    if (!libraryOptions.length) return;
    if (!libraryOptions.some((lib) => lib.libraryId === libraryId)) {
      setLibraryId(libraryOptions[0].libraryId);
    }
  }, [libraryOptions, libraryId]);

  const handleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files ? Array.from(event.target.files) : [];
    setFiles(list);
    const generated = list.map((file) => deriveTitle(file.name));
    setFileTitles(generated);
    setResults([]);
    setTitle(generated[0] ?? "");
  };

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
        title: files.length <= 1 ? title : undefined,
        titles: files.length > 1 ? fileTitles : undefined,
        tenantId,
        libraryId
      });
      setStatus("上传完成");
      setResults(payload.items ?? []);
      setTitle("");
      setFiles([]);
      setFileTitles([]);
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
        <div className="button-row compact">
          {optionLoading && <span className="status-pill info">同步配置…</span>}
          {optionError && <span className="status-pill danger">{optionError}</span>}
          {status && <span className="status-pill">{status}</span>}
        </div>
      </header>
      <form onSubmit={handleSubmit} className="stacked-form">
        <div className="split">
          <label>
            选择租户
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              {tenants.length
                ? tenants.map((tenant) => (
                    <option key={tenant.tenantId} value={tenant.tenantId}>
                      {tenant.displayName ?? tenant.tenantId}（{tenant.tenantId}）
                    </option>
                  ))
                : <option value="default">默认租户（default）</option>}
            </select>
          </label>
          <label>
            知识库
            <select value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
              {libraryOptions.length
                ? libraryOptions.map((lib) => (
                    <option key={lib.libraryId} value={lib.libraryId}>
                      {lib.displayName ?? lib.libraryId}（{lib.libraryId}）
                    </option>
                  ))
                : <option value="default">默认知识库（default）</option>}
            </select>
          </label>
        </div>
        {files.length <= 1 ? (
          <label>
            文档标题
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setFileTitles((prev) => {
                  const next = [...prev];
                  next[0] = e.target.value;
                  return next;
                });
              }}
              required
              placeholder="示例：2024 合作协议"
            />
          </label>
        ) : (
          <div className="stacked-form">
            <p className="muted-text">已批量选择 {files.length} 个文件，可逐个调整标题：</p>
            {files.map((file, index) => (
              <label key={`${file.name}-${index}`}>
                {file.name}
                <input
                  value={fileTitles[index] ?? ""}
                  onChange={(e) =>
                    setFileTitles((prev) => {
                      const next = [...prev];
                      next[index] = e.target.value;
                      return next;
                    })
                  }
                  required
                />
              </label>
            ))}
          </div>
        )}
        <small className="muted-text">标签将根据标题 + AI 自动生成，无需手动填写。</small>
        <label className="file-input">
          文件
          <input type="file" multiple onChange={handleFilesChange} />
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
          <button type="button" className="ghost" onClick={refresh}>
            刷新配置
          </button>
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
