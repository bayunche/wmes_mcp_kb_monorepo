# 知识库 API 对接指南

- 日期：2025-11-29
- 执行者：Codex

本指南面向未接触过代码的集成方，涵盖认证、租户/库传递、主要接口与示例请求/响应。

## 全局约定
- 基础地址：`http://<host>:<port>`，默认端口 `8080`（`API_PORT` 未显式设置时）。
- 认证：除 `/health`、`/metrics` 外所有路径需要 `Authorization: Bearer <API_TOKEN>`。`API_TOKEN` 默认 `dev-token`，生产请自行配置。
- 多租户/库：优先级 **显式参数 > Header > 默认值**。Headers：`x-tenant-id`、`x-library-id`。默认值由 `DEFAULT_TENANT_ID`、`DEFAULT_LIBRARY_ID` 控制（缺省均为 `default`）。
- CORS：白名单来自 `CORS_ALLOWED_ORIGINS`（缺省 `http://localhost:5173` 等），支持 `Authorization,x-tenant-id,x-library-id` 等头。
- 内容类型：JSON 接口使用 `application/json`，上传使用 `multipart/form-data`。
- 状态码：常见 `200/201/204/400/401/403/404/500/501/502`，上传批量可能返回 `207`（部分成功/失败）。
- 体积限制：最大请求体默认 `1024MB`（`API_MAX_BODY_MB`），上传单文件超过 `API_UPLOAD_STREAM_THRESHOLD_MB`（默认 256MB）会落盘再上传。

## 常用环境变量
- `API_TOKEN`：API 鉴权 token。
- `DEFAULT_TENANT_ID` / `DEFAULT_LIBRARY_ID`：默认租户/库。
- `CORS_ALLOWED_ORIGINS`：逗号分隔的允许来源，`*` 表示全放行。
- `API_MAX_BODY_MB`：最大请求体（MB）。
- `API_UPLOAD_STREAM_THRESHOLD_MB`：上传流式阈值（MB）。
- 模型相关：`TEXT_EMBEDDING_ENDPOINT`、`RERANK_ENDPOINT`、`IMAGE_EMBEDDING_ENDPOINT`、`VECTOR_API_KEY` 等。

## 快速示例
```bash
# 健康检查（无需鉴权）
curl http://localhost:8080/health

# 上传单文件并指定租户/库与标签
curl -X POST http://localhost:8080/upload \
  -H "Authorization: Bearer <API_TOKEN>" \
  -F "file=@/path/doc.pdf" \
  -F "title=合同" \
  -F "tags=legal,contract" \
  -H "x-tenant-id=tenant-a" -H "x-library-id=kb-legal"

# 语义检索
curl -X POST http://localhost:8080/search \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "x-tenant-id=tenant-a" -H "x-library-id=kb-legal" \
  -H "Content-Type: application/json" \
  -d '{ "query": "合同终止条件", "limit": 5, "filters": { "hasAttachments": true } }'
```

## 接口列表

### 1) 健康与监控
- `GET /health`：返回 `{ ok: true }`。
- `GET /metrics`：Prometheus 文本格式，无需认证；需配置 `MetricsRegistry` 时可用。

### 2) 入库与文档管理
- `POST /upload`（multipart/form-data）  
  - 必填：`file` 或 `files`（可多文件）。  
  - 可选：`title`（单文件）或 `titles[]`（多文件顺序对应）、`tags`/`tags[]`（逗号或多值）、`tenantId`、`libraryId`。  
  - 行为：为每个文件生成 `docId`，`sourceUri=<tenant>/<docId>/source.<ext>`，写对象存储并入队。  
  - 响应：`{ items: [{ docId, filename, title, status: "queued"|"error", message? }] }`，全部成功 200，部分成功 207，全失败 500。
- `POST /documents`（JSON）  
  - 体：`DocumentSchema`（需 `docId` UUID、`title`，`mimeType` 可选）；服务端会覆盖/填充 `tenantId`、`libraryId`。  
  - 行为：写 DB 并入队；响应 201 携带保存后的文档。
- `GET /documents`：列出租户/库下文档列表。
- `PATCH /documents/{docId}`：更新 `tags`（数组）。返回更新后的文档或 404。
- `DELETE /documents/{docId}`：删除文档、附件、向量索引；校验租户一致性，成功 204。
- `POST /documents/{docId}/reindex`：将文档状态回退为 `uploaded` 并重新入队。
- `GET /ingestion/{docId}/status`：查看单文档 `ingestStatus` / `errorMessage` / `statusMeta`。
- `GET /ingestion/queue?tenantId&libraryId&limit`：获取队列条目，含阶段进度 `progress`。
- `GET /documents/{docId}/chunks`：返回文档的 chunk + 附件列表。
- `GET /documents/{docId}/structure`：返回文档的章节结构（sections）。
- `GET /libraries/{libraryId}/chunks?tenantId&docId&limit`：按库列出 chunk + 文档 + 附件（先按库，后在内存按租户过滤）。
- `GET /stats?tenantId&libraryId`：文档数量、chunk 总数等统计。

### 3) Chunk 元数据
- `GET /chunks/{chunkId}`：返回单个 chunk 记录。
- `PATCH /chunks/{chunkId}`：可更新字段（任选其一）：`topicLabels`、`semanticTags`、`topics`、`keywords`、`parentSectionPath`、`bizEntities`、`envLabels`、`entities`（NER）、`semanticTitle`、`contextSummary`。至少提供一项，否则 400。

### 4) 语义检索与 MCP
- `POST /search`  
  - 体（`SearchRequestSchema`）：`query`(string)，`limit`(默认10，最大50)，`includeNeighbors`(默认 true)，`filters` 可含：  
    - `tenantId` / `libraryId`（若不传走 header 或默认）；  
    - `docIds`、`topicLabels`、`hierarchyPrefix`、`contentTypes`(`text|table|image|caption`)、`attachmentTypes`(`image|table|excel_sheet|slide`)、`hasAttachments`、`semanticTags`、`envLabels`、`metadataQuery`(键值精确匹配)。  
  - 响应（`SearchResponseSchema`）：`query`、`results[]`（含 `chunk`、`score`、`neighbors?`、`attachments?`、`document?`、`sourceUri`）、`queryRewrite?`、`semanticRerankApplied?`。
- `POST /mcp/search`：同 `/search` 输入，返回 MCP 结构 `{ context: [{ title, chunk, document }], total }`。
- `POST /mcp/related`：体 `{ chunkId, tenantId?, libraryId? }`，返回相关推荐。
- `POST /mcp/preview`：体 `{ chunkId, tenantId?, libraryId? }`，返回 chunk 内容预览。

### 5) 模型配置与本地模型管理
- `GET /model-settings/list?tenantId&libraryId`：列出当前库全部模型配置，字段含 `hasApiKey`、`apiKeyPreview`。
- `GET /model-settings?tenantId&libraryId&modelRole`：获取单一 role（默认 `tagging`）。
- `PUT /model-settings`：体为 `ModelSettingInputSchema`（provider `openai|ollama|local`，`baseUrl`，`modelName`，`modelRole`，`apiKey?`，`displayName?`，`options?`）。`modelRole=ocr` 时会立即请求 OCR 服务做连通性校验，失败返回 502/错误信息。返回保存结果（含 `hasApiKey`）。
- `GET /model-settings/catalog`：内置模型清单。
- `POST /model-settings/models`：体 `{ provider, baseUrl, apiKey? }`，返回远端可用模型列表。
- `GET /models`：查看本地模型缓存状态与额外文件。
- `POST /models/install`：体 `{ name | filename }`，下载/解压内置模型包并返回状态。

### 6) 租户与知识库配置
- `GET /config/tenants` / `PUT /config/tenants`：列出或写入租户配置（字段 `tenantId`, `displayName`, `description?`）。`DELETE /config/tenants/{id}` 删除。
- `GET /config/libraries?tenantId` / `PUT /config/libraries`：管理库配置（字段 `libraryId`, `tenantId?`, `displayName`, `description?`）。`DELETE /config/libraries/{id}` 删除。

### 7) 向量日志
- `GET /vector-logs?tenantId&libraryId&docId&chunkId&limit`：返回向量写入日志，字段含 `provider/modelName/driver/status/durationMs/vectorDim/inputChars/ocrUsed/metadata/errorMessage`。

## 典型请求/响应示例

**检索示例请求**
```json
POST /search
Authorization: Bearer <API_TOKEN>
x-tenant-id: tenant-a
x-library-id: kb-legal
{
  "query": "合同解除通知要求",
  "limit": 5,
  "filters": {
    "contentTypes": ["text"],
    "hasAttachments": false,
    "semanticTags": ["合同"],
    "metadataQuery": { "contextSummary": "not null" }
  }
}
```

**检索示例响应（节选）**
```json
{
  "query": "合同解除通知要求",
  "total": 2,
  "results": [
    {
      "score": 0.73,
      "chunk": { "chunkId": "…", "docId": "…", "contentText": "…", "contentType": "text", "semanticTags": ["合同"], "topicLabels": ["合同解除"] },
      "attachments": [],
      "document": { "docId": "…", "title": "XX合同范本", "sourceUri": "tenant-a/…/source.pdf", "tenantId": "tenant-a", "libraryId": "kb-legal" }
    }
  ],
  "semanticRerankApplied": false
}
```

## 错误与重试建议
- `401 Unauthorized`：缺失或错误的 Bearer Token。
- `403 Forbidden`：跨租户访问不匹配（文档/库与请求租户不一致）。
- `404 Not Found`：资源不存在（文档、chunk、模型包等）。
- `207 Multi-Status`：上传部分成功，需逐条查看 `items[].status` 并对失败项重试。
- `501 Not Implemented`：后端未启用对应仓库/功能（如 vectorLogs、listWithStatus）。
- `502`：远端模型/OCR 校验失败，message 会包含上游错误。
- 重试策略：上传/入队操作可按 `docId` 幂等重试（相同文件会新建 docId）；检索类接口读操作可安全重试；写接口在 5xx 时谨慎重试并关注是否已写入部分资源。

## 对接 checklist
- 获取有效的 `API_TOKEN`，设置默认 `tenantId/libraryId`，并在所有请求中显式传递。
- 优先使用 `/upload` 入库，确认响应 `status=queued`；如需自定义 docId/元信息可用 `POST /documents` 后再上传原始文件到对象存储并触发 `/documents/{id}/reindex`（需同一存储层支持）。
- 检查 `model-settings` 中至少配置 `embedding/tagging/metadata/structure`（以及 `ocr` 若需要），否则检索质量/入库能力受限。
- 若需要 Prometheus 监控，直接抓取 `/metrics`；健康探测使用 `/health`。

