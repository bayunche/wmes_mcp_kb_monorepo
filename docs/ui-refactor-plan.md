# 前端重构计划（玻璃拟态 + 清晰流程）

> 目标：提供现代化、低认知、流程导向的控制台体验，采用玻璃拟态 UI，用户按引导即可完成上传→处理→检索，以及模型配置与验证。

## 1. 信息架构与分层
- **API 层**：`src/api/{documents,search,mcp,models,tenants,libraries}.ts` + `client.ts`（统一 fetch、错误/超时、类型）。
- **状态层**：Query/自研 hooks（`useDocuments`、`useSearch`、`useModelSettings` 等），包含 loading/error/empty、乐观更新与 toast。
- **视图层**：
  - `components/ui`: GlassCard、Button、Input、Select、Badge、Skeleton、Toast、Layout。
  - `components/blocks`: UploaderPanel、SearchPanel、ModelSettingsForm、VectorLogPanel、FlowGuide、StatusBar。
  - `pages`: Upload/Documents、Search、MCP 测试、Model Settings、Monitoring（队列+向量日志）、Diagnostics。
- **样式体系**：CSS 变量（色板/阴影/模糊/圆角/间距）、全局玻璃背景、动效（淡入/缩放/悬停微动）。

## 2. 关键体验设计
- **流程导向**：顶部/侧边流程导航 + 步骤完成状态。
- **模型配置（核心痛点）**：
  - 角色卡（切分/元数据/标签/embedding/rerank/OCR）。
  - 本地分支（embedding/rerank/OCR）：扫描 `MODELS_DIR/<role>/` → 下拉选择 → 自动填充 `provider=local`、`baseUrl=local://...`，隐藏 BaseURL/Key。
  - 远程分支（openai/ollama）：提供方→BaseURL→API Key→自动拉取模型列表→下拉选择→“验证”状态提示。
  - 已保存列表右侧表格，可一键加载到表单。
- **上传页**：拖拽/点击上传卡片 + 任务进度表 + 快捷跳转检索/配置。
- **检索页**：大搜索框 + 过滤器（库/标签/类型/结构路径），结果卡含摘要/标签/结构路径/附件缩略，右侧预览。
- **MCP 测试**：请求编辑 + 响应卡 + 日志/耗时。
- **监控**：任务进度、错误日志、向量日志表格，按时间/状态过滤。
- **反馈**：所有操作有 loading、错误 inline + toast、成功轻量提示；空态提供下一步指引。

## 3. 视觉规范（苹果式玻璃）
- 背景：柔和渐变 + 噪点纹理；卡片：半透明白 + blur(20px) + 1px 半透明描边 + 轻阴影；圆角 ≥ 16px。
- 字体：SF Pro/苹方栈，标题 20–24px 半粗，正文 14–16px。
- 颜色：主色蓝紫 (#5b7bff 可调)，辅色青灰；状态色：success #22c55e / warning #f59e0b / danger #ef4444。
- 动效：悬停轻微放大/亮度，卡片/表单淡入，按钮/加载用线性进度/骨架。

## 4. 交互规范
- 表单字段分组，必填/可选标识，错误就地提示，提交按钮显示状态。
- 拉取/验证按钮：显示 “正在拉取…”、“已获取 X 条” 或错误文案。
- 列表空态：展示说明 + CTA（去上传/去配置）。
- 预览层：毛玻璃浮层，右侧滑入。

## 5. 渐进实施步骤
1) **设计系统落地**：全局 CSS 变量/背景/GlassCard/Buttons/Inputs/Badge/Skeleton/Toast。
2) **模型配置页重构**：角色卡 + 本地/远程分支 + 自动拉取/验证 + 保存/加载列表。
3) **上传/检索页迁移**：使用新组件与布局，加入空态/加载态/错误态。
4) **MCP/监控页迁移**：统一表格/日志视图，增加过滤与状态提示。
5) **回归与细节**：动效、响应式、辅助文本、可访问性（tab/focus）。

## 6. 里程碑与交付
- M1：设计系统 + 模型配置页完成（含自动验证、本地扫描）。
- M2：上传/检索页迁移，流程导航完善。
- M3：MCP/监控页迁移，完整测试与文档更新。
