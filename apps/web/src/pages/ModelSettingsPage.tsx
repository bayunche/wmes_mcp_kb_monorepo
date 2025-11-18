import { useCallback, useEffect, useState } from "react";
import {
  fetchModelSettings,
  saveModelSettings,
  fetchModelSettingsList,
  fetchModelCatalog
} from "../api";

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

  return (
    <div className="panel-grid single-column">
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
              Tenant ID
              <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} />
            </label>
            <label>
              Library ID
              <input value={libraryId} onChange={(event) => setLibraryId(event.target.value)} />
            </label>
          </div>
          <div className="split">
            <label>
              Model Role
              <select value={modelRole} onChange={(event) => setModelRole(event.target.value as ModelRoleOption)}>
                {MODEL_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Provider
              <select value={provider} onChange={(event) => setProvider(event.target.value as Provider)}>
                <option value="openai">OpenAI API</option>
                <option value="ollama">Ollama</option>
              </select>
            </label>
          </div>
          <div className="split">
            <label>
              Model Name
              <input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder={modelPlaceholder} />
            </label>
            <label>
              Display Name（可选）
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="标签模型 / OCR 模型" />
            </label>
          </div>
          <label>
            Base URL
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
