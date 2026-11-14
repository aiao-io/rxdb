# 正式验收收尾清单

图片首发交付关联 PR：[154](https://github.com/aiao-io/rxdb/pull/154)。本页只维护**剩余真实验收的执行顺序、真实供应商验收入口的用法，以及生产账号服务的启用步骤**。故事状态与逐条关闭条件见[状态概览](../status-overview.md#未完成验收与关闭条件)，范围决策见[决策](../decisions.md)，本地实现与复验见[本地产品交付验收](local-delivery-verification.md)与[分支收尾](branch-completion-20261029.md)。

## 验收顺序

当前顺序按 D-19 的平台账号、积分和服务端模型执行。旧供应商直连及按请求 Key 的验收不再用于关闭当前需求。

| 工作                      | 对应范围                       | 关闭条件                                                                                                                                                       |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ 显式重新扫描           | MEDIA-US-302 AC5               | 真实本地服务重放旧日志，保留未确认修改和删除冲突；重复扫描不复活、不增业务 revision                                                                            |
| ✅ 既有正式部署与离线更新 | MEDIA-US-004 AC1–4             | 既有四路由/WASM/CSP/旧 API 404、allowlist 和官方 A→B→A 已验；本分支平台积分改版仍须重新发布和复验                                                              |
| ✅ 真实系统中文输入法     | MEDIA-US-106 AC7               | 2026-11-14 macOS 简体拼音的正文与字段组字、自动保存、粘贴、撤销/重做、焦点与刷新恢复通过；见[收口复验](requirements-completion-20261114.md#真实系统中文输入法) |
| ✅ Web 与桌面备份互通     | MEDIA-US-005 AC3/4             | Web ZIP 经真实原生确认导入独立工作区、取消保留数据、PNG 字节相同、退出重开仍在；正式签名、干净系统和升级重装仍待验                                             |
| 正式模型、积分与任务      | MEDIA-US-108/109/206           | 核对服务端模型配置、批准的允许列表与凭据；两侧完成版本升级、后台发放与减少积分、三画幅生成、刷新续接及 R2 领取删除/期限回收                                    |
| 完整原图同步              | MEDIA-US-303/305               | 在正式平台完成 Web/Tauri 双向原图、6 MiB 以上续传、额度/撤权/过期和删除冲突；独立 Storage 传输结果不代替产品联验                                               |
| 正式邮件与评审            | D-16；MEDIA-US-102/106/006/007 | 真实邮箱的注册确认与返回登录闭环；In Review 故事按默认评审/合入条件关闭                                                                                        |

移动真机与支付按 D-04/D-17 继续暂缓。故事状态仍按 YAML 与 AC 更新，不通过修改状态制造完成。

## 现有生产库的升级顺序

2026-11-14 对国内数据库的只读核对确认 marker 为 10，已有初始化表，尚无积分与图片删除保护表。海外本轮只确认正式模型接口仍为 404，未取得其当前数据库版本；不能把本机开发库的 schema 16 当成线上状态。

管理端产物提供以下增量事务，必须先核对目标项目、备份和 marker，再按顺序执行。新项目安装 SQL 继续只适用于空产品库，不能重跑到已有数据的项目。

| 文件                                 | 起始 marker | 目标 marker |
| ------------------------------------ | ----------- | ----------- |
| `/admin/upgrade-installation.sql`    | 10          | 11          |
| `/admin/upgrade-credits.sql`         | 11          | 13          |
| `/admin/upgrade-image-lifecycle.sql` | 13          | 16          |

每个包在源 DDL 前取得同一事务锁并检查 marker 和基础表；允许同一目标版本重放，拒绝跳版本、未知/更高版本与旧包降级。迁移与 marker 在同一事务提交，失败回滚。源摘要和发布产物检查分别用于核对 SQL 来源与实际打包文件；本地测试通过不表示已对线上执行。

平台模型与凭据未核对就绪前，不切换正式前端。正式构建保持 `NX_LOAD_DOT_ENV_FILES=false` 并显式提供对应区域的公开 Auth/Storage 配置，不能把本机回环值发布给用户。具体结果见[收口复验](requirements-completion-20261114.md)。

## 真实供应商自动验收入口

以下保留 D-02 阶段的历史运行方式和未结记录。D-19 已移除用户自配供应商、直连和按请求 Key 的生成；这些旧入口不用于当前平台生成的正式验收，也不能据此解锁或覆盖历史待核对任务。

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

每项发送前在忽略的 `aiao-media/apps/web-e2e/tmp/provider-acceptance/live` 创建独占尝试文件（0600），按 origin、发布产物、供应商/模型、通道与画幅确定身份。验收先持有目录级 `.acceptance-run.lock`（0600），再检查完整计划与既有未知记录：同供应商/模型/通道/画幅的未知记录不因更换发布、产物摘要或 Key 而解锁；只复用同产物已完成的证据，独立未尝试组合可显式另选。登记尝试后任何一步失败都记为 `requires-review`，不自动继续或重发，不删除/覆盖未知记录。正常退出只释放本次所有者的锁；进程崩溃留下的锁保持阻断，须人工核对。

尝试记录跟随执行所在的检出位，检出位删除即丢失。换检出位执行前，先把既有记录（含 `requires-review`）复制到新检出位的 `live` 目录；已丢失的未知记录按[供应商补验](provider-acceptance-follow-up.md)补建保守锁，否则历史未知不可见。

不启用截图、trace、视频或 Playwright 调试日志；报告只保留摘要、合法数值和固定枚举，不保存 Key 或完整供应商响应。Base64 结果不伪造跨 origin 原图读取证据，该边界仍须 URL 结果实证。

历史本机模式发布曾使用空的 `AIAO_SUPABASE_URL`、`AIAO_SUPABASE_ANON_KEY` 并核对公开配置为 `null`，原回执继续见[正式交付验收](public-delivery-verification.md)。当前按 D-16 启用统一平台 Supabase：构建/审查/部署保持 `NX_LOAD_DOT_ENV_FILES=false`，从选定平台项目显式提供这两个公开变量，不再清空账号配置。前端 URL/公开 Key、Worker secrets、迁移、Auth 与私有 Storage 必须属于同一平台项目；命令见[当前发布流程](../../deploy/cloudflare/local-first-pages.md#正式发布)。

## 后续正式账号服务的运维边界

2026-11-06 已完成正式 Worker 发布、空库 bootstrap、Auth 正式返回地址与 Worker secrets 配置，真实云 API/RLS/Storage 及完整浏览器同步样本验证通过，原图下载字节与 SHA-256 一致，详见[平台发布记录](platform-supabase-release-20261106.md)。22:07 发布版本已通过正式四路由与离线浏览器 smoke，58/58 资源摘要匹配、离线新页面保留草稿。尚未配置自定义 SMTP，公众注册确认邮件仍待补；这些步骤不能据此全部标为完成。

以下为当前平台账号与同步发布的执行前置和运维步骤，替代此前仅本地的发布口径。先核验选定平台项目的实际状态，再执行对应步骤；文档更新不表示迁移、秘密配置、正式部署或生产验收已经完成。

1. 核验已有 Cloudflare 账户、`aiao-media` Worker、`aiao.io` active zone、正式域名现存记录与选定的独立 Supabase 项目。保留当前 Worker version/deployment、静态摘要、Auth 配置与数据库备份，不覆盖未知 CNAME。
2. 使用 `aiao-media:production-bundle` 生成的 13 源 SQL 包，仅对经核验的独立空产品项目审查初始化事务。包内保留每个源文件 SHA-256，排除 `001-local-account-checks.sql` 与 `001-local-storage-standin.sql`；首个事务 guard 会拒绝 public 非扩展关系、既有 `media_`/`rxdb_` 对象和相关函数。本地 `supabase-migrate` 不能换 URL 后用于生产。
3. core `01-rxdb-system-tables.sql` 含全 public 授权、关闭 RLS、历史日志改写/去重；应用 003 改变全局 RxDB 分支函数与权限。这些操作不能直接投向已有数据或共享项目；必须先提取按对象收口的 SQL 并评审。不同文件自带事务边界，不能不经整理直接拼接成所谓单事务。
4. 复验所有产品表 RLS、匿名/A/B 的私有数据隔离、变更日志隔离、普通用户管理 RPC 拒绝，以及 `rxdb_change` 的 Realtime publication。SQL 执行成功不代表权限矩阵通过。
5. Auth Site URL 设为 `https://media.aiao.io`，仅允许精确正式返回地址。当前是邮箱密码流程，邮箱确认后回站点再登录；没有 `/auth/callback`，不声明 OAuth/PKCE 已实现。真实邮件投递必须验收。
6. 核验首管理员存在于该项目 `auth.users`、已验证且未被封禁，通过可信 SQL Editor 或受保护数据库会话调用 `media_trusted_membership`。使用目标 UUID、当前成员 revision（不存在才为 0）及固定操作 UUID；超时沿用相同操作 ID 核对结果。现有 `admin-membership` target 强制本地，不能用于生产；部署账号不自动获得产品管理权。
7. 浏览器构建设置 `AIAO_SUPABASE_URL`、`AIAO_SUPABASE_ANON_KEY`；GitHub 手动发布 workflow 已映射同名公开 vars。Worker 的 `MEDIA_SUPABASE_URL`、`MEDIA_SUPABASE_ANON_KEY`、`MEDIA_SUPABASE_SERVICE_ROLE_KEY` 全部使用 secrets，指向同一项目。`../../deploy/cloudflare/.dev.vars` 不会自动上传。普通远程 vars 未列入配置会被后续部署删除；secrets 保留。首轮使用已验证的 legacy anon/service_role JWT，新 Key 格式另验。
8. 服务端配置以 0600、Git 忽略的私密 JSON 经 Wrangler `secret bulk` 接入，不把值写入 shell 参数或日志。然后执行 `aiao-media:deploy-check`，核对公开配置与 Supabase 精确 CSP、无服务端 Key，最后 `aiao-media:deploy` 并保存真实回执。
9. 记录真实部署回执与 `offline-manifest.json` 摘要，在 `https://media.aiao.io` 验证注册/邮件确认/登录、首次范围确认、草稿与作品往返、原图上传取回及 SHA-256、匿名/A/B 隔离、退出与离线恢复。正式服务按本页验收表收口；Storage 字节 fixture 不代表云 Storage、续传或生产 Web/Tauri 已验。服务端 schema 采用前向修复，前端回退不自动删除表、冲突、tombstone、SQLite 或 OPFS；数据库恢复单独作为灾备操作处理。

源码依据：[生产迁移包脚本](../../scripts/supabase/build-production-supabase-bundle.mjs)、[本地迁移入口](../../scripts/supabase/supabase-local.mjs)、[可信管理员入口](../../scripts/supabase/admin-membership.mjs)、[Worker 后端请求](../../apps/api/src/product-http.ts)、[公开配置/CSP 构建](../../apps/web/scripts/build-supabase-config.mjs)、[发布脚本](../../scripts/release/deploy-local-first.mjs)。
