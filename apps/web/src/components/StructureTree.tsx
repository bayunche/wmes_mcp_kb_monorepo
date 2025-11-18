import { useState } from "react";
import { fetchDocumentStructure } from "../api";

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
  const [status, setStatus] = useState<string | null>(null);

  const loadStructure = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!docId.trim().length) {
      setStatus("请输入 Doc ID");
      return;
    }
    try {
      setStatus("加载结构中…");
      const response = await fetchDocumentStructure(docId.trim());
      setSections(response.sections ?? []);
      setStatus(`共 ${response.sections?.length ?? 0} 条`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="eyebrow">STEP 05</p>
          <h2>语义结构树</h2>
        </div>
        {status && <span className="status-pill info">{status}</span>}
      </header>
      <form className="stacked-form" onSubmit={loadStructure}>
        <label>
          Doc ID
          <input value={docId} onChange={(event) => setDocId(event.target.value)} placeholder="输入文档 ID" />
        </label>
        <div className="button-row">
          <button type="submit">加载结构</button>
        </div>
      </form>
      <ul className="structure-tree">
        {sections.map((section) => (
          <li key={section.sectionId} style={{ marginLeft: `${((section.level ?? 1) - 1) * 16}px` }}>
            <div className="structure-node">
              <strong>{section.title}</strong>
              {section.tags?.length ? (
                <div className="tag-inline">
                  {section.tags.map((tag) => (
                    <span key={`${section.sectionId}-${tag}`} className="tag-chip subtle">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {section.summary && <p className="meta-muted">{section.summary}</p>}
              {section.keywords?.length && (
                <small className="meta-muted">关键词：{section.keywords.join(" / ")}</small>
              )}
            </div>
          </li>
        ))}
        {!sections.length && <li className="placeholder">尚未加载结构</li>}
      </ul>
    </section>
  );
}
