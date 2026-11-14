# 登录后端镜像（部署仓专用）。注意：不用原开发仓的 node:22-alpine——
# better-sqlite3 是原生模块，musl/alpine 无预编译产物需现场编译，而 alpine 缺编译工具。
# bookworm-slim（glibc）可直接用官方预编译产物；仍附 python3/make/g++ 兜底，保证一次构建成功。
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN (npm ci --omit=dev || npm install --omit=dev) && npm cache clean --force

COPY server.js auth.js db.js config.js friends.js services.js ./

ENV NODE_ENV=production \
    DATA_DIR=/data
EXPOSE 3001
CMD ["node", "server.js"]
