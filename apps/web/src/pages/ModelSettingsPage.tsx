import { useCallback, useEffect, useMemo, useState } from "react";
import {
  discoverModels,
  fetchLocalModels,
  fetchModelSettings,
  fetchModelSettingsList,
  saveLibrary,
  saveModelSettings,
  saveTenant
} from "../api";
import type { ModelProvider, ModelSettingView } from "../api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { useToast } from "../components/ui/Toast";
import { PipelineFlow } from "../components/PipelineFlow";
import { AlertCircle, CheckCircle2, RefreshCw, Save } from "lucide-react";

type ModelRoleOption =
  | "embedding"
  | "tagging"
  | "metadata"
  | "ocr"
  | "rerank"
  | "structure"
  | "query_rewrite"
  | "semantic_rerank";

interface LocalModelChoice {
  name: string;
  filename: string;
  role: string;
  description?: string;
  relativePath?: string;
}



const ROLE_CARDS: Array<{
  value: ModelRoleOption;
  title: string;
  desc: string;
  highlights: string;
  supportsLocal: boolean;
}> = [
    { value: "structure", title: "语义切分", desc: "LLM 按语义/章节边界切分并生成结构树", highlights: "必须 · 结构", supportsLocal: false },
    { value: "metadata", title: "语义标注", desc: "标题 / 摘要 / 标签 / 关键词 / NER / 父章节路径", highlights: "必须 · 全量标签", supportsLocal: false },
    { value: "tagging", title: "标签补全", desc: "文档 / Chunk 标签与主题分类", highlights: "可复用 metadata", supportsLocal: false },
    { value: "embedding", title: "文本向量", desc: "语义检索与向量索引", highlights: "推荐 · 支持本地", supportsLocal: true },
    { value: "rerank", title: "重排序", desc: "二次排序提升相关性", highlights: "推荐 · 支持本地", supportsLocal: true },
    { value: "query_rewrite", title: "查询语义改写", desc: "LLM 改写检索 Query 提升召回", highlights: "新 · LLM", supportsLocal: false },
    { value: "semantic_rerank", title: "语义重拍", desc: "在 rerank 后由大模型语义重排", highlights: "新 · LLM", supportsLocal: false },
    { value: "ocr", title: "OCR / Caption", desc: "PDF / 图片文字与描述", highlights: "必须（含图片/PDF）", supportsLocal: true }
  ];

const LOCAL_SUPPORTED: ModelRoleOption[] = ["embedding", "rerank", "ocr"];
const DEFAULT_SEMANTIC_WEIGHT = 0.35;

const REMOTE_PROVIDERS: Array<{ value: ModelProvider; label: string; defaultBase: string }> = [
  { value: "openai", label: "OpenAI / 兼容接口", defaultBase: "https://api.openai.com/v1" },
  { value: "ollama", label: "Ollama（本地服务）", defaultBase: "http://localhost:11434" }
];

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none";

function roleToKind(role: ModelRoleOption): string {
  switch (role) {
    case "embedding":
      return "text";
    case "rerank":
      return "rerank";
    case "ocr":
      return "ocr";
    case "query_rewrite":
    case "semantic_rerank":
      return "text";
    default:
      return "metadata";
  }
}

function getDefaultBaseUrl(provider: ModelProvider): string {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "ollama") return "http://localhost:11434";
  return "";
}

export default function ModelSettingsPage() {
  const { tenants, libraries, refresh: refreshOrg } = useOrgOptions();
  const toast = useToast();
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [modelRole, setModelRole] = useState<ModelRoleOption>("structure");
  const [mode, setMode] = useState<"local" | "remote">("remote");
  const [provider, setProvider] = useState<ModelProvider>("openai");
  const [baseUrl, setBaseUrl] = useState(getDefaultBaseUrl("openai"));
  const [modelName, setModelName] = useState("gpt-4o-mini");
  const [displayName, setDisplayName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [apiKeyPreview, setApiKeyPreview] = useState<string | undefined>();
  const [status, setStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingsList, setSettingsList] = useState<ModelSettingView[]>([]);
  const [modelOptions, setModelOptions] = useState<Array<{ modelName: string; label?: string }>>([]);
  const [modelOptionsStatus, setModelOptionsStatus] = useState<string | null>(null);
  const [localModels, setLocalModels] = useState<LocalModelChoice[]>([]);
  const [localDir, setLocalDir] = useState<string>("");
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [semanticWeight, setSemanticWeight] = useState<string>(String(DEFAULT_SEMANTIC_WEIGHT));
  const [allSettings, setAllSettings] = useState<Record<string, ModelSettingView>>({});

  const isOcr = modelRole === "ocr";
  const canUseLocal = useMemo(() => LOCAL_SUPPORTED.includes(modelRole), [modelRole]);
  const localChoicesForRole = useMemo(
    () => localModels.filter((item) => item.role === roleToKind(modelRole)),
    [localModels, modelRole]
  );

  const loadLocalModels = useCallback(async () => {
    try {
      setLocalStatus("正在扫描 /models/weights 下的本地模型...");
      const response = await fetchLocalModels();
      const merged: LocalModelChoice[] = [];
      const items = (response.items ?? []) as any[];
      const extras = (response.extras ?? []) as any[];
      items.forEach((item) =>
        merged.push({
          name: item.name ?? item.filename ?? item.relativePath ?? "",
          filename: item.filename ?? item.name ?? "",
          role: item.role ?? "text",
          description: item.description,
          relativePath: item.relativePath ?? item.filename
        })
      );
      extras.forEach((item) =>
        merged.push({
          name: item.filename ?? item.name ?? "",
          filename: item.filename ?? item.name ?? "",
          role: item.role ?? "text",
          description: item.description,
          relativePath: item.relativePath ?? item.filename
        })
      );
      setLocalModels(merged);
      setLocalDir(response.dir ?? "");
      setLocalStatus(`已发现 ${merged.length} 个本地模型`);
      if (!modelName && merged.length) {
        setModelName(merged[0].filename);
      }
    } catch (error) {
      setLocalStatus((error as Error).message);
    }
  }, [modelName]);

  const loadSetting = useCallback(async () => {
    try {
      setStatus("正在读取配置...");
      const response = await fetchModelSettings({ tenantId, libraryId, modelRole });
      const setting = (response as { setting?: ModelSettingView | null }).setting;
      if (setting) {
        const isLocal = setting.provider === "local" && LOCAL_SUPPORTED.includes(setting.modelRole);
        setProvider(isLocal ? "local" : setting.provider);
        setMode(isLocal ? "local" : "remote");
        setBaseUrl(isLocal ? "" : setting.baseUrl);
        setModelName(setting.modelName);
        setDisplayName(setting.displayName ?? "");
        setHasStoredKey(setting.hasApiKey);
        setApiKeyPreview(setting.apiKeyPreview);
        if (setting.modelRole === "semantic_rerank") {
          const weight = setting.options?.semanticWeight as number | undefined;
          setSemanticWeight(
            weight !== undefined && weight !== null ? String(weight) : String(DEFAULT_SEMANTIC_WEIGHT)
          );
        } else {
          setSemanticWeight(String(DEFAULT_SEMANTIC_WEIGHT));
        }
      } else {
        setHasStoredKey(false);
        setApiKeyPreview(undefined);
        setDisplayName("");
        setSemanticWeight(String(DEFAULT_SEMANTIC_WEIGHT));
      }
      setStatus("配置已加载");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [tenantId, libraryId, modelRole]);

  const loadSettingsList = useCallback(async () => {
    try {
      const response = await fetchModelSettingsList({ tenantId, libraryId });
      setSettingsList((response.items ?? []) as ModelSettingView[]);
    } catch {
      // ignore list errors
    }
  }, [tenantId, libraryId]);

  const loadAllSettings = useCallback(async () => {
    try {
      const response = await fetchModelSettingsList({ tenantId, libraryId });
      const items = (response.items ?? []) as ModelSettingView[];
      const newSettings: Record<string, ModelSettingView> = {};
      items.forEach((item) => {
        newSettings[item.modelRole] = item;
      });
      setAllSettings(newSettings);
    } catch {
      setAllSettings({});
    }
  }, [tenantId, libraryId]);

  const loadRemoteModels = useCallback(async () => {
    if (isOcr) {
      setModelOptionsStatus("OCR 模式无需拉取模型列表");
      return;
    }
    if (mode === "local") {
      setModelOptionsStatus("当前为本地模式，无需拉取远程列表");
      return;
    }
    if (!baseUrl.trim()) {
      setModelOptionsStatus("请先填写 Base URL");
      return;
    }
    if (provider === "openai" && !apiKey && !hasStoredKey) {
      setModelOptionsStatus("请先填写 API Key 以获取模型列表");
      return;
    }
    setModelOptionsStatus("正在获取模型列表...");
    try {
      const response = await discoverModels({ provider, baseUrl: baseUrl.trim(), apiKey: apiKey || undefined });
      const options = (response.items ?? []) as Array<{ modelName: string; label?: string }>;
      setModelOptions(options);
      if (options.length && !options.some((option) => option.modelName === modelName)) {
        setModelName(options[0].modelName);
      }
      setModelOptionsStatus(`已获取 ${options.length} 个模型`);
    } catch (error) {
      setModelOptionsStatus((error as Error).message);
    }
  }, [mode, baseUrl, provider, apiKey, hasStoredKey, modelName]);

  useEffect(() => {
    loadSetting();
    loadSettingsList();
    loadAllSettings();
  }, [loadSetting, loadSettingsList, loadAllSettings]);

  useEffect(() => {
    if (!canUseLocal && mode === "local") {
      setMode("remote");
      setProvider("openai");
    }
  }, [canUseLocal, mode]);

  useEffect(() => {
    if (mode === "local") {
      setProvider("local");
      setBaseUrl("");
      setModelOptions([]);
      setModelOptionsStatus(null);
      setApiKey("");
      loadLocalModels();
      return;
    }
    if (provider === "local") {
      setProvider("openai");
      setBaseUrl(getDefaultBaseUrl("openai"));
    }
  }, [mode, provider, loadLocalModels]);

  useEffect(() => {
    if (mode === "remote") {
      setBaseUrl((prev) => {
        if (!prev.trim()) return getDefaultBaseUrl(provider);
        if (prev === getDefaultBaseUrl("openai") || prev === getDefaultBaseUrl("ollama")) {
          return getDefaultBaseUrl(provider);
        }
        return prev;
      });
    }
  }, [provider, mode]);

  const handleApplySetting = (setting: ModelSettingView) => {
    setTenantId(setting.tenantId ?? "default");
    setLibraryId(setting.libraryId ?? "default");
    setModelRole(setting.modelRole);
    const isLocal = setting.provider === "local" && setting.modelRole !== "ocr";
    setProvider(isLocal ? "local" : setting.provider);
    setMode(isLocal ? "local" : "remote");
    setBaseUrl(isLocal ? "" : setting.baseUrl);
    setModelName(setting.modelName);
    setDisplayName(setting.displayName ?? "");
    setHasStoredKey(setting.hasApiKey);
    setApiKeyPreview(setting.apiKeyPreview);
    setStatus(`已加载 ${setting.displayName ?? setting.modelName}`);
  };

  const validateForm = () => {
    if (isOcr && !baseUrl.trim()) return "请填写 OCR 服务 URL";
    if (!isOcr && !modelName.trim()) return "请填写模型名称";
    if (!isOcr && mode === "remote" && !baseUrl.trim()) return "请填写 Base URL";
    if (!isOcr && mode === "remote" && provider === "openai" && !apiKey && !hasStoredKey) {
      return "请填写 API Key";
    }
    if (!isOcr && mode === "local" && !canUseLocal) {
      return "当前角色不支持本地模型";
    }
    return null;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const err = validateForm();
    if (err) {
      setFormError(err);
      setStatus(err);
      return;
    }
    setFormError(null);
    setSaving(true);
    setStatus("保存中...");
    try {
      const resolvedProvider = isOcr ? "openai" : mode === "local" ? "local" : provider;
      const effectiveModelName = isOcr ? modelName.trim() || "ocr-http" : modelName.trim();
      const resolvedBaseUrl = isOcr
        ? baseUrl.trim()
        : mode === "local"
          ? `local://${modelName.trim() || "model"}`
          : baseUrl.trim();
      const options =
        modelRole === "semantic_rerank"
          ? {
            semanticWeight: Math.max(
              0,
              Math.min(1, Number(semanticWeight) || DEFAULT_SEMANTIC_WEIGHT)
            )
          }
          : undefined;
      const payload = await saveModelSettings({
        tenantId,
        libraryId,
        provider: resolvedProvider,
        baseUrl: resolvedBaseUrl,
        modelName: effectiveModelName,
        modelRole,
        displayName: displayName.trim() || undefined,
        apiKey: isOcr ? apiKey || undefined : mode === "local" ? undefined : apiKey || undefined,
        options
      });
      const setting = (payload as { setting?: ModelSettingView }).setting;
      setHasStoredKey(Boolean(setting?.hasApiKey));
      setApiKeyPreview(setting?.apiKeyPreview);
      setApiKey("");
      setStatus("保存成功");
      toast.push({ title: "模型配置已保存", description: displayName || modelName, tone: "success" });
      await loadSettingsList();
      await loadSetting();
      await loadAllSettings();
      setStatus("保存成功，已刷新配置");
    } catch (error) {
      setStatus((error as Error).message);
      toast.push({ title: "保存失败", description: (error as Error).message, tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTenant = async () => {
    const id = prompt("请输入租户 ID（如 enterprise-a）");
    const name = prompt("请输入租户显示名称");
    if (!id || !name) return;
    try {
      await saveTenant({ tenantId: id, displayName: name });
      await refreshOrg();
      setTenantId(id);
      setStatus("新租户已创建，请立即配置语义切分/打标/元数据/向量/OCR 等模型");
      toast.push({
        title: "租户已创建",
        description: "请在下方卡片完成语义切分/打标/元数据/OCR 等模型配置，未配置将影响上传/解析。",
        tone: "warning"
      });
    } catch (error) {
      toast.push({ title: "租户创建失败", description: (error as Error).message, tone: "danger" });
    }
  };

  const handleCreateLibrary = async () => {
    const id = prompt("请输入知识库 ID（如 kb-001）");
    const name = prompt("请输入知识库名称");
    if (!id || !name) return;
    await saveLibrary({ libraryId: id, tenantId, displayName: name });
    await refreshOrg();
    setLibraryId(id);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">模型配置</h2>
          <p className="text-muted-foreground">
            配置 AI 知识库的核心大脑。请按照下方流程图，依次配置各个环节的模型。
          </p>
        </div>

        <PipelineFlow
          settings={allSettings}
          currentRole={modelRole}
          onSelectRole={(role) => setModelRole(role as ModelRoleOption)}
        />

        {(!allSettings.embedding || !allSettings.rerank) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">核心模型配置缺失</p>
              <p className="text-sm opacity-90">
                知识库运行依赖于 <strong>文本向量 (Embedding)</strong> 和 <strong>重排序 (Rerank)</strong> 模型。
                请优先配置这两个角色，否则无法进行文档切分与检索。
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>配置向导</CardTitle>
            <CardDescription>选择要配置的模型角色</CardDescription>
          </CardHeader>
          <CardContent className="p-2">
            <div className="flex flex-col gap-1">
              {ROLE_CARDS.map((role) => {
                const active = modelRole === role.value;
                const isConfigured = !!allSettings[role.value];
                return (
                  <button
                    key={role.value}
                    onClick={() => {
                      setModelRole(role.value);
                      if (role.value === "ocr") {
                        setMode("remote");
                        setProvider("openai");
                        setModelName((prev) => prev || "ocr-http");
                        setBaseUrl((prev) => prev || "");
                      } else if (!role.supportsLocal) {
                        setMode("remote");
                        setProvider("openai");
                      }
                      if (role.value === "semantic_rerank") {
                        setSemanticWeight(String(DEFAULT_SEMANTIC_WEIGHT));
                      }
                      setStatus(`已选择 ${role.title}`);
                    }}
                    className={`flex items-center justify-between p-3 rounded-md text-sm transition-colors ${active
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted text-slate-600"
                      }`}
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <span>{role.title}</span>
                      <span className="text-[10px] text-muted-foreground">{role.desc}</span>
                    </div>
                    {isConfigured ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <div className={`h-2 w-2 rounded-full ${role.highlights.includes("必须") ? "bg-red-400" : "bg-slate-200"}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{ROLE_CARDS.find(r => r.value === modelRole)?.title}</CardTitle>
                  <CardDescription>{ROLE_CARDS.find(r => r.value === modelRole)?.desc}</CardDescription>
                </div>
                <Badge variant="outline">{ROLE_CARDS.find(r => r.value === modelRole)?.highlights}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>当前租户</Label>
                    <div className="flex gap-2">
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
                      <Button type="button" variant="outline" size="icon" onClick={handleCreateTenant} title="新建租户">
                        <span className="text-lg">+</span>
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>当前知识库</Label>
                    <div className="flex gap-2">
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
                      <Button type="button" variant="outline" size="icon" onClick={handleCreateLibrary} title="新建知识库">
                        <span className="text-lg">+</span>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  {isOcr ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>OCR 服务 URL</Label>
                        <Input
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          placeholder="http://localhost:9009/paddle/ocr"
                          required
                        />
                        <p className="text-xs text-muted-foreground">例如 http://localhost:9009/paddle/ocr</p>
                      </div>
                      <div className="space-y-2">
                        <Label>API Key (可选)</Label>
                        <Input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="无鉴权可留空"
                        />
                        {hasStoredKey && (
                          <p className="text-xs text-muted-foreground">已存储 Key {apiKeyPreview ?? "****"}，留空则不更新</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {canUseLocal && (
                        <Tabs value={mode} onValueChange={(v) => setMode(v as "local" | "remote")}>
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="remote">远程模型 (OpenAI/Ollama)</TabsTrigger>
                            <TabsTrigger value="local">本地模型 (Local Weights)</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      )}

                      {mode === "remote" && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>提供方</Label>
                              <Select value={provider} onValueChange={(v) => setProvider(v as ModelProvider)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {REMOTE_PROVIDERS.map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                      {item.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Base URL</Label>
                              <Input
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                                placeholder="https://api.openai.com/v1"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>API Key</Label>
                            <Input
                              type="password"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              placeholder={provider === "openai" ? "sk-..." : "可留空"}
                            />
                            {hasStoredKey && (
                              <p className="text-xs text-muted-foreground">已存储 Key {apiKeyPreview ?? "****"}，留空则不更新</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Button type="button" variant="secondary" onClick={loadRemoteModels} size="sm">
                              <RefreshCw className="mr-2 h-4 w-4" />
                              拉取模型列表
                            </Button>
                            {modelOptionsStatus && <span className="text-xs text-muted-foreground">{modelOptionsStatus}</span>}
                          </div>
                        </div>
                      )}

                      {mode === "local" && (
                        <div className="rounded-md bg-muted p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <Label>本地模型文件</Label>
                            <Button type="button" variant="ghost" size="sm" onClick={loadLocalModels}>
                              <RefreshCw className="h-3 w-3 mr-1" />
                              刷新
                            </Button>
                          </div>
                          <Select value={modelName} onValueChange={setModelName}>
                            <SelectTrigger>
                              <SelectValue placeholder="选择本地模型" />
                            </SelectTrigger>
                            <SelectContent>
                              {localChoicesForRole.map((item) => (
                                <SelectItem key={`${item.role}-${item.filename}`} value={item.filename}>
                                  {item.name || item.filename}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {localDir ? `扫描目录：${localDir}` : "尚未扫描 models/weights"}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>模型名称 / ID</Label>
                          {mode === "remote" && modelOptions.length ? (
                            <Select value={modelName} onValueChange={setModelName}>
                              <SelectTrigger>
                                <SelectValue placeholder="选择模型" />
                              </SelectTrigger>
                              <SelectContent>
                                {modelOptions.map((option) => (
                                  <SelectItem key={option.modelName} value={option.modelName}>
                                    {option.label ?? option.modelName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={modelName}
                              onChange={(e) => setModelName(e.target.value)}
                              placeholder={mode === "local" ? "本地模型文件名" : "gpt-4o-mini"}
                            />
                          )}
                          {formError && <p className="text-xs text-red-500">{formError}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label>显示名称 (可选)</Label>
                          <Input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="如：标签模型"
                          />
                        </div>
                      </div>

                      {modelRole === "semantic_rerank" && (
                        <div className="space-y-2">
                          <Label>语义重拍权重 (0-1)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            value={semanticWeight}
                            onChange={(e) => setSemanticWeight(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">越高越依赖大模型重拍，默认 0.35</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <Button type="submit" disabled={saving}>
                    {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    保存配置
                  </Button>
                  <Button type="button" variant="ghost" onClick={loadSetting}>
                    重置
                  </Button>
                  {status && <span className="text-sm text-muted-foreground">{status}</span>}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>已保存配置</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>租户/库</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>提供方</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settingsList.length ? (
                    settingsList.map((item) => (
                      <TableRow key={`${item.tenantId}-${item.libraryId}-${item.modelRole}`}>
                        <TableCell className="font-medium">{item.tenantId}/{item.libraryId}</TableCell>
                        <TableCell>{item.modelRole}</TableCell>
                        <TableCell>{item.provider}</TableCell>
                        <TableCell>
                          <div>{item.displayName ?? item.modelName}</div>
                          <div className="text-xs text-muted-foreground">{item.modelName}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleApplySetting(item)}>
                            载入
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                        暂无配置
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
