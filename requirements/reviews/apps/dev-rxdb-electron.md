---
kind: review-plan
object: dev-rxdb-electron
source_root: apps/dev-rxdb-electron
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# dev-rxdb-electron：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

Electron 主进程/preload/renderer 与 SQLite/PGlite/浏览器后端及 DevTools 扩展集成。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/dev-rxdb-electron`](../../../apps/dev-rxdb-electron)                  |
| Nx 项目             | `dev-rxdb-electron`                                                          |
| npm 名称            | `dev-rxdb-electron`                                                          |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W5 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 106 个；测试/共享套件入口 21 个（按文件名，不代表覆盖率）                    |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src-electron/main.ts`](../../../apps/dev-rxdb-electron/src-electron/main.ts)
- [`src-electron/preload.ts`](../../../apps/dev-rxdb-electron/src-electron/preload.ts)
- [`src-electron/desktop-host-request-guard.ts`](../../../apps/dev-rxdb-electron/src-electron/desktop-host-request-guard.ts)
- [`src-electron/desktop-session-ownership.ts`](../../../apps/dev-rxdb-electron/src-electron/desktop-session-ownership.ts)
- [`src-electron/desktop-pglite-bridge.ts`](../../../apps/dev-rxdb-electron/src-electron/desktop-pglite-bridge.ts)
- [`src/app/app.service.ts`](../../../apps/dev-rxdb-electron/src/app/app.service.ts)
- [`README.md`](../../../apps/dev-rxdb-electron/README.md)
- [`package.json`](../../../apps/dev-rxdb-electron/package.json)
- [`project.json`](../../../apps/dev-rxdb-electron/project.json)
- [`tsconfig.app.json`](../../../apps/dev-rxdb-electron/tsconfig.app.json)
- [`tsconfig.json`](../../../apps/dev-rxdb-electron/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                       | 核查动作                                                                                                      | 最低复验场景 / 证据要求                                                                             | 状态                          |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| C1   | backend 选择与资源生命周期 | 逐档审查 local backend、DB 路径、连接初始化/关闭与不支持配置的明确拒绝。                                      | 首次启动、错误路径、关窗/重开、多窗口、初始化中退出；不静默回退到 memory/OPFS。                     | 部分核查；见2026-10-05逐C结论 |
| C2   | 桌面安全边界               | 从页面到 bridge/invoke/host 核查 session、sender、frame、allowlist 和 privilege；与 adapter 协议双端对照。    | 未知消息、跨窗口、旧 session、越权 SQL/file、过大 payload；拒绝发生在副作用之前。                   | 部分核查；见2026-10-05逐C结论 |
| C3   | 业务、存储与备份           | 核查真实 Todo/文件操作、backup-probe、restore 和应用重启，区分 DB 与文件备份范围。                            | 写后重启、恢复中断、目标冲突、文件失败、BigInt/binary；原库可重新打开。                             | 部分核查；见2026-10-05逐C结论 |
| C4   | DevTools 隔离              | 检查 fake-provider/probe、调试窗口、relay、settings/files mutation 与开发/生产 gating。                       | 生产 bundle、调试窗口导航/关闭、provider capability 缺失；调试功能不变成普通 WebView 的特权入口。   | 部分核查；见2026-10-05逐C结论 |
| C5   | 打包资源与延迟后端         | 核查 native 库/WASM/Worker/插件资源、build-devtools 与 audit-lazy-backend；开发 server 通过不代表安装包可用。 | 离线安装包冷启动、资源缺失、无可选后端依赖、生产调试隔离；记录实际应用版本/平台。                   | 部分核查；见2026-10-05逐C结论 |
| C6   | Electron 专项              | 核查 contextIsolation/sandbox、navigation、IPC frame ownership、PGlite worker 和 electron-builder 产物。      | 不可信导航、隐藏 iframe、renderer 崩溃、worker 退出、两种 native 后端持久化；在 packaged E2E 复验。 | 部分核查；见2026-10-05逐C结论 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **21** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src-electron/desktop-host-request-guard.spec.ts`](../../../apps/dev-rxdb-electron/src-electron/desktop-host-request-guard.spec.ts)
- [`src-electron/desktop-pglite-bridge.spec.ts`](../../../apps/dev-rxdb-electron/src-electron/desktop-pglite-bridge.spec.ts)
- [`src-electron/main.utils.spec.ts`](../../../apps/dev-rxdb-electron/src-electron/main.utils.spec.ts)
- [`src-electron/connect-wa-sqlite-adapter.spec.ts`](../../../apps/dev-rxdb-electron/src-electron/connect-wa-sqlite-adapter.spec.ts)
- [`src-electron/desktop-file-bridge.spec.ts`](../../../apps/dev-rxdb-electron/src-electron/desktop-file-bridge.spec.ts)
- [`src-electron/desktop-sqlite-bridge.spec.ts`](../../../apps/dev-rxdb-electron/src-electron/desktop-sqlite-bridge.spec.ts)

运行配置：[`vitest.d.ts`](../../../apps/dev-rxdb-electron/src/vitest.d.ts)、[`vitest.config.mts`](../../../apps/dev-rxdb-electron/vitest.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

应用生产代码以四项覆盖率 ≥ **80%** 作为本轮评审目标（不是声称仓库已有应用硬门禁）；先确认测试配置和测量面。原生 Rust 与前端 TS 分开记录，E2E 不折算生产覆盖率；当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`angular`（集成边界）](../../../modules/angular)、[`angular-todo`（集成边界）](../../../modules/angular-todo)、[`rxdb`](../packages/rxdb.md)、[`rxdb-adapter-electron`](../packages/rxdb-adapter-electron.md)、[`rxdb-adapter-sqlite-core`](../packages/rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-wa-sqlite`](../packages/rxdb-adapter-wa-sqlite.md)、[`rxdb-angular`](../packages/rxdb-angular.md)、[`rxdb-devtools`](../packages/rxdb-devtools.md)、[`rxdb-plugin-graph`](../packages/rxdb-plugin-graph.md)、[`rxdb-plugin-history`](../packages/rxdb-plugin-history.md)、[`rxdb-plugin-storage`](../packages/rxdb-plugin-storage.md)、[`rxdb-plugin-tree`](../packages/rxdb-plugin-tree.md)、[`rxdb-test`](../packages/rxdb-test.md)、[`utils`](../packages/utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-electron-e2e`](dev-rxdb-electron-e2e.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-electron-e2e`](dev-rxdb-electron-e2e.md)、[`rxdb-adapter-electron`](../packages/rxdb-adapter-electron.md)。

## 5. 执行命令与环境

前置环境：Electron 可运行环境、隔离 userData 和打包资源；SQLite/PGlite 多窗口约束不同，分别验证，不使用用户真实 profile。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target            | 用途与证据边界                                                         |
| -------------------- | ---------------------------------------------------------------------- |
| `lint`               | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`          | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`               | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`              | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `audit-lazy-backend` | 生产包延迟 backend 的结构审计；核对实际 build 与两种 backend。         |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project dev-rxdb-electron --json
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-electron:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=dev-rxdb-electron --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-electron:test --coverage --skipRemoteCache --skipNxCache
CI=true NX_DAEMON=false pnpm nx run dev-rxdb-electron:audit-lazy-backend --skipRemoteCache --skipNxCache
```

- `audit-lazy-backend` 只证明其扫描规则覆盖的产物结构；两种 backend 的真实启动、业务写入与持久化仍需宿主复验。

- 普通 `test` 自身可能已经是 browser project；没有单独 `test-browser` 不表示缺少浏览器测试。EPIPE、worker 崩溃或 service stopped 先串行隔离复跑，不直接归因为业务缺陷。

## 6. 完成条件

- [ ] 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。
- [x] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。
- [ ] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [ ] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/dev-rxdb-electron.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：parallel integrations 逐 C 交付

⚠️ **原完成条件未满足，execution维持in-progress，不能标complete。** 已完成逐C的源码结论/证据/未验证动作登记；这一个完成条件已核销，动态语义与全范围深审/覆盖率未完成。

主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。

日志：[strict lint](../evidence/2026-10-05/parallel/validation/all-object-strict-lint.txt)、[typecheck](../evidence/2026-10-05/parallel/validation/all-object-typecheck.txt)；[当轮门禁限定](../evidence/2026-10-05/parallel/integrations/current-gates.json)。

已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。

| C / 专项                      | 已核查源码符号 / 行与结论                                                                                                                                                                                                                                                                                                                                                                                                                          | 证据 / 核销                                                          | 具体未验证与补证动作                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 backend 选择与资源生命周期 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src/app/setup_rxdb.ts:75-141 localBackends/resolveLocalBackend/localDatabase`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src/app/local-backend.ts:71-133 selectLocalBackend`<br>SQLite/PGlite动态import，桌面与web preview使用不同dbName；候选表重复adapter/dbName硬拒绝，连接选路缓存。browser preview是声明的路径，不把它当真实桌面通过。                              | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实首次启动/坏路径、初始化退出/关窗、两backend切换/重开与释放；缺宿主时不能仅wa preview成功就核销。                                     |
| C2 桌面安全边界               | `src-electron/main.ts:124-177 IPC主frame/sandbox/navigation`<br>`src-electron/desktop-session-ownership.ts:94-104 ownership`<br>`src-electron/preload.ts:108-135 allowlist/subscribe`<br>senderFrame限定当前主窗口，host再parse，窗口归属二道校验；bridge没有裸ipcRenderer，事件unsubscribe明确。信任的是宿主sender，不是payload里自报身份。                                                                                                       | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实子frame/第二窗口/旧session、恶意SQL/file/巨大payload，拒绝后磁盘和DB不变；本轮无真实IPC权限结果。                                    |
| C3 业务、存储与备份           | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts:146-148 archiveOps、171-207 entities/storage/adapter`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts:131-188 restoreAndRelaunch`<br>Todo/Task/File等真实实体与桌面filesystem串联；backup/restore走adapter，DATABASE_ONLY范围不能伪称附带storage文件。源码与强E2E断言均已对照，实际未跑。                        | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控Todo/file CRUD、BigInt/binary/原子文件失败、备份恢复中断/冲突、重启；两backend分开，DB与文件范围分开。                                   |
| C4 DevTools 隔离              | `src-electron/devtools-extension.ts:100-139 explicit enable/capability/mutation、157-172 unique extension`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts:115-131 native provider、211-221 connector`<br>扩展需显式enable与绝对路径/capability，mutation默认omit，加载后唯一扩展且allowFileAccess=false；native provider pagehide dispose。不能从provider注册推导所有消息授权通过。                     | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控生产无扩展、capability缺失/readonly拒绝、settings/files mutation、窗口导航/关闭/旧session与native provider真实GUI；不只用fake provider。 |
| C5 打包资源与延迟后端         | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron/src/app/setup_rxdb.ts:75-100 动态backend imports`<br>`src-electron/main.ts:141-148 app scheme资产、151-170 preload`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/packaged-app.ts:80-96 packaged-only`<br>renderer延迟装载两desktop后端与wa preview，preload使用app资源路径；runner缺打包产物直接阻断。包依赖build通过仅属TS/typecheck链，不代表app资源冷安装成功。 | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控audit-lazy-backend和冷electron-package-dir、离线启动/WASM/Worker/native/可选peer缺失；当前未取得打包产物消费证据。                       |
| C6 Electron 专项              | `src-electron/main.ts:212-225 destroyed/render-process-gone释放`<br>`src-electron/desktop-host-bridge.ts:152-170 releaseTarget/closeAll`<br>`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts:62-136 重启`<br>关窗/renderer crash由宿主释放target，三类host closeAll用finally链收束；真实持久化E2E核对adapter与实际文件/重启count，不是浏览器demo。                                                     | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | 主控真实Electron窗口/崩溃/关停、node:sqlite能力与生产依赖、strict app/tests/发布consumer；未跑平台必须留未验证。                             |

证据：[逐C矩阵](../evidence/2026-10-05/parallel/integrations/review-matrix.json)、[实际阅读](../evidence/2026-10-05/parallel/integrations/file-inspection.json)、[验证请求](../evidence/2026-10-05/parallel/integrations/validation-requests.json)、[待主控去重候选](../evidence/2026-10-05/parallel/integrations/findings.pending.md)、[历史验证分账](../evidence/2026-10-05/parallel/integrations/prior-validation.json)。

未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。
