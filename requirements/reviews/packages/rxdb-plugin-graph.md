---
kind: review-plan
object: rxdb-plugin-graph
source_root: packages/rxdb-plugin-graph
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-plugin-graph：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

图实体、边表、遍历/路径查询、响应式增量与 repository 生成器。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 包                                                                           |
| 源码范围            | [`packages/rxdb-plugin-graph`](../../../packages/rxdb-plugin-graph)          |
| Nx 项目             | `rxdb-plugin-graph`                                                          |
| npm 名称            | `@aiao/rxdb-plugin-graph`                                                    |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W3 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 52 个；测试/共享套件入口 17 个（按文件名，不代表覆盖率）                     |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/GraphRepository.ts`](../../../packages/rxdb-plugin-graph/src/GraphRepository.ts)
- [`src/graph-edge-entity.factory.ts`](../../../packages/rxdb-plugin-graph/src/graph-edge-entity.factory.ts)
- [`src/query/touches_edge_table.ts`](../../../packages/rxdb-plugin-graph/src/query/touches_edge_table.ts)
- [`src/sqlite/query_graph_sql.ts`](../../../packages/rxdb-plugin-graph/src/sqlite/query_graph_sql.ts)
- [`src/generator/GraphRepositoryGenerator.ts`](../../../packages/rxdb-plugin-graph/src/generator/GraphRepositoryGenerator.ts)
- [`README.md`](../../../packages/rxdb-plugin-graph/README.md)
- [`package.json`](../../../packages/rxdb-plugin-graph/package.json)
- [`project.json`](../../../packages/rxdb-plugin-graph/project.json)
- [`src/index.ts`](../../../packages/rxdb-plugin-graph/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-graph/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-graph/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./sqlite`、`./generator`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-graph.json)；符号存在不等于归属、语义和兼容性已验证。

## 3. 专项核查与最低复验场景

| 编号 | 专项             | 核查动作                                                                                    | 最低复验场景 / 证据要求                                                           | 状态                                    |
| ---- | ---------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| C1   | 节点与边不变量   | 核查有向/无向、加权/无权、重复边、自环和移除节点的边处理。                                  | 重复 addEdge、自环、环路、删除节点、批写失败；元数据与实际边表一致。              | partial / 待证（2026-10-05；见第 8 节） |
| C2   | 遍历复杂度与限界 | 审查递归 SQL、路径去重、深度/数量约束与权重处理，防止小输入触发无限遍历。                   | 高分支度、深环、无可达路径、负/异常权重、超大结果；上限与不支持场景可解释。       | partial / 待证（2026-10-05；见第 8 节） |
| C3   | 响应式依赖追踪   | 检查边表变化是否正确触发查询，尤其 touches_edge_table 与全量/增量边界。                     | 仅修改边、删除节点、断开再连、查询范围外变更；响应式结果与全量查询一致。          | partial / 待证（2026-10-05；见第 8 节） |
| C4   | 能力声明与后端   | 对照 SQLite graph repository、plugin feature guard 与其他后端能力，不按类名假设全后端支持。 | 缺 Graph 插件、错误边 metadata、不支持的 backend；主动拒绝而非错误空结果。        | partial / 待证（2026-10-05；见第 8 节） |
| C5   | 生成器与公共类型 | 检查 edge filter、GraphRepositoryGenerator 的泛型、返回结构和导出。                         | 现有 consumer 编译、有向/加权类型约束、真实生成客户端运行；不依赖内部未导出符号。 | partial / 待证（2026-10-05；见第 8 节） |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **17** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/generator/GraphRepositoryGenerator.spec.ts`](../../../packages/rxdb-plugin-graph/src/__tests__/generator/GraphRepositoryGenerator.spec.ts)
- [`src/__tests__/GraphRepository.spec.ts`](../../../packages/rxdb-plugin-graph/src/__tests__/GraphRepository.spec.ts)
- [`src/__tests__/GraphRepository.unit.spec.ts`](../../../packages/rxdb-plugin-graph/src/__tests__/GraphRepository.unit.spec.ts)
- [`src/__tests__/merge-query.spec.ts`](../../../packages/rxdb-plugin-graph/src/__tests__/merge-query.spec.ts)
- [`src/__tests__/add-edge-feature-guard.spec.ts`](../../../packages/rxdb-plugin-graph/src/__tests__/add-edge-feature-guard.spec.ts)
- [`src/__tests__/directed-unweighted.spec.ts`](../../../packages/rxdb-plugin-graph/src/__tests__/directed-unweighted.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-graph/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`rxdb-client-generator`](rxdb-client-generator.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-electron`](../apps/dev-rxdb-electron.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-supabase`](../apps/dev-rxdb-supabase.md)、[`dev-rxdb-tauri`](../apps/dev-rxdb-tauri.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb-angular`](rxdb-angular.md)、[`rxdb-react`](rxdb-react.md)、[`rxdb-vue`](rxdb-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

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
NX_DAEMON=false pnpm nx show project rxdb-plugin-graph --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-graph:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-graph --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-graph:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-graph
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-graph.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-04：生成器、图与小程序第四批深审

[本对象实际意见与复验证据](../results/packages/rxdb-plugin-graph.md) · [本批台账](../execution-2026-10-04-generator-graph-miniprogram.md)。只核销明确运行面；Node harness 不冒充真实小程序档位。

## 8. 2026-10-05：plugins 实际逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**189 passed /0 failed /0 skip**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-graph` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**97.48% / 93.63% / 100% / 97.91%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-graph/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态       | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                           | 不变量、正向与反证                                                                                                                                                                                 | 已有/本轮测试证据                                                                                                          | 必要缺口或核销边界                                                                                                    |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| C1  | partial / 待证 | graph_edge_entity.ts:15–44；sqlite/SqliteGraphRepository.ts:310–420                                        | 边身份为 sourceId/targetId 唯一键，双端 CASCADE；有向/无向路径分开，重复添加走 upsert。已追到元数据→边表 SQL，不把孤立索引声明当真实删除原子性。                                                   | directed/undirected-{weighted,unweighted}.spec.ts、add-edge-feature-guard.spec.ts；当前 Node 189/189 通过。                | 批写中途失败、真实删除节点与边同步、跨宿主 FK/CASCADE 的全验收矩阵尚缺。                                              |
| C2  | partial / 待证 | utils.ts:23–67；sqlite/query_graph_sql.ts:475–577；sqlite/SqliteGraphRepository.ts:194–249                 | NaN 在 clamp 前明确 RangeError，当前源不再按 RV-050 的旧行为判断；递归 cycle 标志、深度、扩展条数和结果 limit+1 各有边界，路径与节点回填在同一 transaction。不能把 result limit 当遍历工作量上限。 | review-query-nan-depth.spec.ts、graph-resource-limits.spec.ts、find-paths-backfill.spec.ts；当前 Node 全套通过，非旧基线。 | 高分支/深环/不可达、异常权重与超大节点回填的真实 SQL 资源成本未全面量化；RV-050 修复不等于完整 C2 核销。              |
| C3  | partial / 待证 | GraphRepository.ts:183–200；query/touches_edge_table.ts:20–43；query/merge_{create,update,remove}.ts:21–36 | 查询登记边实体依赖；namespace 与 entity 同时匹配，边变更强制 refresh，节点 plain-object where 同样重查；truncated 纳入 fingerprint，避免相同数组却漏掉截断状态。                                   | graph-reactive-api.spec.ts、merge-query.spec.ts、GraphRepository.unit.spec.ts；当前 Node 全套通过。                        | 真实边-only 更新/删节点、断连重连、范围外事件与全量 SQL 对照未完整闭合；不能由 merge 的 mock 调用次数替代结果正确性。 |
| C4  | partial / 待证 | plugin.ts:20–30；sqlite/SqliteGraphRepository.ts:48–77；sqlite/query_graph_sql.ts:123–127                  | repository 注册随 scope 撤销；缺内部列、非法边 id/direction/level 主动拒绝；未声明 weight/properties 的 edgeWhere 不降级为空过滤。SQLite 能力不扩写成所有后端支持。                                | repository-registry-contract.spec.ts、neighbor-row-guard.spec.ts、add-edge-feature-guard.spec.ts；当前 Node 全套通过。     | 未装插件/错误 metadata/不支持 backend 的 production-path 与消费端拒绝矩阵未逐一验证，保留 partial。                   |
| C5  | partial / 待证 | generator/GraphRepositoryGenerator.ts:176–290；GraphRepository.ts:33–48、74–156                            | 生成类型按 weight/properties 四组合分型，静态方法与 instance 方法区分 Observable/Promise；addEdge 未启用 weight 时保留参数位置而不伪称支持。                                                       | generator/GraphRepositoryGenerator.spec.ts、edge-filter-types.spec.ts；当前 Node 全套通过，主控 lib typecheck 通过。       | 真实生成客户端在发布入口上的运行/编译负向消费未复验；仓库内 ts-morph 测试不等于打包消费证明。                         |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
