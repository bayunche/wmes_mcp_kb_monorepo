import { describe, expect, test } from "bun:test";
import { PgDocumentRepository } from "./documents";
import type { Database } from "../db/schema";
import type { Kysely } from "kysely";

type CountBucket = Record<string, number>;
type CountMap = Record<string, CountBucket>;

class FakeQueryBuilder<Table extends keyof Database> {
  private tenant?: string;
  constructor(private readonly table: Table, private readonly counts: CountMap) {}

  select(_selector: unknown) {
    return this;
  }

  innerJoin() {
    return this;
  }

  where(column: string, _operator: string, value: unknown) {
    if (typeof value === "string" && column.toLowerCase().includes("tenant_id")) {
      this.tenant = value;
    }
    return this;
  }

  executeTakeFirst(): Promise<{ count: number }> {
    const tableCounts = this.counts[this.table as string] ?? {};
    const key = this.tenant ?? "all";
    return Promise.resolve({ count: tableCounts[key] ?? 0 });
  }
}

function createMockDb(counts: CountMap) {
  return {
    selectFrom<Table extends keyof Database>(table: Table) {
      return new FakeQueryBuilder(table, counts);
    }
  } as unknown as Kysely<Database>;
}

describe("PgDocumentRepository.stats", () => {
  test("aggregates counts per tenant", async () => {
    const counts: CountMap = {
      documents: { all: 8, "tenant-b": 3 },
      attachments: { all: 12, "tenant-b": 5 },
      chunks: { all: 40, "tenant-b": 9 },
      ingestion_jobs: { all: 4, "tenant-b": 1 }
    };
    const repo = new PgDocumentRepository(createMockDb(counts));
    const tenantStats = await repo.stats("tenant-b");
    expect(tenantStats).toEqual({
      documents: 3,
      attachments: 5,
      chunks: 9,
      pendingJobs: 1
    });

    const globalStats = await repo.stats();
    expect(globalStats).toEqual({
      documents: 8,
      attachments: 12,
      chunks: 40,
      pendingJobs: 4
    });
  });
});
