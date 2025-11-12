# Phase 6 Step 6.2 设计（2025-11-11，Codex）

## 目标
- 为 REST API 提供完整的文件上传 → 存储 → 入队链路。
- 扩展检索与治理接口（过滤、删除、重索引、统计），并暴露附件信息。
- 让 MCP 工具 (kb.search/related/preview) 返回带溯源 URI 的多模态上下文，复用 MinIO preview。

## 能力拆解

### 1. 文件上传
- 新增 `POST /upload`（multipart/form-data）：字段 `file`（必填）、`title`、`tenantId`、`tags[]`...
- 使用 MinIO raw bucket 存储原始文件，命名 `tenantId/<docId>/source.<ext>`；写入 `documents` 表并将 `sourceUri` 指向 object key。
- 入队 `IngestionTask`（docId/tenantId），返回包含 doc 元数据、队列状态。
- 若用户仍使用 JSON `POST /documents`，保持向后兼容，但推荐 upload 接口。

### 2. 检索扩展
- `/search` 接受 `filters`：`tenantId`、`docIds`、`topicLabels`、`hierarchyPrefix`、新增 `contentTypes`（text/table/image）、`hasAttachments`。
- 结果中增加 `attachments`（数组，含 `assetType/objectKey/mimeType/pageNo/bbox`），以便前端/Agent 读取预览。
- 为此实现 `AttachmentsRepository`（按 chunk/doc id 批量查询）并在 API 层拼装。

### 3. 治理接口
- `DELETE /documents/:id`: 删除 documents/chunks/embeddings/attachments 记录、Qdrant 向量（按 chunkId）、MinIO raw/preview 对象。
- `POST /documents/:id/reindex`: 重新 enqueue ingestion 任务，可选择 `force=true` 清理旧数据。
- `GET /stats`: 返回文档总数、chunk 总数、attachments 总数、最近 ingestion 状态。
- 需要扩展 data layer：DocumentRepository 新增 `delete`、`count`；VectorIndex 增加 `deleteByChunkIds`; MinIOStorageClient 增加删除函数。

### 4. MCP 输出
- `kb.search`: 在 context 中附带 attachment 预览（objectKey、assetType、pageNo），并生成 `sourceUri`（`kb://chunk/<chunkId>`）。
- `kb.related`: 返回 source chunk + neighbor attachments；`kb.preview` 同样需要附件信息。
- 为此扩展 `DbMcpRepository` 以查询 attachments，并传入 API 生成的 object keys（MCP 侧不负责签名，仅返回 key + type）。

### 5. 权限/租户
- 每个路由继续复用 `requireAuth`（Bearer token），并支持 `X-Tenant-Id` 或 body 字段；删除/重索引必须校验 tenant 匹配。

## 数据结构 & 依赖改动
- `packages/data`：
  - 新增 `attachments` repository (`listByChunkIds`, `listByDocId`, `deleteByDocId`).
  - `DocumentRepository` 添加 `delete(docId)`、`stats()`。
  - `VectorIndex` 添加 `deleteByChunkIds`（对 Qdrant 调用 `delete`）。
  - `MinioStorageClient` 添加 `deleteRawObject` / `deletePreviewObjects(prefix)`。
- `packages/shared-schemas`：扩展 SearchResponse 结果块以包含 `attachments` 和 `sourceUri` 字段。

## API 端点规划
| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/upload` | POST (multipart) | 上传文件，返回 doc 元数据 |
| `/documents` | GET (可选) | 查询文档列表（带基本统计），方便治理 UI |
| `/documents/:id` | DELETE | 删除 doc + 附件 + 向量 |
| `/documents/:id/reindex` | POST | 重新入队 |
| `/stats` | GET | 返回文档/附件/队列统计 |
| `/search` | POST | 现有接口扩展 filters + attachments |

## MCP 调整
- 更新工具 handler，在响应里添加 `attachments` 和 `sourceUri`，并通过 repo 拉取预览信息。

## 测试计划
- `apps/api/src/__tests__/api.test.ts`
  - `upload`：模拟 multipart 表单，断言 MinIO stub 被调用、文档写入、任务入队。
  - `delete` / `reindex`: 使用 stub storage/vector/doc repo 验证调用顺序。
  - `search`：确保 filters 传递给 retriever，并返回 attachments。
- `apps/mcp/src/__tests__/mcp.test.ts`: 覆盖新的 attachments/sourceUri。
- `tests/integration/api.integration.test.ts`: 走一遍 upload → search → delete（使用 in-memory stub）。

## 文档更新
- README：新增上传与治理端点说明、MinIO 桶准备、MCP 溯源格式。
- docs/mcp.md：描述新的响应结构、attachments 字段。
- operations-log + verification：记录测试与演示步骤。
