---
id: US-316
title: 撤销/重做的多仓库作用域：几个实体合起来撤，跨它们的事务整条撤
status: In Progress
priority: Medium
epic: epic-016-local-change-workbench
created: 2026-11-26
updated: 2026-11-26
tags: [collaboration, history, undo-redo, api]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只扩历史作用域的类型与选择逻辑；撤销 / 重做的应用、推送水位线与分叉点判定不变
- [x] Negotiable (可协商): 入参形状（实体类数组 / 仓库标识数组）与作用域类型名留待评审定；「集合外的事务照旧拒绝」已定
- [x] Valuable (有价值): 订单演示的写入跨实体，单仓库作用域撤不了，整库作用域会撤到别的页面
- [x] Estimable (可估算): 类型一个成员 + `history()` 一个重载 + 作用域判定与缓存键 + 插件单测 + API 基线
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 插件单测
-->

# 用户故事：撤销/重做的多仓库作用域

## 作为/我想要/以便

**作为** 在一个页面里同时编辑几张有外键关系的表的开发者
**我想要** 用这几个实体合起来的作用域撤销、重做，例如 `history([DemoCustomer, DemoIdCard, DemoOrder, DemoOrderItem, DemoCategory])`
**以便** 跨这几张表的事务能整条撤销，又不会撤到页面以外的数据

## 现状

1. 作用域只有三种，见 [`HistoryScope`](../../../packages/rxdb/src/sync-contract/VersionManager.interface.ts)：

   ```ts
   export type HistoryScope =
     | { type: 'database' }
     | { type: 'repository'; namespace: string; entity: string }
     | { type: 'entity'; namespace: string; entity: string; entityId: RxDBEntityId };
   ```

   入口 [`VersionManager.history()`](../../../packages/rxdb-plugin-history/src/VersionManager.ts) 只收一个实体类或一个实例：`history<T extends EntityType>(options?: T | InstanceType<T>): HistoryScopeAPI`。

2. 跨作用域的事务被拒：[`selectScopedHistories`](../../../packages/rxdb-plugin-history/src/scope-selection.ts) 把「触及作用域、但同时改了作用域外数据」的事务归进 `crossScope`，调用方抛 [`RxDBCrossScopeTransactionError`](../../../packages/rxdb-plugin-history/src/scope-selection.ts)。模块文档给的出路是「调用方改用 `history()`（database 作用域）就能完整撤销这个事务」——对只想撤本页的调用方，这条出路等于越权。
3. 订单演示正好卡在中间（[US-231](../adapter/US-231-supabase-unified-undo-history.md) 阶段 B）。dev 栈访客的订单页实测，`history().histories$` 里：
   - 新建客户带证件是一个事务项，含 `INSERT DemoIdCard` 与 `INSERT DemoCustomer` 两个实体——单仓库作用域撤它必然越界；
   - 给订单项挂分类是一个事务项，里面**只有** `INSERT DemoCategory_DemoOrderItem` 一条（订单项本身没有字段变化，不记）——作用域里只列订单项与分类，这一步既不显示也撤不到。

   整库作用域又会撤到 Todo 与商品，违反 [US-034](../core/US-034-bucketed-entity-local-writes.md)「撤销只撤商品的修改，不会撤到 Todo 页」那一类约束。

## 范围边界

### In Scope

- `HistoryScope` 加一种：`{ type: 'repositories'; repositories: readonly RepositoryIdentifier[] }`，`HistoryScopeType` 加 `'repositories'`（名字可协商）。
- `history([A, B, …])` 重载：实体类数组；空数组报参数错误，不退化成整库作用域。
- 作用域判定：变更落在集合里任一仓库即在作用域内；展示裁切、可撤销 / 可重做计数、`undo()` / `redo()` 的选择都按集合判断。集合外的事务照旧进 `crossScope` 被拒，报错列出越界的仓库。
- 多对多关联表：集合里同时有关系两端时，关联表在作用域内（与 [US-228](../adapter/US-228-supabase-many-to-many-sync.md)「关联表的同步配置跟随两端」同口径），调用方不用手写关联表的名字。
- 缓存键与顺序无关：同一组实体换个顺序拿到同一个作用域实例。
- TSDoc、插件单测、API 基线。

### Out of Scope

- 按外键闭包自动推导作用域（给一个实体，自动带上它的子表）：调用方显式列出，行为可预期。
- 框架绑定：三个框架绑定包都没有包装 `versionManager.history()`，不新增 hook。
- 修改 `modules/angular` 的 `HistorySidebarComponent` 的作用域徽标：它按 `database` / `repository` / `entity` 三种显示，遇到新类型不显示徽标，不报错。

## 验收标准

| #   | 前置条件                                 | 操作                                              | 预期结果                                                                   | 状态 |
| --- | ---------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- | ---- |
| 1   | 作用域为客户、证件两个实体               | 一个 `saveMany` 新建客户与证件，然后 `undo()`     | 两行一起撤掉，不抛 `RxDBCrossScopeTransactionError`；`redo()` 两行一起回来 | ⬜   |
| 2   | 同上，之后在 Todo 上写了一条             | 读 `undoCount$`，再 `undo()`                      | 计数不含 Todo 那条；撤的是作用域里最近的那个事务，Todo 不动                | ⬜   |
| 3   | 作用域为订单项、分类两个实体             | 给订单项挂分类（事务里只有关联表一条）后 `undo()` | 这一步出现在作用域的历史里并整条撤掉；关联表随两端在作用域内               | ⬜   |
| 4   | 作用域只有客户                           | 一个事务同时写客户与 Todo，然后 `undo()`          | 按 `crossScope` 拒绝，报错写明越界的仓库是 Todo                            | ⬜   |
| 5   | 同一组实体                               | 先后以不同顺序调用 `history([...])`               | 拿到同一个作用域实例（缓存键与顺序无关）                                   | ⬜   |
| 6   | —                                        | `history([])`                                     | 报参数错误，不退化成整库作用域                                             | ⬜   |
| 7   | 作用域里最近一步已被子分支继承（US-315） | 读 `undoBarrier$`，再 `undo()`                    | 与单仓库作用域同样停在分叉点，`undoBarrier$` 给出继承它的分支              | ⬜   |
| 8   | —                                        | 插件单测；`pnpm audit:api-surface`                | 通过；新增的类型成员与重载有 TSDoc，基线已更新                             | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据（实现时补齐，验证层级与 AC 一致）：

- AC#1～#7：`packages/rxdb-plugin-history/src/__tests__/` 下新增多仓库作用域用例（作用域判定的纯函数另在 `scope-selection` 的单测里覆盖）；`pnpm nx test rxdb-plugin-history`。
- AC#8：`pnpm audit:api-surface`；若 `packages/rxdb/src/__tests__/contracts/public-type-compatibility.spec.ts` 钉了 `HistoryScopeType`，同步更新。

## 技术笔记

- 判定集中在 [`isChangeInScope`](../../../packages/rxdb-plugin-history/src/scope-selection.ts) 一处，加一支「仓库在集合里」；[`filterHistoriesByScope`](../../../packages/rxdb-plugin-history/src/history-filters.ts)、`selectScopedHistories` 与 [`getScopeKey`](../../../packages/rxdb-plugin-history/src/history-filters.ts) 跟着认新类型。缓存键把仓库按 `namespace:entity` 排序后拼接。
- 关联表在不在作用域：由多对多元数据（`packages/rxdb/src/entity/many-to-many-entity.ts` 生成的关联实体）判断两端是否都在集合里。关联实体按 `namespace` + 生成名注册，变更行里记的就是这个名字：dev 栈上 `syncManager.getAllRepositorySyncStatus()` 列出 `public:DemoCategory_DemoOrderItem`，挂分类那一步的变更 `entity` 也是 `DemoCategory_DemoOrderItem`。
- 删除客户时级联删掉的订单、订单项、关联行与证件各自是独立的历史项（[US-318](US-318-cascade-delete-one-transaction.md)）：多仓库作用域能列出它们，但一次撤不回整组，那是 US-318 的范围。
- 是否算破坏性：给公开的联合类型加成员，API 基线只记符号名、不会报；但对 `HistoryScopeType` 做穷举 `switch` 的消费者会编译失败。PR 里按 [versioning-policy](../../versioning-policy.md) 写明判定。
- `describeScope`（报错文案）加集合的写法，越界报错要列出集合外的仓库。

## 实现文件

- `packages/rxdb/src/sync-contract/VersionManager.interface.ts` — `HistoryScope` / `HistoryScopeType` 新成员与 TSDoc
- `packages/rxdb-plugin-history/src/VersionManager.ts`、`HistoryManager.ts` — `history([...])` 重载
- `packages/rxdb-plugin-history/src/scope-selection.ts`、`history-filters.ts` — 作用域判定、裁切与缓存键
- `packages/rxdb-plugin-history/src/__tests__/` — 单测
- `requirements/api-baseline/rxdb.json`、`requirements/api-baseline/rxdb-plugin-history.json` — 基线

## References

- 使用方：[US-231](../adapter/US-231-supabase-unified-undo-history.md) 阶段 B；整体方案见 [epic-016](../../epics/epic-016-local-change-workbench.md)
- [US-302 撤销/重做](US-302-undo-redo.md)、[US-315 撤销子分支已继承的变更](US-315-undo-inherited-change-switch-corruption.md)
