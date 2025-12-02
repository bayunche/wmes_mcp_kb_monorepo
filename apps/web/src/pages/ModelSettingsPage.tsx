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
import type { ModelProvider } from "../api";
import { GlassCard } from "../components/ui/GlassCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Field } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { PillTabs } from "../components/ui/PillTabs";
import { StatusPill } from "../components/ui/StatusPill";
import { Badge } from "../components/ui/Badge";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { useToast } from "../components/ui/Toast";

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

interface ModelSettingView {
  tenantId: string;
  libraryId: string;
  provider: ModelProvider;
  baseUrl: string;
  modelName: string;
  modelRole: ModelRoleOption;
  displayName?: string;
  hasApiKey: boolean;
  apiKeyPreview?: string;
  options?: Record<string, unknown>;
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
    const promises = ROLE_CARDS.map(async (card) => {
      try {
        const response = await fetchModelSettings({ tenantId, libraryId, modelRole: card.value });
        return { role: card.value, setting: (response as { setting?: ModelSettingView | null }).setting };
      } catch {
        return { role: card.value, setting: null };
      }
    });

    const results = await Promise.all(promises);
    const newSettings: Record<string, ModelSettingView> = {};
    results.forEach((res) => {
      if (res.setting) {
        newSettings[res.role] = res.setting;
      }
    });
    setAllSettings(newSettings);
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
    <div className="space-y-6">
      <GlassCard className="p-6 space-y-6">
        <SectionHeader
          eyebrow="模型配置"
          title="语义切分 / 标注 / 向量 / OCR 全链路模型管理"
          description="本地模型直接扫描 /models/weights；外部模型按提供方填入接口并自动拉取列表"
          status={status ? <StatusPill tone="info">{status}</StatusPill> : null}
        />

        <div className="split">
          <Field label="租户" hint="默认 default，接口头 x-tenant-id">
            <div className="flex gap-2">
              <select className={inputClass} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                {(tenants.length ? tenants : [{ tenantId: "default", displayName: "default" }]).map((item) => (
                  <option key={item.tenantId} value={item.tenantId}>
                    {item.displayName ?? item.tenantId}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" onClick={handleCreateTenant}>
                新增
              </Button>
            </div>
          </Field>
          <Field label="知识库" hint="默认 default，接口头 x-library-id">
            <div className="flex gap-2">
              <select className={inputClass} value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
                {(libraries.length ? libraries : [{ libraryId: "default", displayName: "default" }])
                  .filter((lib) => !lib.tenantId || lib.tenantId === tenantId)
                  .map((lib) => (
                    <option key={lib.libraryId} value={lib.libraryId}>
                      {lib.displayName ?? lib.libraryId}
                    </option>
                  ))}
              </select>
              <Button type="button" variant="ghost" onClick={handleCreateLibrary}>
                新增
              </Button>
            </div>
          </Field>
        </div>

        <div className="flow-guide">
          {ROLE_CARDS.map((role) => {
            const active = modelRole === role.value;
            return (
              <button
                key={role.value}
                type="button"
                className={`step-card${active ? " is-active" : ""}`}
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
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 text-left">
                    <strong className="text-base text-slate-900">{role.title}</strong>
                    <p className="muted-text">{role.desc}</p>
                    <small className={`text-xs ${allSettings[role.value] ? "text-blue-600 font-medium" : "muted-text"}`}>
                      {allSettings[role.value]
                        ? `已配置: ${allSettings[role.value].displayName || allSettings[role.value].modelName}`
                        : role.supportsLocal
                          ? "支持本地模型"
                          : "需要远程接口"}
                    </small>
                  </div>
                  <Badge>{role.highlights}</Badge>
                </div>
              </button>
            );
          })}
        </div>

        <form className="stacked-form" onSubmit={handleSave}>
          {isOcr ? (
            <div className="space-y-3">
              <Field label="OCR 服务 URL" hint="例如 http://localhost:9009/paddle/ocr">
                <input
                  className={inputClass}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:9009/paddle/ocr"
                  required
                />
              </Field>
              <Field label="API Key（可选）" hint="无鉴权可留空">
                <input
                  className={inputClass}
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="可留空"
                />
                {hasStoredKey && (
                  <small className="muted-text">已存储 Key {apiKeyPreview ?? "****"}，留空则不更新</small>
                )}
              </Field>
              <small className="muted-text">内部将保存为模型标识：{modelName || "ocr-http"}</small>
            </div>
          ) : (
            <>
              {canUseLocal ? (
                <div className="space-y-2">
                  <PillTabs
                    value={mode}
                    onChange={(value) => setMode(value)}
                    options={[
                      { value: "remote", label: "远程模型" },
                      { value: "local", label: "本地模型（自动扫描）", disabled: !canUseLocal }
                    ]}
                  />
                  <small className="muted-text">
                    {mode === "local"
                      ? "直接扫描 /models/weights，选择文件即可。"
                      : "远程配置步骤：选择提供方 → 填写 Base URL 与 API Key → 点击“拉取模型列表并测试” → 选择模型后保存。"}
                  </small>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-slate-700">该角色仅支持远程模型配置。</p>
                  <small className="muted-text">
                    远程配置步骤：选择提供方 → 填写 Base URL 与 API Key → 点击“拉取模型列表并测试” → 选择模型后保存。
                  </small>
                </div>
              )}

              {mode === "remote" && (
                <div className="split">
                  <Field label="提供方" hint="OpenAI / Ollama / 其他兼容接口">
                    <select
                      className={inputClass}
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as ModelProvider)}
                    >
                      {REMOTE_PROVIDERS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Base URL" hint="OpenAI 默认 https://api.openai.com/v1，Ollama 默认 http://localhost:11434">
                    <input
                      className={inputClass}
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                    />
                  </Field>
                  <Field
                    label="API Key"
                    hint={provider === "openai" ? "必填，用于拉取模型与调用" : "Ollama 可留空"}
                  >
                    <input
                      className={inputClass}
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={provider === "openai" ? "sk-..." : "可留空"}
                    />
                    {hasStoredKey && (
                      <small className="muted-text">已存储 Key {apiKeyPreview ?? "****"}，留空则不更新</small>
                    )}
                  </Field>
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="ghost" onClick={loadRemoteModels}>
                      拉取模型列表并测试
                    </Button>
                    {modelOptionsStatus && <StatusPill tone="info">{modelOptionsStatus}</StatusPill>}
                  </div>
                  <small className="muted-text col-span-2">
                    远程配置提示：先选择提供方，再填写 Base URL 与 API Key，点击“拉取模型列表并测试”后从下拉选择模型，最后点击保存。
                  </small>
                </div>
              )}

              {mode === "local" && (
                <GlassCard className="p-4 space-y-4">
                  <SectionHeader
                    eyebrow="本地模型"
                    title={localDir ? `自动扫描目录：${localDir}` : "尚未扫描 models/weights"}
                    status={localStatus ? <StatusPill tone="info">{localStatus}</StatusPill> : null}
                  />
                  <Field label="可用模型" hint="仅展示与当前角色匹配的模型（embedding / rerank / ocr）">
                    <select className={inputClass} value={modelName} onChange={(e) => setModelName(e.target.value)}>
                      <option value="">请选择本地模型</option>
                      {localChoicesForRole.map((item) => (
                        <option key={`${item.role}-${item.filename}`} value={item.filename}>
                          {item.name || item.filename}（{item.filename}）
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="button-row">
                    <Button type="button" variant="ghost" onClick={loadLocalModels}>
                      重新扫描
                    </Button>
                  </div>
                </GlassCard>
              )}

              <div className="split">
                <Field
                  label="模型名称"
                  hint={
                    mode === "local"
                      ? "选择后的文件名会自动写入配置"
                      : modelOptions.length
                        ? "从下拉中选择远程模型"
                        : "若未拉取到列表，可直接手填模型 ID"
                  }
                  error={formError}
                >
                  {mode === "remote" && modelOptions.length ? (
                    <select className={inputClass} value={modelName} onChange={(e) => setModelName(e.target.value)}>
                      {modelOptions.map((option) => (
                        <option key={option.modelName} value={option.modelName}>
                          {option.label ?? option.modelName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inputClass}
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      placeholder={mode === "local" ? "本地模型文件名" : "模型 ID 如 gpt-4o-mini"}
                    />
                  )}
                </Field>
                <Field label="显示名称（可选）" hint="用于前端展示，未填则使用模型名称">
                  <input
                    className={inputClass}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="如：标签模型 / OCR 模型"
                  />
                </Field>
              </div>
              {modelRole === "semantic_rerank" && (
                <Field label="语义重拍权重 (0-1)" hint="越高越依赖大模型重拍，默认 0.35">
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={semanticWeight}
                    onChange={(e) => setSemanticWeight(e.target.value)}
                  />
                </Field>
              )}
            </>
          )}

          <div className="button-row">
            <Button type="submit" disabled={saving}>
              {saving ? "保存中..." : "保存配置"}
            </Button>
            <Button type="button" variant="ghost" onClick={loadSetting}>
              重新读取
            </Button>
          </div>
        </form>
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <SectionHeader eyebrow="已保存配置" title="模型列表" />
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>租户/库</th>
                <th>角色</th>
                <th>提供方</th>
                <th>模型</th>
                <th>Base URL</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {settingsList.length ? (
                settingsList.map((item) => (
                  <tr key={`${item.tenantId}-${item.libraryId}-${item.modelRole}`}>
                    <td>
                      <div className="doc-title">{item.tenantId}/{item.libraryId}</div>
                    </td>
                    <td>{item.modelRole}</td>
                    <td>{item.provider}</td>
                    <td>
                      <div className="doc-title">{item.displayName ?? item.modelName}</div>
                      <small className="meta-muted">{item.modelName}</small>
                    </td>
                    <td>
                      <small className="meta-muted">{item.provider === "local" ? "local://（无需 Base URL）" : item.baseUrl}</small>
                    </td>
                    <td>
                      <Button variant="ghost" onClick={() => handleApplySetting(item)}>
                        载入
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="placeholder">
                    暂无配置，请先选择角色并保存
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
