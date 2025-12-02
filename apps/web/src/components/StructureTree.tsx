import { useCallback, useMemo, useState } from "react";
import { fetchDocumentStructure } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
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
import { Network, Search } from "lucide-react";

interface DocumentSectionView {
  sectionId: string;
  title: string;
  summary?: string;
  level?: number;
  path?: string[];
  order?: number;
  tags?: string[];
  keywords?: string[];
}



export function StructureTree() {
  const [docId, setDocId] = useState("");
  const [sections, setSections] = useState<DocumentSectionView[]>([]);

  const loadStructureTask = useAsyncTask(
    useCallback(async () => {
      const response = await fetchDocumentStructure(docId.trim());
      setSections(response.sections ?? []);
      return response.sections?.length ?? 0;
    }, [docId]),
    {
      loadingMessage: "加载结构中...",
      successMessage: (count) => `共 ${count} 个段落`,
      errorMessage: (error) => error.message || "加载失败"
    }
  );

  const statusTone = useMemo(() => {
    if (loadStructureTask.status.phase === "error") return "danger";
    if (loadStructureTask.status.phase === "success") return "success";
    if (loadStructureTask.status.phase === "loading") return "info";
    return "info";
  }, [loadStructureTask.status.phase]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!docId.trim().length) {
      setSections([]);
      loadStructureTask.setStatus("error", "请输入 Doc ID");
      return;
    }
    await loadStructureTask.run();
  };

  return (

    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              结构树
            </CardTitle>
            <CardDescription>文档章节 / 小节</CardDescription>
          </div>
          {loadStructureTask.status.message && (
            <Badge variant={statusTone === "danger" ? "destructive" : statusTone === "success" ? "default" : "secondary"}>
              {loadStructureTask.status.message}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="flex items-end gap-4" onSubmit={handleSubmit}>
          <div className="flex-1 space-y-2">
            <Label>Doc ID</Label>
            <Input
              placeholder="输入需要查看的文档 ID"
              value={docId}
              onChange={(event) => setDocId(event.target.value)}
            />
          </div>
          <Button type="submit">
            <Search className="mr-2 h-4 w-4" />
            加载结构
          </Button>
        </form>

        <div className="rounded-md border p-4 min-h-[200px] bg-slate-50/50">
          <ul className="space-y-2">
            {loadStructureTask.status.phase === "loading" ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <li key={`skeleton-${idx}`} style={{ marginLeft: `${idx * 16}px` }}>
                  <div className="space-y-2 p-2">
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-3 w-[150px]" />
                  </div>
                </li>
              ))
            ) : sections.length > 0 ? (
              sections.map((section) => (
                <li key={section.sectionId} style={{ marginLeft: `${((section.level ?? 1) - 1) * 24}px` }}>
                  <div className="rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between gap-4">
                      <strong className="text-sm font-medium">{section.title}</strong>
                      {section.tags?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {section.tags.map((tag) => (
                            <Badge key={`${section.sectionId}-${tag}`} variant="secondary" className="text-[10px] px-1 py-0">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {section.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{section.summary}</p>}
                    {section.keywords?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {section.keywords.map((keyword) => (
                          <span key={keyword} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))
            ) : (
              <li className="flex flex-col items-center justify-center h-[150px] text-muted-foreground text-sm">
                <Network className="h-8 w-8 mb-2 opacity-20" />
                尚未加载结构
              </li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
