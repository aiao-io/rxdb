---
kind: review-plan
object: rxdb-plugin-working-tree
source_root: packages/rxdb-plugin-working-tree
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-plugin-working-tree：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

数据库级写捕获、未提交变更、commit 图、CAS、分支物化与恢复会话。

| 项目                | 基线事实                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| 对象类型            | 包                                                                                |
| 源码范围            | [`packages/rxdb-plugin-working-tree`](../../../packages/rxdb-plugin-working-tree) |
| Nx 项目             | `rxdb-plugin-working-tree`                                                        |
| npm 名称            | `@aiao/rxdb-plugin-working-tree`                                                  |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai）      |
| 建议波次 / 优先风险 | W3 / 高（排期依据，不是缺陷结论）                                                 |
| 受控文件盘点        | 151 个；测试/共享套件入口 70 个（按文件名，不代表覆盖率）                         |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                         |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/plugin.ts`](../../../packages/rxdb-plugin-working-tree/src/plugin.ts)
- [`src/commit/commit-capability.ts`](../../../packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts)
- [`src/commit/write-commit.ts`](../../../packages/rxdb-plugin-working-tree/src/commit/write-commit.ts)
- [`src/commit/commit-codec.ts`](../../../packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts)
- [`src/working-tree/activation-cas.ts`](../../../packages/rxdb-plugin-working-tree/src/working-tree/activation-cas.ts)
- [`src/working-tree/branch-materialization.ts`](../../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts)
- [`src/working-tree/capture-install.ts`](../../../packages/rxdb-plugin-working-tree/src/working-tree/capture-install.ts)
- [`README.md`](../../../packages/rxdb-plugin-working-tree/README.md)
- [`package.json`](../../../packages/rxdb-plugin-working-tree/package.json)
- [`project.json`](../../../packages/rxdb-plugin-working-tree/project.json)
- [`src/index.ts`](../../../packages/rxdb-plugin-working-tree/src/index.ts)
- [`tsconfig.lib.json`](../../../packages/rxdb-plugin-working-tree/tsconfig.lib.json)
- [`tsconfig.json`](../../../packages/rxdb-plugin-working-tree/tsconfig.json)

公共边界：

- 源 `package.json` 的 `exports` 键：`./package.json`、`.`、`./testing`；逐一核查 types / import / default 与发布文件对应关系。
- API 对照：[当前 API baseline](../../api-baseline/rxdb-plugin-working-tree.json)；符号存在不等于归属、语义和兼容性已验证。
- `peerDependencies` 边界：`vitest: >=4.0.0`；验证消费端配置，不用内部路径绕过缺失依赖。

## 3. 专项核查与最低复验场景

| 编号 | 专项                   | 核查动作                                                                                             | 最低复验场景 / 证据要求                                                                              | 状态                                    |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------- |
| C1   | 启用与迁移水位         | 追踪 enable、能力持久化、系统迁移及未装插件的客户端连接拒绝；v1 不凭空添加 disable。                 | 并发 enable、旧库、插件缺失、失败回滚；能力水位与系统表一致。                                        | partial / 待证（2026-10-05；见第 8 节） |
| C2   | 写捕获闭合             | 逐入口核对实例/批量/raw SQL/远端应用与 trusted write，内部簿记不能进入用户工作树。                   | 用户写、同步写、系统写、bulk write、安装中事务；漏捕/重复捕获有真实 backend 探针。                   | partial / 待证（2026-10-05；见第 8 节） |
| C3   | commit 与 CAS 幂等     | 检查全工作树提交、HEAD/activation revision、幂等 token 与 commit/change-set/ref 的原子性。           | 两个提交者竞争、重复请求、空 commit、提交中抛错；CAS 落败按既有返回值而非改成异常。                  | partial / 待证（2026-10-05；见第 8 节） |
| C4   | 分支物化与 ABA         | 审查 staging 页、page fingerprint、激活屏障与分支删除/重建的身份关联。                               | 页冲突、续页、分页中删除重建、旧引用、多个 active；不得部分物化或复活旧分支。                        | partial / 待证（2026-10-05；见第 8 节） |
| C5   | discard / restore 语义 | 核查 restore/restoreSession 写成新未提交变更，HEAD 不移动；区分 switchBranch 的异常前置。            | 不可达 commit、dirty tree、旧 activation revision、恢复中断/重试；数据/HEAD/历史严格按现有契约。     | partial / 待证（2026-10-05；见第 8 节） |
| C6   | 加密与敏感历史         | 逐项扫描工作树、提交、恢复会话、staging、错误与摘要的持久化字节和日志边界。                          | 敏感字段不同版本 envelope、tamper、落盘检查；不声称永久历史可删除，也不把未覆盖 staging 宣称已加密。 | partial / 待证（2026-10-05；见第 8 节） |
| C7   | 提交图与资源成本       | 检查 graph guard、codec、reachability、GC 和批量 diff/status 的复杂度。                              | 坏图/坏编码、深历史、大批变更、不可达引用；无无限遍历/全库重复扫描。                                 | partial / 待证（2026-10-05；见第 8 节） |
| C8   | 真实后端与三端入口     | 对照 conformance、三个 use-working-tree 与应用交互，必须区分 mock/orchestration 与实际 transaction。 | SQLite/PGlite CAS、rollback、restore；三端同场景返回值与 UI 错误状态对齐。                           | partial / 待证（2026-10-05；见第 8 节） |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **70** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/__tests__/commit/commit-codec.spec.ts`](../../../packages/rxdb-plugin-working-tree/src/__tests__/commit/commit-codec.spec.ts)
- [`src/__tests__/commit/active-branch-cardinality.spec.ts`](../../../packages/rxdb-plugin-working-tree/src/__tests__/commit/active-branch-cardinality.spec.ts)
- [`src/__tests__/commit/capability-enable.spec.ts`](../../../packages/rxdb-plugin-working-tree/src/__tests__/commit/capability-enable.spec.ts)
- [`src/__tests__/commit/change-unit.spec.ts`](../../../packages/rxdb-plugin-working-tree/src/__tests__/commit/change-unit.spec.ts)
- [`src/__tests__/commit/commit-cas-idempotency.spec.ts`](../../../packages/rxdb-plugin-working-tree/src/__tests__/commit/commit-cas-idempotency.spec.ts)
- [`src/__tests__/commit/commit-empty-and-baseline.spec.ts`](../../../packages/rxdb-plugin-working-tree/src/__tests__/commit/commit-empty-and-baseline.spec.ts)

运行配置：[`vite.config.mts`](../../../packages/rxdb-plugin-working-tree/vite.config.mts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

覆盖率验收：`statements / branches / functions / lines` 四项均 ≥ **80%**；本轮尚未测量。 按 [仓库覆盖率门禁](../../../scripts/audit/coverage-check.mjs) 核对来源、include / exclude 与当轮 summary；不能只报告平均值或把 skipped 当已覆盖。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb`](rxdb.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`utils`](utils.md)。

Nx 基线图中的直接消费者：[`benchmarks`（集成边界）](../../../benchmarks)、[`dev-rxdb-angular`](../apps/dev-rxdb-angular.md)、[`dev-rxdb-react`](../apps/dev-rxdb-react.md)、[`dev-rxdb-vue`](../apps/dev-rxdb-vue.md)、[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-adapter-pglite`](rxdb-adapter-pglite.md)、[`rxdb-adapter-sqlite`](rxdb-adapter-sqlite.md)、[`rxdb-adapter-sqlite-wasm`](rxdb-adapter-sqlite-wasm.md)、[`rxdb-adapter-sqliteai`](rxdb-adapter-sqliteai.md)、[`rxdb-adapter-wa-sqlite`](rxdb-adapter-wa-sqlite.md)、[`rxdb-plugin-replay`](rxdb-plugin-replay.md)、[`rxdb-plugin-working-tree-angular`](rxdb-plugin-working-tree-angular.md)、[`rxdb-plugin-working-tree-react`](rxdb-plugin-working-tree-react.md)、[`rxdb-plugin-working-tree-vue`](rxdb-plugin-working-tree-vue.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`rxdb`](rxdb.md)、[`rxdb-plugin-history`](rxdb-plugin-history.md)、[`rxdb-plugin-replay`](rxdb-plugin-replay.md)、[`rxdb-plugin-sync`](rxdb-plugin-sync.md)、[`rxdb-plugin-workspace`](rxdb-plugin-workspace.md)。

**工作树联审**：[`rxdb-plugin-working-tree-angular`](rxdb-plugin-working-tree-angular.md)、[`rxdb-plugin-working-tree-react`](rxdb-plugin-working-tree-react.md)、[`rxdb-plugin-working-tree-vue`](rxdb-plugin-working-tree-vue.md)。对照输入/输出、pending/error、取消、重订阅、并发和释放的语义；保留框架原生表达，不强行同名生命周期实现。

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
NX_DAEMON=false pnpm nx show project rxdb-plugin-working-tree --json
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-working-tree:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-plugin-working-tree --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-plugin-working-tree:test --coverage --skipRemoteCache --skipNxCache
pnpm audit:coverage --projects=rxdb-plugin-working-tree
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

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-plugin-working-tree.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 续执行：2026-10-03 边界取证

本批实际源码专题、确认意见和复验结果见 [此对象执行记录](../results/packages/rxdb-plugin-working-tree.md) 与 续执行汇总。只核销记录中明确覆盖的 C 项，不把全量门禁或单用例通过当作全对象评审完成。

## 8. 2026-10-05：plugins 实际逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**当前 Node 通过；计数不凭其它报告推算，无当前副本 JUnit**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-working-tree` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**97.09% / 90.54% / 97.87% / 98.01%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-working-tree/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态       | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                                                       | 不变量、正向与反证                                                                                                                                                                                                   | 已有/本轮测试证据                                                                                                                             | 必要缺口或核销边界                                                                                                  |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| C1  | partial / 待证 | commit/commit-capability.ts:118–153、177–236；plugin.ts:103–130；commit/enable-migration.ts:145–165                                    | 能力 singleton 缺行不是 disabled；protocol/schema/codec 分别拒绝；enable 是 enabled=false 条件 CAS，落败重读，不凭空增加 disable。bootstrapExisting 已启用时检查单 active 分支并安装捕获。                           | capability-enable、enable-migration、legacy-compat、bootstrap-existing、working-tree-commits-migration 入口；主控当前 Node fresh 四指标达标。 | 并发 enable/旧库水位/缺插件连接拒绝及失败回滚的真实 SQLite/PGlite 全矩阵仍未逐例审证。                              |
| C2  | partial / 待证 | working-tree/capture-install.ts:35–39；capture-hook.ts:259–274、371–425；capture-mount-points.ts:16–23                                 | 入口挂到 adapter hook；事务先抓日志水位，排除 nested 已 consumed change ids；mergeChanges 声明入口并同 executor 捕获，防内部 trusted 写被重复计入。不能把 hook 名单当所有宿主都实际挂载。                            | working-tree capture/write-entry/raw/bulk conformance 测试入口与当前 Node 门禁；本轮只深读部分捕获核心。                                      | raw-write-judgment/bulk/external-notify 全入口代码、安装中事务及各真实 adapter 漏捕/重复捕获探针尚未完整读取/对照。 |
| C3  | partial / 待证 | working-tree/commit-command.ts:215–242、289–339；commit/write-commit.ts:369–424；commit-idempotency.ts:74–107                          | 三类 revision 凭据先验；operationId 混 branchGeneration，重试不重复通知；HEAD CAS 排在 saveMany 前，rowsAffected=0 返回 conflict，不再按原 RV-041 旧 throw 判缺陷；成功后才清全工作树/推进会话。                     | commit-cas-idempotency、commit-empty-and-baseline、commit-graph 及当前 Node 全测量面。                                                        | 多个真实提交者竞争、保存中抛错的完整 rollback、幂等同内容/不同内容公开链路未全部取证，不借当前覆盖率自动核销。      |
| C4  | partial / 待证 | working-tree/branch-materialization.ts:362–506；materialize-branch.ts:267–392；activation-cas.ts:87–106、151–158                       | page 内容复算 fingerprint、唯一页冲突显式报错、seal 验密集序列；source failure 留 staging 以续页；materialize 与 settle 依赖 adapter prepare 同 transaction；activation 单例命中必须恰一行。                         | materialization-barrier、materialize-branch-takeover、metadata-only-branch-switch、switch-branch-options 入口；当前 Node 测量面通过。         | stage→激活的后半全部代码及删除重建 generation ABA、多 active、真实 crash/CAS 联合矩阵未完整闭合。                   |
| C5  | partial / 待证 | working-tree/restore-command.ts:1–34、379–429；replay/restore.ts:41–56；materialize-branch.ts:305–392                                  | restore 重放目标 commit 内容为新未提交单元，不是 checkout/删除后续实体；HEAD/history 不动；dirty/CAS/兼容/可达性有独立拒绝。switchBranch 前置异常与 restore 结构化返回不能混同。                                     | 原 restore 单元/conformance；本组 review-parallel-restore.spec.ts 走真实 PGlite，但首轮两红是本组契约误用，已修订待 late probe。              | 修订 spec 尚未复跑；CAS 竞争、恢复中断/重试与 switchBranch 完整前置矩阵仍缺。首轮红不登记产品问题。                 |
| C6  | partial / 待证 | commit/commit-codec.ts:178–204；commit/write-commit.ts:374–377；working-tree-patch-codec.ts:121–154；branch-materialization.ts:426–431 | commit 写前校验 encryptedPropertyMap 对应 patch/inversePatch 的 envelope；diagnostic 只含身份/列/枚举，不回显值；工作树 patch 经 metadata codec。staging 直接承载 payload，不能由 commit guard 推断 staging 已加密。 | commit-codec、commit-encryption、commit-encrypted-at-rest-wiring 入口；当前 Node 四指标达标。                                                 | 所有版本 envelope/tamper、工作树/提交/会话/staging 的实际落盘字节和日志全扫描未完成；不声称永久历史可删。           |
| C7  | partial / 待证 | commit/commit-graph-guard.ts:119–128、172–212、250–263；commit/write-commit.ts:291–329                                                 | 按 frontier 成批读 commit/change-set，seen 控遍历，缺 commit/数量/fingerprint 不符显式损坏；commit 序列与克隆内容进入 fingerprint。防无限环与资源成本是两回事。                                                      | corruption-guard、commit-graph、change-unit 入口和当前 Node 测量面。                                                                          | 深历史/大批 diff/status 的端到端成本、GC/不可达引用全部路径未读取/测量，不能把层批查询当复杂度已验收。              |
| C8  | partial / 待证 | plugin.ts:103–130；capture-install.ts:35–39；replay/restore.ts:41–56                                                                   | 公开 facade 与 adapter transaction 接缝已对照，明确本轮 PGlite 新 probe 与 mock orchestration 区别；不按 conformance 文件存在就称真实 backend 已过。                                                                 | 当前 working-tree fresh Node 四指标 97.09/90.54/97.87/98.01；本组 replay 实际 PGlite probe 待修订后复跑。                                     | SQLite/PGlite CAS/rollback/restore 与三 use-working-tree 相同 UI 状态矩阵尚未逐项联审；全对象 152 文件未全部深读。  |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
