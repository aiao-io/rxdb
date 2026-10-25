# 验收记录与剩余任务

> 状态唯一真相源为 story YAML；此记录区分模拟供应商、真实本地服务和正式环境。当前 **1 Done / 9 In Progress / 1 Backlog，共 11 条**。

同仓迁入后的复验与旧构建升级证据见[RxDB 迁入验收](plans/rxdb-import-verification.md)。以下保留各产品 AC 的证据边界。

## 当前本地基线

| 入口                                                      | 当前结果                                                                                      | 证据边界                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `aiao-media:offline-assets`                               | 生产 CSR 构建通过，初始包低于 500 kB 预算                                                     | 无 SSR server bundle；包括公开账号配置和版本化离线资源                                |
| `lint` / `typecheck` / `test`                             | contracts、local-data、web 的检查和单元测试通过；web-e2e 类型/lint 与 supabase 脚本 lint 通过 | 本机状态机、契约、提示词与账号会话测试                                                |
| `aiao-media-e2e:local-first-e2e`                          | 28/28 通过：本机图片、本地可靠性与账号 fixture                                                | 真实 Chrome/RxDB/WASM/IndexedDB/OPFS/Service Worker；供应商和该套件 Auth 使用 fixture |
| `aiao-media:supabase-e2e` / `aiao-media-e2e:supabase-e2e` | 3 项真实本地账号浏览器场景通过                                                                | 生产静态应用、真实 Auth 和本地邮箱；断网场景只注入网络失败，不伪造成功响应            |
| `aiao-media:supabase-test`                                | 通过：真实 Auth、RLS、Realtime、刷新/退出探针                                                 | 此入口仅覆盖开发探针；产品业务表另由 product-test/product-e2e 验证                    |
| `aiao-media:product-test`                                 | 2026-10-25 复验：4 组真实本地 API 断言通过，28.0 秒；本应用 6 服务 healthy                    | 仅 up/migrate/API，无 browser/auth-config/build；Supabase 仍为本地                    |
| `aiao-media:relay-test`                                   | 4 项代理边界测试通过                                                                          | 同源/允许列表/参数限制、按请求凭据、无缓存、敏感错误清理与无自动重试                  |
| `aiao-media:auth-config-test`                             | 公开配置与精确回环 CSP 校验通过                                                               | 禁止服务端 Key、非回环 HTTP 和任意 HTTP 放行                                          |
| `aiao-media:release-check` / `aiao-media:deploy-check`    | 产物审查与 Wrangler dry-run                                                                   | 产物无凭据/SSR/source map/旧 API；不代表当前产物已发布                                |
| `aiao-media:requirements-check`                           | 17 项检查器及需求结构/链接门禁通过                                                            | 不验证需求描述与源码的语义一致性，也不替代产品验收                                    |

本机图片套件覆盖默认供应商、配置/草稿恢复、三画幅生成/保存/下载、不确定结果不重发、Key 生命周期、主动代理及结果 URL 无凭据读取、四路由离线、移动视口、多标签生成互斥和草稿冲突选择、OPFS 写失败重试、保存/删除 journal 重开恢复、超限/损坏/中断备份、schema 兼容守卫、模板撤销边界及资源失败重试。逐场景边界见[本地可靠性验收](plans/local-reliability-verification.md)。账号逐条 AC 证据见[真实账号验收说明](plans/supabase-account-verification.md)。

## 正式环境证据

2026-10-25 当前 B：source `c2ab7dc0`，version `cc8cc646-560e-4d36-b0cb-2e311a2d0e25`，manifest SHA-256 `9d303528a1f123d4c4dc8932fc7321b02fa5b360883a4885c9234498ed1d01fd`，46 资源、账号 `null`、allowlist 1 项。原始生成验收 deployment `12606e16-5ba7-44e5-ba8f-0c7081821544`；切换后官方恢复 B 的当前 deployment 为 `aac93845-7add-4fd3-b45a-d37dfc5d1319`，创建于 `2026-10-25T04:36:20.644433Z`，API 核对 100% B 流量。完整证据见[正式交付验收](plans/public-delivery-verification.md)。

正式官方 A→B→A 真实产物切换及各阶段真断网四路由已通过，waiting 时旧 DOM 保持，旧页关闭后新 worker activated 并加载正确入口；profile/schema `1`、完整测试供应商配置与空 Key、草稿、通过产品备份导入的合法 fixture 原图精确字节下载保持，0 生成。没有注入构建/更高 schema marker，不将已验本地兼容守卫写成线上 schema 转换。最终官方恢复 B（`restoredB=true`）后新版 public smoke 再次通过，直接 HTTP/导航/CSP、缓存46/46、旧页关闭后的离线新文档与草稿均通过。MEDIA-US-004 AC1–4✅，故事仍 `In Progress`；保留同一隔离 context 范围，不声称浏览器进程重启。

真实供应商代理三画幅各一次 HTTP 200，PNG 精确尺寸、RxDB/OPFS 保存、刷新回读与下载逐字节/SHA-256 一致。直连正方形一次尝试无响应，保持 `requires-review`/`BROWSER_TIMEOUT`；结合 OPTIONS 403 仅记录限制与未知，未重发，另外两幅直连未尝试。该证据关闭 MEDIA-US-105 AC6、202 AC7；102 AC7 仅代理部分已验，直连部分未完成，整项保持 ⚠️；三项成功结果均为 base64，105 AC7 的真实 URL 原图无凭据读取仍未验。

Cloudflare 控制台已实读 Workers 当前免费套餐 US$0 和活动 Workers Free 订阅；账户另有既有订阅，不宣称全账户免费或零账单。三个 story 保持 `In Progress`，PR 尚未合并。

## 本轮正式验收剩余项

| 待验项目               | 对应故事 / AC    | 必需证据                                                                                          |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| 分通道三画幅的直连部分 | MEDIA-US-102 AC7 | 代理部分已验；直连正方形未知未重发，横向/纵向未尝试；保持原条件和 ⚠️，不重发未知请求              |
| 真实跨 origin 图片 URL | MEDIA-US-105 AC7 | 当前成功结果均为 base64；仍需真实 URL 结果 GET 无 Authorization/Cookie/Referer 并可精确下载的证据 |

正式 origin 为 `https://media.aiao.io`，目前完成上述受限范围的真实交付与浏览器验证。默认直连/代理三画幅逐项执行；可显式选择模式/画幅，结果仅覆盖所选计划，未知请求不得重发。当前应复用已验证的代理三项、保留直连未知锁，不能为重复取证再生成；入口与参数见[收尾清单](plans/release-completion-tasks.md)。

2026-10-25 用户决定：真实桌面中文 IME 本轮跳过，MEDIA-US-106 AC7 保持 ⚠️、尚未验；MEDIA-US-107 的三个移动真机 AC 继续暂缓、保持未验，不列为本轮关闭条件。Supabase 本轮仅本地，生产账号/同步/后台未部署、属于后续启用条件。故事状态继续按 YAML 与未完成 AC 如实记录，不能将跳过或本地通过记为生产通过。

本地可复验 AC 已回写各 story；视口模拟、fixture、开发探针表与 dry-run 分别只覆盖其声明的验证层。当前范围见[路线图](roadmap.md)与[决策](decisions.md)。

## 产品绑定、同步与后台

真实本地产品表、原生复制、双独立副本、账号隔离、首次确认、冲突/删除、作品信息、后台与显式任务上报已接线。本轮 Supabase 范围固定为本地，生产账号/后台尚未部署；详细实现、命令、7 个浏览器场景及边界见[本地产品交付验收](plans/local-delivery-verification.md)。

`aiao-media:product-test` 与 `aiao-media-e2e:product-e2e` 分别验证真实服务边界和生产静态应用。`aiao-media:script-test` 覆盖代理运行策略的实际处理函数，供应商响应使用 fixture。D-06 已确定首发不设 TTL、不自动清理，完整保留 tombstone、冲突与日志；检查点恢复已由 7 项真实产品套件单独留证，不把本地通过视为已经上线。正式执行顺序与条件见[收尾清单](plans/release-completion-tasks.md)。
