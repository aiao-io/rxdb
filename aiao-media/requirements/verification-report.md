# 验收记录

> 本页回答「每项能力的证据来自哪一层、还缺哪一层」。故事状态与关闭条件只在[状态概览](status-overview.md)维护；带日期的执行记录在[计划与验收记录](plans/README.md)。

同仓迁入后的复验与旧构建升级证据见[RxDB 迁入验收](plans/rxdb-import-verification.md)。

## 证据分层

| 层                          | 典型入口                                                                               | 能证明                                                          | 不能证明                         |
| --------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| 单元与契约                  | `aiao-media:test`、`aiao-media:coverage`、各 `*-check` 脚本测试                        | 状态机、契约、序列化、错误分类与验收工具守卫                    | 浏览器存储、真实网络             |
| 真实浏览器 + fixture 供应商 | `aiao-media-e2e:local-first-e2e`、`offline-update-e2e`、`provider-acceptance-fixture`  | 生产静态产物在真实 Chrome、RxDB、WASM、IndexedDB、OPFS 上的行为 | 真实供应商在正式 origin 可用     |
| 真实本地服务                | `aiao-media:product-test`、`aiao-media-e2e:product-e2e`、`aiao-media-e2e:supabase-e2e` | 本地 Supabase 的 Auth、RLS、原生复制、后台与上报                | 生产项目已启用                   |
| 正式环境                    | `aiao-media-e2e:public-origin-smoke`、`aiao-media-e2e:provider-acceptance`             | `https://media.aiao.io` 上的发布、离线与真实供应商交付          | 未覆盖的供应商、设备或系统输入法 |

合成 composition 事件只验证编辑器状态机，不替代真实系统 IME；视口模拟不替代移动真机；fixture 的 URL 结果只验证请求约束，不替代真实跨 origin 原图；dry-run 不代表已发布。

## 2026-10-29 分支收尾本地基线

当前分支源码（含 2026-10-29 合入的收尾改动），Node 26.12.0，`NX_LOAD_DOT_ENV_FILES=false`、远程缓存关闭。执行记录与来源见[分支收尾](plans/branch-completion-20261029.md)。

| 入口                                                                                    | 结果                                                                    | 证据边界                                                            |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `lint` / `typecheck`（`aiao-media`、`aiao-media-e2e`）                                  | 通过，ESLint `--max-warnings=0`                                         | 静态检查                                                            |
| `aiao-media:test`                                                                       | 36 个文件、705 项通过                                                   | unit/data；先运行需求门禁                                           |
| `aiao-media:coverage --args='--maxWorkers=1'`                                           | 39 个文件、734 项通过；语句 87.30%、分支 80.83%、函数 85.34%、行 95.11% | 含 29 项真实 SQLite/IndexedDB/OPFS 浏览器数据测试；E2E 不折算覆盖率 |
| `aiao-media-e2e:local-first-e2e`                                                        | 34/34                                                                   | 生产静态产物、真实 Chrome；供应商、Auth 与绑定服务为 fixture        |
| `aiao-media-e2e:offline-update-e2e`                                                     | 通过                                                                    | 本地实际产物的更新等待、切换、回退与草稿/原图保留                   |
| `aiao-media-e2e:provider-acceptance-fixture`                                            | Images API PNG/MiniMax JPEG 共 12 个通道/画幅组合通过                   | 合成供应商响应；成功复用与未知阻断均不增加生成请求                  |
| `aiao-media-e2e:provider-result-network-fixture`                                        | 9 个真实 Chromium 原图网络场景通过                                      | CORS、CSP、重定向、HTTP 错误、连接、超时与未发请求的失败分类        |
| `aiao-media-e2e:provider-acceptance-check`                                              | 26/26                                                                   | 验收工具的未知锁、跨发布锁与跨进程运行锁                            |
| `aiao-media-e2e:desktop-ime-acceptance-check`                                           | 5/5                                                                     | 输入法验收入口的纯逻辑；入口本身尚未实跑                            |
| `aiao-media:relay-test` / `auth-config-test` / `script-test` / `production-bundle-test` | 12/12、2/2、29/29、3/3                                                  | 代理边界、公开配置与精确 CSP、运行策略处理函数、生产迁移包结构      |
| `aiao-media:product-test`、`aiao-media-e2e:supabase-e2e`、`aiao-media-e2e:product-e2e`  | 4 组 API 检查、3/3、8/8 通过                                            | 真实本地 Supabase，由分支收尾时的 Codex 工作区执行；不代表生产      |
| `aiao-media:deploy-check`                                                               | 生产构建、发布审查与 Wrangler dry-run 通过；公开账号配置为 `null`       | 同上执行来源；不代表已发布                                          |
| `aiao-media:requirements-check`                                                         | 0 个错误                                                                | 只校验结构、状态派生与链接，不验证需求与源码的语义一致性            |

逐场景边界见[本地可靠性验收](plans/local-reliability-verification.md)，账号逐条证据见[真实账号验收说明](plans/supabase-account-verification.md)，产品复制、后台与显式上报见[本地产品交付验收](plans/local-delivery-verification.md)，作品检索的分层样本与覆盖率限制见[实施清单](plans/library-search-tasks.md)。

## 2026-11-06 平台统一同步验证

本轮按 [D-16](decisions.md#d-16统一使用平台-supabase) 将同步收敛到平台账号，并删除用户自有项目的 OAuth、初始化和配置入口。以下为本地执行结果，不改变 MEDIA-US-303/305 的 `In Progress` 状态。

| 入口                                                                       | 结果                                                                                                                                                        | 证据边界                                                                                           |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `aiao-media:coverage --args='--maxWorkers=2'`                              | 57 个文件、984 项通过；语句 86.90%、分支 82.20%、函数 89.65%、行 90.12%                                                                                     | 当前应用测试与覆盖率；不折算 E2E 或生产验收                                                        |
| `lint` / `typecheck`（`aiao-media`、`aiao-media-e2e`）                     | 通过                                                                                                                                                        | 静态检查                                                                                           |
| `aiao-media-e2e:local-first-e2e` 的平台注册用例                            | “平台注册后可开启同步，无需配置自己的项目或管理授权”通过                                                                                                    | 真实浏览器与构建产物，Auth/业务请求为 fixture；本条仅记录该用例                                    |
| `aiao-media-e2e:product-e2e` 的平台原图接线用例                            | “平台账号跨设备同步作品与原图，Storage 字节夹具验证上传和取回接线”1 项通过                                                                                  | 隔离本地真实 Auth/数据库与双浏览器副本；Storage 上传/下载字节由 fixture 提供，不代表真实云 Storage |
| `aiao-media:relay-test` / `production-bundle-test` / `script-test`         | 30、7、59 项分别通过                                                                                                                                        | 后端和构建脚本契约；不代表已发布或云端权限已验                                                     |
| `aiao-media-e2e:platform-account-update-fixture --excludeTaskDependencies` | 旧 stable-null active 且旧页未关闭时升级、内容哈希配置读取与注册表单可用、数据保留、新版接管均通过，22.2 秒；离线新开页配置可用、表单可打开、本机原图可读取 | 本地真实浏览器/产物与 fixture；远端请求 0，未执行离线注册，不代表正式域名或公众注册邮件验收        |
| `auth-config-test`、脚本 lint、`deploy-check` / `release-check`            | 配置测试 3/3，其余通过                                                                                                                                      | 内容哈希配置构建与发布检查；修复已发布，正式站点表单复验通过，未提交注册                           |

浏览器用例见[平台注册入口](../apps/web-e2e/src/supabase-auth.spec.ts)和[平台作品/原图接线](../apps/web-e2e/src/product-local.spec.mts)。本节记录部署前的本地验证，不折算真实云 Storage；同日后续生产部署和云 API 结果见下节及[平台发布记录](plans/platform-supabase-release-20261106.md)，未完成 AC 不因此标为 Done。

## 正式环境证据

| 范围                     | 当前结论                                                                                                                                                                                                                                                                                       | 记录                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 发布                     | 统一平台首发 `cf252547-dd7c-4b0b-8b77-9e1de257ab4b` 于 2026-11-06 16:12:14（Asia/Shanghai）发布；旧配置缓存修复 `fb9c2e12-c181-4ded-ba65-c13fd0a0585b` 于当日 16:41:57 发布；当前版本 `36d61b6b-fd39-4a99-94b8-80afa0c05063` 于当日 22:07:31 发布，100% 流量；正式域名 `https://media.aiao.io` | [平台发布记录](plans/platform-supabase-release-20261106.md)                          |
| 平台数据库与文件权限     | 空库核验后执行 13 源 bootstrap，schema 10；真实云两普通账号/同账号第二会话的 metadata/log RLS、revision、tombstone 与私有 Storage 原字节 SHA-256 往返通过，B/匿名拒绝                                                                                                                          | [平台发布记录](plans/platform-supabase-release-20261106.md#真实云-api-验证)          |
| 平台 UI                  | 正式云 Auth/DB/Storage 下登录、确认范围、元数据同步、真实原图上传、第二设备草稿恢复和默认关闭上传、显式下载通过，下载字节/SHA-256 与原 PNG 一致；注册仅验证表单，未发邮件                                                                                                                      | [平台发布记录](plans/platform-supabase-release-20261106.md#正式域名-ui-进展)         |
| 平台公开 HTTP            | `/providers`、`/api/templates` 为 200，CSP 允许平台项目 `wss`，公开账号配置与 Worker 同项目，旧 OAuth start 为 404；线上 offline-manifest 字节与本地产物一致                                                                                                                                   | [平台发布记录](plans/platform-supabase-release-20261106.md#正式域名-ui-进展)         |
| 当前版本公网与离线浏览器 | 22:07 发布版本四路由直达及加载均为 200；58/58 缓存摘要匹配；真实断网后新开四路由保留 profile 与草稿；页面异常、生成和远端写入均为 0                                                                                                                                                            | [晚间发布复验](plans/platform-supabase-release-20261106.md#晚间-cloudflare-发布复验) |
| 旧配置缓存回归           | 本地真实旧缓存升级及离线回归通过；内容哈希配置 `/app-config-b29867111480b71c.js` 已发布并纳入离线 manifest。正式 `/providers#sync` 复验 `platformAvailable=true`、不可用提示消失、注册表单可见，未提交/发邮件                                                                                  | [平台发布记录](plans/platform-supabase-release-20261106.md#正式域名-ui-进展)         |
| 公众注册邮件             | 未配置自定义 SMTP；默认邮件只向项目团队成员发送，公众邮箱注册/确认邮件闭环未验证                                                                                                                                                                                                               | [平台发布记录](plans/platform-supabase-release-20261106.md#公众注册与剩余边界)       |
| 更新与回退               | 官方 A→B→A 实际产物切换、waiting/旧页关闭/activated 顺序及各阶段真断网四路由已通过（原 B 版本）；没有注入更高 schema marker                                                                                                                                                                    | [正式交付验收](plans/public-delivery-verification.md)                                |
| 代理出图                 | 原供应商三画幅各一次 HTTP 200，PNG 精确尺寸，保存、刷新回读与下载字节/SHA-256 一致；结果均为 base64                                                                                                                                                                                            | [正式交付验收](plans/public-delivery-verification.md)                                |
| 直连出图                 | 原供应商预检 403、正方形无响应；MiniMax 正方形业务成功但浏览器未读到原图，结果 URL 已过期；两条未知记录锁定不重发；横向、纵向待诊断                                                                                                                                                            | [供应商补验](plans/provider-acceptance-follow-up.md)                                 |
| 跨 origin 原图 URL       | 无真实成功证据                                                                                                                                                                                                                                                                                 | [供应商补验](plans/provider-acceptance-follow-up.md)                                 |
| 套餐                     | Cloudflare 控制台显示 Workers 免费套餐 US$0 与活动 Workers Free 订阅；账户另有既有订阅，不称全账户免费或零账单                                                                                                                                                                                 | [正式交付验收](plans/public-delivery-verification.md)                                |

历史 JPEG 及此前发布保持本机模式，其关闭账号配置的构建和离线证据仍见[原交付记录](plans/jpeg-delivery-verification.md)。2026-11-06 平台版本使用显式平台公开配置，生产 Supabase 已初始化并完成上述真实云 API 和完整浏览器同步样本，旧配置缓存修复已发布且正式站点表单复验通过；22:07 再发布版本的正式四路由与离线浏览器 smoke 已通过，58/58 缓存摘要匹配。自定义 SMTP、公众注册确认邮件和生产 Web/Tauri 余项仍待验，故事状态保持未关闭。

## 2026-11-09 国内自建部署

[国内发布记录](plans/self-hosted-release-20261109.md)记录公网 IP HTTPS、真实 Supabase、两个普通账号的 RLS/Storage 隔离、PNG/JPEG/TUS 摘要、浏览器四路由和离线启动，以及整机重启后的数据保留。原 Cloudflare 代理契约和 Worker dry-run 回归通过，未变更海外资源。公众邮件、站外备份、模型压力与 Web/Tauri 原图联验仍未完成，不扩大旧故事的验收结论。
