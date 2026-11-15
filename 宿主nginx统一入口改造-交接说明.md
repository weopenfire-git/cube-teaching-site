# 宿主 nginx 统一入口改造 交接说明

| 项 | 内容 |
| :--- | :--- |
| 版本 | v2.0（架构反转），2026-11-15 |
| 适用 | 腾讯云轻量 43.155.178.13（首尔），同机运行航迹 WingTrace 与青简站点 |
| 交付对象 | 维护宿主 nginx / 航迹站的一侧（「那边」） |
| 文档地位 | **替代**部署仓 README 旧章节「域名与 HTTPS（Cloudflare 回源方案）」；与之冲突时以本文为准 |
| 自洽性 | 本文不依赖任何口头补充或既往对话，可整份转发 |

---

## 0 一句话结论

**把分流与 TLS 从 `cube-web` 容器上移到宿主 nginx，容器回归纯应用。** Cloudflare 不再是「绕开宿主 80 的必经通道」，降级为可选的 DNS / 边缘代理，域名可随时改灰云直连。

> **重要：不要执行旧方案那条 `git pull && gen-origin-cert.sh && docker compose up -d` 的 HTTPS 上线命令。** 服务器实测 443 仍空闲、容器仍是 `8081:80`，旧方案尚未落地。现在直接按本文一次切到最终形态，省掉「先上容器 443 再拆」的来回。

---

## 1 为什么改

| 维度 | 旧方案（容器 443 分流） | 新方案（宿主 nginx 分流） |
| :--- | :--- | :--- |
| 分流层位置 | `cube-web` 容器内，靠容器 443 的两个 server | 宿主 nginx，`server_name` 精确匹配 |
| TLS 终结 | 容器内，自签证书挂进容器卷 | 宿主 nginx，一处证书、一处 TLS 策略 |
| 与宿主 80 的关系 | 绕开 80（因为不能动航迹） | 不碰 80 的既有 server，纯增量加精确域名 server |
| Cloudflare | 必需，没有它域名流量进不来 | 可选，可橙云可灰云 |
| 加一个新子站 | 要么抢宿主端口，要么继续往容器 443 塞 server | 宿主加一个 server 块 |
| 国内直连 / 未来迁回大陆 | 被 CF 绑定，改动大 | DNS 改灰云即可 |
| 代价 | 无 | 宿主 nginx 成为单点；宿主侧多一次配置变更（可回滚） |

一句话：**旧方案是在「宿主 80 不能动」这个约束下做的权宜设计；约束解除后，分流层就该待在它该待的地方。**

---

## 2 目标架构

```
                      ┌─ Cloudflare（可选：橙云代理 / 或纯 DNS 灰云直连）
访客 ── 域名 HTTPS ───┘
                        │
                        ▼
        宿主 nginx  80 / 443   ← TLS 终结 + 按 server_name 分流（唯一入口）
          ├─ qingjiansmart.com / www  → root /opt/cube-deploy/portal   公司主页
          ├─ cube.qingjiansmart.com   → proxy_pass 127.0.0.1:8081      魔方站
          ├─ 未知 Host / IP:443       → return 444
          └─ 80 上既有 default_server → 保持原样，归航迹侧，不改
                                            │
                                            ▼
                        cube-web 容器 80（宿主 8081）  site 静态 + /healthz + /api/
                                            │  docker 内网
                                            ▼
                        cube-auth:3001   无宿主端口映射，不对公网暴露
```

| 端口 | 归属 | 用途 | 是否变动 |
| :--- | :--- | :--- | :--- |
| 宿主 80 | 既有 nginx（航迹侧） | 原有服务 + 新增精确域名 301 跳 HTTPS | 不改既有 server，只新增 |
| 宿主 443 | **宿主 nginx 新增** | 域名 HTTPS 入口 | 新增（原本空闲） |
| 宿主 8080 | 航迹容器 | 航迹站 | 不动 |
| 宿主 8081 | cube-web 容器 80 | 宿主反代目标 + IP 直连老链接 | 保留 |
| 容器 443 | 无 | 不再使用 | 移除映射 |

**边界**：`server_name` 分流只作用于带域名的请求；`http://43.155.178.13:8081/` 这类 IP 直连仍走容器端口，不受影响，老链接不失效。

---

## 3 分工

### 我方（部署仓 `weopenfire-git/cube-teaching-site`）已完成，不需你做

| 文件 | 改动 |
| :--- | :--- |
| `nginx.conf` | 删掉两个 443 server，简化为单个 80 server；不再引用证书；安全响应头仍由容器下发 |
| `docker-compose.yml` | 去掉 `443:443` 与 `./portal`、`./ssl` 挂载；容器只留 `8081:80` |
| `host-nginx/qingjian.conf` | **新增**，宿主 nginx 分流配置全文（本文第 5 节所述） |
| `README.md` | 重写架构与 HTTPS 章节 |
| `scripts/gen-origin-cert.sh` | 注释改为「供宿主 nginx 443 使用」 |

### 需要你做的（宿主 nginx 侧）

只有一件实质动作：**把仓里那份 `qingjian.conf` 复制进宿主 nginx 的 `conf.d/`，校验并 reload**。不修改、不删除任何既有配置。

---

## 4 执行步骤（OrcaTerm 可直接粘贴）

### 4.0 只读体检（先跑，不改动任何东西）

```bash
echo "=== 端口 ==="; sudo ss -lntp | grep -E ':80|:443|:8080|:8081'; echo "=== 系统 nginx ==="; sudo nginx -v 2>&1; sudo grep -nE 'include|conf.d|sites-enabled' /etc/nginx/nginx.conf; echo "=== 现有 default_server ==="; sudo grep -rn 'default_server' /etc/nginx/ 2>/dev/null | head -n 20; echo "=== 航迹存活 ==="; curl -sI http://127.0.0.1:8080/ | head -n 3
```

**分支判断，必须先确认再往下走：**

- `80` 的进程是系统 `nginx`，且 `/etc/nginx/nginx.conf` 含 `include /etc/nginx/conf.d/*.conf;` → 按本文执行。
- `80` 是别的服务（Apache / Node / 另一套 nginx 实例）→ **停下并反馈**，不要继续。此时「宿主 nginx 统一入口」的前提不成立，需先决定是否换成 nginx，或退回旧的容器 443 方案。
- `443` 已有监听 → 停下并反馈，需要先查清归属，避免抢端口。

### 4.1 备份（必须）

```bash
sudo cp -a /etc/nginx /etc/nginx.bak-$(date +%F-%H%M%S) && ls -d /etc/nginx.bak-*
```

### 4.2 一次性上线（推荐，一条命令做完）

```bash
cd /opt/cube-deploy && git pull && sudo bash scripts/gen-origin-cert.sh && sudo cp -a /etc/nginx /etc/nginx.bak-$(date +%F-%H%M%S) && sudo docker compose up -d && sudo cp host-nginx/qingjian.conf /etc/nginx/conf.d/qingjian.conf && sudo nginx -t && sudo systemctl reload nginx && sudo docker ps --filter name=cube-web --format '{{.Status}}'
```

若两侧分工、只由你负责宿主 nginx，则部署仓那条由对方先做：

```bash
# 对方（部署仓侧）
cd /opt/cube-deploy && git pull && sudo bash scripts/gen-origin-cert.sh && sudo docker compose up -d

# 你（宿主 nginx 侧）
sudo cp -a /etc/nginx /etc/nginx.bak-$(date +%F-%H%M%S) && sudo cp /opt/cube-deploy/host-nginx/qingjian.conf /etc/nginx/conf.d/qingjian.conf && sudo nginx -t && sudo systemctl reload nginx
```

**顺序不能反**：先让容器重建（释放宿主 443），再让宿主 nginx reload 占上 443。当前线上容器并没有 443 映射，所以实际不会有空窗；若对方此前已误跑过旧方案，`docker compose up -d` 与 `reload` 之间会有几秒 521，属正常。

`nginx -t` 若报 `a duplicate default server for 0.0.0.0:443`：删掉配置里那段「兜底」server，或去掉其 `listen` 中的 `default_server` 字样后重试。

### 4.3 防火墙（腾讯云轻量控制台，外部动作）

实例详情 → 「防火墙」页签 → 添加规则：自定义 / TCP / **443** / 来源 `0.0.0.0/0` / 允许。原有 80、8080、8081 规则保持不动。

---

## 5 宿主 nginx 配置要点

完整配置以仓内 `host-nginx/qingjian.conf` 为唯一来源（安装后为 `/etc/nginx/conf.d/qingjian.conf`），请勿手改后不同步。要点：

| 块 | 作用 |
| :--- | :--- |
| 80 两个 server | 精确 `server_name` → 301 跳 HTTPS；`/.well-known/acme-challenge/` 放行给后续正式证书签发 |
| 443 兜底 server | `default_server` + `return 444`，IP 直接 HTTPS 或未知名 Host 一律断连，不暴露站点 |
| 443 主站 server | `root /opt/cube-deploy/portal` 直接静态托管公司主页，不经容器 |
| 443 cube server | `proxy_pass http://127.0.0.1:8081`，并注入 `Host` / `X-Real-IP` / `X-Forwarded-For` / `X-Forwarded-Proto` |

三条容易踩的设计取舍：

1. **不写 `default_server` 到 80**：既有 default_server 归航迹侧保持不变，nginx 按 Host 精确匹配优先，带域名的请求自然落到新块，其余流量原样不动。这是本次改动风险极低的原因。
2. **portal 不走容器，`/api/` 必须走容器**：portal 是纯静态，宿主直接读文件少一跳；而 `/api/` 反代依赖 docker 内网 DNS 解析 `cube-auth`，宿主 nginx 直连不到它（该服务无宿主端口映射），所以 cube 子域整条反代到 8081。
3. **安全响应头只在一侧下发**：portal 由宿主 server 下发；cube 子域由容器内 nginx 下发，宿主层不给它写 `add_header`，否则同一响应会出现重复的 CSP 头。**不要照抄航迹的 CSP**（`form-action 'none'` 会拦掉登录 API）。

### 5.1 后续加一个子站（本次不做，仅说明扩展方式）

统一入口的价值在这里：新增站点不需要抢宿主端口，只需在 `qingjian.conf` 加一对 80 / 443 server，再到 CF 加一条 DNS 记录。例如将来若航迹也要挂到 `windborne.qingjiansmart.com`：

```nginx
server {
    listen 80;
    server_name windborne.qingjiansmart.com;
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl;
    server_name windborne.qingjiansmart.com;
    ssl_certificate     /opt/cube-deploy/ssl/origin.crt;
    ssl_certificate_key /opt/cube-deploy/ssl/origin.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**航迹不在本次改造范围内**，它当前在 Cloudflare Workers 上独立运行，是否纳入由航迹侧决定。若纳入，其 CSP 由自身容器下发，宿主层同样不要写 `add_header`；同时 DNS 侧原来指向 Workers 的记录需要一并调整，别两边同时生效。

---

## 6 Cloudflare 两阶段（CF 已降级为可选）

### 阶段一 橙云（当前推荐，零成本）

1. Add a Site → `qingjiansmart.com` → Free，按提示把腾讯云 NS 改成 CF 给的两条
2. DNS 全部 **橙云 Proxied**：`A @ → 43.155.178.13`、`A cube → 43.155.178.13`、`CNAME www → qingjiansmart.com`。不要加 `windborne`（Workers 独立运行）或 `auth`（走 cube 子域同源反代）
3. SSL/TLS → Overview → **Full**（源站是自签证书，**不能选 Full strict**，否则 526）
4. 宿主 nginx 已自带 80→443 跳转，CF 的 Always Use HTTPS 可关可不关，建议关闭以免双层跳转

访客看到的是 CF 签发的正规证书，源站自签不影响体验。

### 阶段二 灰云直连（可选，随时可做）

**硬门槛：先把 `ssl/origin.crt` 与 `ssl/origin.key` 换成正式 CA 证书。** 自签证书在灰云直连时会让每个访客看到浏览器告警。两条路任选：

| 路径 | 做法 | 备注 |
| :--- | :--- | :--- |
| Let's Encrypt | 建议用 **DNS-01** 挑战 + `certbot certonly`（不要用 `--nginx` 自动改写配置），签好后把证书复制/软链到 `ssl/origin.crt|key`，`sudo nginx -t && sudo systemctl reload nginx` | 避开 CF 代理与 80 跳转对 HTTP-01 的干扰；配好自动续期 |
| 腾讯云免费 DV | 控制台 DNS 验证申请，下载 nginx 格式证书，替换同名两个文件后 reload | 每年手动换一次 |

替换时保持 `origin.key` 权限 600（nginx master 以 root 启动，可读）。换证成功后再把三条 DNS 记录改为 **DNS only（灰云）**；此时流量不经过 CF，SSL/TLS 加密模式设置自动失效，无需再管。

---

## 7 备案与主体（澄清一个常见误解）

- 服务器在**首尔境外地域，不需要 ICP 备案**，现在就能灰云直连。挡在直连前面的不是备案，是**正式证书**。
- 若将来把站点迁回中国大陆地域，才需要企业 ICP 备案；届时域名持有人须先过户到公司主体（当前是个人实名注册），备案主体与域名实名信息必须一致。
- 因此「等备案完成再直连」这一步在首尔地域不成立，不必等。

---

## 8 上线顺序（避免 DNS 切早了）

1. 服务器：第 4 节命令跑完，`curl --resolve` 本机验收通过（见第 9 节）
2. 防火墙放行 443
3. CF 改 NS + 三条 DNS 记录 + Full 模式
4. 解析生效后浏览器验收
5. 两个域名都通过，再把 `portal/index.html` 顶部 `SITE.domain` 填成 `'qingjiansmart.com'`，卡片链接自动切到子域名

---

## 9 验收清单

| # | 命令 / 动作 | 期望 |
| :--- | :--- | :--- |
| 1 | `sudo nginx -t` | `syntax is ok` / `test is successful` |
| 2 | `sudo ss -lntp \| grep ':443'` | 进程是宿主 nginx，不是 docker-proxy |
| 3 | `curl -s http://127.0.0.1:8081/healthz` | `{"ok":true,...}` |
| 4 | `curl -sI http://127.0.0.1:8081/` | 200 |
| 5 | `curl -skI --resolve qingjiansmart.com:443:127.0.0.1 https://qingjiansmart.com/ \| head -n 8` | 200，返回公司主页；`-k` 因自签证书，**DNS 未切也能验** |
| 6 | `curl -sk --resolve cube.qingjiansmart.com:443:127.0.0.1 https://cube.qingjiansmart.com/healthz` | `{"ok":true,...}`，证明分流 + 反代链路通 |
| 7 | `curl -sI http://127.0.0.1:8080/ \| head -n 3` | 航迹仍 200，未受影响 |
| 8 | `curl -skI --resolve qingjiansmart.com:80:127.0.0.1 http://qingjiansmart.com/ \| head -n 3` | 301 到 https |
| 9 | `curl -skI https://43.155.178.13/ \| head -n 3` | 连接被断开（444 兜底生效） |
| 10 | DNS 生效后浏览器开两个域名 | 页面正常、地址栏有锁、`http://` 自动跳 https |
| 11 | 注册 / 登录 / 成就 / 成绩卡走一遍 | 功能正常，`/api/` 同源反代无 CORS 报错 |

第 5、6 条是本方案最关键的验收：**不需要等 DNS 生效**就能证明宿主分流和容器反代都正确。

---

## 10 回滚

顺序不能反（宿主 nginx 占着 443 时，旧版容器起不来）：

```bash
# 1 先释放宿主 443
sudo rm /etc/nginx/conf.d/qingjian.conf && sudo nginx -t && sudo systemctl reload nginx

# 2 再恢复旧版部署仓（容器重新占 443）
cd /opt/cube-deploy && git checkout <旧commit> && sudo docker compose up -d
```

若只需放弃宿主侧、域名暂不提供服务，只跑第 1 条即可，但记得把 CF DNS 记录一并改灰云或暂停，否则 CF 会回源到无人监听的 443 返回 521。

备份目录 `/etc/nginx.bak-<日期>` 可整体还原：`sudo cp -a /etc/nginx.bak-XXXX /etc/nginx && sudo nginx -t && sudo systemctl reload nginx`。

`docker compose down` 只在 `/opt/cube-deploy` 目录执行，不影响航迹容器；**永远不要带 `-v`**（会删 SQLite 数据卷）。

---

## 11 安全边界与已知取舍

| 项 | 约定 |
| :--- | :--- |
| 既有配置 | 不修改、不删除；本次是纯增量 |
| `cube-auth` | 不映射宿主端口，只经 `/api/` 同源反代可达 |
| CSP | 不照抄航迹；portal 用与魔方站相同的 self + unsafe-inline 策略 |
| HSTS | **暂不启用**。一旦下发就不可逆，等正式证书 + 灰云直连稳定后再评估 |
| 443 兜底 | `return 444`，避免 IP 直连暴露站点 |
| 单点风险 | 宿主 nginx 故障会同时影响主站与子站，这是统一入口的固有代价；靠备份 + `nginx -t` + reload（不用 restart）控制 |
| 明文入口 | `http://43.155.178.13:8081/` 仍是 HTTP 明文内测入口，正式分享只用域名链接 |
| `DEV_MODE=true` | 内测态：验证码在接口响应返回、微信模拟扫码；接真实短信/邮件后改 `false` |
| 备份 | `scripts/backup.sh` 每日备份 SQLite 卷到本地 90 天 + GitHub 私有仓，与本次改造无关，保持不动 |

---

## 12 可直接转交的提示词（给接手方）

```text
你要在一台腾讯云轻量服务器（首尔，43.155.178.13，Ubuntu 22.04）上，把青简站点的域名分流与 TLS 从 cube-web 容器上移到宿主 nginx，宿主 nginx 做统一入口。同机还运行「航迹 WingTrace」容器（8080:80），宿主 80 上另有既有 nginx 服务。

现状：宿主 443 空闲；cube-web 目前只映射 8081:80；部署仓在 /opt/cube-deploy（weopenfire-git/cube-teaching-site）；登录后端 cube-auth 无宿主端口映射，只在 docker 内网可达。

硬约束：
1. 不修改、不删除宿主 nginx 的任何既有 server 块，只新增一个 conf.d 文件；80 的既有 default_server 保持不动，新文件的 80 server 不带 default_server。
2. 不占用、不停用航迹的 8080，不进入 /opt/wingtrace-deploy，不覆盖容器名 wingtrace。
3. 目标：按 server_name 分流 qingjiansmart.com / www 到公司主页静态目录 /opt/cube-deploy/portal；cube.qingjiansmart.com 反代到 127.0.0.1:8081；未知 Host 的 443 用 444 拒绝；80 上带域名的请求 301 跳 HTTPS。
4. TLS 在宿主 nginx 终结，证书路径 /opt/cube-deploy/ssl/origin.crt|key（脚本 gen-origin-cert.sh 生成，自签）。Cloudflare 橙云阶段用 Full 模式，不能选 Full strict。
5. 安全响应头不要照抄航迹（航迹 CSP 有 form-action 'none'，会拦登录 API）；portal 由宿主下发，cube 子域由容器内 nginx 下发，宿主层不要给 cube 子域写 add_header，避免重复 CSP。
6. 不启用 HSTS。cube-auth 不映射宿主端口。
7. 操作通道是腾讯云控制台 OrcaTerm，只能输出可直接粘贴的单行命令；不要设计需要编辑器交互的流程。改前先备份 /etc/nginx，改后用 nginx -t 校验再 reload（不要 restart）。

交付：先给只读体检命令并判断 80 是不是系统 nginx、443 是否空闲；再给配置全文与上线命令；最后给验收清单（必须包含 curl --resolve 本机验收、以及确认航迹 8080 仍 200）和回滚步骤。完整说明见部署仓 宿主nginx统一入口改造-交接说明.md 与 host-nginx/qingjian.conf。
```

---

## 附：本文涉及的文件绝对路径

```text
/opt/cube-deploy/host-nginx/qingjian.conf                       宿主 nginx 配置（源文件，进仓）
/etc/nginx/conf.d/qingjian.conf                                 安装后的宿主 nginx 配置
/opt/cube-deploy/nginx.conf                                     容器内 nginx（单 80 server）
/opt/cube-deploy/docker-compose.yml                             容器编排（8081:80，无 443）
/opt/cube-deploy/ssl/origin.crt  |  origin.key                  源站证书（不进仓）
/opt/cube-deploy/portal/index.html                              公司主页
/opt/cube-deploy/宿主nginx统一入口改造-交接说明.md               本文
```

> 本文不含任何密钥、口令、证书私钥或企业登记信息；转发时请勿追加敏感内容。
