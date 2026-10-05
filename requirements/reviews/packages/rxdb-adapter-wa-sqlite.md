---
kind: review-plan
object: rxdb-adapter-wa-sqlite
source_root: packages/rxdb-adapter-wa-sqlite
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-adapter-wa-sqlite：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

wa-sqlite 浏览器适配器及 client/loader，共享 SQLite 核心语义。

| 项目                | 基线事实                                                                      |
| ------------------- | ----------------------------------------------------------------------------- |
| 对象类型            | 包                                                                            |
| 源码范围            | [`packages/rxdb-adapter-wa-sqlite`](../../../packages/rxdb-adapter-wa-sqlite) |
| Nx 项目             | `rxdb-adapter-wa-sqlite`                                                      |
| npm 名称            | `@aiao/rxdb-adapter-wa-sqlite`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）  |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                             |
| 受控文件盘点        | 49 个；测试/共享套件入口 21 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                     |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterSqlite.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/RxDBAdapterSqlite.ts)
- [`src/SqliteClient.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/SqliteClient.ts)
- [`src/WaSqliteClientBase.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts)
- [`src/create_sqlite_client.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/create_sqlite_client.ts)
- [`src/sqlite-load.utils.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts)
- [`src/execute_helper.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/execute_helper.ts)
- [`README.md`](../../../packages/rxdb-adapter-wa-sqlite/README.md)
- [`package.json`](../../../packages/rxdb-adapter-wa-sqlite/package.json)
- [`project.json`](../../../packages/rxdb-adapter-wa-sqlite/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-wa-sqlite/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-wa-sqlite/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`./testing`、`./client`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-wa-sqlite.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项             | 核查动作                                                                           | 最低复验场景 / 证据要求                                                                 | 状态                                          |
| ---- | ---------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| C1   | 装载与档位       | 核查 WASM/glue 来源、VFS/Worker/SharedWorker 选择与配置校验；显式区分支持矩阵。    | 资源 404、错 glue/wasm 组合、能力缺失、无安全上下文；明确失败，不回退到其他存储档位。   | 部分执行；MemoryAsyncVFS/async/no-worker 实装 |
| C2   | 异步语句生命周期 | 检查 execute helper、statement finalize、参数/结果映射和异步回调边界。             | prepare/step/finalize 各阶段失败、取消、空结果、BigInt/binary；无悬挂 statement。       | 待核查                                        |
| C3   | 多 realm 与隔离  | 核查远程 client、广播/锁的数据库命名隔离与关闭顺序，不增加已移除 writer lease。    | 同名库双标签页、不同数据库、worker 重启、关闭中事务；真实浏览器验证隔离而非 mock 自证。 | 待核查                                        |
| C4   | 共用契约与加密   | 对照 sqlite-core conformance 与 encrypted 测试调用点，检查业务层是否依赖后端特例。 | 事务回滚、分支物化、变更事件、加密 CRUD/tamper；行为与其它 SQLite 子后端一致。          | 部分执行；RV-061 namespace 共用契约           |
| C5   | 备份传输与持久化 | 核查备份读取、Worker 传输、恢复目标、刷新后的数据归属。                            | 二进制传输截断、恢复失败、页面重开、数据库关闭后恢复；失败不覆盖原库。                  | 待核查                                        |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **21** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/sqlite-load.utils.spec.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/__tests__/sqlite-load.utils.spec.ts)
- [`src/__tests__/create_sqlite_client.remote.spec.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/__tests__/create_sqlite_client.remote.spec.ts)
- [`src/__tests__/create_sqlite_client.spec.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/__tests__/create_sqlite_client.spec.ts)
- [`src/__tests__/execute_helper.spec.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/__tests__/execute_helper.spec.ts)
- [`src/__tests__/adapter-construction.spec.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/__tests__/adapter-construction.spec.ts)
- [`src/__tests__/backup/wa-sqlite-backup-transport.spec.ts`](../../../packages/rxdb-adapter-wa-sqlite/src/__tests__/backup/wa-sqlite-backup-transport.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-wa-sqlite/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](rxdb-plugin-querycache.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-test`](rxdb-test.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`dev-rxdb-http`](../apps/dev-rxdb-http.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-supabase`](../apps/dev-rxdb-supabase.md)、[`dev-rxdb-tauri`](../apps/dev-rxdb-tauri.md)、[`rxdb-adapter-miniprogram`](rxdb-adapter-miniprogram.md)、[`rxdb-adapter-supabase`](rxdb-adapter-supabase.md)、[`rxdb-plugin-graph`](rxdb-plugin-graph.md)、[`rxdb-plugin-search`](rxdb-plugin-search.md)、[`rxdb-plugin-storage`](rxdb-plugin-storage.md)、[`rxdb-plugin-workspace`](rxdb-plugin-workspace.md)、[`rxdb-react`](rxdb-react.md)、[`website`（集成边界）](../../../website)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：真实浏览器、项目使用的 WASM 与 VFS 资源；OPFS/Worker/SharedWorker 路径按已声明能力分别验证。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                         |
| ----------- | ---------------------------------------------------------------------- |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`      | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`     | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-adapter-wa-sqlite --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-wa-sqlite:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-wa-sqlite --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-wa-sqlite:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-wa-sqlite
```

- 普通 `test` 自身可能已经是 browser project；没有单独 `test-browser` 不表示缺少浏览器测试。EPIPE、worker 崩溃或 service stopped 先串行隔离复跑，不直接归因为业务缺陷。

## 6. 完成条件

- [ ] 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。
- [ ] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。
- [ ] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [ ] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-adapter-wa-sqlite.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** Chromium/真实 Wasm/MemoryAsyncVFS，async/no-worker，验证 namespace 冷缓存与物理表正向对照。应用刷新路径另测，不冒充本包 OPFS/多写者验收。

确认意见：RV-061。全批门禁、接缝和中间取证错误见 本轮执行台账；源码指纹、最终计数 与 交付校验。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

## 2026-10-05：local-adapters 并行实审收束

这部分是**实际执行回填**，不是新增泛计划。原专项表及其旧 RV/旧测试数字属于早期执行快照；当前源与当轮结果见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-adapter-wa-sqlite.md`。用户已修历史问题不重新标红。

- execution: in-progress / partial；**原 C 全边界核销 0/5，整对象未 closed**。原第 6 节完成条件保持原文，未满足项不打勾。
- 当轮已结算：Tests 858 passed | 14 skipped (872)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:826）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 本轮明确意见：未新增确认问题；不是整对象通过。

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                 | 当前结论/可证反证                                                                                                                                  | 原 C 核销 | 剩余必要验证                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:67–68,193–241,257–297`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/create_sqlite_client.ts:25–60`               | 默认IDBBatchAtomicVFS；async模式来自同一次解析，已知sync/asyncify文件名错配加载前拒绝；函数型远程选项拒绝，能力表冻结，不偷偷换存储档位。          | 未核销    | 所有VFS/安全上下文/glue404/WASM版本/真实Worker与SharedWorker组合；vfs_register前后资源失败全部边界。         |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/execute_helper.ts:75–88,104–161`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:204–246`                          | 有界SQLITE_BUSY重试；绑定语句的收集/执行被finally覆盖，非绑定也逐条手工finalize，与LA-01形成反证。当前858pass/14skip不能证明每种清理错误都处理完。 | 未核销    | 第一个finalize失败仍清理剩余句柄、原始错误归属、取消/BigInt/binary/空结果与真实VFS statement泄漏验证。       |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:89–110,190–201,249–267,335–361`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts:153–201` | 客户端identity冲突拒绝；初始化晚到会close迟到connection；关闭尝试数据库和VFS两种资源。Comlink同worker仅一租客，不表示不同realm的同库已证明隔离。   | 未核销    | 同/异数据库双标签、worker重启、关闭中事务和真实锁策略；关闭失败重复调用结果完整性尚未核销。                  |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/__tests__/encrypted-change-log.spec.ts:1–9`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1654–1712`        | 复用core事务/变更处理，加密log走persistent suite+readDatabaseFile；没有靠业务后端特例消掉不一致。                                                  | 未核销    | 完整conformance/分支物化/事务回滚/事件/tamper，逐一解释14skip；namespace已修历史状态不自动外推其它全部场景。 |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/RxDBAdapterSqlite.ts:35–45`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:93–105,142–173`          | 备份仅主线程MemoryVFS/MemoryAsyncVFS/IDBBatchAtomicVFS；Worker/SharedWorker与其它VFS拒绝。这是声明支持面收缩，不能伪装全部OPFS持久化能力。         | 未核销    | 主线程IDB真实刷新/恢复坏档/失败原库/关闭后独占、二进制传输；Worker拒绝路径与部署资源/发布consumer闭合。      |

请求/动态日志与阅读记录均由 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters` 保留。三个新增回归的 late lint/typecheck、完整测量面/宿主/持久化及发布闭合按实际待证留阻断；主控统一追加后续结果，不在这里预支通过。
