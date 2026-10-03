---
kind: review-plan
object: rxdb
source_root: packages/rxdb
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: not-started
---

# rxdb：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

本地优先数据层的核心契约：实体、查询、事务、插件生命周期、系统迁移、备份与可信写入。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb`](../../../packages/rxdb)                                    |
| Nx 项目             | `rxdb`                                                                       |
| npm 名称            | `@aiao/rxdb`                                                                 |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W1 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 277 个；测试/共享套件入口 125 个（按文件名，不代表覆盖率）                   |
| 执行状态            | 未开始正式评审；业务门禁未执行、覆盖率未测量                                 |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDB.ts`](../../../packages/rxdb/src/RxDB.ts)
- [`src/rxdb-adapter.ts`](../../../packages/rxdb/src/rxdb-adapter.ts)
- [`src/rxdb.transaction.ts`](../../../packages/rxdb/src/rxdb.transaction.ts)
- [`src/entity/entity-manager.ts`](../../../packages/rxdb/src/entity/entity-manager.ts)
- [`src/repository/QueryManager.ts`](../../../packages/rxdb/src/repository/QueryManager.ts)
- [`src/capture/raw-write-gate.ts`](../../../packages/rxdb/src/capture/raw-write-gate.ts)
- [`src/backup/backup-archive.ts`](../../../packages/rxdb/src/backup/backup-archive.ts)
- [`README.md`](../../../packages/rxdb/README.md)
- [`package.json`](../../../packages/rxdb/package.json)
- [`project.json`](../../../packages/rxdb/project.json)
- [`src/index.ts`](../../../packages/rxdb/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./testing`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`vitest: >=4.0.0`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                | 核查动作                                                                                                                   | 最低复验场景 / 证据要求                                                                                       | 状态   |
| ---- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| C1   | 连接与插件生命周期  | 沿 connect / disconnect、插件依赖安装和销毁顺序画状态机；核查失败后资源归属，避免以 fallback 隐藏初始化失败。              | 并发 connect、连接中 disconnect、插件安装抛错、重连；监听、网关和后台任务均可收束。                           | 待核查 |
| C2   | 实体身份与写入口    | 逐项核查 metadata 校验、identity cache、字段格式、关系、级联与操作权限；实例 save/remove 与批量 mutations 都要追到适配器。 | 重复实体引用、复合关系、只读字段、非法字段值、级联失败、绕过单一入口的写入；拒绝时不留下部分写。              | 待核查 |
| C3   | 查询与响应式增量    | 对比查询初始快照、merge_create/update/remove 与实际 SQL 结果；检查计数、排序、关联失效和游标边界。                         | 同排序值、可空排序列、升降序、跨页更新/删除、过期事件、关系变化；对照全量重查，不接受静默丢行。               | 待核查 |
| C4   | 事务与可信写入      | 追踪事务上下文、提交/回滚与事件发出时点；检查 TrustedWriteIntent、raw-write gate 和捕获挂载口，不扩大公开写权限。          | 写入后抛错、嵌套/并发事务、提交后发布、接收端事务中安装捕获、无 intent 的原始写入。                           | 待核查 |
| C5   | 迁移与能力水位      | 枚举系统迁移和 schema 指纹；检查旧客户端遇到已启用的新能力时如何拒绝，而非直接修改当前数据库。                             | 旧 schema 升级、迁移中断、重复升级、工作树能力已启用但插件未安装；整个连接链路给出可解释失败。                | 待核查 |
| C6   | 备份与恢复边界      | 核查 archive / manifest / queue / lock 协作、版本和 schema 验证、数据库备份与文件存储的边界。                              | 损坏清单、错 schema、部分读写失败、恢复并发、取消、缺失文件；失败不覆盖原数据，不把未包含的文件声称为已备份。 | 待核查 |
| C7   | 公共 API 与核心边界 | 逐项对照根入口、适配器接口、插件接口和生成客户端；核查内部实体函数、测试工具及可选插件是否越过公开边界。                   | 现有 consumer 编译、没有可选插件时连接、按公开入口安装插件；不要把基线更新当作兼容性证明。                    | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **125** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/backup/backup-archive.spec.ts`](../../../packages/rxdb/src/__tests__/backup/backup-archive.spec.ts)
- [`src/__tests__/backup/backup-error.spec.ts`](../../../packages/rxdb/src/__tests__/backup/backup-error.spec.ts)
- [`src/__tests__/backup/backup-lock.spec.ts`](../../../packages/rxdb/src/__tests__/backup/backup-lock.spec.ts)
- [`src/__tests__/backup/backup-manifest.spec.ts`](../../../packages/rxdb/src/__tests__/backup/backup-manifest.spec.ts)
- [`src/__tests__/backup/backup-queue.spec.ts`](../../../packages/rxdb/src/__tests__/backup/backup-queue.spec.ts)
- [`src/__tests__/backup/backup-target.spec.ts`](../../../packages/rxdb/src/__tests__/backup/backup-target.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **90%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`angular`（集成边界）](../../../modules/angular)、[`angular-todo`（集成边界）](../../../modules/angular-todo)、[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`dev-rxdb-http`](../apps/dev-rxdb-http.md)、[`dev-rxdb-http-server`](../apps/dev-rxdb-http-server.md)、[`dev-rxdb-miniprogram`](../apps/dev-rxdb-miniprogram.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-supabase`](../apps/dev-rxdb-supabase.md)、[`dev-rxdb-tauri`](../apps/dev-rxdb-tauri.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`recipes-domain`（集成边界）](../../../modules/recipes-domain)、[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-adapter-encrypted`](rxdb-adapter-encrypted.md)、[`rxdb-adapter-http`](rxdb-adapter-http.md)、[`rxdb-adapter-miniprogram`](rxdb-adapter-miniprogram.md)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-adapter-sqlite`](rxdb-adapter-sqlite.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-sqlite-wasm`](rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-sqliteai`](rxdb-adapter-sqliteai.md)、[`rxdb-adapter-supabase`](rxdb-adapter-supabase.md)、[`rxdb-adapter-tauri`](rxdb-adapter-tauri.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`rxdb-angular`](rxdb-angular.md)、[`rxdb-client-generator`](rxdb-client-generator.md)、[`rxdb-devtools`](rxdb-devtools.md)、[`rxdb-model`](rxdb-model.md)、[`rxdb-model-angular`](rxdb-model-angular.md)、[`rxdb-model-react`](rxdb-model-react.md)、[`rxdb-model-vue`](rxdb-model-vue.md)、[`rxdb-plugin-graph`](rxdb-plugin-graph.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](rxdb-plugin-querycache.md)、[`rxdb-plugin-replay`](rxdb-plugin-replay.md)、[`rxdb-plugin-search`](rxdb-plugin-search.md)、[`rxdb-plugin-search-angular`](rxdb-plugin-search-angular.md)、[`rxdb-plugin-search-react`](rxdb-plugin-search-react.md)、[`rxdb-plugin-search-vue`](rxdb-plugin-search-vue.md)、[`rxdb-plugin-storage`](rxdb-plugin-storage.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-plugin-tree`](rxdb-plugin-tree.md)、[`rxdb-plugin-tree-angular`](rxdb-plugin-tree-angular.md)、[`rxdb-plugin-tree-react`](rxdb-plugin-tree-react.md)、[`rxdb-plugin-tree-vue`](rxdb-plugin-tree-vue.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-plugin-working-tree-angular`](rxdb-plugin-working-tree-angular.md)、[`rxdb-plugin-working-tree-react`](rxdb-plugin-working-tree-react.md)、[`rxdb-plugin-working-tree-vue`](rxdb-plugin-working-tree-vue.md)、[`rxdb-plugin-workspace`](rxdb-plugin-workspace.md)、[`rxdb-react`](rxdb-react.md)、[`rxdb-test`](rxdb-test.md)、[`rxdb-vue`](rxdb-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**RxDB 基础封装联审**：[`rxdb-angular`](rxdb-angular.md)、[`rxdb-react`](rxdb-react.md)、[`rxdb-vue`](rxdb-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

## 5. 执行命令与环境

前置环境：无额外宿主假设；按实际测试配置区分 Node、模拟 DOM 与真实浏览器。

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
NX_DAEMON=false pnpm nx show project rxdb --json
CI=true NX_DAEMON=false pnpm nx run rxdb:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb
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
