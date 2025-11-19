import type { Kysely } from "kysely";
import type { Database, TenantConfigsTable, LibraryConfigsTable } from "../db/schema";
import type {
  TenantConfigRepository,
  TenantConfig,
  LibraryConfigRepository,
  LibraryConfig
} from "../types";
import { TenantConfigSchema, LibraryConfigSchema } from "@kb/shared-schemas";

function mapTenant(row: TenantConfigsTable): TenantConfig {
  return TenantConfigSchema.parse({
    tenantId: row.tenant_id,
    displayName: row.display_name,
    description: row.description ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

function mapLibrary(row: LibraryConfigsTable): LibraryConfig {
  return LibraryConfigSchema.parse({
    libraryId: row.library_id,
    tenantId: row.tenant_id ?? undefined,
    displayName: row.display_name,
    description: row.description ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

export class PgTenantConfigRepository implements TenantConfigRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async list(): Promise<TenantConfig[]> {
    const rows = await this.db.selectFrom("tenant_configs").selectAll().orderBy("tenant_id").execute();
    return rows.map(mapTenant);
  }

  async upsert(config: TenantConfig): Promise<TenantConfig> {
    const payload = {
      tenant_id: config.tenantId,
      display_name: config.displayName,
      description: config.description ?? null,
      updated_at: new Date()
    };

    await this.db
      .insertInto("tenant_configs")
      .values({ ...payload, created_at: new Date() })
      .onConflict((oc) =>
        oc.column("tenant_id").doUpdateSet({
          display_name: payload.display_name,
          description: payload.description,
          updated_at: payload.updated_at
        })
      )
      .execute();

    const row = await this.db
      .selectFrom("tenant_configs")
      .selectAll()
      .where("tenant_id", "=", config.tenantId)
      .executeTakeFirst();

    if (!row) {
      throw new Error("Failed to persist tenant config");
    }
    return mapTenant(row);
  }

  async delete(tenantId: string): Promise<void> {
    await this.db.deleteFrom("tenant_configs").where("tenant_id", "=", tenantId).execute();
  }
}

export class PgLibraryConfigRepository implements LibraryConfigRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async list(tenantId?: string): Promise<LibraryConfig[]> {
    const query = this.db.selectFrom("library_configs").selectAll().orderBy("library_id");
    if (tenantId) {
      query.where("tenant_id", "=", tenantId);
    }
    const rows = await query.execute();
    return rows.map(mapLibrary);
  }

  async upsert(config: LibraryConfig): Promise<LibraryConfig> {
    const payload = {
      library_id: config.libraryId,
      tenant_id: config.tenantId ?? null,
      display_name: config.displayName,
      description: config.description ?? null,
      updated_at: new Date()
    };

    await this.db
      .insertInto("library_configs")
      .values({ ...payload, created_at: new Date() })
      .onConflict((oc) =>
        oc.column("library_id").doUpdateSet({
          tenant_id: payload.tenant_id,
          display_name: payload.display_name,
          description: payload.description,
          updated_at: payload.updated_at
        })
      )
      .execute();

    const row = await this.db
      .selectFrom("library_configs")
      .selectAll()
      .where("library_id", "=", config.libraryId)
      .executeTakeFirst();

    if (!row) {
      throw new Error("Failed to persist library config");
    }
    return mapLibrary(row);
  }

  async delete(libraryId: string): Promise<void> {
    await this.db.deleteFrom("library_configs").where("library_id", "=", libraryId).execute();
  }
}
