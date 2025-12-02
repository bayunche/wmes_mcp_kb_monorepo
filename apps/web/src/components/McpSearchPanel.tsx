import { useEffect, useMemo, useState } from "react";
import { mcpSearch } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "./ui/Toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/Card";
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Skeleton } from "./ui/Skeleton";
import { Search } from "lucide-react";



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

  const statusTone = useMemo(() => {
    if (searchTask.status.phase === "error") return "danger";
    if (searchTask.status.phase === "success") return "success";
    return "info";
  }, [searchTask.status.phase]);

  return (

    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              MCP Search
            </CardTitle>
            <CardDescription>MCP 工具检索测试</CardDescription>
          </div>
          {searchTask.status.message && (
            <Badge variant={statusTone === "danger" ? "destructive" : statusTone === "success" ? "default" : "secondary"}>
              {searchTask.status.message}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>关键词</Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
              placeholder="示例：记账规则"
            />
          </div>
          <div className="space-y-2">
            <Label>Library ID</Label>
            <Input
              value={libraryId}
              onChange={(e) => setLibraryId(e.target.value)}
              placeholder="default"
            />
          </div>
          <Button type="submit" className="w-full">
            执行检索
          </Button>
        </form>

        <div className="space-y-4">
          {searchTask.status.phase === "loading" ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <div key={`mcp-skeleton-${idx}`} className="space-y-2 p-4 border rounded-lg">
                <Skeleton className="h-4 w-[40%]" />
                <Skeleton className="h-3 w-[80%]" />
              </div>
            ))
          ) : results.length > 0 ? (
            results.map((item) => (
              <div key={item.chunk.chunkId} className="p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <strong className="text-sm font-medium truncate max-w-[70%]">
                    {item.chunk.hierPath?.join(" / ") || item.chunk.chunkId}
                  </strong>
                  <Badge variant="outline" className="text-xs">
                    score {item.score?.toFixed?.(3) ?? item.score}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {item.chunk.contentText}
                </p>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg border-dashed">
              MCP 结果会显示在这里
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
