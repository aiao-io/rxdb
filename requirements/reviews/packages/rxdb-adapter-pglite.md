---
kind: review-plan
object: rxdb-adapter-pglite
source_root: packages/rxdb-adapter-pglite
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-adapter-pglite：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

浏览器本地 PostgreSQL 适配器，含 Worker、通知、FTS、系统迁移与备份恢复。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-adapter-pglite`](../../../packages/rxdb-adapter-pglite)      |
| Nx 项目             | `rxdb-adapter-pglite`                                                        |
| npm 名称            | `@aiao/rxdb-adapter-pglite`                                                  |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 240 个；测试/共享套件入口 165 个（按文件名，不代表覆盖率）                   |
| 执行状态            | 执行中：本批仅部分专题复核，完整门禁/覆盖率未完成                            |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterPGlite.ts`](../../../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts)
- [`src/PGliteClient.ts`](../../../packages/rxdb-adapter-pglite/src/PGliteClient.ts)
- [`src/change-pipeline.ts`](../../../packages/rxdb-adapter-pglite/src/change-pipeline.ts)
- [`src/pglite.browser.worker.ts`](../../../packages/rxdb-adapter-pglite/src/pglite.browser.worker.ts)
- [`src/backup/restore-pglite-database.ts`](../../../packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts)
- [`src/fts/create-fts-table.ts`](../../../packages/rxdb-adapter-pglite/src/fts/create-fts-table.ts)
- [`README.md`](../../../packages/rxdb-adapter-pglite/README.md)
- [`package.json`](../../../packages/rxdb-adapter-pglite/package.json)
- [`project.json`](../../../packages/rxdb-adapter-pglite/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-pglite/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-pglite/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-pglite/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./testing`、`./fts`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-pglite.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`@aiao/rxdb-plugin-tree: workspace:*`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                  | 核查动作                                                                                               | 最低复验场景 / 证据要求                                                                    | 状态                         |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------- |
| C1   | SQLite / PG 语义对齐  | 逐个查询和写入操作对比两种方言的 quoting、参数、排序、NULL、类型和返回值。                             | 可空游标升降序、BigInt/binary/JSON、空批次、重复键、关系查询；用相同 fixtures 得到同契约。 | 部分执行，确认问题见执行记录 |
| C2   | 通知与反压            | 追踪 change-pipeline 与 PGliteClient 的通知批处理、乱序、订阅取消和事务提交时点。                      | 通知突发、慢消费者、重连、回滚、不活跃分支消息；不丢最后状态，不无限积压。                 | 待核查                       |
| C3   | 迁移、触发器与分支    | 核查 createTables、系统版本水位、分支约束与重挂触发器；区分 Node 模式迁移与浏览器真实执行。            | 旧 schema 迁移、切分支后建表、迁移失败、多 active 行；系统表与实体表原子一致。             | 待核查                       |
| C4   | Worker 与存储生命周期 | 审查 client factory、worker RPC、数据目录、初始化和关闭；确认具体存储档位而非假设全为 OPFS。           | worker 中断、初始化取消、并发打开、连接失败后重试、残留 worker；不把内存档位声称为持久化。 | 待核查                       |
| C5   | 备份恢复独占          | 检查 backup/data-dir/exclusive/restore-lock 协作与桌面 PGlite 复用边界。                               | 恢复时仍有连接、跨实例抢锁、损坏归档、取消、半途失败；锁释放且旧库仍可用。                 | 待核查                       |
| C6   | 搜索与公开入口        | 核查 PG FTS backend、可选 Tree peer、keyring 和公开导出；未装插件不产生隐藏运行时依赖。                | 中英文搜索与 FTS5 对照、索引更新、按子入口消费、缺可选 peer；明确不支持的行为。            | 待核查                       |
| C7   | 真实测试证据          | 区分 mock residual、Node migration 和 browser conformance，检查覆盖率开启方式及 summary/final 同代性。 | 浏览器全套与独立 test-node 分别留证据；覆盖率未显式产生时不得报达标。                      | 待核查                       |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **165** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/PGliteClient.worker-residual.spec.ts`](../../../packages/rxdb-adapter-pglite/src/__tests__/PGliteClient.worker-residual.spec.ts)
- [`src/__tests__/PGliteClient.notify-backpressure.spec.ts`](../../../packages/rxdb-adapter-pglite/src/__tests__/PGliteClient.notify-backpressure.spec.ts)
- [`src/__tests__/PGliteClient.spec.ts`](../../../packages/rxdb-adapter-pglite/src/__tests__/PGliteClient.spec.ts)
- [`src/__tests__/RxDBAdapterPGlite.change-queue.spec.ts`](../../../packages/rxdb-adapter-pglite/src/__tests__/RxDBAdapterPGlite.change-queue.spec.ts)
- [`src/__tests__/RxDBAdapterPGlite.client-factory.unit.spec.ts`](../../../packages/rxdb-adapter-pglite/src/__tests__/RxDBAdapterPGlite.client-factory.unit.spec.ts)
- [`src/__tests__/RxDBAdapterPGlite.liveQuery.spec.ts`](../../../packages/rxdb-adapter-pglite/src/__tests__/RxDBAdapterPGlite.liveQuery.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-pglite/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-encrypted`](rxdb-adapter-encrypted.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](rxdb-plugin-querycache.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-plugin-tree`](rxdb-plugin-tree.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-test`](rxdb-test.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-http-server`](../apps/dev-rxdb-http-server.md)、[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-plugin-replay`](rxdb-plugin-replay.md)、[`rxdb-plugin-search`](rxdb-plugin-search.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：需要项目配置指定的真实浏览器和 PGlite/WASM 资源；test-node 是补充迁移验证，不能替代浏览器套件。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                         |
| ----------- | ---------------------------------------------------------------------- |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`      | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`     | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `test-node` | PGlite 系统迁移的 Node 补充证据，不代替浏览器 conformance。            |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-adapter-pglite --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-pglite:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-pglite --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-pglite:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-pglite
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-pglite:test-node --skipRemoteCache --skipNxCache
```

- 普通 `test` 已依赖 `test-node`，单列命令用于隔离迁移失败。浏览器覆盖率默认配置是否启用须另核查；Node 迁移通过不能代证浏览器主体。

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

[已执行范围、实际评审意见与证据](../results/packages/rxdb-adapter-pglite.md)；[全仓执行台账](../execution-2026-10-03.md)。

调用当前源码 SQL 构建器，在真实 Node PGlite 内存库执行 JSONB/NULL 查询。3 个一致性断言均失败；一轮配套的现有系统迁移 test-node 记录为 10 passed，但不等于本包完整迁移/浏览器/OPFS 已验证。

只有上述范围取得本轮证据，未执行项仍待核查，完成清单不勾选。
