# 验收记录与剩余任务

> 状态唯一真相源为 story YAML；此记录区分模拟供应商、真实本地服务和正式环境。当前 **8 Done / 1 In Progress / 0 In Review / 1 Backlog / 2 Blocked，共 12 条**。

同仓迁入后的复验与旧构建升级证据见[RxDB 迁入验收](plans/rxdb-import-verification.md)。以下保留各产品 AC 的证据边界。

## PNG/JPEG 交付与最新 MiniMax 正式验收（2026-10-25）

PNG/JPEG 原图交付已实现并发布，包含实际格式校验、保存/回读、下载后缀、备份恢复、同步元数据和工作区兼容标记 2。完整覆盖率测试 700/700、页面 E2E 32/32、Images API PNG/MiniMax JPEG 共 12 个生产 Worker fixture 组合通过；行 94.96%、语句 87.23%、函数 84.88%、分支 80.44%。追加 JPEG 同步投影断言后，相关真实浏览器测试 4/4 通过。应用与 e2e lint/typecheck 通过。

正式 Worker version 为 `e6ece57b-cd1f-4834-99cb-f20813817eb2`，2026-10-25 21:59:23（Asia/Shanghai）发布，官方核对 100% 流量；四路由、草稿刷新、46/46 缓存摘要和真断网新文档启动烟测通过。本次未执行真实更新/回退；旧 C 不兼容 JPEG 工作区。

22:04:17 的正式 MiniMax direct/square 请求返回 HTTP 200 / 业务码 0 和单个图片 URL，请求 ID `072d3f68cb4bb6729477e6e2163d1f21`。浏览器未取得对应的可读原图响应，原图读取、保存、刷新回读和精确下载未通过；本轮真实产品验收 0/3，横/竖两幅未发送，生成 POST 共 1 次，自动重试 0。原因尚未确定，不能归因为 JPEG 解码失败或 CORS；结果 URL 未持久化，需要供应商按请求 ID 提供原图 URL/处理记录后再只读复核。102/105 保持 Blocked；下方 1033 与旧 PNG 契约段落保留为历史记录。当前完整证据与后续关闭条件见[JPEG 交付验收](plans/jpeg-delivery-verification.md)。

## 用户结项指令与供应商补验（2026-10-25）

用户确认已推送，并要求已验故事记为 Done、继续补供应商验收。PR #154 的远程 head `2ef6f2c5` 仍为 OPEN/DRAFT、未合并；该轮 CI 的图库 E2E 失败，PGlite 任务被 runner 关机信号中断。本地 E2E 修复及复验见下文，远程仍待后续提交重验。004/201/202/203/204/301/302 的全部 AC 已验，按 [D-11](decisions.md)在当前分支记为 Done，评审/合并单独跟踪。

供应商补验已完成只读复核：正式 manifest 摘要与审核 B 一致；模型目录 GET 200、配置模型存在；正式 origin 的生成 OPTIONS 仍为 403、无 CORS 许可头；用量 GET 200 但只有按日/模型汇总、没有单次请求 ID 或结果。现有真实成功结果仍为 base64，本机原 live 尝试日志缺失。无法据此关闭 102 AC7/105 AC7，两条故事记为 Blocked，新增生成请求为 0。详见[补验记录](plans/provider-acceptance-follow-up.md)。

本轮校验：需求门禁 17/17、537 个链接与 10 个锚点通过；验收脚本诊断按红绿流程补齐，guard 测试 12/12、e2e lint/typecheck 通过。真实入口的 direct/square 单项以 `PREVIOUS_ATTEMPT_REQUIRES_REVIEW` 停止，`verified=0`、新增生成 0，供应商 AC 未通过。

## MiniMax 原生接口补验（2026-10-25）

用户另选 MiniMax 后，国内区订阅用量 GET 返回 HTTP 200 / 业务码 0，国际区返回 2049；原生图片接口对正式 origin 的 OPTIONS 为 200，允许 POST、Authorization 与 Content-Type。仅向国内区发送一次 `image-01`、1024×1024、`n=1`、URL 响应的原生图片请求，时间为 19:26:41（Asia/Shanghai），返回 HTTP 200 / `1033 / system error`，无图片 URL。官方将 1033 定义为系统错误/下游服务错误，不能推断 Key 无图片权限或零计费。

尝试记录保留 `requires-review`，自动重试 0 次；未取得真实图片，未验原图 GET、PNG、产品保存/刷新回读/精确下载。MiniMax 原生 `/v1/image_generation` 与产品现有 `/images/generations` 的请求及响应协议不同，该次探测未改适配器、未部署。102 AC7/105 AC7 继续 ⚠️，两条故事仍 Blocked。官方依据、脱敏单次记录摘要和继续执行条件见[供应商补验记录](plans/provider-acceptance-follow-up.md#minimax-单次原生接口探测2026-10-25)。

## MiniMax 原生适配与本地回归（2026-10-25）

用户要求继续后，完成 `image-01` 的固定官方前缀适配。浏览器直连、Worker 转发与正式验收共用请求映射，精确发送三画幅 `width/height`；代理入口、存储格式及已有 Images API 配置兼容。原生业务错误使用数值分类，不回显上游消息，1033 等系统错误保留待核对；原图仍须真实 PNG，不通过转码冒充供应商结果。

按红绿流程补齐适配器和 Worker 测试后，应用单元测试 640/640、代理边界 12/12、验收脚本守卫 15/15、应用与 e2e 的 lint/typecheck 均通过。生产形态浏览器 fixture 扩展为 Images API/MiniMax 各 6 个、共 12 个通道/画幅组合，真实执行本地保存、刷新回读与逐字节下载，并验证成功复用和 MiniMax 系统错误后的请求阻断。

完整覆盖率复验 36 文件、662/662 通过：行 94.65%、语句 86.74%、函数 84.72%、分支 80.30%，均达到 80%；新协议映射文件四项均为 100%。

追加只读用量接口仅返回 `general`、`video` 汇总，不能证明图片权限或核对单次结果。适配实施阶段新增真实生成 0 次、未部署；后续正式 C 发布见下节。原生 1033 与原供应商未知记录继续保留，102/105 仍 Blocked。适配范围、官方依据与证据边界见[补验记录](plans/provider-acceptance-follow-up.md#minimax-原生适配与本地验证2026-10-25)。

## 正式 C 发布与公网烟测（2026-10-25）

提交 `2ef6f2c5` 已发布：Worker version `caaf54dd-054b-4be8-a523-518c3875c7a9`，deployment `3b4aed97-17e0-45b7-a446-68d7b7701e3f`，官方 API 确认 100% C 流量。manifest SHA-256 为 `baefea694936345bd05eeb54a69f3b1a0fe76ddef45b8a5828fe35d4af843a33`。发布审查 60 文件通过，账号配置 `null`、代理允许列表 1 项。

真实公网烟测通过：四路由 HTTP/浏览器 200 与 CSP、草稿刷新、46/46 离线缓存摘要、真断网后关闭旧页再以四条新文档启动。生成请求、远程写入、页面异常和越界请求均为 0；本次未验证 B/C 更新或回退。初次静态上传 401 经新官方上传会话完成，原 B 产物与回执已保留。详细身份、证据路径及范围见[供应商补验记录](plans/provider-acceptance-follow-up.md#正式发布-c-与公网烟测)。

MiniMax 原生适配和作品检索实现已上线；102/105 仍缺真实供应商验收，两份未知请求继续锁定。作品检索功能 AC 沿用既有本地分层证据，Supabase 仍仅本地。

## CI 备份导入回归（2026-10-25）

远程提交 `2ef6f2c5` 的[图库 E2E job](https://github.com/aiao-io/rxdb/actions/runs/40192486445/job/121166984466)为 30/31，通过备份播种的第一个图库用例等待 reload/load 90 秒超时。失败 trace 显示文件输入框刚通过 enabled 断言，在实际 `setInputFiles` 时已因工作区初始化重新禁用，最终没有导入提示或新页面。Playwright 的 `setInputFiles` 不检查控件是否 enabled，独立的 enabled 断言无法保证随后上传时仍可操作。

将[备份导入辅助函数](../../aiao-media-e2e/src/local-first.helpers.ts)改为点击原生文件输入框并等待 filechooser，再选择备份文件；点击会执行 enabled 等 actionability 检查。未增加导入重试。本地使用 Chromium、独立端口 4407 与原 `local-first` 套件：失败用例连续 3/3 通过，完整 E2E 31/31 通过（约 2 分 5 秒），e2e lint/typecheck 均通过。生产应用源码和正式 C 资源未因该测试修复改变。

同轮的 [PGlite test lane](https://github.com/aiao-io/rxdb/actions/runs/40192486445/job/121166984450)在运行时收到 runner shutdown signal，Test step 为 cancelled；日志未出现断言失败，也没有完整测试结束结果，保留远程重验事项。未修改 `packages/*`。上述本地修复尚未进入该远程 head，PR CI 不计作全绿；评审与合并继续单独跟踪。

## 状态与剩余验收核对（2026-10-25）

按[状态定义](CONVENTIONS.md#状态定义)核对全部 12 条故事、79 条 AC，73 条已有通过证据。[本地交付](plans/local-delivery-tasks.md) 17/17 与[作品检索](plans/library-search-tasks.md) 10/10 的实施任务已完成；此前将全部 AC 已验的 MEDIA-US-004/201/202/203/204/301/302 从 In Progress 转为 In Review；现按用户后续指令及 D-11 记为 Done，并同步总览、需求入口、路线图、能力矩阵、epic 与清单。上述七条按本轮限定口径结项；其他故事沿用默认 Done 定义，全部 AC 与硬依赖要求保留。

剩余 6 条分别为 MEDIA-US-102 AC7 直连部分、105 AC7 真实跨 origin URL、106 AC7 真实桌面 IME 和 107 的三个移动真机 AC。每条关闭条件见[状态概览](status-overview.md#未完成验收与关闭条件)，保留未知请求不重发、D-09 跳过与 D-04 暂缓。Supabase 本轮仅本地。

通过 GitHub 只读核对 PR #154：仍为 OPEN/DRAFT，远程 head 为 `fdd9b469`、已有 CI 门禁通过、没有批准评审；本地测试源码基线为 `ce016021`，其测试证据见下方实施规划复核，远程 CI 结果不覆盖本地新增提交。本轮只变更需求文档，`aiao-media:requirements-check` 与变更文档格式检查通过；未新增真实供应商、系统 IME、移动真机或生产部署证据。

## 本地实施规划复核（2026-10-25）

源码基线为 `fdd9b469..ce016021`，运行环境为 Node 26.7.0。逐项核对[作品检索清单](plans/library-search-tasks.md)的 10/10 项和[本地交付清单](plans/local-delivery-tasks.md)的 17/17 项，均已有实现与对应证据，本地实施清单无未完成项。本轮补充当前源码的复验记录。

通过 `pnpm nx affected` 以 `HEAD~1` / `HEAD` 为基线，串行复验受影响的 `aiao-media`、`aiao-media-e2e` 及其依赖，共 37 项任务通过，耗时 5 分 20 秒，本地缓存命中 21/37。覆盖 lint、typecheck、test、test-browser、build、library-e2e、provider-acceptance-fixture、public-origin-smoke-fixture 和 actual-release-update-check；610 项 unit/data、22 项真实 SQLite/IndexedDB/OPFS 浏览器测试、31 项页面 E2E 和 6 组供应商 fixture 均通过。

默认 E2E 的 `4398` 端口被已有 Wrangler 服务占用，首轮在启动浏览器前停止；复验使用已有 `library-e2e` 配置的 `4407` 端口，继承相同的四个测试文件，31/31 通过、耗时约 2 分 48 秒。保留原有服务，未修改测试配置。

独立运行 `aiao-media:coverage --args='--maxWorkers=1'`，36 文件、632/632 通过；行 94.62%、语句 86.64%、函数 84.62%、分支 80.06%，四项均达到 80%，统计范围与排除项保持原配置。生产构建仍为 `9b55b9d6cb7e`、46 个完整性校验公开资源；`aiao-media:release-check` 审查 60 文件通过，最大文件 1,263,008 bytes。构建与审查均设置 `NX_LOAD_DOT_ENV_FILES=false`，公开账号配置为空，远程缓存禁用。

`pnpm nx format:check` 与 `aiao-media:requirements-check` 通过；复验时尚未收敛故事状态，共 12 条 story；当前状态以本页顶部和 story YAML 为准。本轮使用本地 fixture，不新增真实供应商生成、部署或生产 Supabase 证据。正式验收仍保留 MEDIA-US-102 AC7 的直连部分和 MEDIA-US-105 AC7 的真实跨 origin URL 原图读取；未知请求不重发，真实桌面 IME 与移动真机按既有决定保持未验；后续状态收敛不增加验收证据。

## 应用质量收尾（2026-10-25）

沿用现有 Vitest 配置和统计范围，没有新增覆盖率排除项。`aiao-media:coverage --args='--maxWorkers=1'` 已通过 36 个文件、632/632 项测试（610 项 unit/data + 22 项真实 SQLite/IndexedDB/OPFS 浏览器测试）。E2E 不折算 Vitest 覆盖率。

| 指标 | 检索首次验收基线 | 当前质量收尾 |
| ---- | ---------------: | -----------: |
| 行   |           63.32% |       94.62% |
| 语句 |           60.99% |       86.64% |
| 函数 |           60.73% |       84.62% |
| 分支 |           56.65% |       80.06% |

四项均达到 80%。报告仍输出到仓库根 `coverage/apps/aiao-media/`，以 `coverage-summary.json`、`coverage-final.json` 和 `lcov.info` 为依据；不将此统计扩展成未被该配置统计的代码或端到端覆盖率承诺。

新增测试覆盖供应商公开字段与 Key 分离、单次生成前持久记账、未知请求禁止重发、运行策略、账号重新验证、后台权限撤销、真实编辑器参数/撤销历史、备份 staging 恢复、工作区切换、原图错误分类和损坏同步日志拒绝访问。

红测复现并修复两处产品问题：重试保存期间切换工作区或开始新创作时，旧文件/任务日志的迟到成功或失败不能再改写当前任务、历史或提示；公开账号配置无效时，工作区使用已验证账号客户端的配置，本机创作继续可用。页面关闭同样丢弃旧保存回调，不删除已持久化的原文件。

最终 affected 以 `HEAD` 为基线，仅影响 `aiao-media`、`aiao-media-e2e`。`lint/typecheck/test/test-browser/build/e2e` 与依赖共 38 项任务全部通过，串行耗时 7 分 13 秒，本地缓存命中 18/38；远程缓存禁用、账号配置为空。两项目 ESLint 均使用 `--max-warnings=0`，应用与测试类型检查通过，610 项 unit/data 和 22 项真实浏览器测试再次通过。

Chrome 本机 E2E 31/31 通过，耗时约 4 分钟；供应商验收的 6 组 Worker/fixture 组合、公开入口 fixture 烟测和更新验收控制器脚本检查通过。当前生产 CSR/offline-assets 构建为 `9b55b9d6cb7e`，包含 46 个完整性校验公开资源；`release-check` 审查 60 个文件通过，最大文件 1,263,008 bytes，无供应商凭据、SSR 运行时、source map 或旧 API。此处的“生产构建”仅表示 production 配置产物，未部署。

供应商响应、后台与账号端点均使用本地 fixture；URL 结果测试只验证无 Authorization/Cookie/Referrer 的请求约束，不替代真实跨 origin URL 验收。合成 composition 事件只验证编辑器状态机，不替代真实系统 IME。Supabase 仍仅本地，本轮没有新增真实供应商生成请求、生产服务或部署。

## 本地作品检索验收（2026-10-25）

MEDIA-US-204 全部 AC 已通过分层本地验收：提示词/模型原生字面 AND、本地整日与 DST、createdAt/实体 id 稳定倒序、24 件原生分页、真实 IO 按需原图及全库 metadata 隔离。冷重开不遍历 ready 原图，显式预览/详情/备份继续完整验证；saving 完整回读后提交、deleting 继续恢复。全库 metadata 首次成功前不推断空库、remote-only 或无副本，后续读取失败保留已知归属，不将失败提交为空同步快照。

生产 CSR/offline-assets 构建 `36099280eb40`、46 个完整性校验公开资源；最终统一 Chrome E2E 31/31（原有 28 项与新增 3 项），约 1 分 27 秒。`release-check` 审查 60 文件通过，无供应商凭据、SSR 运行时、source map 或旧 API。全部是本地构建/验收，没有部署；故事已按用户本次指令及 D-11 记为 Done，PR 评审与合并单独跟踪。

证据分层：查询契约 7 项；真实 SQLite/IndexedDB/OPFS 浏览器 22 项，含 1,005 条 metadata 页/计数压力、105 条全库归属以及 3 项冷启动/只读恢复；会话/指令/metadata/根组件呈现测试验证失效与错误边界。全应用真实 IO 样本只有 50 张图片，同文档 Alice 原库→Bob 空库→Alice 原 50 库，验证筛选/分页重置、旧 URL 释放、原 profile 归属、全部 50 条任务保存记录和不变的 `performance.timeOrigin`。这不是 1,000 张原图的 UI 性能实测，不提供未经测量的毫秒指标。

工作区切换先由真实 UI 显式准备 Alice 绑定，fixture 工作区目录返回空、ensure 返回 503，留下合法且未初始化的待完成绑定。准备仅 1 次目录读取和 1 次失败 ensure；随后筛选/切换零业务请求，生成、复制、上报、上传为零。Auth/供应商/绑定端点是 fixture，不替代真实 Supabase 产品服务验收。具体 AC 对照与命令见[实施清单](plans/library-search-tasks.md)。

检索首次验收的 `aiao-media:coverage` 为 30 文件、294/294 通过（272 项 unit/data + 22 项真实浏览器）。新模块与全应用统计如下，数字顺序固定为行/语句/函数/分支：

覆盖率产物统一生成到仓库根 `coverage/apps/aiao-media/`，与 Nx outputs 和通用 CI 收集路径一致。已按 CI 参数单独复跑 272 项测试，并核对 `coverage-final.json`、`coverage-summary.json`、`lcov.info` 均存在；完整 294 项覆盖率复跑也通过。

通用 CI 曾在原有中断导入重试用例等待 reload 超时；专项同例通过，旧失败未上传 trace，无法据此确定业务根因。上传 helper 现先等待文件输入框启用，Playwright 产物对齐 `apps/aiao-media-e2e/test-output/playwright/output/`，完整 31 项重新通过，后续 CI 可保留截图和 trace。

| 范围                        |     行 |   语句 |   函数 |   分支 |
| --------------------------- | -----: | -----: | -----: | -----: |
| `library-query.ts`          |   100% |   100% |   100% |   100% |
| `work-library-session.ts`   |  99.2% |  95.2% |   100% | 88.63% |
| `work-visible.directive.ts` |   100% |   100% |   100% |   100% |
| `work-metadata-session.ts`  |   100% |   100% |   100% |   100% |
| 检索首次验收全应用基线      | 63.32% | 60.99% | 60.73% | 56.65% |

检索首次验收时，全应用 coverage 低于 80%；当时的根组件呈现测试首次将大型 `LocalImageMvp` 纳入统计，只覆盖归属呈现路径。该表保留历史基线，当前质量收尾的四项指标见上方；两次统计均未将 E2E 折算为 Vitest 覆盖率。

## 当前本地基线

| 入口                                                      | 当前结果                                                                                      | 证据边界                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `aiao-media:offline-assets`                               | 生产 CSR 构建通过，初始包低于 500 kB 预算                                                     | 无 SSR server bundle；包括公开账号配置和版本化离线资源                                 |
| `lint` / `typecheck` / `test`                             | contracts、local-data、web 的检查和单元测试通过；web-e2e 类型/lint 与 supabase 脚本 lint 通过 | 本机状态机、契约、提示词与账号会话测试                                                 |
| `aiao-media-e2e:library-e2e`                              | 本轮 31/31：原有 28 项本机/可靠性/Auth 加 3 项检索/可见预览/切工作区                          | 最终生产静态构建、真实 Chrome/RxDB/WASM/IndexedDB/OPFS；供应商/Auth/绑定服务为 fixture |
| `aiao-media:supabase-e2e` / `aiao-media-e2e:supabase-e2e` | 3 项真实本地账号浏览器场景通过                                                                | 生产静态应用、真实 Auth 和本地邮箱；断网场景只注入网络失败，不伪造成功响应             |
| `aiao-media:supabase-test`                                | 通过：真实 Auth、RLS、Realtime、刷新/退出探针                                                 | 此入口仅覆盖开发探针；产品业务表另由 product-test/product-e2e 验证                     |
| `aiao-media:product-test`                                 | 2026-10-25 复验：4 组真实本地 API 断言通过，28.0 秒；本应用 6 服务 healthy                    | 仅 up/migrate/API，无 browser/auth-config/build；Supabase 仍为本地                     |
| `aiao-media:relay-test`                                   | 4 项代理边界测试通过                                                                          | 同源/允许列表/参数限制、按请求凭据、无缓存、敏感错误清理与无自动重试                   |
| `aiao-media:auth-config-test`                             | 公开配置与精确回环 CSP 校验通过                                                               | 禁止服务端 Key、非回环 HTTP 和任意 HTTP 放行                                           |
| `aiao-media:release-check` / `aiao-media:deploy-check`    | 产物审查与 Wrangler dry-run                                                                   | 产物无凭据/SSR/source map/旧 API；不代表当前产物已发布                                 |
| `aiao-media:requirements-check`                           | 17 项检查器及需求结构/链接门禁通过                                                            | 不验证需求描述与源码的语义一致性，也不替代产品验收                                     |

本机图片套件覆盖默认供应商、配置/草稿恢复、三画幅生成/保存/下载、不确定结果不重发、Key 生命周期、主动代理及结果 URL 无凭据读取、四路由离线、移动视口、多标签生成互斥和草稿冲突选择、OPFS 写失败重试、保存/删除 journal 重开恢复、超限/损坏/中断备份、schema 兼容守卫、模板撤销边界及资源失败重试。逐场景边界见[本地可靠性验收](plans/local-reliability-verification.md)。账号逐条 AC 证据见[真实账号验收说明](plans/supabase-account-verification.md)。

## 正式环境证据

2026-10-25 原 B 验收时：source `c2ab7dc0`，version `cc8cc646-560e-4d36-b0cb-2e311a2d0e25`，manifest SHA-256 `9d303528a1f123d4c4dc8932fc7321b02fa5b360883a4885c9234498ed1d01fd`，46 资源、账号 `null`、allowlist 1 项。原始生成验收 deployment `12606e16-5ba7-44e5-ba8f-0c7081821544`；切换后官方恢复 B 的 deployment 为 `aac93845-7add-4fd3-b45a-d37dfc5d1319`，创建于 `2026-10-25T04:36:20.644433Z`，API 核对 100% B 流量。完整证据见[正式交付验收](plans/public-delivery-verification.md)。

正式官方 A→B→A 真实产物切换及各阶段真断网四路由已通过，waiting 时旧 DOM 保持，旧页关闭后新 worker activated 并加载正确入口；profile/schema `1`、完整测试供应商配置与空 Key、草稿、通过产品备份导入的合法 fixture 原图精确字节下载保持，0 生成。没有注入构建/更高 schema marker，不将已验本地兼容守卫写成线上 schema 转换。最终官方恢复 B（`restoredB=true`）后新版 public smoke 再次通过，直接 HTTP/导航/CSP、缓存46/46、旧页关闭后的离线新文档与草稿均通过。MEDIA-US-004 AC1–4✅，故事按 D-11 记为 `Done`，PR 评审与合并单独跟踪；保留同一隔离 context 范围，不声称浏览器进程重启。

真实供应商代理三画幅各一次 HTTP 200，PNG 精确尺寸、RxDB/OPFS 保存、刷新回读与下载逐字节/SHA-256 一致。直连正方形一次尝试无响应，保持 `requires-review`/`BROWSER_TIMEOUT`；结合 OPTIONS 403 仅记录限制与未知，未重发，另外两幅直连未尝试。该证据关闭 MEDIA-US-105 AC6、202 AC7；102 AC7 仅代理部分已验，直连部分未完成，整项保持 ⚠️；三项成功结果均为 base64，105 AC7 的真实 URL 原图无凭据读取仍未验。

Cloudflare 控制台已实读 Workers 当前免费套餐 US$0 和活动 Workers Free 订阅；账户另有既有订阅，不宣称全账户免费或零账单。MEDIA-US-004 按 D-11 记为 `Done`，MEDIA-US-102/105 补验受阻、记为 `Blocked`，PR 尚未合并。

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
