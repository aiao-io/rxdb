---
kind: review-plan
object: rxdb-adapter-sqliteai
source_root: packages/rxdb-adapter-sqliteai
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-adapter-sqliteai：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

SQLiteAI 运行时的 adapter、client 和资源装载，复用 SQLite 数据层。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-adapter-sqliteai`](../../../packages/rxdb-adapter-sqliteai)  |
| Nx 项目             | `rxdb-adapter-sqliteai`                                                      |
| npm 名称            | `@aiao/rxdb-adapter-sqliteai`                                                |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W2 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 35 个；测试/共享套件入口 11 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/RxDBAdapterSqliteai.ts`](../../../packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts)
- [`src/SqliteaiClient.ts`](../../../packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts)
- [`src/create_sqlite_client.ts`](../../../packages/rxdb-adapter-sqliteai/src/create_sqlite_client.ts)
- [`src/sqliteai-load.utils.ts`](../../../packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts)
- [`src/sqliteai.interface.ts`](../../../packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts)
- [`README.md`](../../../packages/rxdb-adapter-sqliteai/README.md)
- [`package.json`](../../../packages/rxdb-adapter-sqliteai/package.json)
- [`project.json`](../../../packages/rxdb-adapter-sqliteai/project.json)
- [`src/index.ts`](../../../packages/rxdb-adapter-sqliteai/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-adapter-sqliteai/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-adapter-sqliteai/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`./testing`、`.`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-adapter-sqliteai.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项                  | 核查动作                                                                              | 最低复验场景 / 证据要求                                                            | 状态   |
| ---- | --------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| C1   | 运行时装载与版本      | 核查 SQLiteAI 模块/WASM 配对、options 和初始化状态，不从包名推断所有 AI API 已公开。  | 资源版本不匹配、网络失败、能力缺失、重复初始化；失败不切换其他 SQLite 引擎。       | 待核查 |
| C2   | 扩展能力边界          | 对照公开接口、README 和实际引擎 capability，列明支持与不支持的扩展功能。              | 未声明扩展调用、缺扩展、不同资源版本；需要真实引擎探针，不以构造成功代表能力存在。 | 待核查 |
| C3   | SQL / client 共用语义 | 逐项审查同步/异步助手、参数、结果与事务委托。                                         | BigInt/binary/null、批写失败、回滚、关库重开；与 sqlite-core contract 同语义。     | 待核查 |
| C4   | 加密、搜索与备份      | 核查已接入的 encrypted/conformance suite 与备份实现；搜索支持按实际 capability 判定。 | 加密变化日志无明文、tamper 拒绝、备份损坏、恢复失败；不为补齐能力增加 fallback。   | 待核查 |
| C5   | 应用接线与发布        | 对照 Angular 演示的初始化入口、公开 exports 和资源复制规则。                          | 发布后 consumer、真实页面初始化、资源部署错误；类型与运行时能力相符。              | 待核查 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **11** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/sqliteai-load.utils.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/sqliteai-load.utils.spec.ts)
- [`src/__tests__/SqliteaiClient.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/SqliteaiClient.spec.ts)
- [`src/__tests__/create_sqlite_client.options.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/create_sqlite_client.options.spec.ts)
- [`src/__tests__/adapter-construction.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/adapter-construction.spec.ts)
- [`src/__tests__/backup/sqliteai-backup.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/backup/sqliteai-backup.spec.ts)
- [`src/__tests__/encrypted-bigint-binary.spec.ts`](../../../packages/rxdb-adapter-sqliteai/src/__tests__/encrypted-bigint-binary.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-adapter-sqliteai/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-querycache`](rxdb-plugin-querycache.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-plugin-working-tree`](rxdb-plugin-working-tree.md)、[`rxdb-test`](rxdb-test.md)。

Nx 基线图中的直接消费者：[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`rxdb-plugin-search`](rxdb-plugin-search.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

## 5. 执行命令与环境

前置环境：当前锁定版本的 SQLiteAI 资源与真实浏览器；扩展功能必须按实际接口安排探针，不承诺未声明能力。

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
NX_DAEMON=false pnpm nx show project rxdb-adapter-sqliteai --json
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-sqliteai:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-adapter-sqliteai --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-sqliteai:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-adapter-sqliteai
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-adapter-sqliteai.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-05：local-adapters 并行实审收束

这部分是**实际执行回填**，不是新增泛计划。原专项表及其旧 RV/旧测试数字属于早期执行快照；当前源与当轮结果见 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-adapter-sqliteai.md`。用户已修历史问题不重新标红。

- execution: in-progress / partial；**原 C 全边界核销 0/5，整对象未 closed**。原第 6 节完成条件保持原文，未满足项不打勾。
- 当轮已结算：Tests 743 passed | 10 skipped (753)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt:1790）。
- 四指标 S/B/F/L = 95.65/100/100/95.45%；summary/final：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-adapter-sqliteai/coverage-summary.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-adapter-sqliteai/coverage-final.json`。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 本轮明确意见：共享core LA-02/LA-03；本包743pass不反证共享层窗口。

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                                                                                                                            | 当前结论/可证反证                                                                                                                             | 原 C 核销 | 剩余必要验证                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts:46–78`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/create_sqlite_client.ts:26–49`                                                                                                                                          | 加载fingerprint/global lock/assertOo1Static与官方路径同契约；错误不换其它引擎。当前模块构造成功只证明oo1结构，不证明AI所有扩展。              | 未核销    | 网络/资源配对/能力不足/初始化失败重试，以及LA-03共享oo1关闭屏障；不同配置/模块版本实际部署。                       |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/index.ts:1–18`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts:13–20`                                                                                                                                                               | 公开入口暴露adapter/client/loader及core通用SQL接口，没有专门AI向量/记忆方法承诺；不能从包名推断能力。                                         | 未核销    | 真实引擎各扩展capability探针、版本差异/缺扩展拒绝；现有suite中的能力skip需要单列，而不是仅构造绿。                 |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts:13–20`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:113–139,180–235,265–305`                                                                                                                                 | 同步/异步/类型/事件均委托Oo1ClientBase；LA-03已在共享层轻量回归证实。本包743pass/10skip与共享层生命周期红并不矛盾。                           | 未核销    | BigInt/binary/null批写回滚/重开跨后端同fixture、statement各失败阶段、真实OPFS关闭；10skip逐项核销。                |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/__tests__/encrypted-bigint-binary.spec.ts:1–5`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:142–173`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/fts5/create-fts-table.ts:18–32` | 加密类型suite有实际接线；恢复blank按同引擎初始对象描述，不能用“没有任何表”的假设排除sqliteai自建表。搜索必须按capability而非SQL生成存在判断。 | 未核销    | 加密log字节/tamper、搜索真实扩展与索引、损坏备份/失败清理/持久化恢复全场景；未执行部分明确记录。                   |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/index.ts:13–18`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts:65–78`                                                                                                                                                         | loader资源配置实际被传入；包公开API边界可见。本次四指标95.65/100/100/95.45只衡量本包配置源码，不覆盖共享core/全部WASM宿主。                   | 未核销    | Angular真实页面初始化、exports/WASM资源复制及pack后consumer、独立types、离线部署错误未当前验证；不能整对象closed。 |

请求/动态日志与阅读记录均由 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters` 保留。三个新增回归的 late lint/typecheck、完整测量面/宿主/持久化及发布闭合按实际待证留阻断；主控统一追加后续结果，不在这里预支通过。
