# MCP Integration Guide

> 日期：2025-11-11 执行者：Codex

## 1. 工具概览
| 工具 | 输入 | 输出 | 说明 |
| --- | --- | --- | --- |
| kb.search | SearchRequest | SearchResponse | 返回排名、得分、可选邻居；服务器会将 `ctx.tenantId` 注入 filters.tenantId，并在 `results[].attachments` 附上表格/图片 object key 及 `sourceUri=kb://chunk/<id>`。 |
| kb.related | { chunkId, limit } | { source, neighbors } | 源 chunk 及邻居均包含 attachments 与 sourceUri，便于 Agent 拼装上下文。 |
| kb.preview | { chunkId } | { chunk, attachments, sourceUri } | 单段预览，带回附件 object key；MCP 层不负责签名，调用方可按需下载或生成预览。 |

## 2. 数据流
createMcpServer() 默认依赖 @kb/data：PgChunkRepository + Qdrant 提供向量检索，PgAttachmentRepository 负责读取附件并生成 kb://chunk/* 溯源。若需自定义缓存，可实现 ChunkRepository / AttachmentRepository 并通过 createMcpServer({ chunkRepository, attachments }) 注入，但需保证：
- kb.related 能在同文档内快速定位 chunk 与附件；
- kb.preview 仅返回必要元数据（object key），避免在 MCP 层暴露签名 URL；
- 所有请求必须携带 `tenantId`（由 `McpToolContext` 注入，应与 REST 请求的 `X-Tenant-Id` 对齐），确保多租户隔离。

## 3. 实现与调试
- 单元测试：pps/mcp/src/__tests__/mcp.test.ts 覆盖 search/related/preview，包含附件断言。
- MCP Inspector：在本地运行 createMcpServer() 并接入 Inspector，可观察输入输出与上下文。
- 日志：如需排查 Agent 行为，可在 createSearchTool 等 handler 内插入日志，记录 query、tenantId、附件数量等关键信息。

## 4. 安全与鉴权
- MCP 与 REST 共用 tenantId 过滤逻辑；若 Agent 层还需更细粒度权限，可扩展 McpToolContext（例如 roles）。
- 附件返回的 object key 默认为 MinIO preview bucket 下的路径，调用方在需要下载时再使用各自凭据生成签名 URL。
- 如需禁止某些工具，可在 handleMcpRequest 外层增加白名单，或在 createMcpServer 注册前过滤。
