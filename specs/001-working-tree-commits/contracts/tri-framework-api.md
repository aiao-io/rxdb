# Contract: 三框架对称 API

**Feature**: [spec.md](../spec.md) | **Core API**: [core-api.md](./core-api.md) | **Date**: 2026-08-15

冻结 `@aiao/rxdb-angular`、`@aiao/rxdb-react`、`@aiao/rxdb-vue` 三端必须**同名、同签名、同返回键**的工作树交互面（US4 / US-306c）。三端只做透传与呈现，**不得自带业务分支逻辑**。

---

## 1. 共享类型透传

三端 MUST 从 `@aiao/rxdb` 透传同一组类型，不得各自重定义：

`WorkingTreeStatus`、`WorkingTreeDiff`、`WorkingTreeSelection`、`WorkingTreeStageResult`、`WorkingTreeCommandError`、`CommitOptions`、`CommitConflict`

定义见 [core-api.md](./core-api.md)；`CommitConflict` 见 [§8.5](./core-api.md#85-冲突描述类型)——它是从操作、对象与 expected/actual revision 派生的纯结构，三端**原样透传**，不得在框架层重算或补字段。

---

## 2. `useWorkingTree()` 返回键（v1 基线键集）

| 键                                  | 语义                                                                  | 容器差异                                                                  |
| ----------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `status`                            | 当前持久状态；含 `clean`/`modified`/`staged`/`restoring`/`conflicted` | Angular `Signal` / React 快照 / Vue `Ref`                                 |
| `diff`                              | HEAD↔工作树 与 HEAD↔缓存区 的当前差异                                 | 同上                                                                      |
| `refresh`                           | 主动读取最新 revision                                                 | 函数，三端同签名                                                          |
| `stage` / `unstage`                 | 返回**实际依赖闭包**                                                  | 函数                                                                      |
| `clearIndex` / `discardWorkingTree` | 明确范围的清理命令                                                    | 函数                                                                      |
| `commit`                            | `message` + `CommitOptions` 提交                                      | 函数                                                                      |
| `commandState`                      | 当前命令的 `idle`/`loading`/`success`/`error` 与类型化错误            | 复用既有 [`useAction`](../../../packages/rxdb-vue/src/use-action.ts) 形态 |

**容器差异（Signal / state / Ref）是唯一允许的差异**。导出名、参数、返回键、错误 code、empty/loading/success/error 判定与恢复建议必须逐项对称。**不得让某一端额外拥有业务能力。**

---

## 3. 扩展点协议（本故事冻结「怎么加」，不冻结键的全集）

上表是 **v1 基线键集**，不是最终全集。后续故事按同一协议向 `useWorkingTree()` **追加**键，不得另立入口：

| 追加者                | 新增键                    | 约束                                                                                                   |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| US5（恢复会话）       | `restore`、`restoreState` | 复用同一 `commandState` 形状与错误 code 结构；`status` 的 `restoring` 值在本故事已存在，**不得改语义** |
| US6（分支隔离与冲突） | 分支切换与冲突提示入口    | 同上；**不得**在某一端把切换做成组件内部逻辑                                                           |

追加 MUST 满足：三端同名同签名同返回键、共享类型仍从 `@aiao/rxdb` 透传、`tri-framework-check` 与 a11y 门禁对新键同样生效（**缺一端整故事失败**）。追加者 MUST NOT 重定义已冻结键的语义；确需变更时改本契约并同步三端。

---

## 4. 对称门禁

`scripts/audit/tri-framework-check.mjs`（[R-014](../research.md#r-014-三框架对称门禁的实现)）：

- 比对三个 `packages/rxdb-{angular,react,vue}/src/index.ts` 的导出名集合。
- 比对从 `@aiao/rxdb` 透传的共享类型集合。
- 三端不完全一致 → 失败。判据：**跨端缺失导出数量 = 0**（SC-010）。

行为层对称由三端等价组件测试 + Playwright 跨框架 E2E 验证，共享同一份 `@aiao/rxdb-test/cross-framework-fixtures` 种子，沿用既有 [`search-parity`](../../../packages/rxdb-test/src/cross-framework-fixtures/search-parity.ts) 的落地形态。

---

## 5. 可访问性契约（WCAG 2.1 AA）

| 项             | 要求                                                               |
| -------------- | ------------------------------------------------------------------ |
| 键盘可达       | 浏览 diff、选择单元、stage、clearIndex、commit 全流程仅键盘可完成  |
| 焦点           | 焦点顺序符合视觉顺序；焦点可见                                     |
| 名称与角色     | 每个可操作元素有可被辅助技术读出的名称                             |
| 状态公告       | `loading` / `success` / `error` / `empty` 状态变化被公告           |
| empty 真实性   | 查询无 diff 时公告 `empty` 与 `clean`；命令**不得伪造** `empty`    |
| 长文本与窄视口 | 最长实体名与错误文本在窄视口下不溢出、不遮挡、不改变固定工具栏尺寸 |

---

## 6. 错误呈现契约

三端呈现的错误 MUST 包含三要素（FR-039）：

1. **操作** —— 哪个命令失败（stage / commit / restore / switchBranch …）
2. **对象** —— 涉及的实体或提交
3. **恢复建议** —— 可执行的下一步

错误 code 全集与恢复建议方向见 [core-api.md §9](./core-api.md#9-错误契约)。三端的 code 必须逐字相同。

---

## 7. 演示应用

`apps/dev-rxdb-{angular,react,vue}/` 各提供对称演示页，覆盖 `status → stage → refresh → commit` 主流程，以及失败、empty、键盘与屏幕阅读器名称。E2E 记录首次可见状态耗时，但**浏览器 OPFS/IDB 不承诺相同绝对数字**（仅 Node + PGlite 的 benchmark 作门禁，见 [benchmark-report.md](./benchmark-report.md)）。
