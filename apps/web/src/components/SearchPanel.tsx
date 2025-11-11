import { useState } from "react";
import { searchDocuments } from "../api";

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("检索中…");
    try {
      const response = await searchDocuments(query);
      setResults(response.results ?? []);
      setStatus(`命中 ${response.total} 条`);
    } catch (error) {
      setStatus((error as Error).message);
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
          </li>
        ))}
      </ul>
    </section>
  );
}
