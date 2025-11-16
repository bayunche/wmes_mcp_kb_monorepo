import { useState } from "react";
import { buildAttachmentUrl, previewChunk, relatedChunks, searchDocuments } from "../api";

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [loadingChunk, setLoadingChunk] = useState<string | null>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [relatedStatus, setRelatedStatus] = useState<string | null>(null);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("检索中…");
    try {
      const response = await searchDocuments(query);
      setResults(response.results ?? []);
      setPreview(null);
      setRelated([]);
      setStatus(`命中 ${response.total} 条`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const handlePreview = async (chunkId: string) => {
    setLoadingChunk(chunkId);
    setStatus("加载预览中…");
    try {
      const snapshot = await previewChunk(chunkId);
      setPreview(snapshot);
      setRelated([]);
      setStatus("预览就绪");
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoadingChunk(null);
    }
  };

  const handleRelated = async (chunkId: string) => {
    setRelatedStatus("加载相关段落中…");
    try {
      const response = await relatedChunks(chunkId, 5);
      setRelated(response.neighbors ?? []);
      setRelatedStatus(response.neighbors?.length ? `找到 ${response.neighbors.length} 条相关段落` : "未找到相关段落");
    } catch (error) {
      setRelatedStatus((error as Error).message);
    }
  };

  const copyObjectKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setStatus("对象键已复制");
    } catch {
      setStatus("无法复制对象键，请手动选择复制");
    }
  };

  return (
    <section className="card">
      <h2>检索测试</h2>
      <form onSubmit={handleSearch}>
        <label>
          关键词
          <input value={query} onChange={(e) => setQuery(e.target.value)} required />
        </label>
        <button type="submit">检索</button>
        {status && <p>{status}</p>}
      </form>
      <ul>
        {results.map((item) => (
          <li key={item.chunk.chunkId}>
            <strong>{item.chunk.hierPath?.join(" / ")}</strong>
            <p>{item.chunk.contentText}</p>
            <small>score: {item.score}</small>
            {item.attachments?.length ? (
              <details>
                <summary>附件 {item.attachments.length}</summary>
                <ul>
                  {item.attachments.map((att: any) => (
                    <li key={att.assetId}>
                      {att.assetType} · <code>{att.objectKey}</code>
                      <button type="button" onClick={() => copyObjectKey(att.objectKey)}>
                        复制对象键
                      </button>
                      {buildAttachmentUrl(att.objectKey) ? (
                        <a href={buildAttachmentUrl(att.objectKey) ?? "#"} target="_blank" rel="noreferrer">
                          打开
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <button
              type="button"
              onClick={() => handlePreview(item.chunk.chunkId)}
              disabled={loadingChunk === item.chunk.chunkId}
            >
              {loadingChunk === item.chunk.chunkId ? "加载中…" : "预览"}
            </button>
            <button
              type="button"
              onClick={() => handleRelated(item.chunk.chunkId)}
            >
              查看相关段落
            </button>
          </li>
        ))}
      </ul>
      {preview && (
        <div className="preview">
          <h3>当前预览</h3>
          <pre>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      )}
      {relatedStatus && <p>{relatedStatus}</p>}
      {related.length > 0 && (
        <div className="preview">
          <h3>相关段落</h3>
          <ul>
            {related.map((item) => (
              <li key={item.chunk.chunkId}>
                <strong>{item.chunk.hierPath?.join(" / ")}</strong>
                <p>{item.chunk.contentText}</p>
                <small>source: {item.sourceUri}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
