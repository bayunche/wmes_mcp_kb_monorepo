import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { deleteDocument, listDocuments, reindexDocument } from "../api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Separator } from "../components/ui/Separator";
import { ArrowLeft, RefreshCw, Trash2, Edit, FileText, Calendar, Hash, Layers } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/Alert";

type DocSummary = {
  docId: string;
  title: string;
  ingestStatus?: string;
  tenantId?: string;
  libraryId?: string;
  tags?: string[];
};

export default function DocumentDetail() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocSummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = async () => {
    if (!docId) return;
    setStatus("加载详情中...");
    try {
      const response = await listDocuments();
      const target = (response.items ?? []).find((doc: DocSummary) => doc.docId === docId) ?? null;
      setDocument(target);
      setStatus(target ? null : "未找到该文档");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const handleReindex = async () => {
    if (!docId) return;
    setStatus("重新入队重建索引...");
    try {
      await reindexDocument(docId, document?.tenantId, document?.libraryId);
      setStatus("任务已入队");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!docId) return;
    if (!confirm("确定删除该文档及其附件吗？")) return;
    setStatus("删除中...");
    try {
      await deleteDocument(docId);
      navigate("/documents");
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
          <Link to="/documents">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {document?.title ?? docId}
          </h1>
          <p className="text-sm text-muted-foreground">
            文档详情与管理
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <Badge variant="secondary">{status}</Badge>
          )}
        </div>
      </div>

      {document ? (
        <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  基本信息
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase">Doc ID</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{document.docId}</code>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase">状态</span>
                  <div>
                    <Badge variant={document.ingestStatus === "success" ? "default" : "secondary"}>
                      {document.ingestStatus ?? "Unknown"}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase">租户</span>
                  <p className="text-sm">{document.tenantId ?? "-"}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase">知识库</span>
                  <p className="text-sm">{document.libraryId ?? "-"}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">标签</CardTitle>
              </CardHeader>
              <CardContent>
                {document.tags?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {document.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">暂无标签</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">操作</CardTitle>
                <CardDescription>管理文档生命周期</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start" variant="outline" onClick={handleReindex}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重新索引
                </Button>
                <Button className="w-full justify-start" variant="outline" asChild>
                  <Link to={`/documents/${docId}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    编辑元数据
                  </Link>
                </Button>
                <Separator />
                <Button
                  className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                  variant="ghost"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除文档
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>错误</AlertTitle>
          <AlertDescription>未找到该文档，可能已被删除或您没有权限查看。</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
