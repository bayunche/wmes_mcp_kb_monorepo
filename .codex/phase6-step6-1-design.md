# Phase 6 — Step 6.1 设计方案（2025-11-11，执行者：Codex）

> 目标：将 `apps/worker` 的占位 pipeline 升级为可以处理真实多模态文档（文本/表格/图片）的解析、切块、嵌入与入库流程，并与 packages/data（Postgres/Qdrant/MinIO/RabbitMQ）彻底打通。

## 1. 输入 / 输出契约

| 项 | 说明 |
| --- | --- |
| 输入 | API 写入 `documents` 表（含 `docId/mimeType/tenantId/sourceUri`）并在 MinIO `kb-raw/{tenant}/{docId}` 上传原始文件（Step 6.2 将提供上传接口，Step 6.1 先支持 worker 端读取）。 |
| 输出 | `KnowledgeBundle`（Document 更新 ingestStatus=indexed，Chunk/Embedding/Attachment 写入 Postgres + Qdrant），以及 MinIO `kb-preview` 中的附件（切图/表格截图/图片 caption）。 |
| 依赖 | Postgres + Qdrant + MinIO + MODELS_DIR（bge/CLIP/OCR）+ 可选 `UNSTRUCTURED_API_URL`（或本地 CLI）。 |

## 2. Pipeline 阶段

1. **fetchSource**  
   - 通过 `DocumentRepository` 查询 doc metadata；  
   - 使用新的 `MinioStorageClient.getObject` 下载 `source.bin`；  
   - 输出 `SourcePayload`（Buffer、mime、filename、tenantId、Doc 元数据）。

2. **parseDocument**  
   - 新增 `DocumentParser` 接口：`parse(buffer, mimeType)` → `ParsedElement[]`；  
   - 默认实现 `UnstructuredParser`：如配置 `UNSTRUCTURED_API_URL` 调用 HTTP API（multipart 上传），否则 fallback 至 `BasicTextParser`（pdf/text/docx 使用 `pdf-parse`/`textract-lite`，xlsx 使用 `xlsx`，pptx 使用 `jszip+xml2js`，图片使用 `tesseract.js` 获取 caption）。  
   - `ParsedElement` 标准字段：`type`（text/table/image/caption）、`text`, `page`, `bbox`, `hierarchy`, `metadata`（slide/table name 等）。

3. **chunkDocument**  
   - 将 `ParsedElement` 聚合为 `Chunk`：  
     - 文本：按章节/段落拆分（支持基于 `hierarchy` 的路径）；  
     - 表格：将二维数组序列化为 Markdown + 附件 preview（CSV/PNG）；  
     - 图片：保留 caption + objectKey。  
   - 新增 `ChunkFactory`，负责生成 `Chunk` + 需要写入 MinIO 的附件集合。

4. **extractMetadata**  
   - 规则：  
     - `hierPath`：来自 parser 的层级或推导自 heading；  
     - `topicLabels`：基于 heading/slide title/table caption；  
     - `qualityScore`：简易启发式（文本长度、OCR 置信度）。  
   - 生成 `Attachment`（图片预览/表格截图）的 metadata，并写入 MinIO `kb-preview`。

5. **embedChunks**  
   - 文本：使用 `VectorClient.embedText`（在 config 中新增 `TEXT_EMBEDDING_ENDPOINT`，fallback 时使用 MODELS_DIR + `onnxruntime-node` 加载 bge-m3；如模型缺失再回退 deterministicVector，并记录 WARN）。  
   - 表格：走文本嵌入（table markdown）；  
   - 图片：实现 `VectorClient.embedImage`，利用 OpenCLIP ONNX（同 MODELS_DIR）或远程 endpoint；如不可用，至少生成 deterministic embedding 并记日志；  
   - 输出 `(chunk, embedding?)[]`，embedding 中写入 `modelName`、`modality`。

## 3. 存储与命名规范

| 类型 | MinIO Key | 说明 |
| --- | --- | --- |
| 原始文件 | `kb-raw/{tenant}/{docId}/source.bin` | API 上传时写入（Step 6.2 实现）；Worker 读取。 |
| 表格预览 | `kb-preview/{tenant}/{docId}/tables/{chunkId}.json`（结构数据）+ 可选 `.png` | JSON 版供治理/预览；png 由后续 Step 6.2 UI 消费。 |
| 图片附件 | `kb-preview/{tenant}/{docId}/images/{chunkId}.png` | OCR caption + CLIP embedding 来源。 |

`KnowledgeBundle.attachments` 对应上述对象 key，并记录 `assetType`/`mimeType`/`pageNo`/`bbox`。

## 4. 代码改动清单

1. **packages/data**
   - `MinioStorageClient`: 添加 `getObject(objectKey)`, `getSignedUrl`, `listObjects`。
   - 导出 storage 创建函数供 Worker 使用。

2. **packages/core（新增子模块）**
   - `parsing/elements.ts`: 定义 `ParsedElement`、`ElementType`、`ChunkFactory` 协议。  
   - `parsing/unstructured.ts`: HTTP 客户端 + fallback JSON schema。  
   - `parsing/text.ts`: 基本 PDF/TXT/Docx parser（pdf-parse + mammoth/textract-lite）。  
   - `embeddings/onnx.ts`: 封装 `onnxruntime-node` 加载 MODELS_DIR（bge/clip）。  
   - `chunking/hierarchy.ts`: 根据 heading/slide/worksheet 推导层级路径与 topic labels。

3. **apps/worker**
   - 扩展 `WorkerDependencies`：新增 `documents`, `storage`, `parser`, `chunkFactory`, `attachmentWriter`, `embeddingOrchestrator`。  
   - 在 `startWorker` 中注入 packages/data documents + 新建 MinIO 客户端 + parser。  
   - 重写 `defaultWorkerStages`：  
     ```ts
     fetchSource -> 从 storage 下载原始文件（Buffer）并拼装 Document metadata  
     parseDocument -> parser.parse(buffer, mimeType) => ParsedElement[]  
     chunkDocument -> chunkFactory.build(doc, elements) => { chunks, attachments }  
     extractMetadata -> enrich with hierPath/topicLabels/qualityScore  
     embedChunks -> embeddingOrchestrator.process(chunks)
     ```
   - 增加错误处理：若 parser/embedding 失败，写入 `document.ingest_status=failed` 并记录 metrics。

4. **配置**
   - `packages/core/src/config.ts`: 增加 `UNSTRUCTURED_API_URL`, `UNSTRUCTURED_API_KEY`, `TEXT_EMBEDDING_ENDPOINT`, `IMAGE_EMBEDDING_ENDPOINT`, `VECTOR_FALLBACK_DIM` 等；更新 `.env.example`。  
   - README/docs 补充新的环境变量与运行要求（需 Python/Unstructured or ONNX Runtime）。

5. **依赖**
   - `package.json` / relevant workspaces：新增 `pdf-parse`, `mammoth`, `xlsx`, `jszip`, `xml2js`, `tesseract.js`, `onnxruntime-node`, `node-fetch` polyfills（Bun 自带 fetch），并在 `bunfig` 中允许 native module。  
   - 若外部依赖无法安装，保留 graceful fallback（记录日志+将 chunk 标记为 `contentType=text`）。

## 5. 验证策略

1. **单元测试**
   - `packages/core/parsing/__tests__`: 针对 PDF/TXT/PPTX/XLSX 样例生成 `ParsedElement[]` 并断言层级/页码。  
   - `apps/worker/src/__tests__/pipeline.real.test.ts`: 使用内存 storage + fixture Buffer，验证 end-to-end chunk/embedding 结果。

2. **集成测试**
   - 伪造 MinIO/Document repo stub + VectorClient deterministic 模式，运行 `processIngestionTask`，确认 `KnowledgeBundle` 写入 Postgres/Qdrant stub。  
   - 记录 metrics（`kb_ingestion_total`、`kb_ingestion_errors_total`）。

3. **验收/演示**
   - 在 `.codex/testing.md` 记录使用示例文档（assets/samples/phase6/*.pdf）运行 `bun run apps/worker/src/main.ts` + `SEED_DEMO_TASK=true` 的步骤与输出。  
   - operations-log 记录一次成功 ingestion 的日志 ID，便于 Step 6.4 引用。

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| Bun 环境下某些解析/ONNX 库无法构建 | Worker 无法启动 | 优先使用纯 JS 实现；ONNX runtime 放在可选路径（存在时使用本地模型，否则走 HTTP endpoint/fallback）。 |
| Unstructured API 不可用 | 无法解析 PDF/PPTX/XLSX | 保留 Basic parser fallback（对 PDF/TXT 使用 pdf-parse/mammoth，对 XLSX 使用 `xlsx` 包，将内容以 Markdown 形式输出）；提示日志需启用强解析器。 |
| 图像/表格预览生成依赖外部工具（libreoffice/pdftoppm） | 无法产出附件 | 首阶段仅生成 JSON/文字描述与 object key 占位，Step 6.2 可迭代图像渲染。 |
| 模型体积过大（>1GB）影响仓库 | 无法提交 | 模型通过 `ops/scripts/sync-models.ts` 下载到 MODELS_DIR（gitignore），代码仅引用路径。 |

## 7. 下一步

1. 扩展 packages/data MinIO 客户端与配置。  
2. 落地解析/切块/嵌入模块骨架与接口。  
3. 重写 Worker pipeline + tests。  
4. 记录一次实际运行输出到 `.codex/testing.md` 与 `operations-log.md`。  
5. 为 Step 6.2 的 API/MCP 扩展保留接口（例如返回 attachment objectKey 与预览 URI）。

