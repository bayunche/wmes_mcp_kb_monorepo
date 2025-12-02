#!/bin/sh
set -e

: "${API_PROXY_TARGET:=http://kb-api:8080/}"

# 将模板中的占位符替换为当前环境变量
envsubst '${API_PROXY_TARGET}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
