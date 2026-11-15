# cube 教学站（魔方七课 + 个人练习 + 登录/成就）部署仓

与「航迹 WingTrace」同机并行部署，完全隔离。

| 项 | 值 |
| :--- | :--- |
| 服务器 | 腾讯云轻量 43.155.178.13（首尔） |
| 服务器目录 | `/opt/cube-deploy`（**勿与 `/opt/wingtrace-deploy` 混淆**） |
| 对外端口 | **8081**（IP 直连）/ **443**（域名 HTTPS，Cloudflare 回源）；航迹占宿主 80 与 8080，本站不监听宿主 80 |
| 主域 | `qingjiansmart.com`（腾讯云，2026-11-15 个人实名购买；公司实名通过后需过户） |
| 容器 | `cube-web`（nginx 静态 + 同源反代）/ `cube-auth`（Node 登录后端，端口不对公网） |
| 数据卷 | `cube-auth-data`（SQLite，`docker compose down` 不带 `-v` 不会删） |
| 仓库 | https://github.com/weopenfire-git/cube-teaching-site |

## 结构

```
site/        页面静态文件（index.html + cube-*.js + authClient.js）——由 cube-prototype/sync-deploy.cjs 生成，勿手改
auth/        登录后端（Express + better-sqlite3，复制自 网站登陆功能/，Dockerfile 换 bookworm-slim）
portal/      公司主页（纯静态 index.html，nginx 443 根域 server 挂载）
scripts/     backup.sh 每日备份 SQLite 卷并推 GitHub 私有仓；gen-origin-cert.sh 生成源站自签证书
ssl/         证书与私钥（脚本生成，.gitignore 排除，绝不进仓）
nginx.conf   三个 server：容器 80（IP 直连）、443 根域（portal）、443 cube 子域（site + /api 反代）
docker-compose.yml
```

## 域名与 HTTPS（Cloudflare 回源方案）

服务器在首尔，无需 ICP 备案。宿主 80 已被航迹占用，因此**不监听宿主 80、不改航迹 nginx**，改由 Cloudflare 边缘终结 80/443 后回源到宿主 443（实测 443 空闲）。

```
访客 --HTTPS--> Cloudflare 边缘（免费证书 + HTTP 自动跳 HTTPS）
      --HTTPS 443--> cube-web nginx --按 server_name 分流--> portal/ 或 site/
                                  --同源 /api/--> cube-auth:3001
```

**Cloudflare 控制台（外部动作）**

1. Add a Site → `qingjiansmart.com` → Free 计划，按提示把腾讯云的 NS 改成 Cloudflare 给的两条
2. DNS 记录（全部**橙云 Proxied**）：

   | 类型 | 名称 | 值 |
   | :--- | :--- | :--- |
   | A | `@` | 43.155.178.13 |
   | A | `cube` | 43.155.178.13 |
   | CNAME | `www` | qingjiansmart.com |

   不要加 `windborne`（在 Cloudflare Workers 上独立运行）或 `auth`（后端走 cube 子域同源反代，不单独暴露）
3. SSL/TLS → Overview → 加密模式设 **Full**（源站是自签证书，**不能选 Full strict**，否则 526）
4. SSL/TLS → Edge Certificates → 打开 **Always Use HTTPS**
5. 腾讯云轻量控制台 → 实例 → 防火墙 → 添加规则：自定义 / TCP / **443** / 允许（已有 8081 规则保留）

**服务器（OrcaTerm，先让源站就绪再切 NS）**

```bash
cd /opt/cube-deploy && git pull && sudo bash scripts/gen-origin-cert.sh && sudo docker compose up -d && sudo docker ps --filter name=cube-web --format '{{.Status}}'
```

证书是本机生成的 10 年期自签证书，Cloudflare Full 模式接受；访客看到的是 Cloudflare 签发的正规证书，不会出现自签警告。想升级到 Full (strict)，在 CF 生成 Origin CA 证书替换 `ssl/origin.crt` 与 `ssl/origin.key` 即可。

**主页配置**：等 `https://qingjiansmart.com` 和 `https://cube.qingjiansmart.com` 都验收通过，再把 `portal/index.html` 顶部 `SITE.domain` 填成 `'qingjiansmart.com'`，卡片链接自动切到子域名。现在留空，卡片指向实际可用的 IP 地址。

## 服务器操作（OrcaTerm 粘贴）

首次部署：

```bash
sudo mkdir -p /opt/cube-deploy && sudo chown ubuntu:ubuntu /opt/cube-deploy
cd /opt/cube-deploy && git clone https://github.com/weopenfire-git/cube-teaching-site.git .
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env && echo "DEV_MODE=true" >> .env && chmod 600 .env
sudo bash scripts/gen-origin-cert.sh
sudo docker compose up -d --build
curl -s http://127.0.0.1:8081/healthz && echo && curl -sI http://127.0.0.1:8081/ | head -n 3
```

> `gen-origin-cert.sh` **必须**在 `up` 之前跑，否则 nginx 找不到证书会启动失败（幂等，重复跑会跳过）。

然后到腾讯云轻量控制台 → 实例 → 防火墙 → 添加规则：自定义 / TCP / 8081 / 允许（域名 HTTPS 另需 443）。

后续更新版本：

```bash
cd /opt/cube-deploy && git pull && sudo bash scripts/gen-origin-cert.sh && sudo docker compose up -d --build
```

回滚：`sudo docker compose down && cd /opt/cube-deploy && git checkout <旧commit> && sudo docker compose up -d --build`
（`down` 只作用于本项目目录，不会影响航迹容器。）

## 验收

1. `curl -s http://127.0.0.1:8081/healthz` 返回 `{"ok":true,...}`
2. 公网浏览器打开 `http://43.155.178.13:8081/` 魔方页面正常
3. 域名生效后 `https://cube.qingjiansmart.com/` 魔方页、`https://qingjiansmart.com/` 公司主页都正常，且地址栏有锁
4. 注册/登录/成就走通（右栏「成就与进度」→ 保存进度 → 注册）
5. `http://43.155.178.13:8080/` 航迹仍 200

## 已知限制（内测态）

- `http://43.155.178.13:8081/` 这个 IP 直连入口仍是 HTTP 明文；域名 HTTPS 通道已加密，正式分享请只用域名链接
- `DEV_MODE=true`：验证码在接口响应里直接返回、微信走模拟扫码；接真实短信/邮件后改 `false` 并配 `.env` 的 SMTP/SMS 段
- 数据备份：`scripts/backup.sh` 已自动化（本地保留 90 天 + 自动推 GitHub 私有仓 `cube-backups`），手动备份 `sudo /bin/bash /opt/cube-deploy/scripts/backup.sh`；定时任务 `30 3 * * *`。纯手工兜底：`sudo docker run --rm -v cube-deploy_cube-auth-data:/data -v $(pwd):/b alpine tar czf /b/auth-db-$(date +%F).tgz -C /data .`
