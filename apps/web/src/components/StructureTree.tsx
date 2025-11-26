import { useCallback, useMemo, useState } from "react";
import { fetchDocumentStructure } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { GlassCard } from "./ui/GlassCard";
import { SectionHeader } from "./ui/SectionHeader";
import { Field } from "./ui/Field";
import { Button } from "./ui/Button";
import { StatusPill } from "./ui/StatusPill";
import { Badge } from "./ui/Badge";
import { Skeleton } from "./ui/Skeleton";

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

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition";

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
    <GlassCard className="space-y-4">
      <SectionHeader
        eyebrow="结构树"
        title="文档章节 / 小节"
        status={
          loadStructureTask.status.message ? (
            <StatusPill tone={statusTone}>{loadStructureTask.status.message}</StatusPill>
          ) : null
        }
      />
      <form className="stacked-form" onSubmit={handleSubmit}>
        <Field label="Doc ID" hint="输入需要查看的文档 ID">
          <input className={inputClass} value={docId} onChange={(event) => setDocId(event.target.value)} placeholder="输入文档 ID" />
        </Field>
        <div className="button-row">
          <Button type="submit">加载结构</Button>
        </div>
      </form>
      <ul className="structure-tree">
        {loadStructureTask.status.phase === "loading"
          ? Array.from({ length: 4 }).map((_, idx) => (
              <li key={`skeleton-${idx}`} style={{ marginLeft: `${idx * 6}px` }}>
                <div className="structure-node">
                  <Skeleton width="70%" height={14} />
                  <Skeleton width="55%" height={12} style={{ marginTop: "8px" }} />
                </div>
              </li>
            ))
          : sections.map((section) => (
              <li key={section.sectionId} style={{ marginLeft: `${((section.level ?? 1) - 1) * 16}px` }}>
                <div className="structure-node">
                  <div className="button-row compact" style={{ justifyContent: "space-between" }}>
                    <strong>{section.title}</strong>
                    {section.tags?.length ? (
                      <div className="tag-inline">
                        {section.tags.map((tag) => (
                          <Badge key={`${section.sectionId}-${tag}`} tone="info">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {section.summary && <p className="meta-muted">{section.summary}</p>}
                  {section.keywords?.length ? (
                    <small className="meta-muted">关键词：{section.keywords.join(" / ")}</small>
                  ) : null}
                </div>
              </li>
            ))}
        {!sections.length && loadStructureTask.status.phase !== "loading" && (
          <li className="placeholder">尚未加载结构</li>
        )}
      </ul>
    </GlassCard>
  );
}
