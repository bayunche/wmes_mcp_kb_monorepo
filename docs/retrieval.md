# Retrieval & Ranking Guide

> 日期：2025-11-10 执行者：Codex

## 1. Hybrid 检索模型
- **向量相似度**：`VectorClient`（`packages/core/src/vector.ts`）提供文本/图片嵌入，支持远程端点和 fallback。  
- **融合权重**：`HybridRetriever`（`packages/core/src/retrieval.ts`）按 α~ζ 加权：向量、关键词、层级、时间衰减、topic 与邻居得分。  
- **数据源**：通过 `ChunkRepository` 提供候选，默认由 `@kb/data` 的 `PgChunkRepository + Qdrant` 实现，也可注入其他搜索后端。  
- **邻居扩展**：若 `request.includeNeighbors = true`，检索结果会携带同篇上下文，用于长文回答。

## 2. 典型调用
```ts
const retriever = new HybridRetriever({
  vectorClient: new VectorClient({ fallbackDim: 8 }),
  repo: new ChunkDbRepository()
});
const response = await retriever.search({
  query: "付款节点",
  limit: 5,
  includeNeighbors: true,
  filters: { topicLabels: ["付款"] }
});
```

## 3. Observability
建议将检索耗时记录到 `kb_retrieval_request_seconds`（自定义 Histogram），并在 API 层统计请求成功率。现在的 API 测试用例已覆盖基本行为，可根据需要扩展。

## 4. 与其他模块的关系
- **API**：`/search` 直接调用 `HybridRetriever`，由 API 负责多租户过滤与鉴权。  
- **MCP**：`apps/mcp` 的 `kb.search` 工具也基于同一 `HybridRetriever`，保证 Agent 与 API 一致性。  
- **Worker**：索引阶段会写入 `topicLabels`、`neighbors` 等字段，为检索提供额外得分因子。

## 5. 调优建议
1. **权重微调**：`HybridRetriever` 构造参数支持覆盖权重，可按业务场景（如关键词优先）调整。  
2. **向量库**：上线时以 Qdrant 或 Postgres+pgvector 替换内存存储，并在 repo 层做分页/过滤。  
3. **诊断**：将 `SearchRequest/Response` 保存到日志，用于 QA 回溯；可选在 MCP 工具中暴露 `debug` 字段。  
4. **性能**：若查询并发较高，可预热 `VectorClient`、缓存常见查询向量，并在 repo 层做增量更新。
