# Retrieval & Ranking Guide

> 日期：2025-11-10 执行者：Codex

## 1. Hybrid 检索模型
- **向量相似度**：`VectorClient`（`packages/core/src/vector.ts`）提供文本/图片嵌入，默认启用本地 @xenova 模型。  
- **本地 Rerank**：同一个 `VectorClient.rerank` 会优先调用本地交叉编码模型（`LOCAL_RERANK_MODEL_ID`，默认 `Xenova/bge-reranker-v2-m3`），若配置远程 `RERANK_ENDPOINT` 则自动切换到兼容 OpenAI API 的 `/v1/models` 接口。  
- **语义元数据**：Chunk 含 `title/summary/tags/topics/keywords/entities/parentSectionPath`，`HybridRetriever` 可以按这些字段过滤或加分。  
- **融合权重**：`HybridRetriever`（`packages/core/src/retrieval.ts`）按 α~ζ 加权：向量、关键词、层级、时间衰减、topic、模态匹配与邻居得分。  
- **二次排序**：基础得分计算完成后，候选文本会交给 rerank 模型，最终得分 = 0.6 * hybrid + 0.4 * rerank，确保召回/排序兼顾语义匹配与上下文词面适配。  
- **数据源**：`PgChunkRepository + Qdrant` 组合；结构树数据通过 `document_sections` 表读取。  
- **邻居扩展**：`includeNeighbors=true` 时返回同章节/关联块，便于 RAG 对话引用完整上下文。

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
  filters: {
    topicLabels: ["付款"],
    parentSectionPath: ["合同", "第3章"],
    entityTypes: ["person"]
  }
});
```

## 3. 结构树与 API/MCP
- **REST**：`GET /documents/:id/structure` 返回 LLM 构建的章节树（`sectionId/parentSectionId/title/summary/tags/keywords`），用于前端树视图或 Agent 决策。  
- **搜索结果**：`/search` 与 MCP `kb.search` 均会返回新的语义元数据字段，可直接展示 chunk 的 `semanticTitle/summary/entities/parentSectionPath`。  
- **MCP 工具**：`kb.related` 会依据结构树返回邻接块，`kb.preview` 中附带章节信息便于 Agent 拼接答案。

## 3. Observability
建议将检索耗时记录到 `kb_retrieval_request_seconds`（自定义 Histogram），并在 API 层统计请求成功率。现在的 API 测试用例已覆盖基本行为，可根据需要扩展。

## 4. 与其他模块的关系
- **API**：`/search` 直接调用 `HybridRetriever`，由 API 负责多租户过滤与鉴权。  
- **MCP**：`apps/mcp` 的 `kb.search` 工具也基于同一 `HybridRetriever`，保证 Agent 与 API 一致性。  
- **Worker**：索引阶段会写入 `topicLabels`、`neighbors` 等字段，为检索提供额外得分因子。

## 5. 调优建议
1. **权重微调**：`HybridRetriever` 构造参数支持覆盖权重，可按“章节优先/实体优先”等场景调整。  
2. **结构过滤**：利用 `/documents/:id/structure` 预览章节树，并在查询侧提供 `parentSectionPath` / `sectionId` 过滤，提高召回精度。  
3. **向量库**：上线时以 Qdrant 或 Postgres+pgvector 替换内存存储，并在 repo 层做分页/过滤。  
4. **诊断**：将 `SearchRequest/Response` 保存到日志，用于 QA 回溯；可选在 MCP 工具中暴露 `debug` 字段。  
5. **性能**：预热 `VectorClient`、缓存常见查询向量，并在 repo 层按 tenant/library 进行分片。
