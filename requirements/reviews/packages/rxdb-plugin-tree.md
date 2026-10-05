---
kind: review-plan
object: rxdb-plugin-tree
source_root: packages/rxdb-plugin-tree
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-plugin-tree：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

树实体、repository、增量查询与生成器；浏览器运行套件单独配置。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-plugin-tree`](../../../packages/rxdb-plugin-tree)            |
| Nx 项目             | `rxdb-plugin-tree`                                                           |
| npm 名称            | `@aiao/rxdb-plugin-tree`                                                     |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W3 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 47 个；测试/共享套件入口 18 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/entity/tree-entity-base.ts`](../../../packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts)
- [`src/repository/TreeRepository.ts`](../../../packages/rxdb-plugin-tree/src/repository/TreeRepository.ts)
- [`src/query/merge-update-tree.ts`](../../../packages/rxdb-plugin-tree/src/query/merge-update-tree.ts)
- [`src/query/tree-helper.ts`](../../../packages/rxdb-plugin-tree/src/query/tree-helper.ts)
- [`src/generator/TreeRepositoryGenerator.ts`](../../../packages/rxdb-plugin-tree/src/generator/TreeRepositoryGenerator.ts)
- [`README.md`](../../../packages/rxdb-plugin-tree/README.md)
- [`package.json`](../../../packages/rxdb-plugin-tree/package.json)
- [`project.json`](../../../packages/rxdb-plugin-tree/project.json)
- [`src/index.ts`](../../../packages/rxdb-plugin-tree/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-tree/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-tree/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./generator`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-tree.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项               | 核查动作                                                                               | 最低复验场景 / 证据要求                                                            | 状态                                    |
| ---- | ------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| C1   | 树结构不变量       | 核查根、父子关系、层级与移动/删除的原子性，追踪 numeric/string id 路径。               | 自父、祖先移动到子孙、孤儿、重复路径、深树、批次失败；不得留下半棵树。             | partial / 待证（2026-10-05；见第 8 节） |
| C2   | 树查询与增量       | 逐项比较 ancestors/descendants、懒加载与 merge-create/update/remove 同全量查询的结果。 | 移动跨查询边界、父删除、排序相同、未加载节点更新；增量结果可全量复验。             | partial / 待证（2026-10-05；见第 8 节） |
| C3   | 能力限制与插件依赖 | 核查必须插件、querycache-ban、SQLite/PGlite backend 能力，明确不支持的组合。           | 未装 Tree 插件、QueryCache 模式、不支持的后端；明确错误而非扁平查询 fallback。     | partial / 待证（2026-10-05；见第 8 节） |
| C4   | 生成类型与三框架   | 对照 TreeRepositoryGenerator、公开泛型及三端 use-tree，不能让树 API 被宽化为 any。     | numeric id、嵌套 filter、consumer 类型错误、同场景三端状态；生成器与运行入口闭合。 | partial / 待证（2026-10-05；见第 8 节） |
| C5   | 浏览器真实证据     | 区分普通 test 与 test-browser；不能只跑 generator 单测就宣称树运行时通过。             | 完整 browser suite 与真实 SQLite/PGlite conformance；记录缺少环境导致的未验证项。  | partial / 待证（2026-10-05；见第 8 节） |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **18** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/generator/TreeRepositoryGenerator.spec.ts`](../../../packages/rxdb-plugin-tree/src/__tests__/generator/TreeRepositoryGenerator.spec.ts)
- [`src/__tests__/query/merge-update-tree.handlers.browser.spec.ts`](../../../packages/rxdb-plugin-tree/src/__tests__/query/merge-update-tree.handlers.browser.spec.ts)
- [`src/__tests__/query/tree-helper.browser.spec.ts`](../../../packages/rxdb-plugin-tree/src/__tests__/query/tree-helper.browser.spec.ts)
- [`src/__tests__/contracts/querycache-ban.browser.spec.ts`](../../../packages/rxdb-plugin-tree/src/__tests__/contracts/querycache-ban.browser.spec.ts)
- [`src/__tests__/contracts/tree-query-type-parity.browser.spec.ts`](../../../packages/rxdb-plugin-tree/src/__tests__/contracts/tree-query-type-parity.browser.spec.ts)
- [`src/__tests__/entity/tree-entity-base.browser.spec.ts`](../../../packages/rxdb-plugin-tree/src/__tests__/entity/tree-entity-base.browser.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-tree/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-client-generator`](rxdb-client-generator.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-tauri`](../apps/dev-rxdb-tauri.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-sqlite-wasm`](rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-supabase`](rxdb-adapter-supabase.md)、[`rxdb-plugin-tree-angular`](rxdb-plugin-tree-angular.md)、[`rxdb-plugin-tree-react`](rxdb-plugin-tree-react.md)、[`rxdb-plugin-tree-vue`](rxdb-plugin-tree-vue.md)、[`rxdb-test`](rxdb-test.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

**树联审**：[`rxdb-plugin-tree-angular`](rxdb-plugin-tree-angular.md)、[`rxdb-plugin-tree-react`](rxdb-plugin-tree-react.md)、[`rxdb-plugin-tree-vue`](rxdb-plugin-tree-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

## 5. 执行命令与环境

前置环境：无额外宿主假设；按实际测试配置区分 Node、模拟 DOM 与真实浏览器。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target      | 用途与证据边界                                                         |
| -------------- | ---------------------------------------------------------------------- |
| `lint`         | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck`    | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`         | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`        | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |
| `test-browser` | 显式浏览器运行时补证；检查 provider、include、环境与清理。             |
| `coverage`     | 项目专用覆盖率流程；核对是否合并不同运行时、产物是否当轮生成。         |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-plugin-tree --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-tree:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-tree --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-tree:coverage --skipRemoteCache --skipNxCache
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-tree:test-browser --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-tree
```

- `test-browser` 与普通 `test` 的运行面分别记录；专用 coverage 流程是否已纳入 browser project 需读配置，未纳入则补独立测量，不拿 Node summary 代证。

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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-tree.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-04：树查询与 DevTools 第三批深审

[本对象实际意见与源码/运行证据](../results/packages/rxdb-plugin-tree.md) · 本批台账。未核销项不由生成器、mock 或其它后端门禁代证。

## 8. 2026-10-05：plugins 实际逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**7 passed /0 failed /0 skip（仅 Node generator/静态面）**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-tree` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**100% / 100% / 100% / 100%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-tree/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态       | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                     | 不变量、正向与反证                                                                                                                                               | 已有/本轮测试证据                                                                                                                                            | 必要缺口或核销边界                                                                                                |
| --- | -------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| C1  | partial / 待证 | entity/tree-entity-base.ts:46–100；repository/tree-level.utils.ts:10–14；query/tree-helper.ts:94–198 | parentId 保持 Id 泛型，level 是非负安全整数；增量 helper visited 防环/缺父停止。读遍历终止不等于写入禁止自父或保证移动/删除整棵原子。                            | entity/tree-entity-numeric-id.browser.spec.ts、tree-helper.browser.spec.ts、merge-tree browser 入口已定位；当前 Node 仅 7/7。                                | 原自父/祖先移到子孙/孤儿/重复路径/深树/批写失败的真实 SQL 写入与回滚证据尚缺，不能拿 generator 的 Node 七例代替。 |
| C2  | partial / 待证 | query/merge-update-tree.ts:273–376、397–558；repository/TreeRepository.ts:65–119                     | where 翻转/改父会失去可达性信息，ancestors 与 counts 交 SQL refresh；纯字段变化才本地 applyExternalEntityUpdate。当前 RV-046 修法不是继续错误的局部 +1/-1 计数。 | query/review-query-tree.regression.browser.spec.ts、merge-update-tree.handlers.browser.spec.ts、numeric-id-tree-merge.browser.spec.ts；当前 browser 待主控。 | 边界移动、父删、未载节点、相同排序与全量 SQLite/PGlite 结果逐场景对照未完整核销。                                 |
| C3  | partial / 待证 | plugin.ts:48–64；repository/TreeRepository.ts:65–119                                                 | registry 按 SyncType.QueryCache 明确禁止，原因是 where 局部缓存不保证祖先链；四 API 走注册的 primary，不为缺插件补扁平查询。                                     | contracts/missing-plugin-error.browser.spec.ts、querycache-ban.browser.spec.ts；Node 不包含这两项，browser 排队。                                            | 缺插件/不支持 backend 的实际公开调用与当前 browser 拒绝结果未收齐。                                               |
| C4  | partial / 待证 | generator/TreeRepositoryGenerator.ts:69–151；entity/tree-entity-base.ts:46–98                        | children 规则收窄，RuleGroup 与 numeric/string Id 贯通；find 包含自身/count 不包含自身，声明返回 Observable，未宽化成 any。                                      | generator 及 contracts/public-type-compatibility、tree-query-type-parity browser 入口；当前 Node 7/7，主控 lib typecheck 通过。                              | 真实生成消费与三个框架相同输入返回状态/错误未独立映射到本 C；框架整体门禁不可自动替代三端用户链路。               |
| C5  | partial / 待证 | vite 配置/已解析 target 将 Node 与 browser 分开；repository/TreeRepository.ts:65–119                 | 当前 Node fresh summary 仅 20 lines/21 statements，是 generator 测量面，100% 绝不代表树运行时。已核对 browser 入口不是当前 Node include。                        | 主控 Node 7/7、coverage 100/100/100/100（仅 Node 面）；5 包 browser 由主控统一续跑。                                                                         | 完整 browser 与真实 SQLite/PGlite conformance 合并四指标、skip/宿主范围尚未收齐，原 C5 不核销。                   |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
