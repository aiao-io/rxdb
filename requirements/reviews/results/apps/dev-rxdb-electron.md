---
kind: review-execution
object: dev-rxdb-electron
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# dev-rxdb-electron：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Electron 主进程/preload/renderer 与 SQLite/PGlite/浏览器后端及 DevTools 扩展集成。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`apps/dev-rxdb-electron/src-electron/main.ts`](../../../../apps/dev-rxdb-electron/src-electron/main.ts)
- [`apps/dev-rxdb-electron/src-electron/preload.ts`](../../../../apps/dev-rxdb-electron/src-electron/preload.ts)
- [`apps/dev-rxdb-electron/src-electron/desktop-host-request-guard.ts`](../../../../apps/dev-rxdb-electron/src-electron/desktop-host-request-guard.ts)
- [`apps/dev-rxdb-electron/src-electron/desktop-session-ownership.ts`](../../../../apps/dev-rxdb-electron/src-electron/desktop-session-ownership.ts)
- [`apps/dev-rxdb-electron/src-electron/desktop-pglite-bridge.ts`](../../../../apps/dev-rxdb-electron/src-electron/desktop-pglite-bridge.ts)
- [`apps/dev-rxdb-electron/src/app/app.service.ts`](../../../../apps/dev-rxdb-electron/src/app/app.service.ts)
- [`apps/dev-rxdb-electron/package.json`](../../../../apps/dev-rxdb-electron/package.json)
- [`apps/dev-rxdb-electron/project.json`](../../../../apps/dev-rxdb-electron/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `test`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `build`     | 本轮通过（限定当前配置/平台） | 执行日志     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 backend 选择与资源生命周期：逐档审查 local backend、DB 路径、连接初始化/关闭与不支持配置的明确拒绝。
- [ ] C2 桌面安全边界：从页面到 bridge/invoke/host 核查 session、sender、frame、allowlist 和 privilege；与 adapter 协议双端对照。
- [ ] C3 业务、存储与备份：核查真实 Todo/文件操作、backup-probe、restore 和应用重启，区分 DB 与文件备份范围。
- [ ] C4 DevTools 隔离：检查 fake-provider/probe、调试窗口、relay、settings/files mutation 与开发/生产 gating。
- [ ] C5 打包资源与延迟后端：核查 native 库/WASM/Worker/插件资源、build-devtools 与 audit-lazy-backend；开发 server 通过不代表安装包可用。
- [ ] C6 Electron 专项：核查 contextIsolation/sandbox、navigation、IPC frame ownership、PGlite worker 和 electron-builder 产物。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 专项任务核销

- backend 延迟加载产物审计通过。

上述只是对应任务/平台的证据，专项 C 项/其它宿主未自动完成。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：strict lint、typecheck；当轮门禁限定。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项                      | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                          | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 backend 选择与资源生命周期 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src/app/setup_rxdb.ts:75-141 localBackends/resolveLocalBackend/localDatabase`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src/app/local-backend.ts:71-133 selectLocalBackend`<br>SQLite/PGlite动态import，桌面与web preview使用不同dbName；候选表重复adapter/dbName硬拒绝，连接选路缓存。browser preview是声明的路径，不把它当真实桌面通过。                              | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实首次启动/坏路径、初始化退出/关窗、两backend切换/重开与释放；缺宿主时不能仅wa preview成功就核销。                                     |
| C2 桌面安全边界               | `src-electron/main.ts:124-177 IPC主frame/sandbox/navigation`<br>`src-electron/desktop-session-ownership.ts:94-104 ownership`<br>`src-electron/preload.ts:108-135 allowlist/subscribe`<br>senderFrame限定当前主窗口，host再parse，窗口归属二道校验；bridge没有裸ipcRenderer，事件unsubscribe明确。信任的是宿主sender，不是payload里自报身份。                                                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实子frame/第二窗口/旧session、恶意SQL/file/巨大payload，拒绝后磁盘和DB不变；本轮无真实IPC权限结果。                                    |
| C3 业务、存储与备份           | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts:146-148 archiveOps、171-207 entities/storage/adapter`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts:131-188 restoreAndRelaunch`<br>Todo/Task/File等真实实体与桌面filesystem串联；backup/restore走adapter，DATABASE_ONLY范围不能伪称附带storage文件。源码与强E2E断言均已对照，实际未跑。                        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控Todo/file CRUD、BigInt/binary/原子文件失败、备份恢复中断/冲突、重启；两backend分开，DB与文件范围分开。                                   |
| C4 DevTools 隔离              | `src-electron/devtools-extension.ts:100-139 explicit enable/capability/mutation、157-172 unique extension`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts:115-131 native provider、211-221 connector`<br>扩展需显式enable与绝对路径/capability，mutation默认omit，加载后唯一扩展且allowFileAccess=false；native provider pagehide dispose。不能从provider注册推导所有消息授权通过。                     | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控生产无扩展、capability缺失/readonly拒绝、settings/files mutation、窗口导航/关闭/旧session与native provider真实GUI；不只用fake provider。 |
| C5 打包资源与延迟后端         | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src/app/setup_rxdb.ts:75-100 动态backend imports`<br>`src-electron/main.ts:141-148 app scheme资产、151-170 preload`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/packaged-app.ts:80-96 packaged-only`<br>renderer延迟装载两desktop后端与wa preview，preload使用app资源路径；runner缺打包产物直接阻断。包依赖build通过仅属TS/typecheck链，不代表app资源冷安装成功。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控audit-lazy-backend和冷electron-package-dir、离线启动/WASM/Worker/native/可选peer缺失；当前未取得打包产物消费证据。                       |
| C6 Electron 专项              | `src-electron/main.ts:212-225 destroyed/render-process-gone释放`<br>`src-electron/desktop-host-bridge.ts:152-170 releaseTarget/closeAll`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts:62-136 重启`<br>关窗/renderer crash由宿主释放target，三类host closeAll用finally链收束；真实持久化E2E核对adapter与实际文件/重启count，不是浏览器demo。                                                     | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实Electron窗口/崩溃/关停、node:sqlite能力与生产依赖、strict app/tests/发布consumer；未跑平台必须留未验证。                             |

证据：逐C矩阵、实际阅读、验证请求、待主控去重候选、历史验证分账。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
