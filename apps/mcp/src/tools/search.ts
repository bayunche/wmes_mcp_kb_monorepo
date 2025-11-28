import { HybridRetriever } from "../../../../packages/core/src/retrieval";
import { McpSearchHandler } from "../types";
import { DbMcpRepository } from "../repository/db";
import { SearchResponseSchema } from "@kb/shared-schemas";

export function createSearchTool(
  retriever: HybridRetriever,
  repo: DbMcpRepository,
  resolveOverrides?: (input: any, ctx: any) => Promise<unknown>
): McpSearchHandler {
  return {
    name: "kb.search",
    async handle(input, ctx) {
      const request = {
        ...input,
        filters: {
          ...input.filters,
          tenantId: input.filters?.tenantId ?? ctx.tenantId,
          libraryId: input.filters?.libraryId ?? ctx.libraryId
        }
      };
      const overrides = resolveOverrides ? await resolveOverrides(request, ctx) : undefined;
      const result = await retriever.search(request, overrides as any);
      const chunkIds = result.results.map((item) => item.chunk.chunkId);
      const attachmentMap = await repo.attachmentsForChunks(chunkIds);
      const payload = {
        query: result.query,
        total: result.total,
        results: result.results.map((item) => ({
          ...item,
          attachments: attachmentMap.get(item.chunk.chunkId) ?? [],
          sourceUri: `kb://chunk/${item.chunk.chunkId}`
        })),
        queryRewrite: result.queryRewrite,
        semanticRerankApplied: result.semanticRerankApplied
      };
      return SearchResponseSchema.parse(payload);
    }
  };
}
