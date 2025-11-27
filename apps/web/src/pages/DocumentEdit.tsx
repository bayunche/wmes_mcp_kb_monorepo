import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { listDocuments, updateDocumentTags } from "../api";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatusPill } from "../components/ui/StatusPill";
import { Field } from "../components/ui/Field";
import { Button } from "../components/ui/Button";

export default function DocumentEdit() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [title, setTitle] = useState("...");

  useEffect(() => {
    const load = async () => {
      if (!docId) return;
      try {
        const response = await listDocuments();
        const doc = (response.items ?? []).find((item: any) => item.docId === docId);
        if (doc) {
          setTitle(doc.title ?? docId);
          setTags((doc.tags ?? []).join(","));
        } else {
          setStatus("未找到文档");
        }
      } catch (error) {
        setStatus((error as Error).message);
      }
    };
    load();
  }, [docId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!docId) return;
    setStatus("更新中…");
    try {
      await updateDocumentTags(
        docId,
        tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      );
      setStatus("已保存");
      navigate(`/documents/${docId}`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  if (!docId) {
    return <p className="placeholder">缺少 docId</p>;
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-6 space-y-2">
        <SectionHeader
          eyebrow="编辑"
          title={`文档标签 · ${title}`}
          description="维护文档标签，保障检索/过滤的准确性。"
          status={status ? <StatusPill tone="info">{status}</StatusPill> : null}
        />
      </GlassCard>
      <GlassCard>
        <form onSubmit={handleSubmit} className="stacked-form">
          <Field label="标签（用逗号分隔）">
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="合同, 采购" />
          </Field>
          <div className="button-row">
            <Button type="submit">保存</Button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
