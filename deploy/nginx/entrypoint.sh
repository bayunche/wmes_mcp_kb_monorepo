#!/bin/sh
set -e

: "${API_PROXY_TARGET:=http://192.168.0.57:8080/}"
: "${API_BASE:=http://192.168.0.57:8080}"
: "${API_TOKEN:=dev-token}"
: "${PREVIEW_BASE:=}"

# 将模板中的占位符替换为当前环境变量
envsubst '${API_PROXY_TARGET}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# 生成前端运行时配置，供 window.__API_BASE__/__API_TOKEN__ 覆盖
cat >/usr/share/nginx/html/env.js <<EOF
window.__API_BASE__ = '${API_BASE}';
window.__API_TOKEN__ = '${API_TOKEN}';
window.__PREVIEW_BASE__ = '${PREVIEW_BASE}';
EOF

exec nginx -g 'daemon off;'
