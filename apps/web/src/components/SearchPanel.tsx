import { useMemo, useState } from "react";
import { buildAttachmentUrl, previewChunk, relatedChunks, searchDocuments } from "../api";

type SearchResult = {
  chunk: {
    chunkId: string;
    hierPath?: string[];
    contentText?: string;
    sourceUri?: string;
    semanticMetadata?: {
      contextSummary?: string;
      semanticTags?: string[];
      envLabels?: string[];
    };
  };
  document?: {
    docId: string;
    title?: string;
    tags?: string[];
    ingestStatus?: string;
    sourceUri?: string;
  };
  attachments?: any[];
  score?: number;
};

export default function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [loadingChunk, setLoadingChunk] = useState<string | null>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [relatedStatus, setRelatedStatus] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [semanticTags, setSemanticTags] = useState("");
  const [envLabels, setEnvLabels] = useState("");
  const [metadataKey, setMetadataKey] = useState("");
  const [metadataValue, setMetadataValue] = useState("");
  const [onlyWithAttachments, setOnlyWithAttachments] = useState(false);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("检索中…");
    try {
      const response = await searchDocuments(
        {
          query,
          limit: 10,
          includeNeighbors: true,
          filters: {
            tenantId: tenantId || undefined,
            libraryId: libraryId || undefined,
            semanticTags: semanticTags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            envLabels: envLabels
              .split(",")
              .map((label) => label.trim())
              .filter(Boolean),
            metadataQuery:
              metadataKey.trim() && metadataValue.trim()
                ? { [metadataKey.trim()]: metadataValue.trim() }
                : undefined,
            hasAttachments: onlyWithAttachments ? true : undefined
          }
        },
        libraryId || "default"
      );
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
      const snapshot = await previewChunk(chunkId, libraryId || "default");
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
      const response = await relatedChunks(chunkId, 5, libraryId || "default");
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

  const placeholder = useMemo(() => "例如：付款条款、违约责任", []);

  return (
    <section className="card card--tall">
      <header className="card-header">
        <div>
          <p className="eyebrow">混合检索</p>
          <h2>Search &amp; Preview</h2>
        </div>
        {status && <span className="status-pill">{status}</span>}
      </header>
      <form onSubmit={handleSearch} className="stacked-form">
        <label>
          关键词
          <input value={query} onChange={(e) => setQuery(e.target.value)} required placeholder={placeholder} />
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
        </div>
        <div className="split">
          <label>
            语义标签筛选（逗号分隔）
            <input value={semanticTags} onChange={(e) => setSemanticTags(e.target.value)} placeholder="合同, 付款" />
          </label>
          <label>
            环境标签筛选
            <input value={envLabels} onChange={(e) => setEnvLabels(e.target.value)} placeholder="流程, 系统" />
          </label>
        </div>
        <div className="split">
          <label>
            Metadata Key
            <input value={metadataKey} onChange={(e) => setMetadataKey(e.target.value)} placeholder="如 bizType" />
          </label>
          <label>
            Metadata Value
            <input value={metadataValue} onChange={(e) => setMetadataValue(e.target.value)} placeholder="如 合同" />
          </label>
        </div>
        <label className="checkbox-inline">
          <input type="checkbox" checked={onlyWithAttachments} onChange={(event) => setOnlyWithAttachments(event.target.checked)} />
          仅展示含附件的段落
        </label>
        <label>
          <span className="guide-hint">检索结果按段落返回，可结合语义标签/环境标签筛选。</span>
        </label>
        <div className="button-row">
          <button type="submit">检索</button>
        </div>
      </form>
      <div className="result-list">
        {results.map((item) => (
          <article key={item.chunk.chunkId} className="result-card">
            <header>
              <div>
                <p className="eyebrow">
                  来自 · {item.document?.title ?? "未知文档"}
                </p>
                <h3>{item.chunk.hierPath?.join(" / ") || "未命名段落"}</h3>
              </div>
              <span className="badge">score {item.score?.toFixed?.(3) ?? item.score}</span>
            </header>
            <div className="doc-meta">
              <span className="badge subtle">{item.document?.ingestStatus ?? "uploaded"}</span>
              <span className="meta-muted">库：{item.document?.libraryId ?? libraryId}</span>
              {item.document?.tags?.length ? (
                <div className="tag-inline">
                  {item.document.tags.slice(0, 5).map((tag) => (
                    <span key={`${item.chunk.chunkId}-${tag}`} className="tag-chip">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="meta-muted">自动标签生成中…</span>
              )}
            </div>
            <p className="result-snippet">{item.chunk.contentText}</p>
            {item.chunk.sourceUri && <small className="meta-muted">{item.chunk.sourceUri}</small>}
            {item.attachments?.length ? (
              <div className="attachment-chips">
                {item.attachments.map((att: any) => (
                  <div key={att.assetId} className="chip">
                    <span>{att.assetType} · {att.objectKey}</span>
                    <div className="chip-actions">
                      <button type="button" onClick={() => copyObjectKey(att.objectKey)}>复制</button>
                      {buildAttachmentUrl(att.objectKey) ? (
                        <a href={buildAttachmentUrl(att.objectKey) ?? "#"} target="_blank" rel="noreferrer">
                          打开
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {item.chunk?.semanticMetadata && (
              <div className="semantic-panel">
                {item.chunk.semanticMetadata.contextSummary && (
                  <p className="meta-muted">摘要：{item.chunk.semanticMetadata.contextSummary}</p>
                )}
                <div className="tag-inline">
                  {item.chunk.semanticMetadata.semanticTags?.map((tag) => (
                    <span key={`${item.chunk.chunkId}-semantic-${tag}`} className="tag-chip subtle">
                      {tag}
                    </span>
                  ))}
                  {item.chunk.semanticMetadata.envLabels?.map((label) => (
                    <span key={`${item.chunk.chunkId}-env-${label}`} className="tag-chip ghost">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="button-row">
              <button
                type="button"
                onClick={() => handlePreview(item.chunk.chunkId)}
                disabled={loadingChunk === item.chunk.chunkId}
              >
                {loadingChunk === item.chunk.chunkId ? "加载中…" : "查看预览"}
              </button>
              <button type="button" className="ghost" onClick={() => handleRelated(item.chunk.chunkId)}>
                相关段落
              </button>
            </div>
          </article>
        ))}
        {results.length === 0 && <p className="placeholder">尚无结果，输入关键词开始检索。</p>}
      </div>
      {preview && (
        <div className="preview-panel">
          <div className="panel-header">
            <h3>当前预览</h3>
            <span className="badge subtle">chunk {preview.chunkId ?? "N/A"}</span>
          </div>
          <pre>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      )}
      {relatedStatus && <p className="status-text">{relatedStatus}</p>}
      {related.length > 0 && (
        <div className="preview-panel">
          <div className="panel-header">
            <h3>相关段落</h3>
          </div>
          <ul className="related-list">
            {related.map((item) => (
              <li key={item.chunk.chunkId}>
                <strong>{item.chunk.hierPath?.join(" / ")}</strong>
                <p>{item.chunk.contentText}</p>
                <small>{item.sourceUri}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
