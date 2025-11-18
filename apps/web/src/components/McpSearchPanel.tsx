import { useState } from "react";
import { mcpSearch } from "../api";

export function McpSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [libraryId, setLibraryId] = useState("default");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("MCP 搜索中…");
    try {
      const response = await mcpSearch({ query, limit: 5 }, libraryId || "default");
      setResults(response.results ?? []);
      setStatus(`MCP 命中 ${response.total ?? response.results?.length ?? 0} 条`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="eyebrow">工具链</p>
          <h2>MCP Search</h2>
        </div>
        {status && <span className="status-pill">{status}</span>}
      </header>
      <form onSubmit={handleSubmit} className="stacked-form">
        <label>
          关键词
          <input value={query} onChange={(e) => setQuery(e.target.value)} required placeholder="例如：审批" />
        </label>
        <label>
          Library ID
          <input value={libraryId} onChange={(e) => setLibraryId(e.target.value)} placeholder="default" />
        </label>
        <div className="button-row">
          <button type="submit">执行</button>
        </div>
      </form>
      <div className="result-list compact">
        {results.map((item) => (
          <article key={item.chunk.chunkId} className="result-card compact">
            <header>
              <strong>{item.chunk.hierPath?.join(" / ") || item.chunk.chunkId}</strong>
              <span className="badge subtle">score {item.score?.toFixed?.(3) ?? item.score}</span>
            </header>
            <p>{item.chunk.contentText}</p>
          </article>
        ))}
        {results.length === 0 && <p className="placeholder">MCP 结果将展示在此。</p>}
      </div>
    </section>
  );
}
