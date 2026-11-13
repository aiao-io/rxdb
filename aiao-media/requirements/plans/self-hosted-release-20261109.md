# 2026-11-09 国内自建发布记录

国内入口：[https://47.103.117.118/](https://47.103.117.118/)。部署主机为 `ssh aliyun-self`，目录为 `/srv/aiao-media/deploy`。范围见 [MEDIA-US-006](../stories/platform/MEDIA-US-006-self-hosted-deployment.md)，架构与取舍见[双部署改善方案](dual-region-deployment.md)。本次只操作国内主机和本地构建，未改海外 Cloudflare / Supabase，也未清理用户浏览器数据。

## 已部署

旧 `new-api`、PostgreSQL、Redis 的 Podman 容器、卷、镜像及 `/root/new-api`、`/opt/ai-mock` 已按用户授权清理。安装并启用 Docker Engine 26.1.3、Compose 2.27.0，使用 [Compose](../../deploy/self-hosted/compose.yaml) 运行 Caddy、Node API、Kong、PostgreSQL、Auth、PostgREST、Realtime 与真实 Storage。

| 服务       | 固定版本       | 数据与暴露方式                                                                   |
| ---------- | -------------- | -------------------------------------------------------------------------------- |
| Caddy      | 2.11.9         | 公网 80/443，证书数据持久卷                                                      |
| Node       | 26.12.0-alpine | API 只监听 `127.0.0.1:8787`，非 root 进程；任务目录 `/srv/aiao-media/data/relay` |
| PostgreSQL | 17.6.1.136     | `aiao-media-cn_database` 卷，不发布宿主端口                                      |
| Auth       | v2.189.0       | 自建 JWT，公众注册关闭                                                           |
| PostgREST  | v14.12         | 产品 schema 与既有 RLS                                                           |
| Realtime   | v2.102.3       | 经网关提供 WSS                                                                   |
| Storage    | v1.81.0        | `aiao-media-cn_originals` 原图卷，16 MiB 单文件上限                              |
| Kong       | 3.9.3          | 只发布 `127.0.0.1:8000`                                                          |

Docker Hub 在服务器不可直接拉取；镜像由本机构建环境按 Linux amd64 拉取，经 SSH 导入，Compose 已能完整启动。静态 Web 与无外部 npm 依赖的 API bundle 在本机通过 Nx 构建后上传，生产没有启动开发服务器或内存 Storage 替身。产品空库生产迁移已完整提交，真实 Storage 先初始化其自身 catalog；没有应用本地 Storage 表替身。

## 公开 HTTPS

Caddy 显式使用 Let’s Encrypt ACME 与 `shortlived` profile，配置 `default_sni` 支持不发送 SNI 的 IP 客户端。实际证书 issuer 为 Let’s Encrypt YE2，IP SAN 为 `47.103.117.118`；此次证书有效期为 2026-11-09 10:32:51 UTC 至 2026-11-16 02:32:50 UTC。Caddy 保持自动管理和续期，证书数据卷已在整机重启后保留；尚未等到首次实际续期周期。

公网 HTTP 返回 308 并跳转 HTTPS，curl、Python 默认信任链和 Chromium 均正常通过，未关闭证书校验。用户已在阿里云安全组放行 TCP 443；HTTP-01 的 TCP 80 须继续保留。数据库、Kong 管理端口及 Node API 未额外开放公网监听。

## 真实验证

| 验证层       | 结果与边界                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| 初始账号     | 可信运维创建一个已确认账号，通过审计 RPC 单独授予管理员；公网 API 与浏览器登录成功，受保护管理 API 可用         |
| 权限反向验证 | 两个临时普通账号的工作区相互隔离；匿名读取、跨账号原图读写及普通账号管理 API 均被拒绝                           |
| 真实 Storage | PNG、JPEG 与 6 MiB+ TUS 两个分片上传成功，Location 为同一公开 IP 的 Storage 路径，下载 SHA-256 与输入完全相同   |
| 浏览器       | 四路由直接访问、本机 WASM 数据库、登录重载、Service Worker 与四路由断网重开通过，无 JS 异常                     |
| Realtime     | Chromium 经公网 `wss://47.103.117.118` 成功完成升级握手；不据此扩大为全部复制/冲突场景验收                      |
| 整机重启     | Linux boot ID 改变后 Docker 自动启动全部服务；HTTPS、账号、原图与任务封存记录保留，三个样本再次通过摘要校验     |
| 任务边界     | 封存 UUID 经整机重启后重放返回 409，无上游派发；密文、过期恢复、错误令牌、互斥与容量由真实 Node SQLite 单测覆盖 |
| 清理验收样本 | 两个临时账号及其三个对象已删除，最终 Auth 仅保留初始账号，Storage 对象数为 0                                    |

此次没有调用真实付费模型。Node 的恢复测试注入供应商响应，不能据此声称真实供应商已生图、断连结果均可找回或最大并发已经压测。

## 仓库检查

- `aiao-media:test`：43 个文件、799 项通过；包含 IP Storage 回归、显式 Storage 配置与可信/越界 TUS Location。
- `aiao-media-api:test`：18 项通过，其中新增 6 项为 Node 持久化、恢复、容量、清理与 HTTP 长轮询退出验证。
- `aiao-media-api:script-test`：45 项通过，原 Cloudflare 代理任务路径保留兼容；Worker `deploy-check` dry-run 通过。
- Web/API lint 与 typecheck、公开配置测试 4 项、Node bundle、前端生产/离线构建均通过。
- `aiao-media:release-check`：62 个文件，最大 1,263,008 字节，服务密钥、JWT 密钥、数据库及初始账号密码作为扫描值，静态产物扫描通过。
- 公网逐文件复验：61 个 Web 文件与发布清单的 SHA-256 全部一致；需求门禁校验 19 个故事、753 个链接，0 错误。
- Angular 首屏包仍有既有 budget warning：606.28 kB，高于 510 kB 提醒阈值，构建成功；本次未放宽预算。

## 运维与复验

初始账号邮箱为 `admin@aiao.local`。随机密码只保存在本地忽略目录 `aiao-media/tmp/self-hosted/initial-admin.json`，文件权限 0600；本文、Git 和网页都不包含密码。部署密钥在同一忽略目录与服务器 `/srv/aiao-media/deploy/.env`，权限 0600。生成的 Kong 配置同样不提交。

```bash
ssh aliyun-self
cd /srv/aiao-media/deploy
docker compose ps
docker compose logs --tail 50 api caddy
docker compose up -d
```

保留 `database`、`originals`、`caddy-data`、`caddy-config` 卷及 relay 目录；日常发布不能执行 `docker compose down -v`。API 更新通过 `docker compose restart api` 触发正常退出，最多等待 240 秒；不要用 `kill -9` 作为常规发布步骤。服务日志不应开启 Authorization 或请求正文记录。

在此工作区保留的私有配置下复验（会创建并随后删除两个专用验收账号及样本文件）：

```bash
AIAO_VERIFY_PHASE=before-restart pnpm nx run aiao-media:verify-self-hosted
# 重启目标服务器或应用后再执行，验证原有样本而不是重建它们。
AIAO_VERIFY_PHASE=after-restart pnpm nx run aiao-media:verify-self-hosted
pnpm nx run aiao-media:verify-self-hosted-browser
```

准备新部署使用 `AIAO_DEPLOY_ORIGIN=https://<公开地址> pnpm nx run aiao-media:prepare-self-hosted`。脚本保留既有部署密钥并拒绝把它们复用到另一个 origin；新数据库先启动真实 Storage，再应用 `aiao-media:production-bundle` 生成的空库初始化 SQL。已使用的数据库后续只运行审阅后的增量迁移。

当前主机重启后的采样：约 657 MiB 已用内存、2.5 GiB available，磁盘使用 15 GB、剩余 24 GB；这只是空闲采样，不是容量测试。各容器配置日志轮转，relay 临时密文 512 MiB 总预算并保留 512 MiB 余量。

## 未关闭边界

公众注册保持关闭，邮件找回尚未启用，生产 SMTP 尚未配置。尚未建立站外联合备份、告警和恢复演练，未做最大模型响应压力测试、真实付费生图或 Web/Tauri 原图联验；当前按初始受控部署交付。

## 首次初始化更新（20:48，Asia/Shanghai）

按 [MEDIA-US-007](../stories/platform/MEDIA-US-007-installation.md) 更新 Web、独立 Admin 与 Node API，应用增量 `011-installation.sql`，重新加载 Caddy。原部署配置备份于服务器 `/srv/aiao-media/backups/20261109-204448/`；数据库、原图、relay 与证书卷保留。

按用户要求取消额外安装凭据，self-hosted 与 Cloudflare 均直接提交管理员与必需服务配置。国内公开页面已更新，Cloudflare 通过部署 dry-run，本轮未发布海外站点。更新前的配置、API bundle 与 Admin 备份于服务器 `/srv/aiao-media/backups/20261109-remove-setup-token/`。

公网首页已通过真实 Chromium 验证，自动进入 [首次初始化](https://47.103.117.118/admin/)，没有安装凭据输入框，页面无脚本或控制台错误，390 px 手机视口没有横向溢出。安装接口返回尚未初始化、使用部署环境预置服务配置；七个带健康检查的容器全部 healthy，Caddy 正常运行，线上 API bundle 的 SHA-256 与本地产物一致。

初始化留给部署者操作，验收没有提交安装表单。数据库仍保留原管理员，应使用原管理员邮箱与密码接管现有站点。原管理员登录信息保存在本地忽略文件 `aiao-media/tmp/self-hosted/installation-access.txt`（0600），未写入 Git、网页或本文。

## 初始化失败修复（21:40，Asia/Shanghai）

首次提交创建账号成功，但此前部署验收留下的 `admin@aiao.local` 管理员权限阻止了新账号成为首个管理员。第二次提交时真实 GoTrue 返回 `code: 422` 与 `error_code: email_exists`，旧解析只读取字符串 `code`，误报为产品服务失败。

后端已统一识别 Auth 的 `error_code` 与 PostgREST 的字符串 `code`。重复邮箱继续验证原密码；错误密码明确返回 401，允许修正重试。已有管理员时先验证原账号与权限，不再先创建多余账号；最终 SQL 授权仍保留事务锁与原管理员保护。API 回归 29 项、接口脚本 39 项及 lint/typecheck 通过。

另建隔离空业务数据库与真实 GoTrue v2.189.0、PostgREST v14.12，使用本次 Node bundle 完成账号创建、重复邮箱、原密码错误、授权前失败、授权成功但回执丢失后的重试、关闭初始化、管理员登录、受保护用户列表、重启持久化及普通账号不可接管的验证。临时服务仅绑定回环地址，已清理隔离数据库、容器与临时服务配置，未在生产库执行成功初始化。

生产数据库、API 与配置先备份到 `/srv/aiao-media/backups/20261109-installation-retry-fix/`。随后仅移除部署验收账号的管理员权限记录，并在管理审计保留清理原因；两个 Auth 账号及密码、用户数据、原图、relay 和证书均保留。该操作是清理本次部署测试遗留，不是产品的通用管理员重置功能。旧 `initial-admin.json` 仅记录历史测试账号，已不具备管理员权限。

国内 API 已更新并重启，线上与本地 bundle SHA-256 均为 `ed8476e74abed3e366ff427908819de7a1da5e7a3d78559b05c9c9b8cc700827`。公网对已存在账号提交错误密码得到明确 401，安装状态仍为未完成；七个健康检查服务均 healthy。首次完成操作留给用户使用自己刚才的邮箱与原密码执行，未重置用户密码或代替用户选择新密码。Cloudflare 共用此修复，本轮未发布海外站点。

## 初始化邮箱修正（22:12，Asia/Shanghai）

失败后的待确认记录同时锁定了邮箱和服务配置，导致用户修正邮箱时在创建账号前就被拒绝。现改为尚未完成时允许修改邮箱，并为新邮箱生成独立操作标识；相同邮箱继续原操作。账号服务配置在结果未确认时保持一致，已有管理员检查与数据库事务授权继续防止创建第二个首任管理员。

API 回归 31 项、lint、typecheck、Node bundle、Cloudflare 部署 dry-run 与需求门禁通过。隔离真实 Auth / PostgREST 验证了账号创建失败后换邮箱、账号已创建但授权失败后再换邮箱、授权提交但回执丢失后的管理员保护、新管理员登录、受保护接口和重启持久化；验证容器、数据库与临时服务配置已清理。

更新前 API 和本地初始化状态备份于 `/srv/aiao-media/backups/20261109-installation-email-fix/`。国内新 bundle SHA-256 为 `f48350b0affad23e65e8f1748f99788aa459a6ffeaa0ef9852247c284cc62847`。公网使用与待确认记录不同的历史测试邮箱和随机错误密码得到明确 401，确认邮箱修改已能到达认证服务；未创建验收账号、未修改任何已有密码。部署后管理员记录与远端安装完成记录仍均为 0，安装继续留给用户完成，七个健康检查服务均 healthy。Cloudflare 共用修复，本轮未发布海外站点。
