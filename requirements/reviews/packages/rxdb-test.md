---
kind: review-plan
object: rxdb-test
source_root: packages/rxdb-test
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-test：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

实体与跨框架 fixtures、适配器契约共享套件及测试基础设施；这是后续证据的可信根之一。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-test`](../../../packages/rxdb-test)                          |
| Nx 项目             | `rxdb-test`                                                                  |
| npm 名称            | `@aiao/rxdb-test`                                                            |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W0 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 105 个；测试/共享套件入口 30 个（按文件名，不代表覆盖率）                    |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/index.ts`](../../../packages/rxdb-test/src/index.ts)
- [`src/testing/index.ts`](../../../packages/rxdb-test/src/testing/index.ts)
- [`src/cross-framework-fixtures/index.ts`](../../../packages/rxdb-test/src/cross-framework-fixtures/index.ts)
- [`public-contract/consumer.ts`](../../../packages/rxdb-test/public-contract/consumer.ts)
- [`entities/Todo.ts`](../../../packages/rxdb-test/entities/Todo.ts)
- [`README.md`](../../../packages/rxdb-test/README.md)
- [`package.json`](../../../packages/rxdb-test/package.json)
- [`project.json`](../../../packages/rxdb-test/project.json)
- [`tsconfig.lib.json`](../../../packages/rxdb-test/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-test/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./entities`、`./shop`、`./encrypted`、`./query-cache-contract`、`./tree-unique`、`./transaction`；逐一核查 types / import / default 与发布文件对应关系。

## 3. 专项核查与最低复验场景

| 编号 | 专项               | 核查动作                                                                                                 | 最低复验场景 / 证据要求                                                                                   | 状态                         |
| ---- | ------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| C1   | 套件本身的判别力   | 逐套件核查断言是否能区分错误实现；用故意破坏的测试替身检验失败路径，不仅看正确实现通过。                 | 吞掉错误、省略回滚、错事件顺序的替身必须被拒；不可用 mock 自证真实持久化。                                | 部分核销；见2026-10-05证据表 |
| C2   | factory 与环境隔离 | 审查 adapter factory、清库、临时建表和关闭路径，检查动态表/触发器是否被正常回收。                        | 连续两轮套件、用例失败后的 teardown、临时实体、同名库、多连接；不向下一用例泄露状态。                     | 部分核销；见2026-10-05证据表 |
| C3   | 共享套件调用闭合   | 对照所有适配器入口与 Tauri conformance 调用点，核对参数、跳过条件和删除后的引用。                        | 同一事务/分支/备份契约跨真实后端复跑；不得重新引入已删除的 rowsAffectedConformanceSuite 或 writer lease。 | 部分核销；见2026-10-05证据表 |
| C4   | 三框架 fixtures    | 对照 cross-framework fixtures、公共 consumer 和生成实体，检查状态、字段 descriptor、查询泛型与异常断言。 | 同一数据与同一失败序列在 Angular/React/Vue 得到同语义；框架原生响应式表示允许不同。                       | 部分核销；见2026-10-05证据表 |
| C5   | 覆盖率合并可信度   | 审查 coverage-acceptance 的多段运行、合并路径、源文件分母和产物代次；共享套件不能虚增生产覆盖率。        | 缺一段、陈旧 summary、失败段、重复计入源文件时门禁拒绝；产物与当前 SHA 对齐。                             | 部分核销；见2026-10-05证据表 |
| C6   | 发布与依赖方向     | 核查 fixtures/testing 子入口、生成实体和依赖关系，确保生产消费者不会被迫安装整套测试宿主。               | public-contract consumer 编译、构建产物导入、无 vitest 的业务消费；实际发布清单不误带临时数据。           | 部分核销；见2026-10-05证据表 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **30** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/cross-framework-fixtures/entity-fields-descriptor.spec.ts`](../../../packages/rxdb-test/src/__tests__/cross-framework-fixtures/entity-fields-descriptor.spec.ts)
- [`src/__tests__/cross-framework-fixtures/live-cursor-boundary.spec.ts`](../../../packages/rxdb-test/src/__tests__/cross-framework-fixtures/live-cursor-boundary.spec.ts)
- [`src/__tests__/cross-framework-fixtures/search-parity.spec.ts`](../../../packages/rxdb-test/src/__tests__/cross-framework-fixtures/search-parity.spec.ts)
- [`src/__tests__/cross-framework-fixtures/sync-override.spec.ts`](../../../packages/rxdb-test/src/__tests__/cross-framework-fixtures/sync-override.spec.ts)
- [`src/__tests__/testing/clear-entity-records.spec.ts`](../../../packages/rxdb-test/src/__tests__/testing/clear-entity-records.spec.ts)
- [`src/__tests__/testing/e2e-db-name.spec.ts`](../../../packages/rxdb-test/src/__tests__/testing/e2e-db-name.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-test/vite.config.mts)、[`vitest.acceptance-root.mts`](../../../packages/rxdb-test/vitest.acceptance-root.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 本包由 `coverage-acceptance` 合并消费者执行共享套件的证据；通用 `audit:coverage` 排除了它，普通 `test --coverage` 不能代替此验收。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-client-generator`](rxdb-client-generator.md)、[`rxdb-plugin-tree`](rxdb-plugin-tree.md)。

Nx 基线图中的直接消费者：[`angular-todo`（集成边界）](../../../modules/angular-todo)、[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-angular-e2e`](../apps/dev-rxdb-angular-e2e.md)、[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-react-e2e`](../apps/dev-rxdb-react-e2e.md)、[`dev-rxdb-supabase`](../apps/dev-rxdb-supabase.md)、[`dev-rxdb-tauri`](../apps/dev-rxdb-tauri.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`dev-rxdb-vue-e2e`](../apps/dev-rxdb-vue-e2e.md)、[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-adapter-http`](rxdb-adapter-http.md)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-adapter-sqlite`](rxdb-adapter-sqlite.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-sqlite-wasm`](rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-sqliteai`](rxdb-adapter-sqliteai.md)、[`rxdb-adapter-supabase`](rxdb-adapter-supabase.md)、[`rxdb-adapter-tauri`](rxdb-adapter-tauri.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`rxdb-angular`](rxdb-angular.md)、[`rxdb-model-angular`](rxdb-model-angular.md)、[`rxdb-model-react`](rxdb-model-react.md)、[`rxdb-model-vue`](rxdb-model-vue.md)、[`rxdb-react`](rxdb-react.md)、[`rxdb-vue`](rxdb-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：无额外宿主假设；按实际测试配置区分 Node、模拟 DOM 与真实浏览器。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target             | 用途与证据边界                                                         |
| --------------------- | ---------------------------------------------------------------------- |
| `lint`                | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`           | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`                | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`               | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `coverage-acceptance` | 专用跨套件覆盖率验收；按实现核对合并范围和四指标门槛。                 |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-test --json
CI=true NX_DAEMON=false pnpm nx run rxdb-test:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-test --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-test:coverage-acceptance --skipRemoteCache --skipNxCache
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-test.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：parallel/core 核销对照

本轮已实际审查与验证，未改原最低复验标准。**原完整C核销0，原完成条件不勾；execution保持in-progress，执行记录保持partial。** “部分核销”仅表示下表中有证据的子面，不把单测红等同未评审，也不把发现一个问题等同完整C。

| C   | 本轮实际审查所得 / 源码锚点                                                                                                                                                                                                                    | 验证面                                                                                                                      | 核销结论                                               | 必要待证 / 下一批动作                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `packages/rxdb-test/src/transaction/bootstrap.suite.ts:56-90`：查物理 migration 水位而非内存VFS重连假绿；回滚负例故意提供未建表实体，断言业务表和迁移表都不存在。三套事务 afterEach 吞 dispose 拒绝（候选3），不是持久化后端问题的动态证明。   | bootstrap/readiness及 isolation 前段已读；新增故障替身测试捕获实际注册 hook，3边界+3正常，待 supplement。                   | 部分核销：引导判别器、关闭失败判别缺口。               | encrypted/sortable/tree/query-cache 全部套件和错误替身未读完；不能仅用正确实现 pass 核销完整 C1。                                                          |
| C2  | `packages/rxdb-test/src/testing/sqlite.ts:120-169,179-238`：精确影子表后缀、identifier 转义、删除前检查 main 分支恢复前提；事务关闭日志，初始能力行在触发器恢复前补回，finally 再清缓存。seed-lock 对同 key 串行且前次拒绝不拖死后续。         | 清库/seed-lock/事务factory协议全文已读；本轮主套使用替身，不能声称真实SQLite两轮隔离已证。                                  | 部分核销：清库顺序与前置拒绝；候选3待复验。            | 多连接、失败 teardown、清库两轮和真实动态触发器回收还缺对应宿主证据；已开的 probe.dispose 正常 finally 不与吞错混淆。                                      |
| C3  | `packages/rxdb-test/src/transaction/types.ts:23-102`：executor 身份/终态与队列外 query 的协议明确；无具体 adapter import，factory 为结构类型。                                                                                                 | 类型/构建本轮通过；没有将协议声明本身当所有后端执行通过。                                                                   | 部分核销：共享事务接口与依赖方向。                     | 所有 adapter/Tauri 调用入口和删 rowsAffectedConformanceSuite 后引用未在本子任务逐一核查；真实后端重跑归主控，未核销。                                      |
| C4  | `packages/rxdb-test/src/index.ts:19-26` 根重导出同一 cross-framework-fixtures；当前普通覆盖报告列出了 descriptor/live-cursor/search/sync-override 文件，证明其属于当前测量面，不证明三端真实行为一致。                                         | 普通 test本轮通过；统一typecheck含三端，但本轮未人工逐行审四个fixture/三端调用测试。                                        | 部分：仅入口/测量面核对，语义未核销。                  | 四个fixture和实际Angular/React/Vue同数据失败序列仍待逐行联审；不能据共享导出或框架整包绿打勾。                                                             |
| C5  | `packages/rxdb-test/scripts/run-coverage-acceptance.mjs:14-23,54-95,150-166`：临时根代次隔离、失败清最终输出、canonical source去重、expected/actual双向相等、四指标≥80；merge分母为src+entities+shop，suite排除。                              | runner/merge/unit配置已读；本轮普通覆盖33键/验收预期59受控生产键，缺26键，详见 validation-reconciliation.json。             | 部分核销：合并/分母/失败清理静态边界；普通覆盖面达标。 | coverage-acceptance 当前未执行，缺真实合并与故障段/陈旧blob/重复计入负例；普通91.12/91.92/83.22/92.27不能替代验收。runner快照检查需避开并行新增/删除文件。 |
| C6  | `packages/rxdb-test/scripts/verify-public-contract.mjs:24-89`：8入口与package exports集合精确对应、增删/改种类均报错，root版本/实体数量一致；root导出工具与fixture，suite在独立子路径。package把vitest声明为直接依赖，不能宣称安装无宿主负担。 | 本轮build日志明确 Public contract OK: 97 exports across 8 entries；NodeNext consumer由build/typecheck执行，但其正文未全审。 | 部分核销：8子入口运行时形状与现有构建契约。            | 发布pack清单、无vitest业务安装/消费、全部generated entity/consumer正文未完整审；不得拿同仓dist导入冒充隔离安装。                                           |

本轮验证的日期/基线、测试红绿、coverage测量面与晚加spec边界见 [本对象实际执行记录](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-test.md)。继续动作只限上表的必要缺口；本次不新增探针/发现，不等待主控重队列，supplement最终结果由主控追加。
