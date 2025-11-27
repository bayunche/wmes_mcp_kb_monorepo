import { loadConfig } from "../../packages/core/src/config";
import { createDataLayer } from "../../packages/data/src";
import type { ModelSettingSecret, ModelRole } from "@kb/shared-schemas";

function resolveEnvBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ["true", "1", "yes"].includes(value.toLowerCase());
}

async function main() {
  const envFile = process.env.ENV_FILE ?? ".env";
  const cfg = loadConfig({ envFile });
  const data = createDataLayer(cfg);
  const repo = data.modelSettings;

  const tenantId = process.env.LLM_TENANT_ID ?? cfg.DEFAULT_TENANT_ID;
  const libraryId = process.env.LLM_LIBRARY_ID ?? cfg.DEFAULT_LIBRARY_ID;

  const provider = (process.env.LLM_PROVIDER ?? "openai") as ModelSettingSecret["provider"];
  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? undefined;
  const allowMissingKey = resolveEnvBoolean(process.env.LLM_ALLOW_MISSING_KEY, false);

  if (!apiKey && provider !== "local" && !allowMissingKey) {
    throw new Error("缺少 LLM_API_KEY/OPENAI_API_KEY，且 provider 非 local；如需跳过请设置 LLM_ALLOW_MISSING_KEY=true");
  }

  const structureModel = process.env.LLM_STRUCTURE_MODEL ?? "gpt-4o-mini";
  const metadataModel = process.env.LLM_METADATA_MODEL ?? structureModel;

  const settings: Array<{ role: ModelRole; model: string; displayName?: string }> = [
    { role: "structure", model: structureModel, displayName: process.env.LLM_STRUCTURE_NAME },
    { role: "metadata", model: metadataModel, displayName: process.env.LLM_METADATA_NAME }
  ];

  for (const setting of settings) {
    const payload: ModelSettingSecret = {
      tenantId,
      libraryId,
      provider,
      baseUrl,
      modelName: setting.model,
      apiKey,
      modelRole: setting.role,
      displayName: setting.displayName,
      options: undefined
    };
    await repo.upsert(payload);
    console.log(
      `Upserted model_settings role=${setting.role} provider=${provider} model=${setting.model} tenant=${tenantId} library=${libraryId}`
    );
  }

  await data.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
