| 2025-11-29T02:35:00+08:00 | apply_patch | apps/web/src/pages/ModelSettingsPage.tsx | 隐藏不支持本地的角色切换，新增远程配置操作指引文案。 |
| 2025-11-29T02:45:00+08:00 | apply_patch | deploy/nginx/nginx.conf | 将 proxy_pass 改为 API_PROXY_TARGET 占位，便于运行时覆盖后端地址。 |
| 2025-11-29T02:46:00+08:00 | apply_patch | deploy/nginx/entrypoint.sh | 新增 entrypoint envsubst 模板生成 default.conf，支持 API_PROXY_TARGET 环境变量。 |
| 2025-11-29T02:47:00+08:00 | apply_patch | deploy/docker/Dockerfile.web | web 镜像增加 nginx 模板+entrypoint，默认 API_PROXY_TARGET=http://kb-api:8080/，容器启动时生成配置。 |
| 2025-11-29T03:00:00+08:00 | apply_patch | apps/web/src/api.ts | API_BASE 支持运行时 __API_BASE__ 注入，默认回退 /api，便于容器/反向代理统一兼容。 |
| 2025-11-29T03:40:00+08:00 | add_file | apps/web/public/env.js | 提供默认 env.js，避免 404 返回 HTML 触发 SyntaxError，内容可被 Docker 入口覆盖。 |
