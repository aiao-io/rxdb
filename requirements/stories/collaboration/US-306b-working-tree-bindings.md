---
id: US-306b
title: 工作树的三框架绑定与演示
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-15
updated: 2026-08-15
tags: [collaboration, working-tree, staging, angular, react, vue, a11y]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-306a 冻结的导出契约，但绑定层、demo 与跨框架 E2E 自成一条交付线；US-306a Done 后本故事不再需要动核心包
- [x] Negotiable: hook / composable / signal 的命名后缀与 demo 的交互形态可在 plan 阶段调整
- [x] Valuable: 三个框架的使用者第一次能在自己的技术栈里用工作树，而不必自己封装核心 API
- [x] Estimable: 被绑定的操作集合已由 US-306a 冻结，三端绑定在本仓库有 11 组既有先例（见 status-overview 跨框架 API 对称矩阵）
- [x] Small: 只做绑定层与 demo，不含任何状态机、存储或 diff 逻辑；不含 restore（US-307）与冲突提示（US-308）
- [x] Testable: 「三端 demo 里跑 status → stage → commit → refresh」可独立验收，失败点全部落在绑定层
- [x] 横切 FR 适用性：FR-023 / FR-024 / FR-025 / FR-028 **全部适用**——本故事是 epic-006 里唯一同时交付框架绑定与 UI 的工作树故事
-->

# 用户故事：工作树的三框架绑定与演示

> Epic 级的术语表、横切 FR（FR-023 / FR-024 / FR-025 / FR-028）与性能口径见 [epic-006](../../epics/epic-006-working-tree-commits.md)。
> 被绑定的状态机与操作契约见 [US-306a](./US-306a-working-tree-index.md)。

## 拆分背景

本故事从原 US-306 拆出。原故事把状态机、7 个操作、三端绑定、三端 demo 与跨框架 E2E 装在一起，
是整条依赖链上最长的关键路径节点。原先不拆的理由是「三端绑定与状态机共享同一套导出名和状态枚举，
先拆会制造一次纯粹为拆而拆的契约冻结」——但同一份 INVEST 清单的 `Negotiable` 项本来就写着
「导出名、事件名和 diff 结构可在 plan 阶段冻结」，即那次冻结无论如何都要发生，拆分并不额外制造它。

因此 2026-08-15 三轮复审把冻结**显式变成 US-306a 的交付物**，本故事以该冻结契约为输入。

## 作为/我想要/以便

**作为** 在 Angular / React / Vue 里使用 RxDB 的开发者
**我想要** 用与我的框架惯用法一致的响应式入口读工作树状态、执行 stage / commit / discard
**以便** 我不必自己把核心 API 封装一遍，也不会因为换框架而拿到不同的状态语义

## 范围边界

### In Scope

- Angular / React / Vue 三端对称的工作树绑定：状态读取（status / diff）与操作入口（stage / unstage / stage all / clearIndex / commit / discardWorkingTree）
- 三端一致的 loading / success / empty / error 状态暴露（FR-023）
- 三端工作树演示应用（`apps/dev-rxdb-{angular,react,vue}/`）
- 演示 UI 的可访问性：键盘可达、焦点可见、状态与错误可被屏幕阅读器读出（FR-025）
- 跨框架 E2E：status → stage → commit → refresh
- 更新 [status-overview 跨框架 API 对称矩阵](../../status-overview.md)

### Out of Scope

- 工作树 / 缓存区状态机、diff 计算、持久化与元数据表 —— 属 [US-306a](./US-306a-working-tree-index.md)
- 导出名、状态枚举与错误类型的**定义** —— 属 [US-306a](./US-306a-working-tree-index.md)；本故事只消费
- bench 场景与阈值 —— 属 [US-306a FR-026](./US-306a-working-tree-index.md)；绑定层不单独立性能门禁
- 恢复会话的三端入口 —— 属 [US-307](./US-307-restore-session.md)
- 冲突提示的三端状态 —— 属 [US-308](./US-308-branch-isolation-conflict.md)

## 用户场景与验收标准

### User Story 1 - 在任一框架里完成一次提交（Priority: P1）

**独立测试**：在三个 demo 中分别修改实体、stage 一部分、commit，刷新后检查状态；只依赖本地存储。

**验收场景**：

1. **Given** 工作树有未暂存修改，**When** 用户在任一框架的 demo 中查看工作树面板，**Then** 三端展示同一组状态（clean / 仅未暂存 / 仅已暂存 / 同时存在 / 恢复中 / 冲突），状态名与 [US-306a FR-004](./US-306a-working-tree-index.md) 冻结的枚举一致。
2. **Given** 用户在任一框架中 stage 一个实体后 commit，**When** 操作完成，**Then** 三端的返回值、状态转换顺序与错误语义一致；任一端缺失该能力，本故事不得标 Done（FR-024）。
3. **Given** 提交进行中，**When** 用户观察 UI，**Then** 三端都暴露 loading 状态；成功后暴露 success，缓存区为空时暴露 empty，失败时暴露带操作、对象与恢复建议的 error（FR-023）。
4. **Given** 用户在任一框架的 demo 中完成 stage 但未 commit，**When** 页面刷新，**Then** 绑定层重建出与刷新前一致的状态——绑定层 MUST NOT 持有自己的内存副本作为真相源。

### User Story 2 - 仅用键盘完成同一流程（Priority: P1）

**独立测试**：在三个 demo 中不使用鼠标，仅用键盘完成 status → stage → commit，并用屏幕阅读器核对播报。

**验收场景**：

1. **Given** 工作树面板已渲染，**When** 用户仅用键盘操作，**Then** 全部交互元素可达、焦点可见、Tab 顺序与视觉顺序一致，达到 WCAG 2.1 AA（FR-025）。
2. **Given** 变更列表中的每个条目都有 stage / unstage 控件，**When** 这些控件只用图标表达，**Then** 每个控件仍 MUST 有可访问名称，不得只有图标（FR-025）。
3. **Given** 提交失败，**When** 屏幕阅读器读到该区域，**Then** 错误文本被播报且包含恢复建议，不是只有一个视觉红框。
4. **Given** `status()` 从 `modified` 变为 `staged`，**When** 状态在无页面跳转的情况下更新，**Then** 变化通过 live region 播报，不依赖用户主动重新聚焦。

### User Story 3 - 绑定层不引入第二套语义（Priority: P2）

**验收场景**：

1. **Given** US-306a 已冻结状态枚举与错误类型，**When** 检查三端绑定的公开导出，**Then** 绑定层 MUST NOT 定义平行的状态字符串、错误类或状态机；只做转发与框架惯用法适配（FR-038）。
2. **Given** 某一端因框架惯用法需要不同的调用形态（如 Angular signal vs React hook 返回值），**When** 对比三端，**Then** 命名、参数、状态转换与错误语义仍一致，差异只允许出现在框架惯用的包装形态上（FR-024）。

## 功能需求

- **FR-023**：见 [epic-006 横切约束](../../epics/epic-006-working-tree-commits.md)；本故事的全部绑定层异步入口适用。
- **FR-024**：见 [epic-006 横切约束](../../epics/epic-006-working-tree-commits.md)。**本故事是该 FR 在工作树链路上的唯一落点**：任一端缺失即本故事未完成。
- **FR-025**：见 [epic-006 横切约束](../../epics/epic-006-working-tree-commits.md)；适用于三端 demo 的工作树 UI。
- **FR-028**：见 [epic-006 横切约束](../../epics/epic-006-working-tree-commits.md)。
- **FR-038**（新增）：三端绑定 MUST 只转发 [US-306a](./US-306a-working-tree-index.md) 冻结的操作与状态，MUST NOT 在绑定层定义第二套状态枚举、错误类型或状态机。绑定层 MUST NOT 把工作树状态缓存成自己的内存真相源——刷新后的状态 MUST 由核心包重建（否则会重新引入 [FR-034](./US-306a-working-tree-index.md) 禁止的 per-tab 影子状态）。允许的差异仅限框架惯用的包装形态（Angular signal / React hook 返回值 / Vue composable ref）。

## 关键实体

本故事**不引入新的持久化实体**。绑定层消费 [US-306a](./US-306a-working-tree-index.md) 的 `WorkingTreeState` 与 `IndexEntry`。

> 命名遵守 [epic-006](../../epics/epic-006-working-tree-commits.md) 的术语表：不得使用 `Workspace*` 前缀。

## 测试要求

- 三端各有等价的单元/组件测试，覆盖率不低于各自包的既有基线（见 [coverage-baseline.json](../../../scripts/audit/coverage-baseline.json)）。
- 跨框架 E2E 验证 status → stage → commit → refresh 流程，三端断言同一组期望。
- 失败、空状态、键盘可达性和屏幕阅读器名称必须有 UI 回归测试。
- FR-038 必须有一条类型层或导出层断言：三端绑定的公开导出中不存在平行的状态枚举与错误类型。
- 刷新后状态重建必须有独立用例，断言绑定层未把状态缓存为内存真相源。
- 测试文件使用 `*.spec.ts`，不依赖固定延时。

## 实现文件（计划阶段待确认）

- `packages/rxdb-{angular,react,vue}/` — 对称的 hooks / composables / signals
- `apps/dev-rxdb-{angular,react,vue}/` — 三端工作树演示
- `apps/dev-rxdb-{angular,react,vue}-e2e/` — 跨框架 E2E
- `requirements/api-baseline/rxdb-{angular,react,vue}.json`
- `requirements/status-overview.md` — 跨框架 API 对称矩阵新增行

> 本故事**不改动** `packages/rxdb/`（列出是为了明确它在变更范围之外，属 [US-306a](./US-306a-working-tree-index.md)）。

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-306a 工作树、缓存区与提交操作（核心状态机）](./US-306a-working-tree-index.md) — 本故事的输入契约
- [US-101 Angular 集成](../framework/US-101-angular-integration.md) / [US-102 React 集成](../framework/US-102-react-integration.md) / [US-103 Vue 集成](../framework/US-103-vue-integration.md) — 既有三端绑定形态的先例
