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

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

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

| 编号 | 专项               | 核查动作                                                                                                 | 最低复验场景 / 证据要求                                                                                   | 状态   |
| ---- | ------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| C1   | 套件本身的判别力   | 逐套件核查断言是否能区分错误实现；用故意破坏的测试替身检验失败路径，不仅看正确实现通过。                 | 吞掉错误、省略回滚、错事件顺序的替身必须被拒；不可用 mock 自证真实持久化。                                | 待核查 |
| C2   | factory 与环境隔离 | 审查 adapter factory、清库、临时建表和关闭路径，检查动态表/触发器是否被正常回收。                        | 连续两轮套件、用例失败后的 teardown、临时实体、同名库、多连接；不向下一用例泄露状态。                     | 待核查 |
| C3   | 共享套件调用闭合   | 对照所有适配器入口与 Tauri conformance 调用点，核对参数、跳过条件和删除后的引用。                        | 同一事务/分支/备份契约跨真实后端复跑；不得重新引入已删除的 rowsAffectedConformanceSuite 或 writer lease。 | 待核查 |
| C4   | 三框架 fixtures    | 对照 cross-framework fixtures、公共 consumer 和生成实体，检查状态、字段 descriptor、查询泛型与异常断言。 | 同一数据与同一失败序列在 Angular/React/Vue 得到同语义；框架原生响应式表示允许不同。                       | 待核查 |
| C5   | 覆盖率合并可信度   | 审查 coverage-acceptance 的多段运行、合并路径、源文件分母和产物代次；共享套件不能虚增生产覆盖率。        | 缺一段、陈旧 summary、失败段、重复计入源文件时门禁拒绝；产物与当前 SHA 对齐。                             | 待核查 |
| C6   | 发布与依赖方向     | 核查 fixtures/testing 子入口、生成实体和依赖关系，确保生产消费者不会被迫安装整套测试宿主。               | public-contract consumer 编译、构建产物导入、无 vitest 的业务消费；实际发布清单不误带临时数据。           | 待核查 |

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
