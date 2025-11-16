# Web Console 功能说明

> 该前端用于验证上传/检索/MCP 流程，后续新特性会在此文件记录。

## ✅ 已实现
- **Multipart 上传**：`UploadForm` 调用 `/upload`，写入 MinIO 并触发 Worker 入栈。
- **检索 + MCP 预览**：`SearchPanel` 使用 `/search` 与 `/mcp/preview`，展示附件与 `sourceUri`。
- **MCP Related**：同一面板可调用 `/mcp/related`，列出邻居 chunk。
- **治理能力**：`MetadataEditor`（治理面板）可查看 `/stats` 统计、更新 tags、删除文档、触发重索引。
- **附件复制**：附件列表提供“复制对象键”按钮，便于定位 MinIO 对象。

## ⚠️ 待完善
1. **MCP Search 视图**：当前 UI 仍直接调用 REST `/search`，未展示 `/mcp/search` 的 rerank 结果。
2. **附件下载/预览**：仅展示 object key，尚未集成签名 URL 或原生图片/表格预览。
3. **监控/日志**：缺少 `/metrics` 图表或队列/处理耗时等指标卡片。

## 🧭 下一步建议
- 增加 MCP Search 结果对比，方便测试向量 rerank 表现。
- 根据 MinIO bucket 策略提供下载/预览按钮（可结合签名接口或公共 bucket）。
- 引入指标卡片或嵌入 `/metrics`，同时显示最近操作日志，提升运维体验。

本文件会随着前端能力变更而更新，便于追踪剩余差异。
