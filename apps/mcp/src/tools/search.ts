import { HybridRetriever } from "../../../packages/core/src/retrieval";
import { McpSearchHandler } from "../types";

export function createSearchTool(retriever: HybridRetriever): McpSearchHandler {
  return {
    name: "kb.search",
    async handle(input, ctx) {
      const request = {
        ...input,
        filters: {
          ...input.filters,
          tenantId: input.filters?.tenantId ?? ctx.tenantId
        }
      };
      return retriever.search(request);
    }
  };
}
