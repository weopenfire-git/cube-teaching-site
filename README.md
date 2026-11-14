# cube 教学站（魔方七课 + 个人练习 + 登录/成就）· 部署仓

与「航迹 WingTrace」同机并行部署，完全隔离。

| 项 | 值 |
| :--- | :--- |
| 服务器 | 腾讯云轻量 43.155.178.13（首尔） |
| 服务器目录 | `/opt/cube-deploy`（**勿与 `/opt/wingtrace-deploy` 混淆**） |
| 对外端口 | **8081**（航迹占 8080；宿主 80 被其它服务占用，未动） |
| 容器 | `cube-web`（nginx 静态 + 同源反代）/ `cube-auth`（Node 登录后端，端口不对公网） |
| 数据卷 | `cube-auth-data`（SQLite，`docker compose down` 不带 `-v` 不会删） |
| 仓库 | https://github.com/weopenfire-git/cube-teaching-site |

## 结构

```
site/        页面静态文件（index.html + cube-*.js + authClient.js）——由 cube-prototype/sync-deploy.cjs 生成，勿手改
auth/        登录后端（Express + better-sqlite3，复制自 网站登陆功能/，Dockerfile 换 bookworm-slim）
nginx.conf   本站专用安全头 + /api/ 同源反代（不抄航迹 CSP）
docker-compose.yml
```

## 服务器操作（OrcaTerm 粘贴）

首次部署：

```bash
sudo mkdir -p /opt/cube-deploy && sudo chown ubuntu:ubuntu /opt/cube-deploy
cd /opt/cube-deploy && git clone https://github.com/weopenfire-git/cube-teaching-site.git .
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env && echo "DEV_MODE=true" >> .env && chmod 600 .env
sudo docker compose up -d --build
curl -s http://127.0.0.1:8081/healthz && echo && curl -sI http://127.0.0.1:8081/ | head -n 3
```

然后到 腾讯云轻量控制台 → 实例 → 「防火墙」页签 → 添加规则：自定义 / TCP / 8081 / 0.0.0.0/0 / 允许。

后续更新版本：

```bash
cd /opt/cube-deploy && git pull && sudo docker compose up -d --build
```

回滚：`sudo docker compose down && cd /opt/cube-deploy && git checkout <旧commit> && sudo docker compose up -d --build`
（`down` 只作用于本项目目录，不会影响航迹容器。）

## 验收

1. `curl -s http://127.0.0.1:8081/healthz` 返回 `{"ok":true,...}`
2. 公网浏览器打开 `http://43.155.178.13:8081/` 魔方页面正常
3. 注册/登录/成就走通（页面右下「成就与进度」→ 保存进度 → 注册）
4. `http://43.155.178.13:8080/` 航迹仍 200

## 已知限制（内测态）

- **HTTP 明文**：登录密码走明文传输，仅适合内测；正式对外前必须绑域名 + HTTPS（首尔免备案）。
- `DEV_MODE=true`：验证码在接口响应里直接返回、微信走模拟扫码；接真实短信/邮件后改 `false` 并配 `.env` 的 SMTP/SMS 段。
- 数据备份：`sudo docker run --rm -v cube-deploy_cube-auth-data:/data -v $(pwd):/b alpine tar czf /b/auth-db-$(date +%F).tgz -C /data .`
