---
kind: review-plan
object: rxdb-adapter-sqlite-wasm
source_root: packages/rxdb-adapter-sqlite-wasm
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-adapter-sqlite-wasm：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

sqlite-wasm 浏览器持久化适配器，含远程 client 与 VFS 按需装载。

| 项目                | 基线事实                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| 对象类型            | 包                                                                                |
| 源码范围            | [`packages/rxdb-adapter-sqlite-wasm`](../../../packages/rxdb-adapter-sqlite-wasm) |
| Nx 项目             | `rxdb-adapter-sqlite-wasm`                                                        |
| npm 名称            | `@aiao/rxdb-adapter-sqlite-wasm`                                                  |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）      |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                                 |
| 受控文件盘点        | 50 个；测试/共享套件入口 26 个（按文件名，不代表覆盖率）                          |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                         |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterSqlite.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts)
- [`src/SqliteClient.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts)
- [`src/create_sqlite_client.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/create_sqlite_client.ts)
- [`src/vfs-storage-loaders.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/vfs-storage-loaders.ts)
- [`src/sqlite-load.utils.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts)
- [`src/execute_helper.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/execute_helper.ts)
- [`README.md`](../../../packages/rxdb-adapter-sqlite-wasm/README.md)
- [`package.json`](../../../packages/rxdb-adapter-sqlite-wasm/package.json)
- [`project.json`](../../../packages/rxdb-adapter-sqlite-wasm/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-sqlite-wasm/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-sqlite-wasm/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`./testing`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-sqlite-wasm.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`comlink: ^4.4.2`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                  | 核查动作                                                                             | 最低复验场景 / 证据要求                                                        | 状态   |
| ---- | --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------ |
| C1   | VFS 与运行档位        | 核查 VFS loader、依赖按需导入、配置拒绝与数据库名；不能把不同 VFS 的持久性互相替代。 | 资源缺失、OPFS 不可用、不受支持档位、初始化失败；明确错误且不静默降级。        | 待核查 |
| C2   | 远程 client / Comlink | 追踪请求与响应、对象/二进制传递、取消和 worker 释放；对照主线程 client 语义。        | worker 崩溃、取消后晚到结果、BigInt/binary、异常序列化；不泄露 worker 和订阅。 | 待核查 |
| C3   | SQLite 事务与语句     | 核查执行助手和 core 委托，特别是 async callback、失败 cleanup 与提交后通知。         | 批写中途失败、回滚、并发查询、已关闭 client、statement 异常；不留下半笔变更。  | 待核查 |
| C4   | 多标签页与分支        | 审查 SharedWorker/广播档位、branch materialization 与数据库生命周期。                | 跨标签页写后观察、分支切换、删除重建、关闭重连；事件按库和分支隔离。           | 待核查 |
| C5   | 加密与备份传输        | 核查 encrypted suite 接线、备份传输边界、恢复目标验证和版本资源闭合。                | tamper 拒绝、导出二进制完整性、坏归档、刷新持久化、恢复失败后的原库。          | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **26** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/sqlite-load.utils.spec.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/__tests__/sqlite-load.utils.spec.ts)
- [`src/__tests__/RxDBAdapterSqlite.spec.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/__tests__/RxDBAdapterSqlite.spec.ts)
- [`src/__tests__/create_sqlite_client.remote.spec.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/__tests__/create_sqlite_client.remote.spec.ts)
- [`src/__tests__/create_sqlite_client.spec.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/__tests__/create_sqlite_client.spec.ts)
- [`src/__tests__/execute_helper.spec.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/__tests__/execute_helper.spec.ts)
- [`src/__tests__/backup/sqlite-wasm-backup-transport.spec.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/__tests__/backup/sqlite-wasm-backup-transport.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-sqlite-wasm/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](rxdb-plugin-querycache.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-plugin-tree`](rxdb-plugin-tree.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-test`](rxdb-test.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb-plugin-search`](rxdb-plugin-search.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：真实浏览器及正确版本的 sqlite-wasm 资源；验证当前实际启用的 VFS，不把模拟 DOM 当作持久化证据。

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
NX_DAEMON=false pnpm nx show project rxdb-adapter-sqlite-wasm --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-sqlite-wasm:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-sqlite-wasm --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-sqlite-wasm:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-sqlite-wasm
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-adapter-sqlite-wasm.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：local-adapters 并行实审收束

这部分是**实际执行回填**，不是新增泛计划。原专项表及其旧 RV/旧测试数字属于早期执行快照；当前源与当轮结果见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-adapter-sqlite-wasm.md`。用户已修历史问题不重新标红。

- execution: in-progress / partial；**原 C 全边界核销 0/5，整对象未 closed**。原第 6 节完成条件保持原文，未满足项不打勾。
- 当轮已结算：Tests 1 failed | 871 passed | 13 skipped (885)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt:2205）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 本轮明确意见：LA-01（轻量回归确认）。

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                                                                                                                           | 当前结论/可证反证                                                                                                                                                      | 原 C 核销 | 剩余必要验证                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts:76–121,127–177`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/vfs-storage-loaders.ts:23–38`                                                                                                                             | 冻结能力表按实际WorkerGlobalScope检查；OPFS主线程拒绝、fs-handle缺root拒绝，不降级。VFS聚合模块一次lazy import加载各预设，不是每个VFS独立懒加载。                      | 未核销    | 各VFS资源/OPFS不可用/无安全上下文与失败清理完整矩阵；工厂与发布资源consume、声明数据库名称边界。             |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/create_sqlite_client.ts:65–77`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts:159–201,232–241`                                                                                                                        | 每连接租独立Comlink端口、同Worker只能一个租客，caller/client所有权有区分；init失败释放代理。没有从这些正常释放路径推断worker崩溃能结算在途RPC。                        | 未核销    | Worker死亡/取消后的晚到结果/BigInt/binary异常序列化、订阅释放；明确当前没有已核销的cancel/崩溃完整证据。     |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/execute_helper.ts:108–136`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:182–212,225–262`                                                                                                                                    | LA-01当前回归红：第二prepare失败时首条unscoped statement finalize实际0次；WA相应段用整段finally，不可用另一后端绿抵消。本client队列串行、初始化失败有close/aggregate。 | 未核销    | 真实WASM busy/可关库后果；所有prepare/step/finalize、并发/回滚/提交通知/已关闭调用；13 skip不能作通过。      |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:243–250,273–335`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts:153–201`                                                                                                                              | update_hook事件按type/db/table聚合，batch debounce+max timer；Worker端口只租一个client，没有恢复已删writer lease。按数据库分组不自动保证active branch和跨标签可见性。  | 未核销    | 真正多标签不同库/同库、分支切换/物化、删除重建、重开与Worker重启；事件branch隔离仍须联审。                   |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:34–44`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/__tests__/encrypted-bigint-binary.spec.ts:1–5`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:142–173` | 当前备份只交付主线程memory/idb；Worker/SharedWorker显式unsupported，不是“远程备份已经通过”。其它VFS也拒绝。加密suite接线存在不替代tamper/字节扫描。                    | 未核销    | 主线程idb刷新/备份传输完整性/坏归档/原库与tamper；worker备份为当前不支持，但拒绝及发布版本资源仍须完整核查。 |

请求/动态日志与阅读记录均由 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters` 保留。三个新增回归的 late lint/typecheck、完整测量面/宿主/持久化及发布闭合按实际待证留阻断；主控统一追加后续结果，不在这里预支通过。
