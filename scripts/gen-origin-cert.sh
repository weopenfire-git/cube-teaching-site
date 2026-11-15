#!/usr/bin/env bash
# 生成源站证书，供宿主 nginx 监听 443 使用（host-nginx/qingjian.conf 引用）。
# 默认自签 10 年期，Cloudflare "Full" 橙云阶段可接受；
# 改灰云直连前必须把 ssl/origin.crt|key 换成正式 CA 证书（见 README 与交接说明）。
# 只在服务器本机执行；私钥留在 ssl/，该目录已被 .gitignore 排除，绝不进 git。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p ssl

if [[ -s ssl/origin.crt && -s ssl/origin.key ]]; then
  echo "origin cert already exists, skipped"
  exit 0
fi

openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout ssl/origin.key \
  -out ssl/origin.crt \
  -subj "/CN=qingjiansmart.com" \
  -addext "subjectAltName=DNS:qingjiansmart.com,DNS:*.qingjiansmart.com" \
  >/dev/null 2>&1

chmod 600 ssl/origin.key
chmod 644 ssl/origin.crt
echo "origin cert generated: ssl/origin.crt (10y self-signed; for host nginx 443, Cloudflare Full mode)"
