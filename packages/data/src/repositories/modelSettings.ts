import type { Kysely } from "kysely";
import type { Database, ModelSettingsTable } from "../db/schema";
import type { ModelSettingSecret, ModelRole } from "@kb/shared-schemas";
import { ModelSettingSecretSchema } from "@kb/shared-schemas";
import type { ModelSettingsRepository } from "../types";

function mapRow(row: ModelSettingsTable): ModelSettingSecret {
  return ModelSettingSecretSchema.parse({
    tenantId: row.tenant_id,
    libraryId: row.library_id,
    provider: row.provider,
    baseUrl: row.base_url,
    modelName: row.model_name,
    modelRole: row.model_role as ModelRole,
    displayName: row.display_name ?? undefined,
    apiKey: row.api_key ?? undefined,
    options: (row.options as Record<string, unknown> | null) ?? undefined,
    updatedAt: row.updated_at.toISOString()
  });
}

export class PgModelSettingsRepository implements ModelSettingsRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async get(tenantId: string, libraryId: string, modelRole: ModelRole = "tagging"): Promise<ModelSettingSecret | null> {
    const row = await this.db
      .selectFrom("model_settings")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("library_id", "=", libraryId)
      .where("model_role", "=", modelRole)
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  async list(tenantId: string, libraryId: string): Promise<ModelSettingSecret[]> {
    const rows = await this.db
      .selectFrom("model_settings")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("library_id", "=", libraryId)
      .orderBy("model_role", "asc")
      .execute();
    return rows.map(mapRow);
  }

  async upsert(setting: ModelSettingSecret): Promise<ModelSettingSecret> {
    const payload = {
      tenant_id: setting.tenantId,
      library_id: setting.libraryId,
      provider: setting.provider,
      base_url: setting.baseUrl,
      model_name: setting.modelName,
      api_key: setting.apiKey ?? null,
      options: setting.options ?? null,
      model_role: setting.modelRole ?? "tagging",
      display_name: setting.displayName ?? null,
      updated_at: new Date()
    };

    await this.db
      .insertInto("model_settings")
      .values({ ...payload, created_at: new Date() })
      .onConflict((oc) =>
        oc.columns(["tenant_id", "library_id", "model_role"]).doUpdateSet({
          provider: payload.provider,
          base_url: payload.base_url,
          model_name: payload.model_name,
          api_key: payload.api_key,
          options: payload.options,
          display_name: payload.display_name,
          updated_at: payload.updated_at
        })
      )
      .execute();

    const row = await this.db
      .selectFrom("model_settings")
      .selectAll()
      .where("tenant_id", "=", setting.tenantId)
      .where("library_id", "=", setting.libraryId)
      .where("model_role", "=", setting.modelRole ?? "tagging")
      .executeTakeFirst();

    if (!row) {
      throw new Error("Failed to persist model setting");
    }
    return mapRow(row);
  }

  async delete(tenantId: string, libraryId: string, modelRole: ModelRole): Promise<void> {
    await this.db
      .deleteFrom("model_settings")
      .where("tenant_id", "=", tenantId)
      .where("library_id", "=", libraryId)
      .where("model_role", "=", modelRole)
      .execute();
  }
}
