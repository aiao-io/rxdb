---
id: US-909
title: 会话录制回放与失败现场数据还原
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-09-18
updated: 2026-09-26
tags: [future, replay, debugging, e2e, working-tree, rrweb]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 阶段 A 不依赖 epic-006；阶段 B 的前置（US-307）在交付阶段门禁列单独声明
- [x] Negotiable (可协商): 录制注入点、保留策略、体积预算与回放页技术栈在 plan 阶段冻结
- [x] Valuable (有价值): 阶段 A 关闭「e2e 失败无应用级现场、无数据状态」的既有诊断缺口；阶段 C 需价值待证证据
- [x] Estimable (可估算): 阶段 A 是 fixture 注入 + 回放单页 + 本地库写入，可估算
- [ ] Small (小): 按 A / B / C 分阶段交付，不拆子故事文件
- [x] Testable (可测试): 各阶段 AC 以 e2e / 单测 / 契约测试可复验
-->

# 用户故事：会话录制回放与失败现场数据还原

## 作为/我想要/以便

**作为** 本仓库 e2e 与 demo 应用的维护者（阶段 C 之后扩展为使用 `@aiao/rxdb` 的应用开发者）
**我想要** e2e 失败时自动保留失败会话的界面回放，并能把应用数据恢复到失败时刻
**以便** 一次失败就有完整案发现场（界面所见 + 数据状态），不靠反复重跑猜测复现条件

## 现状与证据

1. **e2e 失败诊断缺口**：[`playwright.config.ts`](../../../apps/dev-rxdb-angular-e2e/playwright.config.ts) 设
   `trace: 'on-first-retry'`、`retries: isCI ? 2 : 0`，注释明确「正确动作是用 `--retries=0 --repeat-each=N`
   把它钉成确定性复现，再查产品代码」。两个设置叠在一起，本地失败**从不产生 trace**（没有重试就没有
   first retry），CI 上也只录重试那一次、不录首次失败。即便录到，Playwright trace 记录的是浏览器动作、
   网络与 console，**不含**应用级 DOM 语义回放，也**不含**失败时刻的应用数据状态——trace 定位到失败后，
   仍需手工构造数据场景复现。
2. **数据版本控制基建已存在**：working-tree 已提供写捕获与提交（US-305 `Done`、US-306 `In Review`），
   [`capture-interceptor.ts`](../../../packages/rxdb/src/capture/capture-interceptor.ts) 拦截写入。
   「回到某个提交」的是 `restore({ commitId }, credentials)`（US-307，`Done`）：把一个**当前分支 HEAD 可达**的
   历史 commit 的内容作为新的未提交变更写回工作树，HEAD 不动。它与只读当前恢复会话的 `restoreSession()`
   一起经 `createWorkingTreeCommands` 展开进三框架入口（如 React 的
   [`use-working-tree.ts`](../../../packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts)）。
   数据侧「回到某个提交」的基建存在，但没有任何东西把「界面发生了什么」和「数据在哪个提交」连起来。
3. **冲突粒度决定数据模型**：同步冲突按整文档 LWW 处理（[`LWWConflictResolver`](../../../packages/rxdb/src/sync-contract/LWWConflictResolver.ts)）。
   录制事件若内嵌进 session 大数组，单事件写入会整文档覆盖冲突、并破坏增量拉取粒度——因此
   **每事件一文档**是唯一符合现有同步语义的模型。
4. **写入路径已存在**：批量 mutation 是既有通道（[`rxdb_adapter_mutations.ts`](../../../packages/rxdb-adapter-pglite/src/rxdb_adapter_mutations.ts)，
   sqlite 系同构）。rrweb 高频小事件必须聚批走事务写入，不能逐条 `save()`。
5. **rrweb 能力边界**：MIT 许可、v2.x 活跃维护。其回放是「录制 DOM 的重新渲染」，**不重执行应用代码**——
   回放提供观察级还原；交互调试必须在 `restore()` 之后的活应用里进行。执行级确定性复现（浏览器引擎级录制）
   不在 rrweb 能力内，也不在本故事范围。

## 交付阶段

| 阶段 | 状态 | 交付                                                               | 必过 AC          | 门禁                                                                                                      |
| ---- | ---- | ------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------- |
| A    | ⬜   | e2e 失败现场录制 + 本地回放页（直用 rrweb Replayer，不建框架组件） | AC#1～7          | 体积预算与保留策略冻结；不破坏 BASE_URL 8200 端口的 e2e DB 隔离                                           |
| B    | ⬜   | 事件流与 working-tree commit 的关联标记 + 失败时刻数据状态还原     | AC#1～7、8～10   | US-307 `Done`（`restore()` 已交付）；技术笔记「阶段 B 的前提」三条在 plan 阶段定案                        |
| C    | ⬜   | `rxdb-plugin-replay` 通用插件 + 三框架 Replayer 组件 + demo 集成   | AC#1～10、11～14 | 价值待证：须写出「今天用户踩得到的具体症状」才允许排期（CONVENTIONS 病灶数 ≥ 抽象数）；三框架 parity 铁律 |

AC#1～6 是公共契约，从阶段 A 起执行，后续每个阶段都必须继续通过。一个 PR 只交付一个阶段。
阶段 B 的 commit 关联不得伪造数据侧标记：标记必须来自真实 commit 生命周期，不能靠时间戳事后反查。

## 范围边界

### In Scope

- 阶段 A：rrweb recorder 注入 e2e fixture；事件流每事件一文档批量写入本地库；失败 session 保留、通过 session 按冻结策略清理；回放页重放指定 session。
- 阶段 B：每次 working-tree commit 向事件流写入携带该 commit `commitId` 的标记事件；回放页从时间轴选点 → `restore()` 恢复数据 → 活应用承载交互调试。
- 阶段 C：`rxdb-plugin-replay` 的录制 / 停止 / 导出 API 与生命周期；脱敏选项透传（`maskAllInputs` / `blockSelector` 等）；三框架 Replayer 组件（parity）；`dev-rxdb-angular` 的 opt-in 录制演示。

### Out of Scope

- 事件流云端上报与多端同步（`pushRepository` / HTTP / Supabase 通道）——价值待证，未来另立。
- FTS / 向量检索与 AI 会话分析——vision 阶段 6 范围，本故事只保证事件流是结构化、可被未来检索的数据。
- canvas / WebGL / iframe 保真增强与 shadow DOM 边缘场景；执行级 record-replay。
- 移动端 / 小程序宿主录制。
- 压缩、采样与保留策略的完整治理——阶段 A 只承诺体积上限与超限显式报告。

## 验收标准

|   # | 阶段 | 前置条件                                       | 操作                                                               | 预期结果                                                                                                        | 状态 |
| --: | :--: | ---------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | :--: |
|   1 | 公共 | e2e fixture 已注入 recorder，本地录制库可用    | 运行任一交互型 spec（如 todo / code-editor）                       | 事件流按每事件一文档写入本地库，sessionId + timestamp 复合索引生效；写入走批量 mutation 事务，不逐条 save       |  ⬜  |
|   2 | 公共 | 录制期间持续高频交互（拖拽、连续输入）         | 停止录制后按 sessionId + 时间范围查询事件流                        | 事件按时间戳有序、无丢失；查询命中预期范围                                                                      |  ⬜  |
|   3 | 公共 | 某 session 事件流已入库                        | 打开回放页选择该 session                                           | rrweb Replayer 完整重放 DOM 快照与交互，关键操作可辨识                                                          |  ⬜  |
|   4 | 公共 | spec 失败 / 通过两种结局                       | 查看录制产物与保留策略执行结果                                     | 失败 session 事件流保留并可定位；通过 session 按冻结策略清理，不残留占用                                        |  ⬜  |
|   5 | 公共 | 录制运行于 e2e 环境（BASE_URL 指向 8200 端口） | 断言被测应用库与录制库                                             | 录制数据不进入被测应用业务库；既有 e2e DB 隔离语义不破坏                                                        |  ⬜  |
|   6 | 公共 | plan 冻结的体积预算                            | 注入超预算事件量                                                   | 达到上限后按冻结策略截断 / 采样并显式报告，不静默丢弃、不无限增长                                               |  ⬜  |
|   7 |  A   | 录制回放链路就绪                               | 对至少三类既有 spec（todo / working-tree / code-editor）跑录制回放 | 各类型均可回放；回放页自身有测试守卫                                                                            |  ⬜  |
|   8 |  B   | 录制期间 working-tree 产生多次 commit          | 检查事件流                                                         | 每次 commit 在事件流中留下携带该 commit `commitId` 的标记事件，顺序与 commit 一致；标记来自真实 commit 生命周期 |  ⬜  |
|   9 |  B   | 回放时间轴显示 commit 标记                     | 在回放页选择某一 commit                                            | 经 `restore({ commitId }, credentials)` 写回工作树并返回 `ok: true`；数据与该 commit 内容一致                   |  ⬜  |
|  10 |  B   | 数据已恢复到失败时刻状态（口径见技术笔记）     | 在活应用上交互                                                     | 失败场景的数据前置条件成立（复现 bug 属调试动作，不作为 AC 判据）                                               |  ⬜  |
|  11 |  C   | 插件挂载（`rxdb.use(...)` 后 connect）         | 调用录制 / 停止 / 导出 API                                         | 生命周期正确（scoped lifecycle、inject 依赖声明）；写入与公共契约同路径                                         |  ⬜  |
|  12 |  C   | 配置脱敏选项                                   | 录制含敏感输入的表单                                               | 敏感值不进入事件流（`maskAllInputs` / `blockSelector` 生效）                                                    |  ⬜  |
|  13 |  C   | 三框架宿主各自集成 Replayer 组件               | 各框架运行组件测试与 parity e2e                                    | Angular / React / Vue 同 API 同功能，无单端缺失                                                                 |  ⬜  |
|  14 |  C   | `dev-rxdb-angular` 集成完成                    | 手动录制一段会话                                                   | demo 内录制 → 入库 → 回放页闭环；录制默认关闭（opt-in）                                                         |  ⬜  |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **数据模型**：每事件一文档，字段（plan 冻结）：sessionId / revision（事件序号）/ type / timestamp / payload；
  复合索引 sessionId + timestamp。禁止 session 内嵌 events 大数组（LWW 整文档冲突粒度）。
- **commit 关联挂点**：rrweb 自定义事件（`EventType.Custom`）携带 `commitId`（AC#9 的 `restore()` 按它寻址），写入时机挂 commit 生命周期。
  候选挂点：working-tree 侧既有实体事件总线订阅（仿 [`rxdb-plugin-search` 的 `ENTITY_LOCAL_*_EVENT` 增量索引模式](../../../packages/rxdb-plugin-search/src/plugin.ts)），
  plan 冻结。禁止按时间戳反查 commit 充当关联。
- **回放与还原分工**：rrweb 回放 = 观察级；`restore()` = 状态级。本故事的调试闭环是
  「看回放定位 → 恢复数据 → 活应用交互调试」，不是「在回放里复现 bug」。非确定性问题（竞态 / 随机 / 时序）
  不承诺复现。
- **阶段 B 的前提**（plan 阶段定案）：
  - **库在哪**：e2e 跑在 Playwright 默认的临时浏览器上下文里（仓内没有 `launchPersistentContext`），上下文关闭时
    OPFS 里的库连同提交历史一起丢弃；`restore()` 只能在持有同一份提交历史的库上调用。失败现场的库怎么带出来
    （导出 / 持久上下文）要先定，否则回放页没有可 restore 的对象。
  - **未提交的那部分**：commit 标记只覆盖已提交状态，失败时刻工作树里的未提交条目不在任何 commit 里；
    `restore()` 还要求工作树干净，否则返回 `dirty_working_tree`。「失败时刻」取「失败前最后一个 commit」，
    还是由 fixture 在失败时补一次快照提交，二选一。
  - **调用约束**：目标必须在当前分支 HEAD 的可达父链上（FR-033），其他分支上的 commit 要先 `switchBranch`；
    三个 CAS 凭据（`WorkingTreeCredentials`）取自一次新鲜的 `status()`；被拒走返回值（`conflict` /
    `dirty_working_tree` / `incompatible_schema` / `unreachable_target`），回放页要逐个给出可操作提示。
- **体积**：阶段 A 预算按 e2e session 时长（分钟级）冻结；事件批量 mutation 写入；无压缩 / 采样算法承诺，
  超限显式报告。会话数保留上限与清理时机进保留策略。
- **依赖**：`@rrweb/record` / `@rrweb/replay`（MIT）；版本以 lockfile 为准，不 fork 上游。新依赖过审计门禁，
  不得新增 high 漏洞。
- **阶段 C 的三框架封装**：沿用 `code-editor` + `code-editor-angular/react/vue` 的既有分包先例。
- 新增公开 API 同步 TSDoc、API baseline、类型兼容测试与覆盖率（核心 90% / 其他 80%）。

## 实现文件

| 阶段 | 路径                                                       | 职责                                      |
| ---- | ---------------------------------------------------------- | ----------------------------------------- |
| A    | `apps/dev-rxdb-angular-e2e/`                               | fixture 注入 recorder、失败落盘与保留策略 |
| A    | `apps/`（回放页 project，技术栈 plan 冻结）                | session 选择与 rrweb Replayer 回放页      |
| B    | `packages/rxdb-plugin-working-tree/`（或录制侧等价挂点）   | commit 标记写入事件流                     |
| B    | `apps/dev-rxdb-angular/`（或回放页）                       | 时间轴选点 → `restore()` → 活应用         |
| C    | `packages/rxdb-plugin-replay/`                             | 录制 / 存储 / 关联 / 脱敏插件包           |
| C    | `packages/rxdb-plugin-replay-angular/`、`-react/`、`-vue/` | 三框架 Replayer 组件（parity）            |
| C    | `apps/dev-rxdb-angular/`                                   | opt-in 录制与回放演示                     |
| 横切 | `requirements/api-baseline/`                               | 新增公开 API 基线                         |

## References

- [US-305 提交图与 HEAD 持久化](../collaboration/US-305-commit-graph-head.md)
- [US-306 工作树与提交操作](../collaboration/US-306-working-tree-commits.md)
- [US-307 会话恢复](../collaboration/US-307-restore-session.md) — 阶段 B 前置
- [playwright.config.ts](../../../apps/dev-rxdb-angular-e2e/playwright.config.ts)
- [rrweb](https://github.com/rrweb-io/rrweb)
- [vision.md 阶段 2 生产可靠性 / 阶段 6 搜索与本地 AI](../../vision.md)
