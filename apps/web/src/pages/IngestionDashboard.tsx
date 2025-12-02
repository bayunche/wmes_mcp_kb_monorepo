import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UploadForm } from "../components/UploadForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/Select";
import { Label } from "../components/ui/Label";
import { AlertCircle, CheckCircle2, FileText, UploadCloud, Zap } from "lucide-react";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { fetchModelSettingsList, ModelSettingView } from "../api";

export default function IngestionDashboard() {
  const { tenants, libraries } = useOrgOptions();
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [settings, setSettings] = useState<Record<string, ModelSettingView>>({});
  const [loading, setLoading] = useState(true);

  // Auto-select tenant/library
  useEffect(() => {
    if (tenants.length > 0 && (tenantId === "default" || !tenants.some(t => t.tenantId === tenantId))) {
      setTenantId(tenants[0].tenantId);
    }
  }, [tenants, tenantId]);

  useEffect(() => {
    const availableLibs = libraries.filter(l => !l.tenantId || l.tenantId === tenantId);
    if (availableLibs.length > 0 && (libraryId === "default" || !availableLibs.some(l => l.libraryId === libraryId))) {
      setLibraryId(availableLibs[0].libraryId);
    }
  }, [libraries, tenantId, libraryId]);

  // Check model status
  useEffect(() => {
    async function checkModels() {
      try {
        const res = await fetchModelSettingsList({ tenantId, libraryId });
        const map: Record<string, ModelSettingView> = {};
        (res.items || []).forEach((item: ModelSettingView) => {
          map[item.modelRole] = item;
        });
        setSettings(map);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    checkModels();
  }, [tenantId, libraryId]);

  const missingModels = [];
  if (!settings.embedding) missingModels.push("文本向量 (Embedding)");
  if (!settings.rerank) missingModels.push("重排序 (Rerank)");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">数据入库</h2>
          <p className="text-muted-foreground">
            将文档转化为知识资产。支持 PDF, Markdown, TXT 等格式。
          </p>
        </div>

        {/* Context Selection */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-4 items-end">
            <div className="space-y-2 min-w-[200px]">
              <Label>当前租户</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择租户" />
                </SelectTrigger>
                <SelectContent>
                  {(tenants.length ? tenants : [{ tenantId: "default", displayName: "default" }]).map((item) => (
                    <SelectItem key={item.tenantId} value={item.tenantId}>
                      {item.displayName ?? item.tenantId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 min-w-[200px]">
              <Label>目标知识库</Label>
              <Select value={libraryId} onValueChange={setLibraryId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择知识库" />
                </SelectTrigger>
                <SelectContent>
                  {(libraries.length ? libraries : [{ libraryId: "default", displayName: "default" }])
                    .filter((lib) => !lib.tenantId || lib.tenantId === tenantId)
                    .map((lib) => (
                      <SelectItem key={lib.libraryId} value={lib.libraryId}>
                        {lib.displayName ?? lib.libraryId}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Pre-flight Check */}
        {!loading && missingModels.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>核心模型配置缺失</AlertTitle>
            <AlertDescription>
              当前知识库缺少以下必要模型，无法进行文档处理：
              <strong>{missingModels.join("、")}</strong>。
              <Link to="/settings/models" className="underline ml-2 font-medium">
                前往配置 &rarr;
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* Pipeline Visualization */}
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "上传文档", icon: UploadCloud, desc: "支持批量拖拽" },
            { label: "结构解析", icon: FileText, desc: "提取文本与表格" },
            { label: "语义切分", icon: Zap, desc: "LLM 智能分块" },
            { label: "向量索引", icon: CheckCircle2, desc: "Embedding 入库" },
            { label: "知识资产", icon: CheckCircle2, desc: "可检索可管理" }
          ].map((step, i) => (
            <Card key={step.label} className="border-muted bg-muted/40">
              <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                <div className="h-10 w-10 rounded-full bg-background border flex items-center justify-center shadow-sm">
                  <step.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium text-sm">{step.label}</div>
                  <div className="text-xs text-muted-foreground">{step.desc}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {missingModels.length === 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>上传文件</CardTitle>
              <CardDescription>
                支持拖拽上传。单次建议不超过 20 个文件。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadForm onUploaded={() => { }} />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">常见问题</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-4">
                <div className="space-y-1">
                  <p className="font-medium">解析失败怎么办？</p>
                  <p className="text-muted-foreground">
                    请检查文件是否加密或损坏。您可以在“知识资产”页面查看详细的错误日志。
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">支持图片吗？</p>
                  <p className="text-muted-foreground">
                    PDF 中的图片会自动通过 OCR 模型提取文字（需在模型配置中启用 OCR）。
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
