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

## 当前本地基线

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

## 正式环境证据

| 范围               | 当前结论                                                                                                                                                                         | 记录                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 发布               | 线上为 JPEG 版本 `e6ece57b-cd1f-4834-99cb-f20813817eb2`，`wrangler deployments status` 核对 100% 流量；manifest SHA-256 `e83a9f05…`；四路由、CSP、46/46 缓存与断网新文档烟测通过 | [JPEG 交付验收](plans/jpeg-delivery-verification.md)  |
| 更新与回退         | 官方 A→B→A 实际产物切换、waiting/旧页关闭/activated 顺序及各阶段真断网四路由已通过（原 B 版本）；没有注入更高 schema marker                                                      | [正式交付验收](plans/public-delivery-verification.md) |
| 代理出图           | 原供应商三画幅各一次 HTTP 200，PNG 精确尺寸，保存、刷新回读与下载字节/SHA-256 一致；结果均为 base64                                                                              | [正式交付验收](plans/public-delivery-verification.md) |
| 直连出图           | 原供应商预检 403、正方形无响应；MiniMax 正方形业务成功但浏览器未读到原图，结果 URL 已过期；两条未知记录锁定不重发；横向、纵向待诊断                                              | [供应商补验](plans/provider-acceptance-follow-up.md)  |
| 跨 origin 原图 URL | 无真实成功证据                                                                                                                                                                   | [供应商补验](plans/provider-acceptance-follow-up.md)  |
| 套餐               | Cloudflare 控制台显示 Workers 免费套餐 US$0 与活动 Workers Free 订阅；账户另有既有订阅，不称全账户免费或零账单                                                                   | [正式交付验收](plans/public-delivery-verification.md) |

正式产物均以 `NX_LOAD_DOT_ENV_FILES=false AIAO_SUPABASE_URL='' AIAO_SUPABASE_ANON_KEY=''` 构建，公开账号配置为 `null`；生产 Supabase 未部署。
