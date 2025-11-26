import { useEffect, useMemo, useState } from "react";
import { mcpSearch } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "./ui/Toast";
import { GlassCard } from "./ui/GlassCard";
import { SectionHeader } from "./ui/SectionHeader";
import { Field } from "./ui/Field";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { StatusPill } from "./ui/StatusPill";
import { Skeleton } from "./ui/Skeleton";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition";

export function McpSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [libraryId, setLibraryId] = useState("default");
  const toast = useToast();

  const searchTask = useAsyncTask(
    async () => {
      const response = await mcpSearch({ query, limit: 5 }, libraryId || "default");
      setResults(response.results ?? []);
      return response.total ?? response.results?.length ?? 0;
    },
    {
      loadingMessage: "MCP 检索中...",
      successMessage: (total) => `MCP 找到 ${total} 条结果`,
      errorMessage: (error) => error.message
    }
  );

  useEffect(() => {
    if (searchTask.status.phase === "error" && searchTask.status.message) {
      toast.push({ title: "MCP 检索失败", description: searchTask.status.message, tone: "danger" });
    }
  }, [searchTask.status, toast]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await searchTask.run();
    } catch (error) {
      toast.push({ title: "MCP 检索失败", description: (error as Error).message, tone: "danger" });
    }
  };

  const statusTone = useMemo(() => (searchTask.status.phase === "error" ? "danger" : "info"), [searchTask.status.phase]);

  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        eyebrow="MCP 工具"
        title="MCP Search"
        status={
          searchTask.status.message ? <StatusPill tone={statusTone}>{searchTask.status.message}</StatusPill> : null
        }
      />
      <form onSubmit={handleSubmit} className="stacked-form">
        <Field label="关键词">
          <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} required placeholder="示例：记账规则" />
        </Field>
        <Field label="Library ID" hint="默认 default">
          <input className={inputClass} value={libraryId} onChange={(e) => setLibraryId(e.target.value)} placeholder="default" />
        </Field>
        <div className="button-row">
          <Button type="submit">执行</Button>
        </div>
      </form>
      <div className="result-list compact space-y-2">
        {searchTask.status.phase === "loading"
          ? Array.from({ length: 3 }).map((_, idx) => (
              <article key={`mcp-skeleton-${idx}`} className="result-card compact">
                <Skeleton width="40%" />
                <Skeleton width="80%" height={12} style={{ marginTop: "6px" }} />
              </article>
            ))
          : results.map((item) => (
              <article key={item.chunk.chunkId} className="result-card compact">
                <header className="flex items-center justify-between">
                  <strong>{item.chunk.hierPath?.join(" / ") || item.chunk.chunkId}</strong>
                  <Badge tone="subtle">score {item.score?.toFixed?.(3) ?? item.score}</Badge>
                </header>
                <p className="muted-text">{item.chunk.contentText}</p>
              </article>
            ))}
        {results.length === 0 && searchTask.status.phase !== "loading" && (
          <p className="placeholder">MCP 结果会显示在这里</p>
        )}
      </div>
    </GlassCard>
  );
}
