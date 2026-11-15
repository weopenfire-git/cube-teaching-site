# cube 教学站（魔方七课 + 个人练习 + 登录/成就）部署仓

与「航迹 WingTrace」同机运行。域名流量由**宿主 nginx 统一入口按 `server_name` 分流**，容器侧保持独立目录、独立容器名、独立数据卷，互不干扰。

| 项 | 值 |
| :--- | :--- |
| 服务器 | 腾讯云轻量 43.155.178.13（首尔，境外地域，免 ICP 备案） |
| 服务器目录 | `/opt/cube-deploy`（**勿与 `/opt/wingtrace-deploy` 混淆**） |
| 域名入口 | 宿主 nginx 80 / 443；`qingjiansmart.com` + `www` → 公司主页，`cube.qingjiansmart.com` → 魔方站 |
| 直连入口 | `http://43.155.178.13:8081/`（容器 80，供宿主反代与老链接共用） |
| 主域 | `qingjiansmart.com`（腾讯云，2026-11-15 个人实名购买；公司实名通过后需过户） |
| 容器 | `cube-web`（nginx 静态 + `/api` 同源反代）/ `cube-auth`（Node 登录后端，无宿主端口映射） |
| 数据卷 | `cube-auth-data`（SQLite，`docker compose down` 不带 `-v` 不会删） |
| 仓库 | https://github.com/weopenfire-git/cube-teaching-site |
| 架构版本 | **v2.0 宿主 nginx 统一入口**（替代旧的「容器 443 + Cloudflare 绕 80」方案） |

## 结构

```
site/        页面静态文件（index.html + cube-*.js + authClient.js）——由 cube-prototype/sync-deploy.cjs 生成，勿手改
auth/        登录后端（Express + better-sqlite3，复制自 网站登陆功能/，Dockerfile 换 bookworm-slim）
portal/      公司主页（纯静态，由宿主 nginx 直接 root 托管，不经过容器）
host-nginx/  qingjian.conf —— 宿主 nginx 分流配置，安装到 /etc/nginx/conf.d/
scripts/     backup.sh 每日备份 SQLite 卷并推 GitHub 私有仓；gen-origin-cert.sh 生成源站证书
ssl/         证书与私钥（脚本生成，.gitignore 排除，绝不进仓）
nginx.conf   容器内 nginx：单个 80 server（site 静态 + /healthz + /api 反代）
docker-compose.yml       仅 8081:80，容器不占宿主 443
宿主nginx统一入口改造-交接说明.md  可直接转交宿主 nginx / 航迹侧的说明（自包含）
```

## 架构（v2.0）

```
访客 ── 可选 Cloudflare（橙云代理 / 或灰云纯 DNS）──► 宿主 nginx 80/443
                                                      ├─ 根域 / www  → /opt/cube-deploy/portal（直接静态）
                                                      ├─ cube 子域   → 127.0.0.1:8081 → cube-web 容器
                                                      │                                 └─ /api/ → cube-auth:3001
                                                      ├─ 未知 Host:443 → 444 拒绝
                                                      └─ 80 既有 default_server（航迹侧）保持不动
```

分流与 TLS 都在宿主 nginx 完成，容器只做应用服务。宿主侧是**纯增量**：不改任何既有 server 块，只新增 `conf.d/qingjian.conf`，nginx 按 Host 精确匹配优先于 default_server，航迹侧零改动。

**Cloudflare 不再是必经通道**，只是可选的 DNS / 边缘代理。橙云阶段用 **Full** 模式（源站自签证书，不能选 Full strict）；想灰云直连，先把 `ssl/origin.crt|key` 换成正式 CA 证书，再把 DNS 改 DNS only。首尔地域免备案，直连的门槛是证书不是备案；只有将来迁回大陆地域才需要企业 ICP 备案（且域名持有人须先过户到公司）。

> 旧方案（容器映射 443、容器内按 server_name 分流、靠 CF 绕开宿主 80）已废弃。**不要执行旧版那条 HTTPS 上线命令**；443 实测仍空闲，直接按 v2.0 一次切到最终形态。

## 服务器操作（OrcaTerm 粘贴）

首次部署（宿主 nginx 侧前提：80 是系统 nginx、443 空闲，见交接说明第 4.0 节体检）：

```bash
sudo mkdir -p /opt/cube-deploy && sudo chown ubuntu:ubuntu /opt/cube-deploy
cd /opt/cube-deploy && git clone https://github.com/weopenfire-git/cube-teaching-site.git .
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env && echo "DEV_MODE=true" >> .env && chmod 600 .env
sudo bash scripts/gen-origin-cert.sh
sudo docker compose up -d --build
curl -s http://127.0.0.1:8081/healthz && echo && curl -sI http://127.0.0.1:8081/ | head -n 3
```

> `gen-origin-cert.sh` 生成 `ssl/origin.crt|key`，宿主 nginx 的 `qingjian.conf` 引用它们。必须先跑，否则 `nginx -t` 会因找不到证书失败。幂等，重复跑会跳过。

安装宿主 nginx 分流（**先备份，先重建容器释放 443，再 reload**）：

```bash
cd /opt/cube-deploy && git pull && sudo bash scripts/gen-origin-cert.sh && sudo cp -a /etc/nginx /etc/nginx.bak-$(date +%F-%H%M%S) && sudo docker compose up -d && sudo cp host-nginx/qingjian.conf /etc/nginx/conf.d/qingjian.conf && sudo nginx -t && sudo systemctl reload nginx
```

腾讯云轻量控制台 → 实例 → 防火墙 → 放行 TCP **443**（8081 规则保留）。

后续更新版本：

```bash
cd /opt/cube-deploy && git pull && sudo docker compose up -d --build
```

若 `host-nginx/qingjian.conf` 也改了，追加 `sudo cp host-nginx/qingjian.conf /etc/nginx/conf.d/qingjian.conf && sudo nginx -t && sudo systemctl reload nginx`。`site/` 与 `portal/` 是 bind mount，`git pull` 即生效，无需重建容器。

**Cloudflare 控制台（外部动作，DNS 最后切）**：Add a Site → Free → 改 NS → 三条记录（橙云）`A @ → 43.155.178.13`、`A cube → 43.155.178.13`、`CNAME www → qingjiansmart.com` → SSL/TLS 设 **Full**。不要加 `windborne`（Workers 独立）或 `auth`（走 cube 子域同源反代）。

**主页配置**：等 `https://qingjiansmart.com` 与 `https://cube.qingjiansmart.com` 都验收通过，再把 `portal/index.html` 顶部 `SITE.domain` 填成 `'qingjiansmart.com'`，卡片链接自动切到子域名。现在留空，卡片指向实际可用的地址。

## 验收

| # | 检查 | 期望 |
| :--- | :--- | :--- |
| 1 | `sudo nginx -t` | `test is successful` |
| 2 | `sudo ss -lntp \| grep ':443'` | 宿主 nginx 监听（非 docker-proxy） |
| 3 | `curl -s http://127.0.0.1:8081/healthz` | `{"ok":true,...}` |
| 4 | `curl -skI --resolve qingjiansmart.com:443:127.0.0.1 https://qingjiansmart.com/ \| head -n 8` | 200 公司主页（`-k` 因自签证书，DNS 未切也能验） |
| 5 | `curl -sk --resolve cube.qingjiansmart.com:443:127.0.0.1 https://cube.qingjiansmart.com/healthz` | `{"ok":true,...}` |
| 6 | `curl -sI http://127.0.0.1:8080/ \| head -n 3` | 航迹仍 200 |
| 7 | 公网浏览器打开两个域名 | 页面正常、有锁、http 自动跳 https |
| 8 | 注册 / 登录 / 成就 / 成绩卡 | 走通，`/api/` 无 CORS 报错 |

## 回滚

顺序不能反（宿主 nginx 占着 443 时旧版容器起不来）：

```bash
sudo rm /etc/nginx/conf.d/qingjian.conf && sudo nginx -t && sudo systemctl reload nginx
cd /opt/cube-deploy && git checkout <旧commit> && sudo docker compose up -d
```

`/etc/nginx.bak-<日期>` 可整体还原。`docker compose down` 只作用于本目录，不影响航迹；**永远不要带 `-v`**。

## 已知限制（内测态）

- `http://43.155.178.13:8081/` 仍是 HTTP 明文直连入口；正式分享只用域名链接
- 源站是自签证书，只在 Cloudflare 橙云 Full 模式下无告警；**改灰云直连前必须换正式 CA 证书**
- 暂不启用 HSTS（不可逆），等正式证书 + 直连稳定后再评估
- `DEV_MODE=true`：验证码在接口响应里直接返回、微信走模拟扫码；接真实短信/邮件后改 `false` 并配 `.env` 的 SMTP/SMS 段
- 数据备份：`scripts/backup.sh` 已自动化（本地保留 90 天 + 自动推 GitHub 私有仓 `cube-backups`），手动备份 `sudo /bin/bash /opt/cube-deploy/scripts/backup.sh`；定时任务 `30 3 * * *`。纯手工兜底：`sudo docker run --rm -v cube-deploy_cube-auth-data:/data -v $(pwd):/b alpine tar czf /b/auth-db-$(date +%F).tgz -C /data .`

## 侧边文档

`宿主nginx统一入口改造-交接说明.md` 是可整份转发给宿主 nginx / 航迹维护侧的自包含说明，含只读体检、配置要点、CF 两阶段、证书硬门槛、验收与回滚。本文与之冲突时以交接说明为准。
