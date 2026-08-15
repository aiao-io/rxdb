---
id: US-306c
title: 三框架工作树交互面与性能门禁
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-15
updated: 2026-08-15
tags: [collaboration, working-tree, angular, react, vue, accessibility, benchmark]
---

<!--
INVEST 检查清单:
- [x] Independent: 核心状态机完成后，三端 API、demo、E2E 与 benchmark 可独立验收
- [x] Negotiable: 框架内部响应式原语可按 signal/state/ref 实现
- [x] Valuable: 三端用户获得同功能同命名的工作树操作面
- [x] Estimable: 导出映射、状态键、E2E 流程和性能 fixture 已冻结
- [x] Small: 不改核心存储或事务协议
- [x] Testable: tri-framework API 表、组件测试、E2E 和 benchmark 都有硬判据
-->

# 用户故事：三框架工作树交互面与性能门禁

> 本故事依赖 [US-306b](./US-306b-index-commit-state-machine.md)，并承接父故事
> [US-306](./US-306-working-tree-index.md) 的三框架、异步状态、a11y 与 FR-026。

## 作为/我想要/以便

**作为** Angular、React 或 Vue 应用开发者
**我想要** 使用同名、同语义的工作树 API 和状态
**以便** 框架选择不会改变 status、stage、commit 与错误处理能力

## 公开 API 对称契约

三端都 MUST 导出 `useWorkingTree()`，并从 `@aiao/rxdb` 透传同一组共享类型：
`WorkingTreeStatus`、`WorkingTreeDiff`、`WorkingTreeSelection`、`WorkingTreeStageResult`、
`WorkingTreeCommandError`、`CommitOptions`、`CommitConflict`。

`useWorkingTree()` 的返回对象在三端保持同一组语义键：

| 键 | 语义 |
| -- | ---- |
| `status` | 当前持久状态；支持 clean/modified/staged/restoring/conflicted |
| `diff` | HEAD↔working tree 与 HEAD↔index 的当前差异 |
| `refresh` | 主动读取最新 revision |
| `stage` / `unstage` | 返回实际依赖闭包 |
| `clearIndex` / `discardWorkingTree` | 明确范围的清理命令 |
| `commit` | message + CommitOptions 提交 |
| `commandState` | 当前命令的 idle/loading/success/error 与类型化错误 |

Angular 使用 signal、React 使用 state/store、Vue 使用 ref 只是容器差异；导出名、参数、返回键、错误 code、
empty/loading/success/error 判定和恢复建议必须对称。不得让某一端额外拥有业务能力。

## 验收场景

1. **Given** 三端加载同一 fixture，**When** status → stage → refresh → commit，**Then** 三端返回相同状态、依赖闭包、commit 摘要和错误 code。
2. **Given** 查询无 diff，**When** 页面渲染，**Then** empty 与 clean 可被辅助技术读取；命令不伪造 empty。
3. **Given** 命令运行、成功或失败，**When** 状态变化，**Then** 三端均暴露 loading/success/error，错误包含操作、对象和恢复建议。
4. **Given** 仅键盘操作，**When** 浏览 diff、选择单元、stage、clear 或 commit，**Then** 焦点顺序、可见焦点、名称与状态公告达到 WCAG 2.1 AA。
5. **Given** 最长实体名、错误文本和窄视口，**When** 状态更新，**Then** 文本不溢出、遮挡或改变固定工具栏尺寸。
6. **Given** 任一共享类型或运行时入口只在一到两端导出，**When** parity 门禁运行，**Then** 整个故事失败，不能把单端实现记为 Done。

## 性能门禁

- 新增 `pnpm nx run benchmarks:bench-working-tree`，使用 Epic 固定的 Node + PGlite memory fixture。
- status、完整 diff、批量 stage 50 单元执行 5 次 warmup、50 次采样，输出 p50/p95、control ratio、fixture hash 与 runner profile。
- 普通 CI 的归一化 ratio 不得超过冻结 reference median 的 110%；绝对 p95 100 ms 只在 profile 匹配的固定 runner 上作为发布门禁。
- 三端 E2E 记录首次可见状态耗时，但浏览器 OPFS/IDB 不承诺相同绝对数字。

## 测试要求

- 三端 `src/index.ts` 导出与共享类型透传通过 `tri-framework-check`，缺一端即失败。
- 三端各有等价组件测试，统一 fixture 验证返回键、状态转换、错误 code 和恢复建议。
- Playwright 覆盖 status → stage → refresh → commit，以及失败、empty、键盘和屏幕阅读器名称。
- benchmark reference 必须先于候选发布签入；失败后不得重算基线。

## 实现文件（计划阶段待确认）

- `packages/rxdb-{angular,react,vue}/` — `useWorkingTree()` 与共享类型透传
- `apps/dev-rxdb-{angular,react,vue}/` — 对称演示与 E2E
- `benchmarks/working-tree.bench.ts`
- `benchmarks/reports/`
