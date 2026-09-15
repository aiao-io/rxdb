# Contract: 三框架对称

**Feature**: [../spec.md](../spec.md) | **Core API**: [./core-api.md](./core-api.md)

宪法第三条：**三框架功能等价强制，单端缺失 = 未完成**。本文件冻结对称的判据。

## 0. 适用范围（按故事，不是全特性）

| 交付单元          | 是否要求三端入口 | 说明                                                       |
| ----------------- | ---------------- | ---------------------------------------------------------- |
| US-305            | ❌               | 无 UI 的核心底座：只要求核心公开类型、TSDoc、类型契约测试  |
| US-306 阶段 A / B | ❌               | 同上                                                       |
| **US-306 阶段 C** | ✅               | 三端入口在此收口                                           |
| **US-307**        | ✅               | 核心持久层可与阶段 C 并行，**三端入口必须排在阶段 C 之后** |
| **US-308**        | ✅               | 同上                                                       |

## 1. 对称的判据

**同名 + 同语义 + 同错误码**；运行时形状按各框架既有约定。对称不等于形状全等——强行让 Angular 返回 React 的 hook 形状，或让 Vue 返回裸 `Observable`，都是把「一致」做成了「别扭」。

| 概念       | Angular 22                                | React 19                              | Vue 3.5                               |
| ---------- | ----------------------------------------- | ------------------------------------- | ------------------------------------- |
| 工作树入口 | 可注入服务 `WorkingTreeService`           | `useWorkingTree()`                    | `useWorkingTree()`                    |
| 响应式状态 | `Signal<WorkingTreeStatus>` / `status$`   | 返回对象上的 state 字段（随渲染更新） | `Ref<WorkingTreeStatus>` / `computed` |
| 命令       | 方法返回 `Promise`                        | 返回对象上的方法，`Promise`           | 返回对象上的方法，`Promise`           |
| 错误       | 抛同一组错误码；`CommitConflict` 走返回值 | 同左                                  | 同左                                  |

三端**共享同一份**核心类型（`WorkingTreeStatus` / `CommitResult` / `CommitConflict` / `WorkingTreeDiff`…），从 `@aiao/rxdb` 再导出，**不各自重定义**。重定义会让三份类型独立漂移，而漂移只在用户那里暴露。

## 2. 命名规则：框架包只适用负向规则

| 规则                                                    | 框架包                                |
| ------------------------------------------------------- | ------------------------------------- |
| 新增导出必须是 `Commit*` / `WorkingTree*` 前缀          | ❌ 不适用（正向规则只管核心共享契约） |
| **无 `Workspace*` 新增导出**                            | ✅ 适用                               |
| **无 `Index*` 新增导出**                                | ✅ 适用                               |
| **不复用 `SwitchBranchOptions`**                        | ✅ 适用                               |
| 不复活 `stagedChange` / `unstageChange` / `stagedCount` | ✅ 适用                               |

因此 **`useWorkingTree()` 合规**：它是小写 `use*` 开头的运行时入口，沿用仓库既有约定，不受正向前缀规则约束（SC-014 原文已写明）。

## 3. 必须三端齐全的能力清单（阶段 C 收口）

`isEnabled()` / `enable()`、`status()` 及其响应式形式、`diff()`、`commit()`、`discard()`、`listCommits()`、`restore()`、`restoreSession()`、`switchBranch` 的 `WorkingTreeSwitchBranchOptions`。

**任一端缺一项 = 阶段 C 未完成**，不接受「先上两端，第三端下个迭代补」。

## 4. UX 一致性义务

| 状态    | 要求                                                                          |
| ------- | ----------------------------------------------------------------------------- |
| loading | 三端都要有可观测的进行中状态；`commit()` / `restore()` 期间不得静默           |
| empty   | 有 empty 语义的命令（`status` 无未提交变更、`listCommits` 无历史）三端一致    |
| error   | 同一错误码在三端呈现同一语义；`CommitConflict` 是**可重试的返回值**，不是崩溃 |
| a11y    | WCAG 2.1 AA；键盘可达、焦点可见、状态变化对读屏可感知                         |

**不给无 empty 语义的命令伪造 empty**：`commit()` 没有「空成功」，未提交变更为零时它是一次明确的 no-op 结果，不是空列表。

## 5. 验收

- 三端各自的 `*.spec.ts` 覆盖第 3 节清单的每一项。
- 覆盖率按 `scripts/audit/coverage-check.mjs`：`rxdb-angular` / `rxdb-react` / `rxdb-vue` 四指标 ≥ 90%。
- a11y 走 Playwright。
- 公开面差异由 `scripts/audit/api-surface.mjs` 与 `requirements/api-baseline/rxdb-{angular,react,vue}.json` 比对。
