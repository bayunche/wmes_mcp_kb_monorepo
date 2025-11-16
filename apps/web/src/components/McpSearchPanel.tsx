import { useState } from "react";
import { mcpSearch } from "../api";

export function McpSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("MCP 搜索中…");
    try {
      const response = await mcpSearch({ query, limit: 5 });
      setResults(response.results ?? []);
      setStatus(`MCP 命中 ${response.total ?? response.results?.length ?? 0} 条`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <section className="card">
      <h2>MCP Search</h2>
      <form onSubmit={handleSubmit}>
        <label>
          关键词
          <input value={query} onChange={(e) => setQuery(e.target.value)} required />
        </label>
        <button type="submit">执行</button>
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
                    <li key={att.assetId}>{att.assetType} · {att.objectKey}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
