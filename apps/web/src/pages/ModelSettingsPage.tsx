import { useCallback, useEffect, useState } from "react";
import {
  fetchModelSettings,
  saveModelSettings,
  fetchModelSettingsList,
  fetchModelCatalog,
  saveTenant,
  saveLibrary,
  discoverModels,
  fetchLocalModels,
  installModel
} from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";

type Provider = "openai" | "ollama";
type ModelRoleOption = "embedding" | "tagging" | "metadata" | "ocr" | "rerank" | "structure";

interface SettingResponse {
  setting?: {
    tenantId: string;
    libraryId: string;
    provider: Provider;
    baseUrl: string;
    modelName: string;
    modelRole: ModelRoleOption;
    displayName?: string;
    hasApiKey: boolean;
    apiKeyPreview?: string;
  } | null;
}

interface SettingsListResponse {
  items?: SettingResponse["setting"][];
}

interface CatalogModel {
  modelName: string;
  displayName: string;
  roles: ModelRoleOption[];
}

interface CatalogEntry {
  provider: string;
  driver: "local" | "remote";
  defaultBaseUrl?: string;
  models: CatalogModel[];
}

const MODEL_ROLE_OPTIONS: Array<{ value: ModelRoleOption; label: string }> = [
  { value: "tagging", label: "标签生成 (tagging)" },
  { value: "metadata", label: "语义元数据 (metadata)" },
  { value: "embedding", label: "文本向量 (embedding)" },
  { value: "ocr", label: "OCR / caption" },
  { value: "rerank", label: "重排 (rerank)" },
  { value: "structure", label: "语义分段 (structure)" }
];

const PROVIDER_VALUES: Provider[] = ["openai", "ollama"];

const ROLE_LABEL_MAP = new Map<ModelRoleOption, string>(
  MODEL_ROLE_OPTIONS.map((item) => [item.value, item.label])
);

function isSupportedProvider(value: string): value is Provider {
  return PROVIDER_VALUES.includes(value as Provider);
}

export default function ModelSettingsPage() {
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const { tenants, libraries, loading: orgLoading, error: orgError, refresh: refreshOrgOptions } = useOrgOptions();
  const [tenantForm, setTenantForm] = useState({ tenantId: "", displayName: "", description: "" });
  const [libraryForm, setLibraryForm] = useState({ libraryId: "", tenantId: "", displayName: "", description: "" });
  const [provider, setProvider] = useState<Provider>("openai");
  const [modelRole, setModelRole] = useState<ModelRoleOption>("tagging");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1/chat/completions");
  const [modelName, setModelName] = useState("gpt-4o-mini");
  const [displayName, setDisplayName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [apiKeyPreview, setApiKeyPreview] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | null>(null);
  const [settingsList, setSettingsList] = useState<SettingResponse["setting"][]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [listStatus, setListStatus] = useState<string | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<string | null>(null);
  const [tenantFormStatus, setTenantFormStatus] = useState<string | null>(null);
  const [libraryFormStatus, setLibraryFormStatus] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<Array<{ modelName: string; label?: string }>>([]);
  const [modelOptionsStatus, setModelOptionsStatus] = useState<string | null>(null);
  const [localModels, setLocalModels] = useState<any[]>([]);
  const [localModelExtras, setLocalModelExtras] = useState<any[]>([]);
  const [localModelsDir, setLocalModelsDir] = useState<string>("");
  const [localModelsStatus, setLocalModelsStatus] = useState<string | null>(null);

  const formatBytes = (value?: number) => {
    if (!value || value <= 0) return "-";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };

  const loadSetting = useCallback(async () => {
    try {
      setStatus("加载配置中…");
      const response = (await fetchModelSettings({ tenantId, libraryId, modelRole })) as SettingResponse;
      if (response.setting) {
        setProvider(response.setting.provider);
        setBaseUrl(response.setting.baseUrl);
        setModelName(response.setting.modelName);
        setDisplayName(response.setting.displayName ?? "");
        setHasStoredKey(response.setting.hasApiKey);
        setApiKeyPreview(response.setting.apiKeyPreview);
      } else {
        setHasStoredKey(false);
        setApiKeyPreview(undefined);
        setDisplayName("");
      }
      setStatus("配置已加载");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [tenantId, libraryId, modelRole]);

  useEffect(() => {
    loadSetting();
  }, [loadSetting]);

  const loadSettingsList = useCallback(async () => {
    try {
      setListStatus("加载配置列表…");
      const response = (await fetchModelSettingsList({
        tenantId,
        libraryId
      })) as SettingsListResponse;
      setSettingsList(response.items ?? []);
      setListStatus(`共 ${response.items?.length ?? 0} 条`);
    } catch (error) {
      setListStatus((error as Error).message);
    }
  }, [tenantId, libraryId]);

  useEffect(() => {
    loadSettingsList();
  }, [loadSettingsList]);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        setCatalogStatus("加载模型目录…");
        const response = (await fetchModelCatalog()) as { items?: CatalogEntry[] };
        setCatalog(response.items ?? []);
        setCatalogStatus(null);
      } catch (error) {
        setCatalogStatus((error as Error).message);
      }
    };
    loadCatalog();
  }, []);

  const loadRemoteModels = useCallback(async () => {
    if (!baseUrl) {
      setModelOptionsStatus("请先填写 Base URL");
      return;
    }
    if (provider === "openai" && !apiKey && !hasStoredKey) {
      setModelOptionsStatus("请填写 API Key 以获取 OpenAI 模型列表");
      return;
    }
    setModelOptionsStatus("拉取模型列表…");
    try {
      const response = await discoverModels({
        provider,
        baseUrl,
        apiKey: apiKey || undefined
      });
      const options = response.items ?? [];
      setModelOptions(options);
      if (options.length && !options.some((option: any) => option.modelName === modelName)) {
        setModelName(options[0].modelName);
      }
      setModelOptionsStatus(`获取 ${options.length} 条`);
    } catch (error) {
      setModelOptionsStatus((error as Error).message);
    }
  }, [provider, baseUrl, apiKey, hasStoredKey]);

  useEffect(() => {
    if (!tenants.length) return;
    if (!tenants.some((tenant) => tenant.tenantId === tenantId)) {
      setTenantId(tenants[0].tenantId);
    }
  }, [tenants, tenantId]);

  useEffect(() => {
    if (!libraries.length) return;
    const scoped = libraries.filter((lib) => !lib.tenantId || lib.tenantId === tenantId);
    if (scoped.length && !scoped.some((lib) => lib.libraryId === libraryId)) {
      setLibraryId(scoped[0].libraryId);
    }
  }, [libraries, tenantId, libraryId]);

  useEffect(() => {
    setLibraryForm((prev) => {
      if (prev.tenantId || !tenantId) {
        return prev;
      }
      return { ...prev, tenantId };
    });
  }, [tenantId]);

  useEffect(() => {
    setModelOptions([]);
    setModelOptionsStatus(null);
  }, [provider, baseUrl]);

  const loadLocalModels = useCallback(async () => {
    try {
      setLocalModelsStatus("读取模型目录…");
      const response = await fetchLocalModels();
      setLocalModels(response.items ?? []);
      setLocalModelExtras(response.extras ?? []);
      setLocalModelsDir(response.dir ?? "");
      setLocalModelsStatus(null);
    } catch (error) {
      setLocalModelsStatus((error as Error).message);
    }
  }, []);

  useEffect(() => {
    loadLocalModels();
  }, [loadLocalModels]);

  const applySettingFromList = (setting: SettingResponse["setting"]) => {
    if (!setting) return;
    if (isSupportedProvider(setting.provider)) {
      setProvider(setting.provider);
    }
    setModelRole(setting.modelRole);
    setModelName(setting.modelName);
    setBaseUrl(setting.baseUrl);
    setDisplayName(setting.displayName ?? "");
    setStatus(`已加载 ${setting.displayName ?? setting.modelName}`);
  };

  const applyCatalogModel = (entry: CatalogEntry, model: CatalogModel) => {
    if (isSupportedProvider(entry.provider)) {
      setProvider(entry.provider);
    }
    if (model.roles.length) {
      const matchedRole = model.roles.includes(modelRole) ? modelRole : model.roles[0];
      setModelRole(matchedRole);
    }
    setModelName(model.modelName);
    if (entry.defaultBaseUrl) {
      setBaseUrl(entry.defaultBaseUrl);
    }
    setStatus(`已选择目录模型 ${model.displayName}`);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("保存中…");
    try {
      const payload = await saveModelSettings({
        tenantId,
        libraryId,
        provider,
        baseUrl,
        modelName,
        modelRole,
        displayName: displayName.trim() ? displayName.trim() : undefined,
        apiKey: apiKey.length ? apiKey : undefined
      });
      const setting = (payload as SettingResponse).setting;
      setHasStoredKey(Boolean(setting?.hasApiKey));
      setApiKeyPreview(setting?.apiKeyPreview);
      setApiKey("");
      setStatus("保存成功");
      await loadSettingsList();
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const providerPlaceholder = provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "http://localhost:11434/api/generate";
  const modelPlaceholder = provider === "openai" ? "gpt-4o-mini" : "llama3.1";

  const handleTenantFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantForm.tenantId.trim() || !tenantForm.displayName.trim()) {
      setTenantFormStatus("请填写租户 ID 和名称");
      return;
    }
    setTenantFormStatus("保存中…");
    try {
      await saveTenant({
        tenantId: tenantForm.tenantId.trim(),
        displayName: tenantForm.displayName.trim(),
        description: tenantForm.description?.trim() || undefined
      });
      setTenantForm({ tenantId: "", displayName: "", description: "" });
      await refreshOrgOptions();
      setTenantFormStatus("租户已保存");
    } catch (error) {
      setTenantFormStatus((error as Error).message);
    }
  };

  const handleLibraryFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!libraryForm.libraryId.trim() || !libraryForm.displayName.trim()) {
      setLibraryFormStatus("请填写库 ID 和名称");
      return;
    }
    setLibraryFormStatus("保存中…");
    try {
      await saveLibrary({
        libraryId: libraryForm.libraryId.trim(),
        displayName: libraryForm.displayName.trim(),
        tenantId: libraryForm.tenantId || undefined,
        description: libraryForm.description?.trim() || undefined
      });
      setLibraryForm({ libraryId: "", tenantId: libraryForm.tenantId, displayName: "", description: "" });
      await refreshOrgOptions();
      setLibraryFormStatus("知识库已保存");
    } catch (error) {
      setLibraryFormStatus((error as Error).message);
    }
  };

  const handleInstallModel = async (name: string) => {
    setLocalModelsStatus(`安装 ${name}…`);
    try {
      await installModel({ name });
      await loadLocalModels();
      setLocalModelsStatus(`已安装 ${name}`);
      setTimeout(() => setLocalModelsStatus(null), 1500);
    } catch (error) {
      setLocalModelsStatus((error as Error).message);
    }
  };

  return (
    <div className="panel-grid single-column">
      <section className="card">
        <header className="card-header">
          <div>
            <p className="eyebrow">基础配置</p>
            <h2>租户 / 知识库管理</h2>
          </div>
          <div className="button-row compact">
            {orgLoading && <span className="status-pill info">同步中…</span>}
            {orgError && <span className="status-pill danger">{orgError}</span>}
            <button type="button" className="ghost" onClick={refreshOrgOptions}>
              刷新列表
            </button>
          </div>
        </header>
        <div className="split stack-on-mobile">
          <form className="stacked-form" onSubmit={handleTenantFormSubmit}>
            <h3>创建/更新租户</h3>
            <label>
              租户 ID
              <input
                value={tenantForm.tenantId}
                onChange={(e) => setTenantForm((prev) => ({ ...prev, tenantId: e.target.value }))}
                placeholder="如 enterprise-a"
                required
              />
            </label>
            <label>
              显示名称
              <input
                value={tenantForm.displayName}
                onChange={(e) => setTenantForm((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="企业 A"
                required
              />
            </label>
            <label>
              备注
              <input
                value={tenantForm.description}
                onChange={(e) => setTenantForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </label>
            <div className="button-row">
              <button type="submit">保存租户</button>
            </div>
            {tenantFormStatus && <small className="muted-text">{tenantFormStatus}</small>}
          </form>
          <form className="stacked-form" onSubmit={handleLibraryFormSubmit}>
            <h3>创建/更新知识库</h3>
            <label>
              所属租户
              <select
                value={libraryForm.tenantId}
                onChange={(e) => setLibraryForm((prev) => ({ ...prev, tenantId: e.target.value }))}
              >
                <option value="">共享</option>
                {tenants.map((tenant) => (
                  <option key={tenant.tenantId} value={tenant.tenantId}>
                    {tenant.displayName ?? tenant.tenantId}（{tenant.tenantId}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              知识库 ID
              <input
                value={libraryForm.libraryId}
                onChange={(e) => setLibraryForm((prev) => ({ ...prev, libraryId: e.target.value }))}
                placeholder="kb-001"
                required
              />
            </label>
            <label>
              显示名称
              <input
                value={libraryForm.displayName}
                onChange={(e) => setLibraryForm((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="本地知识库"
                required
              />
            </label>
            <label>
              备注
              <input
                value={libraryForm.description}
                onChange={(e) => setLibraryForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </label>
            <div className="button-row">
              <button type="submit">保存知识库</button>
            </div>
            {libraryFormStatus && <small className="muted-text">{libraryFormStatus}</small>}
          </form>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <p className="eyebrow">模型资产</p>
            <h2>本地模型管理</h2>
            <small className="muted-text">目录：{localModelsDir || "未配置（MODELS_DIR）"}</small>
          </div>
          <div className="button-row compact">
            {localModelsStatus && <span className="status-pill info">{localModelsStatus}</span>}
            <button type="button" className="ghost" onClick={loadLocalModels}>
              刷新
            </button>
          </div>
        </header>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>文件</th>
                <th>状态</th>
                <th>大小</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {localModels.map((model) => (
                <tr key={model.name}>
                  <td>
                    <div className="doc-title">{model.name}</div>
                    <small className="meta-muted">{model.description ?? ""}</small>
                  </td>
                  <td>{model.filename}</td>
                  <td>{model.present ? "已下载" : "缺失"}</td>
                  <td>{formatBytes(model.sizeBytes)}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost"
                      disabled={model.present}
                      onClick={() => handleInstallModel(model.name)}
                    >
                      {model.present ? "已安装" : "下载"}
                    </button>
                  </td>
                </tr>
              ))}
              {!localModels.length && (
                <tr>
                  <td colSpan={5} className="placeholder">
                    尚无清单数据。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {localModelExtras.length ? (
          <div className="muted-text">
            <strong>额外文件：</strong>{" "}
            {localModelExtras.map((extra) => `${extra.filename} (${formatBytes(extra.sizeBytes)})`).join("， ")}
          </div>
        ) : null}
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <p className="eyebrow">模型配置</p>
            <h2>语义/向量模型与 API Key</h2>
          </div>
          {status && <span className="status-pill info">{status}</span>}
        </header>
        <form className="stacked-form" onSubmit={handleSubmit}>
          <div className="split">
            <label>
              租户
              <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
                {tenants.length
                  ? tenants.map((tenant) => (
                      <option key={tenant.tenantId} value={tenant.tenantId}>
                        {tenant.displayName ?? tenant.tenantId}（{tenant.tenantId}）
                      </option>
                    ))
                  : <option value="default">默认租户（default）</option>}
              </select>
            </label>
            <label>
              知识库
              <select value={libraryId} onChange={(event) => setLibraryId(event.target.value)}>
                {libraries
                  .filter((lib) => !lib.tenantId || lib.tenantId === tenantId)
                  .map((lib) => (
                    <option key={lib.libraryId} value={lib.libraryId}>
                      {lib.displayName ?? lib.libraryId}（{lib.libraryId}）
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="split">
            <label>
              模型角色
              <select value={modelRole} onChange={(event) => setModelRole(event.target.value as ModelRoleOption)}>
                {MODEL_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              服务提供方
              <select value={provider} onChange={(event) => setProvider(event.target.value as Provider)}>
                <option value="openai">OpenAI API</option>
                <option value="ollama">Ollama</option>
              </select>
            </label>
          </div>
          <div className="split">
            <label>
              模型
              {modelOptions.length ? (
                <select value={modelName} onChange={(event) => setModelName(event.target.value)}>
                  {modelOptions.map((option) => (
                    <option key={option.modelName} value={option.modelName}>
                      {option.label ?? option.modelName}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder={modelPlaceholder} />
              )}
              <small className="muted-text">
                {modelOptions.length
                  ? "模型列表通过实时接口返回，可直接选择。"
                  : "如需自动获取模型名单，可点击下方按钮并由 API Key 代理请求。"}
              </small>
            </label>
            <label>
              显示名称（可选）
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="标签模型 / OCR 模型" />
            </label>
          </div>
        <div className="button-row compact">
          <button type="button" className="ghost" onClick={loadRemoteModels}>
            拉取模型列表
          </button>
          {modelOptionsStatus && <span className="status-pill info">{modelOptionsStatus}</span>}
        </div>
        <small className="muted-text">
          该步骤会直接向已配置的大模型 API 发起请求：OpenAI 兼容接口使用 <code>/v1/models</code>，Ollama 使用
          <code>/api/tags</code>。点击后将自动填充返回的模型 ID。
        </small>
          <label>
            接口 Base URL
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={providerPlaceholder} />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={provider === "openai" ? "sk-..." : "可选：Ollama 可留空"}
            />
            {hasStoredKey && <small className="muted-text">已保存 Key {apiKeyPreview ?? "****"}，填写新 Key 可覆盖。</small>}
            {provider === "openai" && (
              <small className="muted-text">拉取模型列表需要可用的 API Key，即使已保存也需临时填写。</small>
            )}
          </label>
          <div className="button-row">
            <button type="submit">保存配置</button>
            <button type="button" className="ghost" onClick={loadSetting}>
              重新加载
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <p className="eyebrow">已保存配置</p>
            <h2>模型列表</h2>
          </div>
          <div className="button-row compact">
            {listStatus && <span className="status-pill info">{listStatus}</span>}
            <button type="button" className="ghost" onClick={loadSettingsList}>
              刷新
            </button>
          </div>
        </header>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Role</th>
                <th>模型</th>
                <th>Base URL</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {settingsList.map((item) => (
                <tr key={`${item?.tenantId}-${item?.libraryId}-${item?.modelRole}`}>
                  <td>{item?.provider}</td>
                  <td>{ROLE_LABEL_MAP.get(item?.modelRole ?? "tagging") ?? item?.modelRole}</td>
                  <td>
                    <div className="doc-title">{item?.displayName ?? item?.modelName}</div>
                    <small className="meta-muted">{item?.modelName}</small>
                  </td>
                  <td>
                    <small className="meta-muted">{item?.baseUrl}</small>
                  </td>
                  <td>
                    <button type="button" onClick={() => applySettingFromList(item!)}>加载到表单</button>
                  </td>
                </tr>
              ))}
              {!settingsList.length && (
                <tr>
                  <td colSpan={5} className="placeholder">
                    暂无已保存配置
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card--tall">
        <header className="card-header">
          <div>
            <p className="eyebrow">模型目录</p>
            <h2>可用模型（API 提供）</h2>
          </div>
          {catalogStatus && <span className="status-pill info">{catalogStatus}</span>}
        </header>
        <div className="model-catalog">
          {catalog.map((entry) => (
            <article key={entry.provider} className="catalog-card">
              <div className="catalog-card__header">
                <h3>{entry.provider}</h3>
                <span className="badge">{entry.driver === "local" ? "本地" : "远程"}</span>
              </div>
              {entry.defaultBaseUrl && (
                <small className="meta-muted">默认 Base URL：{entry.defaultBaseUrl}</small>
              )}
              <ul className="catalog-card__list">
                {entry.models.map((model) => (
                  <li key={`${entry.provider}-${model.modelName}`}>
                    <div className="catalog-card__model">
                      <strong>{model.displayName}</strong>
                      <small className="meta-muted">
                        {model.roles.map((role) => ROLE_LABEL_MAP.get(role) ?? role).join(" / ")}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => applyCatalogModel(entry, model)}
                    >
                      填入表单
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {!catalog.length && (
            <p className="placeholder">
              尚无模型目录，请检查 `/model-settings/catalog` 响应或设置 MODEL_CATALOG_PATH。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
