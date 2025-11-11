# MCP Integration Guide

> 日期：2025-11-10 执行者：Codex

## 1. 工具概览
| 工具 | 输入 | 输出 | 说明 |
| --- | --- | --- | --- |
| `kb.search` | `SearchRequest` | `SearchResponse` | 通过 `HybridRetriever` 返回排名、得分及可选邻居 |
| `kb.related` | `{ chunkId, limit }` | `{ source, neighbors }` | 根据 chunkId 返回相邻段落 |
| `kb.preview` | `{ chunkId }` | `{ chunk }` | 直接预览某个 chunk 内容 |

实现代码在 `apps/mcp/src/tools/*`，通过 `createMcpServer()` 注册进 `McpServer`。  
示例：
```ts
const server = createMcpServer({ data: chunkRecords });
const response = await handleMcpRequest(server, "kb.search", { query: "付款" }, ctx);
```

## 2. 数据源
MCP 使用 `InMemoryChunkRepository`（同 HybridRetriever）与 `InMemoryMcpRepository`（邻居/预览）。生产环境可替换为共享的数据库或缓存层，但需保证：
- `kb.related` 能快速定位 chunk 及上下文；
- `kb.preview` 只返回必要字段，避免泄露敏感数据；
- 所有请求必须携带 `tenantId`（由 `McpToolContext` 注入）。

## 3. 安全与鉴权
- MCP 层通常与 Agent 位于同一进程，安全由上游负责；若需要多 Agent 场景，可在 `handleMcpRequest` 前增加 token 校验。  
- 所有工具会遵循 `tenantId` 过滤，确保跨租户隔离。

## 4. 调试方式
1. 单元测试：`apps/mcp/src/__tests__/mcp.test.ts`，可扩展更多场景。  
2. MCP Inspector：将 `kb.search`／`kb.related` 注册到 inspector 观察参数与返回。  
3. 日志：`McpServer` 可在 handler 内部添加日志，用于观察 Agent 调用频率和失败原因。

## 5. 常见扩展
- **分段预览**：在 `kb.preview` 中加入 `includeNeighbors` 选项，复用 repository 的邻居逻辑。  
- **权限控制**：在 `McpToolContext` 中添加 `roles`，按角色过滤可见文档。  
- **执行缓存**：对相同查询缓存 `SearchResponse`，降低高频问题的响应时间。
