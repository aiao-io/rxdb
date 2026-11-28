---
id: epic-016-local-change-workbench
status: Done
startDate: 2026-11-26
targetDate: TBD
owner: jimmy
---

# 本机修改工作台：推送、拉取、撤销与历史的统一交互

## 愿景

local-first 应用里一次修改的完整生命周期——在本机写下、撤销或重做、推到远端、被远端接受或拒绝、拉到别人的修改——在界面上是一条连续、看得见的路径，而不是散在各页的几组按钮和解释文字。`dev-rxdb-supabase` 先做出这套交互，作为接入方可以照抄的参考。

## 为什么单列一个 Epic

分组判据是**横切交互约束**：Todo、商品目录、订单三页分属 epic-004（[US-225](../stories/adapter/US-225-supabase-sync-protocol-access-baseline.md)、[US-227](../stories/adapter/US-227-supabase-relational-sync-demo.md)）与 [epic-015](epic-015-identity-scoped-sync.md)（US-033～036、[US-034](../stories/core/US-034-bucketed-entity-local-writes.md)、[US-229](../stories/adapter/US-229-supabase-change-history.md)）的演示，各自长出了一套推拉与撤销控件。统一它们要同时改三个 epic 的演示页，并补四处核心缺口（多仓库撤销作用域、待推送清单、待拉数准确、级联删除的事务归属）；挂进任何一个现有 epic 都只覆盖其中一页。

## 方案总览

### 心智模型：照 git 讲本机修改

参考形态是 dev-rxdb-angular 的 [working-tree 页](../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.page.html)（GitHub Desktop 式：工具栏是仓库 / 分支 / 获取，左栏 Changes 与 History，右栏 diff）。搬的是它的结构，不是它的提交语义：

| git / GitHub Desktop        | 本仓库                              | 现有能力                                                                                                                             |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 当前仓库                    | 当前身份的本地库（US-035）          | `DemoSession.prepared.databaseName`                                                                                                  |
| 当前分支                    | 历史插件的分支                      | 侧栏 `BranchManager`                                                                                                                 |
| 领先 ↑N（还没推的提交）     | 待推送                              | `versionManager.pushableCount$`（一个事务一条）                                                                                      |
| 落后 ↓M                     | 待拉取                              | `versionManager.pullableCount$`；刷新后会把自己推的算进去（[US-233](../stories/adapter/US-233-supabase-pullable-count-accuracy.md)） |
| `git push` / `git pull`     | 推送 / 拉取（整机）                 | `syncManager.push()` / `syncManager.pull()`                                                                                          |
| push 被拒                   | 被拒的推送                          | `useSyncState().lastRejections`                                                                                                      |
| 推送前 reset 掉本地提交     | 撤销 / 重做（推送或拉到改写后清空） | `history(scope).undo()` / `redo()`                                                                                                   |
| Changes 列表 + diff         | 待推送清单 + 字段级改前改后         | 只有计数，缺清单（[US-317](../stories/collaboration/US-317-pushable-histories.md)）                                                  |
| `git log`                   | 本页的操作历史                      | `history(scope).histories$`                                                                                                          |
| `git log -- <file>`（远端） | 一件商品的远端变更历史              | US-229                                                                                                                               |

不搬的：暂存区、提交框、丢弃单个文件、合并、检出位。日志同步里每次保存就相当于一次提交，没有「未提交的修改」这一层；working-tree 页的这些能力属于 `@aiao/rxdb-plugin-working-tree`，supabase 演示没有装这个插件。

### 页面登记，顶栏渲染

一个根级服务（暂名 `PageWorkbench`）承接顶栏上的四个按钮：撤销、重做、推送、拉取（外加操作历史与同步中心两个面板开关）。

- 页面进入时登记自己要哪几个按钮、每个按钮的命令与状态（次数、进行中、不可用原因），离开时随 `DestroyRef` 注销；顶栏只按当前登记渲染，没登记的不显示，首页什么都不登记。
- 状态由页面更新：商品页对访客把撤销的不可用原因设为「访客只读」，顶栏不认识任何页面、没有按页面判断的分支。
- 撤销、重做：页面登记本页作用域的命令（[US-231](../stories/adapter/US-231-supabase-unified-undo-history.md)）。
- 推送、拉取：三页都登记同一组整机命令（根级 `SyncCommands`），见下一节的理由。

### 作用域规则（实测过，一处说清，三页照用）

| 控件                             | 作用范围                                           | 放在哪                   |
| -------------------------------- | -------------------------------------------------- | ------------------------ |
| 推送、拉取、待推待拉数、被拒清单 | 整机：当前身份的本地库、当前分支                   | 顶栏同步组、同步中心     |
| 撤销、重做、操作历史             | 当前页面的实体：Todo；商品；订单的五个实体与关联表 | 顶栏编辑组、操作历史面板 |
| 模拟服务端变更                   | 商品页                                             | 商品页头的开关，右侧抽屉 |

- 推送、拉取今天就是整机的：dev 栈上在 Todo 页点「推送」，订单页新建的客户与商品页新建的商品一起推上去；Todo、订单页的「拉取」是不带过滤的 `pull()`，只有商品页的「同步」是单仓库的。所以入口放顶栏、写明「整机」，同步中心按实体分列待推待拉，读的人一眼看出推送会带上别的页的修改。
- 推拉不做成按页：推上去至少一条时，历史插件清的是**整条分支**的撤销栈（`captureUndoHistory(branchId)`），只推本页会让别的页没推的修改也失去撤销；按页的待拉数在 US-233 修好之前也不准。按页推拉的解锁条件写在 [US-230](../stories/adapter/US-230-supabase-header-sync.md) 的 Out of Scope。
- 撤销是编辑动作，用户期待撤掉眼前这一页的修改，US-034 明确要求「撤销只撤商品的修改，不会撤到 Todo 页」。

### 布局

```text
宽屏（≥ 768px）
┌侧栏┬ 顶栏 ───────────────────────────────────────────────────────────────────────────────────────┐
│    │ 商品目录   ↶ 撤销  ↷ 重做  ☰ 历史 · 本页：商品 │ 整机 ↓ 拉取 2  ↑ 推送 3  ⇅ 同步中心 ● │ 🛡 │ Alice ▾ │
│    ├────────────────────────────────────────────────────────┬──────────────────────────────────────┤
│    │ 页头：标题 · 一句说明                   [页面动作 ▸]   │ 右侧面板（同一时刻只开一个）         │
│    │ 提示区：本地模式 / 访客 / 本页语境的说明               │  · 操作历史（本页）                  │
│    │ 页面内容：只留本页的领域操作                           │  · 同步中心（整机，按实体分列）      │
│    │                                                        │  · 模拟服务端（仅商品页）            │
└────┴────────────────────────────────────────────────────────┴──────────────────────────────────────┘

窄屏（< 768px）：顶栏只留图标与数字，页面标题回到内容区；右侧面板改为带遮罩的整屏抽屉。
```

### 交付顺序

每一步一个 PR，e2e 锚点与界面改动同一个 PR 迁移，场景一条不删：

1. [US-232](../stories/adapter/US-232-supabase-catalog-server-drawer.md) 商品「模拟服务端变更」收进右侧抽屉——最小，零核心改动，顺手建右侧面板的壳。
2. [US-230](../stories/adapter/US-230-supabase-header-sync.md) 阶段 A：页面登记服务、顶栏同步组与同步中心，三页移除各自的推拉。
3. [US-231](../stories/adapter/US-231-supabase-unified-undo-history.md) 阶段 A：Todo 与商品登记撤销、重做、操作历史，三页页面骨架统一。
4. [US-233](../stories/adapter/US-233-supabase-pullable-count-accuracy.md) 待拉数准确 → US-230 阶段 B。
5. [US-316](../stories/collaboration/US-316-multi-repository-history-scope.md) 多仓库撤销作用域 + [US-318](../stories/collaboration/US-318-cascade-delete-one-transaction.md) 级联删除记进同一个事务 → US-231 阶段 B：订单页接入。
6. [US-317](../stories/collaboration/US-317-pushable-histories.md) 待推送清单 → US-230 阶段 C：同步中心列出会推什么、每条改了什么。

US-233 与 US-318 是今天就踩得到的缺陷（推完一刷新徽标冒出拉了也不变的大数；删除带证件的客户之后撤销卡死），不必等前面的界面改造，可以先修。

## 目标

- [ ] 推送、拉取、待推待拉数与被拒清单只有顶栏一处入口，三页不再各放一组；页面登记要哪几个按钮（[US-230](../stories/adapter/US-230-supabase-header-sync.md)）
- [ ] 待拉数只数别人的、按区同步的按真实条数（[US-233](../stories/adapter/US-233-supabase-pullable-count-accuracy.md)、US-230）
- [ ] 三页的撤销、重做、操作历史同一位置、同一外观、同一快捷键，作用域写在控件上（[US-231](../stories/adapter/US-231-supabase-unified-undo-history.md)）
- [ ] 订单页能整条撤销跨实体的事务与级联删除，又不撤到别的页面（[US-316](../stories/collaboration/US-316-multi-repository-history-scope.md)、[US-318](../stories/collaboration/US-318-cascade-delete-one-transaction.md)、US-231）
- [ ] 推送之前能看到会推哪些修改、每条改了什么，清单条数等于待推数（[US-317](../stories/collaboration/US-317-pushable-histories.md)、US-230）
- [ ] 商品页默认单栏，「模拟服务端变更」按需从右侧打开，开着时仍能拉取并看到本机变化（[US-232](../stories/adapter/US-232-supabase-catalog-server-drawer.md)）

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-230 dev-rxdb-supabase 顶栏统一推送与拉取：页面登记要哪些按钮，待拉数准确，推之前看得见会推什么](../stories/adapter/US-230-supabase-header-sync.md) (Medium) — A 页面登记与顶栏同步组、同步中心 → B 待拉数准确（前置 US-233）→ C 待推送清单与字段级改前改后（前置 US-317）
- [US-231 dev-rxdb-supabase 三页交互统一：撤销、重做与操作历史同一位置、作用域写在控件上](../stories/adapter/US-231-supabase-unified-undo-history.md) (Medium) — A Todo 与商品登记、页面骨架统一 → B 订单接入（前置 US-316、US-318）
- [US-232 dev-rxdb-supabase 商品「模拟服务端变更」收进右侧抽屉：主界面先看本机数据，需要时再打开](../stories/adapter/US-232-supabase-catalog-server-drawer.md) (Medium)
- [US-233 Supabase 待拉数与能拉的对不上：刷新后把自己推的算进去，分区按变更号差计](../stories/adapter/US-233-supabase-pullable-count-accuracy.md) (High)
- [US-235 dev-rxdb-supabase 订单页一个窗口就能测：页面上写明怎么测，远端数据看得见，没推的行标出来](../stories/adapter/US-235-supabase-orders-testability.md) (Medium)
- [US-236 Supabase 同步状态一轮问完：打开页面不再为每个仓库各发三个请求，频道订阅上只重算一次](../stories/adapter/US-236-supabase-sync-status-batching.md) (Medium)
- [US-316 撤销/重做的多仓库作用域：几个实体合起来撤，跨它们的事务整条撤](../stories/collaboration/US-316-multi-repository-history-scope.md) (Medium)
- [US-317 待推送清单：与待推数同一口径的历史项流](../stories/collaboration/US-317-pushable-histories.md) (Medium)
- [US-318 本地外键级联删除与源删除记进同一个事务：一次撤销整组恢复，互相引用的也撤得回来](../stories/collaboration/US-318-cascade-delete-one-transaction.md) (High)

## 非目标

- React / Vue 版的同一套演示：supabase 演示只有 Angular 一端；核心故事只动 `@aiao/rxdb`、历史与同步插件和 Supabase 适配器，三个框架绑定包都没有包装 `versionManager`，不新增框架 hook。
- 按页推送、拉取：解锁条件见 US-230。
- 自动同步（定时推拉、联网即推）。
- git 式的暂存、提交、丢弃单条修改、合并、检出位。
- 改 `modules/angular` 的 `HistorySidebarComponent`：dev-rxdb-angular 的树菜单、文件管理器页面在用，supabase 应用另写面板。
- 待拉取的明细列表：远端只给计数。

## References

- 参考形态：[working-tree.page.html](../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.page.html)、[changes-list.component.ts](../../apps/dev-rxdb-angular/src/app/pages/working-tree/components/changes-list.component.ts)、[working-tree.diff-format.ts](../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.diff-format.ts)
- 演示说明：[dev-rxdb-supabase README](../../apps/dev-rxdb-supabase/README.md)
- [US-302 撤销/重做](../stories/collaboration/US-302-undo-redo.md)、[US-218 RLS 下的推送完整性](../stories/adapter/US-218-supabase-rls-push-integrity.md)（被拒清单 AC#16）、[US-226 待拉数按记录计](../stories/adapter/US-226-supabase-pull-count-records.md)
