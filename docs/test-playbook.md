# 全流程测试用例与切分质量验证指引
- 日期：2025-11-29
- 执行者：Codex

面向本地/集成环境的端到端测试剧本，覆盖上传→解析/切分→元数据→向量→检索与日志检查，便于人工和自动化验证。

## 环境准备
- 启动依赖：`make dev`（或等价 compose，确保 db/vectordb/object/queue/kb-api/kb-worker/mcp-server 全部就绪）。
- API 鉴权：导出 `API_TOKEN`（默认 `dev-token`），设置默认租户/库（`DEFAULT_TENANT_ID`, `DEFAULT_LIBRARY_ID`）。
- 工具：`curl`、`bun`。必要时设置 `OPENAI_API_KEY` 等模型变量；若无远端模型，也能走本地元数据兜底。

## 基线样本
- 纯文本：使用自制 `.txt`，内容含标题+两段正文。
- OCR/扫描 PDF：`test_assets/预算定额：第一册建筑工程（上册）(1).pdf`。
- 图片：`assets/samples/demo.png`。

## 用例列表
1) 纯文本上传与检索
   - 上传：`curl -X POST http://localhost:8080/upload -H "Authorization: Bearer $API_TOKEN" -F "file=@/path/to/sample.txt" -F "title=文本样本" -H "x-tenant-id=tenant-a" -H "x-library-id=kb-a"`
   - 预期：响应 `status=queued`；`GET /ingestion/<docId>/status` 最终 `ingestStatus=indexed`。
   - 检查：`GET /documents/<docId>/chunks` 至少 1 条，`semanticMetadata.contextSummary` 非空。
   - 检索：`POST /search` 带查询词命中该文档，返回 `results[].semanticRerankApplied` 视模型配置而定。

2) OCR PDF 兜底
   - 上传扫描件：`curl -X POST http://localhost:8080/upload ... -F "file=@test_assets/预算定额：第一册建筑工程（上册）(1).pdf" -F "title=预算定额OCR"`
   - 预期：`statusMeta.stages` 含 `parsing`→`preprocess`→`chunking` 等，`document.statusMeta.meta.ocrApplied=true`。
   - 检查：`GET /documents/<docId>/chunks`，chunk `entities.ocr=true`，`semanticMetadata.contextSummary` 非空。
   - 日志：若 OCR 失败应有错误日志；否则 `vector-logs` 的 `ocrUsed=true`。

3) 本地图/图文混合（图片向量）
   - 上传 `assets/samples/demo.png`。
   - 预期：`contentType=image` 的 chunk 存在；`embeddings` 记录 `modality=image`；检索时使用 `contentTypes:["image"]` 能返回该条。

4) 元数据模型缺失兜底
   - 不配置 `model_settings` role=metadata，上传任意文本。
   - 预期：chunk 仍有 `semanticMetadata.contextSummary/semanticTags`（来自本地兜底）；`document.tags` 非空。
   - 若 `SEMANTIC_METADATA_LIMIT` 设小于 chunk 数，超限 chunk 也应有本地元数据。

5) 远程标签生成（可选）
   - 配置 `model_settings` role=tagging`provider=openai|ollama`，确保 API Key 可用。
   - 上传短文并查看 `document.tags` 包含远端生成的标签（测试需具备外部网络/模型）。

6) 多租户/库隔离
   - 分别向 `tenant-a/kb-a` 与 `tenant-b/kb-b` 上传不同文件。
   - 检索时仅带各自 Header，确认查询结果只返回对应租户/库的数据。

## 验证命令速查
- 队列进度：`curl -H "Authorization: Bearer $API_TOKEN" "http://localhost:8080/ingestion/queue?tenantId=tenant-a&libraryId=kb-a"`
- 文档状态：`curl -H "Authorization: Bearer $API_TOKEN" http://localhost:8080/ingestion/<docId>/status`
- Chunk/元数据：`curl -H "Authorization: Bearer $API_TOKEN" http://localhost:8080/documents/<docId>/chunks`
- 结构：`curl -H "Authorization: Bearer $API_TOKEN" http://localhost:8080/documents/<docId>/structure`
- 向量日志：`curl -H "Authorization: Bearer $API_TOKEN" "http://localhost:8080/vector-logs?docId=<docId>&limit=50"`
- 搜索示例：`curl -X POST http://localhost:8080/search -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" -d '{"query":"关键字","limit":5,"filters":{"tenantId":"tenant-a","libraryId":"kb-a"}}'`

## 结果判定要点
- `ingestStatus` 最终为 `indexed`；`statusMeta` 包含完整阶段。
- 每个 chunk 具备 `semanticMetadata.contextSummary/semanticTags`，即使缺模型配置。
- OCR 测试的 chunk 应带 `entities.ocr=true`，向量日志 `ocrUsed=true`。
- 搜索返回的 `results[].attachments` 与 `contentType` 符合过滤条件。
- 多租户测试中，交叉 Header 不应返回他库数据。

## 失败排查提示
- `401`：检查 `API_TOKEN`；`403`：租户/库不匹配。
- `501`：对应仓库/功能未启用（如 vectorLogs/listWithStatus）。
- 元数据仍为空：确认是否使用本分支；检查日志中是否存在本地兜底提示；若 chunk 文本为空，需先排查解析/OCR。
- OCR 未触发：检查上传 MIME（应含 pdf），或文件名扩展；查看日志中 `OCR skipped`/`OCR fallback`。

