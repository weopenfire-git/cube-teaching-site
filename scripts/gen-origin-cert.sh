#!/usr/bin/env bash
# 生成源站自签证书，供 Cloudflare "Full" 加密模式回源到 443 使用。
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
echo "origin cert generated: ssl/origin.crt (10y self-signed, Cloudflare Full mode)"
