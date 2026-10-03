# Implementation Plan: US-909 阶段 C — 应用内会话录制回放与 commit 关联

**Branch**: `us909-stage-c`（特性目录 `005-us-909-session-replay`，PR 叠在 `us909-stage-b` 上） | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md)（故事 [US-909](../../requirements/stories/future/US-909-session-replay-debugging.md) 阶段 C，AC#10～17，
AC#1～3 继续必过）。owner 2026-10-02 冻结三项：事件流放独立录制库（工厂注入）；上限 16 MiB / 128 MiB；commit 挂点是工作树门面的
提交后 Observable。

## Summary

新增 `@aiao/rxdb-plugin-replay`：scoped 插件挂 `rxdb.replay`，开始录制时才按需加载 rrweb，事件按批写进工厂造出的独立录制库
（每事件一行，`(sessionId, timestamp)` 复合索引），体积上限在每批的写事务里判定，超限截断并写终止标记；订阅工作树门面新增的
`commits$`，把每次提交写成 `EventType.Custom` 标记；`restoreToCommit()` 取新鲜凭据调 `workingTree.restore()`，四种拒绝映射成提示。
回放视图是 core 里一份与框架无关的 DOM 实现（`mountReplayer()`，按需加载 rrweb `Replayer`），`-angular` / `-react` / `-vue`
三个包只是薄封装，同名输入 / 输出 / 命令，DOM 由同一份实现产出。`dev-rxdb-angular` 加默认关闭的录制开关与 `/replay` 回放页。

1. **门面通知**（跨包）：`WorkingTreeManager.commits$`，只在 `commit()` 事务提交后、且本次确实写了新 commit 时发（D7）。
2. **core 插件**：录制器（rrweb 适配 + 缓冲 + 刷新暂存）、存储（实体 + 批写 + 上限 + 删除）、关联（commit 标记 + 恢复）（D2–D6、D8）。
3. **回放视图**：`mountReplayer()` 的加载 / 空 / 错误 / 就绪四态、时间轴、commit 标记列表、恢复结果播报（D9）。
4. **三框架封装**：`ao-replayer` / `<Replayer>` / `<Replayer>`（D10）。
5. **demo**：opt-in 开关、录制库工厂（主线程 IDB、`<dbName>-replay`）、`/replay` 页、e2e（D11）。

## Technical Context

**Language/Version**: TypeScript 6.0 strict + ESM；Angular 22（standalone、OnPush、signals）、React 19、Vue 3.5

**Primary Dependencies**: `rrweb@2.1.6`、`@rrweb/types@2.1.6`（新增，精确版本，MIT；D1）；`@aiao/rxdb`（插件契约、实体装饰器、
`TransactionExecutor`、`sqlStringLiteral`）；`@aiao/rxdb-plugin-working-tree`（可选 peer，只 `import type`）；`rxjs ^7.8.2`

**Storage**: 录制库 = 工厂返回的另一个 `RxDB`；demo 用 sqlite-wasm 主线程 `vfs: 'idb'`，库名 `<应用库名>-replay`；node 单测用 PGlite
memory。刷新暂存用 `sessionStorage`（标签页级）

**Testing**: Vitest。core：node 单测（PGlite memory 跑存储 / 上限 / 删除 / 续录 / 门面关联，录制器用假 `record`）+ chromium
`*.browser.spec.ts`（真 rrweb 的录制、脱敏、回放跳转）；working-tree：`commits$` 单测；三框架：happy-dom 组件测试（`mountReplayer`
打桩）+ 同一份 parity 契约；demo：`replay.spec.ts`（Playwright，8200 强制 IDB）

**Target Platform**: 浏览器（Chromium e2e）；录制与回放需要 DOM，node 里 `start()` 报 `no_dom`

**Project Type**: 新增 4 个可发布库 + 1 处跨包公开 API + demo 集成

**Performance Goals**: 单批写入（≤ 200 条）中位数 < 100 ms（宪法 DB 操作预算，SC-007，D12 量法）；新包自身产物 < 50 KB gz（rrweb
不计，SC-008）；录制关闭时 demo 初始包不含 rrweb 与插件代码（FR-022）

**Constraints**: 无 fallback——上限非法直接抛、写入失败以错误结束不重试、暂存失败写缺口标记不假装连续；绝不自动删除；不按时间戳
反查 commit；录制库不挂工作树插件（天然零条目）

**Scale/Scope**: 默认上限下单会话 ≈ 8 万条事件（均值 ~200 B）；会话数几十级；`listSessions()` 全表读即可

## Constitution Check

_GATE: Phase 0 前必须通过，Phase 1 设计后复查。_ 依据宪法 v2.0.2。

| 原则        | 检查项                                                                                                                                       | 结论 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| I. 代码质量 | 新包 `lint` + `typecheck` 零警告；嵌套 ≤ 3；不用 `any`；可选 peer 只 `import type`，运行时以 `getPlugins('workingTree')` 判断，不做类型断言  |  ✅  |
| I. 代码质量 | 无 fallback：上限配置非法即抛（FR-014）；写入失败进 `error` 态并从 `stop()` 抛出，不重试；暂存失败写 `gap` 标记（D5）                        |  ✅  |
| I. 代码质量 | 每个公开导出与门面新成员带 TSDoc；`audit:api-surface:update` 进基线（FR-024）                                                                |  ✅  |
| I. 代码质量 | 新抽象：core 的 `mountReplayer()` 视图（D9），理由见 Complexity Tracking                                                                     |  ✅  |
| II. 测试    | TDD：`commits$`、存储、上限、续录、标记、恢复映射、视图四态、三框架封装都先写红测试                                                          |  ✅  |
| II. 测试    | 确定性：录制器经注入的 `record` 函数打桩，批触发用手动 `flush()`；回放跳转的 T 取自 commit 标记时间（D11），不靠墙钟                         |  ✅  |
| II. 测试    | 覆盖率：4 个新包按「其他包」档 ≥ 80%（`coverage-check.mjs`），进 `coverage-baseline.json`                                                    |  ✅  |
| III. 三框架 | 三个封装同名输入 `replay` / `sessionId` / `initialTime`、同语义输出（时刻变化、恢复结果）、同名命令 `play` / `pause` / `seek`（contracts）   |  ✅  |
| III. 三框架 | 视觉一致：三端挂同一份 `mountReplayer()` DOM，parity 由构造保证；parity 契约测试在三个包里跑同一份断言（D10）                                |  ✅  |
| III. 三框架 | 跨框架 e2e：只有 Angular demo 集成录制（owner 决策 4），React / Vue 不加 demo 页；以「同一份 DOM 实现 + 三端 parity 契约测试」代替，见偏离 1 |  ⚠️  |
| III. 三框架 | 四态：加载（`aria-busy`）/ 空（「No events to replay」）/ 错误（`role="alert"`）/ 就绪；控件是原生 `button` / `input[type=range]`，都有名字  |  ✅  |
| IV. 性能    | 批写入中位数 < 100 ms、包 < 50 KB gz、rrweb 按需加载；量法见 D12，结果记进 tasks 验证项                                                      |  ✅  |
| 工程护栏    | 技术栈不变；新依赖钉精确版本、过 `pnpm audit` 门禁（FR-023）；一个 PR 只交付阶段 C                                                           |  ✅  |

**设计后复查**：Phase 1 只引入 Complexity Tracking 里的两项，⚠️ 一项在偏离里写明理由与替代验证，结论不变。

## Project Structure

### Documentation (this feature)

```text
specs/005-us-909-session-replay/
├── spec.md
├── plan.md            # 本文件
├── research.md        # Phase 0：D1–D12
├── data-model.md      # Phase 1：实体、标记事件、状态机、暂存、恢复结果
├── contracts/
│   ├── replay-plugin.md          # rxdb.replay 公开 API 与插件选项
│   ├── working-tree-commits.md   # WorkingTreeManager.commits$
│   └── replayer-component.md     # mountReplayer + 三框架封装（parity 表）
├── quickstart.md      # AC#10～17 验证步骤
├── checklists/requirements.md
└── tasks.md           # Phase 2（/speckit-tasks）
```

### Source Code (repository root)

```text
packages/rxdb-plugin-working-tree/src/
├── working-tree/working-tree-facade.ts       # 改：readonly commits$（实例字段）、commit() 提交后发通知
├── working-tree/commit-command.ts            # 改：内部 runCommitWorkingTree() 带出「是否新写」，commitWorkingTree() 行为不变
├── working-tree/working-tree-commit-event.ts # 新：WorkingTreeCommitEvent 类型
├── working-tree/testing/use-working-tree-fixtures.ts  # 改：stub 补 commits$
└── __tests__/working-tree/facade-commits.spec.ts      # 新

packages/rxdb-plugin-replay/                  # 新包（模板：rxdb-plugin-search）
└── src/
    ├── index.ts
    ├── plugin.ts                  # RxDBPluginReplay（scoped，inject adapter:local）+ rxDBPluginReplay + 模块增强
    ├── options.ts                 # RxDBReplayOptions、默认值、assertReplayOptions()
    ├── errors.ts                  # RxDBReplayError（code）
    ├── entities.ts                # ReplaySessionRecord / ReplayEventRecord（namespace replay）
    ├── store.ts                   # ReplayStore：appendBatch（含上限）/ list / read / export / delete / usage
    ├── recorder.ts                # 录制器：rrweb 适配、缓冲、批触发、seq、pagehide 暂存、续录
    ├── markers.ts                 # 标记事件的 tag 与 payload、解析
    ├── restore.ts                 # restoreToCommit + 拒绝提示
    ├── manager.ts                 # ReplayManager（rxdb.replay 的实现）
    ├── replayer/mount-replayer.ts # 视图：四态、控件、时间轴、标记、播报
    ├── testing/                   # parity 契约与夹具（./testing 子路径）
    └── __tests__/                 # *.spec.ts（node）与 *.browser.spec.ts（chromium）

packages/rxdb-plugin-replay-angular/          # 新包（模板：rxdb-plugin-search-angular + code-editor-angular）
└── src/replayer.component.ts                 # <ao-replayer>
packages/rxdb-plugin-replay-react/            # 新包
└── src/replayer.tsx                          # <Replayer>
packages/rxdb-plugin-replay-vue/              # 新包
└── src/replayer.vue / replayer.types.ts      # <Replayer>

apps/dev-rxdb-angular/src/app/
├── rxdb/replay-recording.ts       # 新：开关键、录制库工厂、installReplay()（按需加载）
├── rxdb/setup_rxdb_sqlite-wasm.ts # 改：开关打开时 import() 并 use()
├── pages/replay/replay.page.ts/.html  # 新：开关、会话列表、<ao-replayer>
├── components/app-menu.ts / app.routes.ts  # 改
apps/dev-rxdb-angular-e2e/src/replay.spec.ts  # 新：AC#10～14、16、17 的 demo 闭环

注册点（新包逐一登记，research D13）：tsconfig.base.json、tsconfig.json references、.github/codecov.yml、
scripts/audit/coverage-baseline.json、scripts/ci/plan-test-lanes.mjs、scripts/commitizen.mjs、website/（typedoc、sidebars、
flatten-api-docs、插件指南、compatibility）、README.md、requirements/api-baseline/*.json
```

**Structure Decision**: 包结构沿用 `rxdb-plugin-search` + `-angular/-react/-vue` 的分包先例；组件写法沿用 `code-editor-*`
（core 持有 DOM，框架层挂到宿主元素）。录制库工厂由应用提供，插件不依赖任何适配器包。

## 偏离与澄清

1. **跨框架 parity 用契约测试而非三端 e2e**：owner 决策 4 只要求 Angular demo 集成录制。三个封装挂的是同一个 `mountReplayer()`，
   DOM 不可能分岔；剩下可能分岔的是封装层（输入转发、输出、命令），由三端各跑一遍的同一份 parity 契约覆盖（contracts/replayer-component.md §4）。
   给 React / Vue demo 各加录制只为一条 e2e，成本是两套 demo 改造加两份 e2e，换来的只是再证一遍同一份 DOM。
2. **commit 通知只覆盖 `commit()`**：基线 commit（`enable` 迁移、建分支）不是用户提交，不发；同一 `operationId` 的幂等重放
   （`reused`）没有写新 commit，也不发（D7）。
3. **多标签页**：两个标签页对同一个录制库并发写，上限在各自的写事务里按全表合计判定（D4）；正确性由 core 的双写入者单测证明，
   demo e2e 只验单标签页。
4. **故事技术笔记的依赖写法**：笔记列了 `@rrweb/record` / `@rrweb/replay`，两者都只是对 `rrweb ^2.1.6` 的再导出，钉不住版本；
   改为直接依赖 `rrweb@2.1.6` + `@rrweb/types@2.1.6`（D1），故事技术笔记同步。

## Complexity Tracking

| 新增                                       | 为什么需要                                                                                     | 更简单的方案为什么不行                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core 的 `mountReplayer()` 视图             | 三框架必须视觉一致；一份 DOM 实现让 parity 由构造保证，rrweb `Replayer` 本来也直接操作宿主 DOM | 三个框架各写一份模板：三份时间轴 / 标记 / 四态迟早漂移，且只能靠三端 e2e 才抓得到                                                                          |
| 内部 `runCommitWorkingTree()` 带出新写标志 | `reused` 也返回 `ok: true`，门面单看 `CommitResult` 分不出「本次写了新 commit」                | 用 `headRevision === expectedHeadRevision + 1` 推断：依赖 `finishCommit` 两个分支的实现细节而非契约；给公开 `CommitResult` 加字段会动 API 基线且对外无意义 |
