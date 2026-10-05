---
kind: review-plan
object: rxdb-adapter-sqlite
source_root: packages/rxdb-adapter-sqlite
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: partial
release-readiness: not-claimed
---

# rxdb-adapter-sqlite：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

官方 SQLite WASM 的 adapter、oo1 client 与装载边界。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-adapter-sqlite`](../../../packages/rxdb-adapter-sqlite)      |
| Nx 项目             | `rxdb-adapter-sqlite`                                                        |
| npm 名称            | `@aiao/rxdb-adapter-sqlite`                                                  |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 33 个；测试/共享套件入口 13 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterSqliteOfficial.ts`](../../../packages/rxdb-adapter-sqlite/src/RxDBAdapterSqliteOfficial.ts)
- [`src/SqliteOfficialClient.ts`](../../../packages/rxdb-adapter-sqlite/src/SqliteOfficialClient.ts)
- [`src/create_sqlite_client.ts`](../../../packages/rxdb-adapter-sqlite/src/create_sqlite_client.ts)
- [`src/sqlite-official-load.utils.ts`](../../../packages/rxdb-adapter-sqlite/src/sqlite-official-load.utils.ts)
- [`src/sqlite-official.interface.ts`](../../../packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts)
- [`README.md`](../../../packages/rxdb-adapter-sqlite/README.md)
- [`package.json`](../../../packages/rxdb-adapter-sqlite/package.json)
- [`project.json`](../../../packages/rxdb-adapter-sqlite/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-sqlite/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-sqlite/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-sqlite/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`./testing`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-sqlite.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项           | 核查动作                                                                 | 最低复验场景 / 证据要求                                                                       | 状态                           |
| ---- | -------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------ |
| C1   | 官方 WASM 装载 | 审查 factory 的 options、资源路径、宿主检测和初始化失败的释放。          | 错 URL、缺能力、并发初始化、重复关闭；只提供当前已声明档位，不补 fallback。                   | 待核查                         |
| C2   | oo1 与异步契约 | 核查同步 SQLite API 向上层异步接口的转交、statement 生命周期和错误归属。 | 同步抛错、prepare/step 失败、关闭中调用、无行返回；Promise 和错误语义与 core 一致。           | 待核查                         |
| C3   | 类型与事务     | 对照 core SQL/类型映射和本包执行用例，确认引擎差异没有泄露给消费者。     | BigInt/binary/null、事务回滚、批写、分支过滤、提交后事件；同 fixtures 对比 wa-sqlite/PGlite。 | 待核查（额外树联审见执行记录） |
| C4   | 加密与恢复     | 追踪 keyring、加密 CRUD/tamper 与官方 SQLite 备份入口。                  | 损坏 envelope、备份失败、恢复目标非空、重连与刷新；不得写明文日志或部分恢复。                 | 待核查                         |
| C5   | 发布资源闭合   | 核查 exports、WASM 外部资源和构建后的 consumer，不仅检查工作区 alias。   | pack 后安装、浏览器导入、离线资源部署、缺资源诊断；公共类型可独立消费。                       | 待核查                         |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **13** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/sqlite-official-load.utils.spec.ts`](../../../packages/rxdb-adapter-sqlite/src/__tests__/sqlite-official-load.utils.spec.ts)
- [`src/__tests__/RxDBAdapterSqliteOfficial.spec.ts`](../../../packages/rxdb-adapter-sqlite/src/__tests__/RxDBAdapterSqliteOfficial.spec.ts)
- [`src/__tests__/SqliteOfficialClient.spec.ts`](../../../packages/rxdb-adapter-sqlite/src/__tests__/SqliteOfficialClient.spec.ts)
- [`src/__tests__/backup/sqlite-official-backup.spec.ts`](../../../packages/rxdb-adapter-sqlite/src/__tests__/backup/sqlite-official-backup.spec.ts)
- [`src/__tests__/create_sqlite_client.options.spec.ts`](../../../packages/rxdb-adapter-sqlite/src/__tests__/create_sqlite_client.options.spec.ts)
- [`src/__tests__/create_sqlite_client.spec.ts`](../../../packages/rxdb-adapter-sqlite/src/__tests__/create_sqlite_client.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-sqlite/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](rxdb-plugin-querycache.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-test`](rxdb-test.md)。

Nx 基线图中的直接消费者：[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`rxdb-plugin-search`](rxdb-plugin-search.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：官方 SQLite WASM 与真实浏览器；支持的 oo1/存储档位以接口和 loader 为准。

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
NX_DAEMON=false pnpm nx show project rxdb-adapter-sqlite --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-sqlite:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-sqlite --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-sqlite:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-sqlite
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-adapter-sqlite.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 续执行：2026-10-03 边界取证

本批实际源码专题、确认意见和复验结果见 [此对象执行记录](../results/packages/rxdb-adapter-sqlite.md) 与 [续执行汇总](../follow-up-2026-10-03.md)。只核销记录中明确覆盖的 C 项，不把全量门禁或单用例通过当作全对象评审完成。

## 2026-10-04：树查询与 DevTools 第三批深审

[本对象实际意见与源码/运行证据](../results/packages/rxdb-adapter-sqlite.md) · [本批台账](../execution-2026-10-04-tree-devtools.md)。未核销项不由生成器、mock 或其它后端门禁代证。

## 2026-10-05：local-adapters 并行实审收束

这部分是**实际执行回填**，不是新增泛计划。原专项表及其旧 RV/旧测试数字属于早期执行快照；当前源与当轮结果见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-adapter-sqlite.md`。用户已修历史问题不重新标红。

- execution: in-progress / partial；**原 C 全边界核销 0/5，整对象未 closed**。原第 6 节完成条件保持原文，未满足项不打勾。
- 当轮已结算：Tests 734 passed | 13 skipped (747)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:1231）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 本轮明确意见：共享core LA-02/LA-03；不是本包suite红。

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                            | 当前结论/可证反证                                                                                                                                                            | 原 C 核销 | 剩余必要验证                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite/src/sqlite-official-load.utils.ts:43–76`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite/src/create_sqlite_client.ts:26–51`                       | 加载资源fingerprint一致才复用，global load lock二次检查；factory init失败释放Comlink proxy，不静默忽略函数型远程选项。LA-03 是共享oo1初始化关闭窗口，不能用工厂catch来反证。 | 未核销    | 下载失败/能力不足/并发init/重复关闭完整生命周期；late oo1回归与真实 OPFS；错误资源和fallback配置全边界。           |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:113–139,180–235,265–305`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/execute_oo1_helper.ts:72–127`         | 同步oo1通过Promise入口执行；prepare读路径和exec路径责任不同。LA-03轻量回归确认在途load关闭后仍开库/ready。                                                                   | 未核销    | prepare/step/finalize失败、关闭中调用、无行返回与完整Promise错误归属；不同dbName重复init的契约与真实模块生命周期。 |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/entity/insert_sql.ts:66–79`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1654–1712`                 | 类型/事务不是本包复制实现，而委托共享core；当前734 pass/13 skip只按配置宿主记账。旧树问题修复状态不反转。                                                                    | 未核销    | BigInt/binary/null/批写/分支过滤/提交事件同 fixture跨后端；13 skip逐项说明，提交时点与rollback完整边界。           |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:93–105,142–172`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:646–724` | 实际行拒绝坏信封；恢复要求同引擎blank描述与断开/独占锁。共享逻辑有守卫不等于官方OPFS恢复已经实测。                                                                           | 未核销    | 坏envelope/备份失败/非空目标/失败原库/页面刷新/持久化恢复；各transport的实际支持档位和版本资源。                   |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite/src/sqlite-official-load.utils.ts:62–76`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite/src/create_sqlite_client.ts:27–39`                       | WASM/proxy URL配置被传入实际模块加载并参与缓存identity。未读取全部打包文件/pack consumer，所以不宣称exports与资源闭合。                                                      | 未核销    | 发布后消费、独立类型、浏览器导入、离线与错资源部署；pack/部署与共享worker构建链路未当前执行。                      |

请求/动态日志与阅读记录均由 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters` 保留。三个新增回归的 late lint/typecheck、完整测量面/宿主/持久化及发布闭合按实际待证留阻断；主控统一追加后续结果，不在这里预支通过。

## 2026-10-05 packages-only 收口

源码审阅与意见交付已完成：34文件/1980行、原C1–C5结论齐全，评级🟡；[当前结果](../results/packages/rxdb-adapter-sqlite.md)及[closure](../evidence/2026-10-05/packages-only/rxdb-adapter-sqlite/closure.json)。原C最低运行场景不删除、不自动核销；测试判别力、冷发布consumer、OPFS/native恢复及共享core数据场景明确列必要未验owner。当前用户任务以源码评审交付计数，发布/全矩阵仍单独partial。
