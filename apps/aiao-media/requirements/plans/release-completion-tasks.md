# 正式验收收尾清单

图片首发交付关联 PR：[154](https://github.com/aiao-io/rxdb/pull/154)。本页只维护**剩余真实验收的执行顺序、真实供应商验收入口的用法，以及生产账号服务的启用步骤**。故事状态与逐条关闭条件见[状态概览](../status-overview.md#未完成验收与关闭条件)，范围决策见[决策](../decisions.md)，本地实现与复验见[本地产品交付验收](local-delivery-verification.md)与[分支收尾](branch-completion-20261029.md)。

## 验收顺序

| 工作                  | 对应 AC                      | 关闭条件                                                                                                                             |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ✅ 显式重新扫描       | MEDIA-US-302 AC5             | 真实本地服务重放旧日志，保留未确认修改和删除冲突；重复扫描不复活、不增业务 revision                                                  |
| ✅ 正式部署与离线更新 | MEDIA-US-004 AC1–4           | 四路由/WASM/CSP/旧 API 404、allowlist、官方 A→B→A 与各阶段真断网四路由，见[正式交付验收](public-delivery-verification.md)            |
| ✅ 代理 PNG 交付      | MEDIA-US-105 AC6、202 AC7    | 三画幅各一次 HTTP 200，尺寸/字节/SHA、保存/刷新回读/精确下载一致；直连限制与未知独立记录                                             |
| 直连三画幅            | MEDIA-US-102 AC7             | 网络稳定后先跑 MiniMax 直连横图诊断；能读到原图再补纵图；正方形须用户核对供应商记录后解锁；原图跨域不可读时先决定直连是否改用 base64 |
| 真实 URL 原图读取     | MEDIA-US-105 AC7             | 真实跨 origin URL 结果无 Authorization/Cookie/Referer，经产品保存、刷新回读与精确下载                                                |
| 本轮跳过：桌面输入法  | MEDIA-US-106 AC7             | D-09；恢复时运行 `aiao-media-e2e:desktop-ime-acceptance`，不以粘贴中文、合成 composition 或视口模拟代替系统 IME                      |
| 后续：正式账号/后台   | MEDIA-US-201、203 的部署边界 | 生产尚未部署；启用时另验真实 Auth、A/B 与双副本隔离、管理授权、模板/策略运行版本及任务上报来源                                       |

移动真机不进入这次桌面发布，MEDIA-US-107 三个 AC 保持未验。跳过、暂缓、本地通过和生产通过分别记录；故事仍按 YAML 与 AC 更新，不通过修改状态制造完成。

## 真实供应商自动验收入口

入口位于 e2e 项目，应用不反向依赖 e2e。先运行本地 fixture：

```sh
NX_NO_CLOUD=true pnpm nx run aiao-media-e2e:provider-acceptance-fixture --skipRemoteCache
```

正式验收由 `aiao-media-e2e:provider-acceptance` 执行，必须显式设置以下非敏感参数，并在进程或应用私有 `.env` 提供供应商三字段：

| 参数                                    | 取值                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `AIAO_MEDIA_ACCEPTANCE_GENERATE`        | `1`，允许本轮真实生成；普通 CI 不设置                                                          |
| `AIAO_MEDIA_ACCEPTANCE_ORIGIN`          | 固定 `https://media.aiao.io`                                                                   |
| `AIAO_MEDIA_ACCEPTANCE_RELEASE`         | 实际 Cloudflare 发布回执的 version UUID                                                        |
| `AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256` | 已审核发布产物 `offline-manifest.json` 的 SHA-256；不是临时从未知线上内容接受的摘要            |
| `AIAO_MEDIA_ACCEPTANCE_MODES`           | 可选：`direct`、`proxy` 的逗号子集；未设置时为 `direct,proxy`；空、非法或重复值拒绝            |
| `AIAO_MEDIA_ACCEPTANCE_ASPECTS`         | 可选：`square`、`landscape`、`portrait` 的逗号子集；未设置时为全部三画幅；空、非法或重复值拒绝 |

脚本在发请求和复用证据前核对线上 manifest 与预期摘要，不匹配即停止。默认执行直连/代理 × 正方形/横向/纵向六项；显式模式/画幅参数仅筛选计划，不改变尝试身份。输出 `planned`、`complete` 或 `stopped`、所选范围、计划数和成功数；子集通过只覆盖所选项，不能称六项全部通过。

各项只允许一次生成请求，返回 PNG/JPEG 原图尺寸须精确匹配请求，格式、MIME 与下载后缀须一致，原图不转码。使用实际产品界面保存、刷新、回读与下载，比较 SHA-256 和精确文件字节；结果 URL 请求检查无 Authorization、Cookie 或 Referer。OPTIONS 403 只作为该次预检限制，不能据此断言上游未处理或零计费。

每项发送前在忽略的 `apps/aiao-media-e2e/tmp/provider-acceptance/live` 创建独占尝试文件（0600），按 origin、发布产物、供应商/模型、通道与画幅确定身份。验收先持有目录级 `.acceptance-run.lock`（0600），再检查完整计划与既有未知记录：同供应商/模型/通道/画幅的未知记录不因更换发布、产物摘要或 Key 而解锁；只复用同产物已完成的证据，独立未尝试组合可显式另选。登记尝试后任何一步失败都记为 `requires-review`，不自动继续或重发，不删除/覆盖未知记录。正常退出只释放本次所有者的锁；进程崩溃留下的锁保持阻断，须人工核对。

尝试记录跟随执行所在的检出位，检出位删除即丢失。换检出位执行前，先把既有记录（含 `requires-review`）复制到新检出位的 `live` 目录；已丢失的未知记录按[供应商补验](provider-acceptance-follow-up.md)补建保守锁，否则历史未知不可见。

不启用截图、trace、视频或 Playwright 调试日志；报告只保留摘要、合法数值和固定枚举，不保存 Key 或完整供应商响应。Base64 结果不伪造跨 origin 原图读取证据，该边界仍须 URL 结果实证。

本轮生产 Nx 构建/审查/部署必须同时使用 `NX_LOAD_DOT_ENV_FILES=false AIAO_SUPABASE_URL='' AIAO_SUPABASE_ANON_KEY=''`，并复核产物公开账号配置为 `null`；仅两个空值不足以阻止 Nx 展开私有 `.env` 的公网值。完整命令、发布身份、生成 journal、正式浏览器 JSON 和本地 API 复验见[正式交付验收](public-delivery-verification.md)。

## 后续正式账号服务的运维边界

以下保留未来启用生产 Supabase 的条件；本轮仅本地，当前未执行这些生产步骤，也不据此要求提供生产项目或管理员凭据。

1. 核验已有 Cloudflare 账户、`aiao-media` Worker、`aiao.io` active zone、正式域名现存记录与选定的独立 Supabase 项目。保留当前 Worker version/deployment、静态摘要、Auth 配置与数据库备份，不覆盖未知 CNAME。
2. 使用 `aiao-media:production-bundle` 生成的 10 源 SQL 包，仅对经核验的独立空产品项目审查初始化事务。包内保留每个源文件 SHA-256，排除 `001-local-account-checks.sql`；首个事务 guard 会拒绝 public 非扩展关系、既有 `media_`/`rxdb_` 对象和相关函数。本地 `supabase-migrate` 不能换 URL 后用于生产。
3. core `01-rxdb-system-tables.sql` 含全 public 授权、关闭 RLS、历史日志改写/去重；应用 003 改变全局 RxDB 分支函数与权限。这些操作不能直接投向已有数据或共享项目；必须先提取按对象收口的 SQL 并评审。不同文件自带事务边界，不能不经整理直接拼接成所谓单事务。
4. 复验所有产品表 RLS、匿名/A/B 的私有数据隔离、变更日志隔离、普通用户管理 RPC 拒绝，以及 `rxdb_change` 的 Realtime publication。SQL 执行成功不代表权限矩阵通过。
5. Auth Site URL 设为 `https://media.aiao.io`，仅允许精确正式返回地址。当前是邮箱密码流程，邮箱确认后回站点再登录；没有 `/auth/callback`，不声明 OAuth/PKCE 已实现。真实邮件投递必须验收。
6. 核验首管理员存在于该项目 `auth.users`、已验证且未被封禁，通过可信 SQL Editor 或受保护数据库会话调用 `media_trusted_membership`。使用目标 UUID、当前成员 revision（不存在才为 0）及固定操作 UUID；超时沿用相同操作 ID 核对结果。现有 `admin-membership` target 强制本地，不能用于生产；部署账号不自动获得产品管理权。
7. 浏览器构建设置 `AIAO_SUPABASE_URL`、`AIAO_SUPABASE_ANON_KEY`；GitHub 手动发布 workflow 已映射同名公开 vars。Worker 的 `MEDIA_SUPABASE_URL`、`MEDIA_SUPABASE_ANON_KEY`、`MEDIA_SUPABASE_SERVICE_ROLE_KEY` 全部使用 secrets，指向同一项目。`deploy/.dev.vars` 不会自动上传。普通远程 vars 未列入配置会被后续部署删除；secrets 保留。首轮使用已验证的 legacy anon/service_role JWT，新 Key 格式另验。
8. 服务端配置以 0600、Git 忽略的私密 JSON 经 Wrangler `secret bulk` 接入，不把值写入 shell 参数或日志。然后执行 `aiao-media:deploy-check`，核对公开配置与 Supabase 精确 CSP、无服务端 Key，最后 `aiao-media:deploy` 并保存真实回执。
9. 正式服务按本页验收表收口。服务端 schema 采用前向修复，前端回退不自动删除表、冲突、tombstone、SQLite 或 OPFS；数据库恢复单独作为灾备操作处理。

源码依据：[生产迁移包脚本](../../scripts/build-production-supabase-bundle.mjs)、[本地迁移入口](../../scripts/supabase-local.mjs)、[可信管理员入口](../../scripts/admin-membership.mjs)、[Worker 后端请求](../../deploy/product-http.mjs)、[公开配置/CSP 构建](../../scripts/build-supabase-config.mjs)、[发布脚本](../../scripts/deploy-local-first.mjs)。
