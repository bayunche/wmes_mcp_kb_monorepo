import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { listDocuments, updateDocumentTags } from "../api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { ArrowLeft, Save } from "lucide-react";
import { Badge } from "../components/ui/Badge";

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

    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link to={`/documents/${docId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            编辑文档标签
          </h1>
          <p className="text-sm text-muted-foreground">
            {title}
          </p>
        </div>
        {status && (
          <Badge variant="secondary">{status}</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>标签管理</CardTitle>
          <CardDescription>
            维护文档标签，保障检索/过滤的准确性。多个标签请用逗号分隔。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tags">标签</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="例如：合同, 采购, 2024"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit">
                <Save className="mr-2 h-4 w-4" />
                保存更改
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
