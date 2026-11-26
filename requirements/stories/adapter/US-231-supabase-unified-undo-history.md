---
id: US-231
title: dev-rxdb-supabase 三页交互统一：撤销、重做与操作历史同一位置、作用域写在控件上
status: Backlog
priority: Medium
epic: epic-016-local-change-workbench
created: 2026-11-26
updated: 2026-11-26
tags: [adapter, supabase, undo-redo, history, demo, ux, e2e]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 阶段 A 只动 dev-rxdb-supabase 与它的 e2e；阶段 B 以 US-316、US-318 为前置
- [x] Negotiable (可协商): 面板的视觉细节留待实现时定；页面登记的方式与作用域规则已定
- [x] Valuable (有价值): 三页三套撤销写法，订单页根本没有撤销；没有快捷键；页面骨架与写入反馈各写各的
- [x] Estimable (可估算): 页面登记撤销 / 重做 + 快捷键 + 操作历史面板 + 三页骨架 + e2e 改锚点
- [ ] Small (小): 两个阶段各一个 PR，阶段 B 等 US-316 与 US-318
- [x] Testable (可测试): 组件单测 + 远端 e2e
-->

# 用户故事：三页交互统一——撤销、重做与操作历史

## 作为/我想要/以便

**作为** 在 Todo、商品目录、订单三页之间来回操作的开发者
**我想要** 三页的撤销、重做、操作历史长在同一个位置、长得一样、快捷键一样，并且控件上写明它们只作用于眼前这一页
**以便** 换一页不用重新学一套操作，也不担心撤销撤到看不见的另一页

## 现状

1. Todo：[`TodoPage`](../../../apps/dev-rxdb-supabase/src/app/todo/todo.page.ts) 用 `history(Todo)`，图标按钮的读屏名是英文 `Undo` / `Redo`，次数贴在按钮上；操作历史是共享模块的 [`HistorySidebarComponent`](../../../modules/angular/src/components/history-sidebar.component.ts)，挂在列表左边，宽 `w-48`。为什么不用整库作用域，代码里写着：

   ```ts
   // 与计数、侧栏同一份 Todo 作用域：无参 history() 是整库作用域，会撤销页面外的实体（商品目录）
   ```

2. 商品：[`CatalogLocalWrites`](../../../apps/dev-rxdb-supabase/src/app/catalog/catalog-local-writes.ts) 用 `history(CatalogItem)`，文字按钮「撤销」「重做」和「推送」「同步」挤在商品卡片的标题行；没有操作历史（单件商品的「历史」是 US-229 的远端变更历史，另一回事）。
3. 订单：[`OrdersPage`](../../../apps/dev-rxdb-supabase/src/app/orders/orders.page.ts) 没有撤销、重做与历史。也不能照抄前两页，dev 栈访客的订单页实测有两处挡着：
   - 写入跨实体。新建客户带证件时 [`#saveCustomerWithIdCard`](../../../apps/dev-rxdb-supabase/src/app/orders/orders.page.ts) 的 `saveMany` 记成一个含客户与证件的事务；给订单项挂分类记成一个只有关联表 `DemoCategory_DemoOrderItem` 一条插入的事务。单仓库作用域撤到前者，[`selectScopedHistories`](../../../packages/rxdb-plugin-history/src/scope-selection.ts) 把它归进 `crossScope`，调用方抛 [`RxDBCrossScopeTransactionError`](../../../packages/rxdb-plugin-history/src/scope-selection.ts)；后者不在任何手写实体的作用域里；整库作用域又会撤到 Todo 与商品。缺的是「几个仓库合起来」的作用域，由 [US-316](../collaboration/US-316-multi-repository-history-scope.md) 补。
   - 删除带证件的客户之后，撤销第一步就以 `FOREIGN KEY constraint failed` 失败、撤销栈卡死：级联删掉的订单、订单项、关联行与证件各自是独立的历史项，不和源删除同一个事务。由 [US-318](../collaboration/US-318-cascade-delete-one-transaction.md) 补。
4. 页面骨架各写各的：Todo 是 `max-w-4xl` 的标题栏加徽标，商品是 `max-w-7xl` 两栏，订单是 `max-w-5xl` 卡片堆叠。写入失败的位置也不一致：订单页的写入失败与推拉失败共用一个 `#error`，显示在「同步」卡片里，离出错的表单很远。
5. 三页都没有 ⌘/Ctrl+Z 之类的快捷键。

## 交付阶段

| 阶段 | 内容                                                                                                              | 前置                                                                                                                                     | 状态 |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A    | 页面登记撤销、重做与操作历史，顶栏按登记渲染编辑组，Todo 与商品接入；新的操作历史面板；三页页面骨架与写入反馈统一 | 无。与 [US-230](US-230-supabase-header-sync.md) 阶段 A 共用页面登记服务与右侧面板壳，先落地的一方建，后落地的一方复用                    | ⬜   |
| B    | 订单页接入：作用域为订单的五个实体与关联表；删除带子记录的数据后一次撤回整组                                      | [US-316](../collaboration/US-316-multi-repository-history-scope.md)、[US-318](../collaboration/US-318-cascade-delete-one-transaction.md) | ⬜   |

两个阶段都是当前承诺；阶段 B 的前置落地之前，本故事不关闭。

## 范围边界

### In Scope

- 页面登记（`PageWorkbench`，见 [US-230](US-230-supabase-header-sync.md)「入口设计」）：页面进入时登记撤销、重做与操作历史的命令和状态（次数、不可用原因），离开时注销；顶栏按登记渲染「撤销」「重做」「操作历史」与作用域标签（如「本页：商品」），首页不登记就不显示。
- 各页登记的作用域：Todo → `Todo`；商品 → `CatalogItem`；订单（阶段 B）→ 订单的实体组。
- 快捷键：⌘/Ctrl+Z 撤销，⌘/Ctrl+Shift+Z 与 Ctrl+Y 重做；焦点在输入框、文本域、下拉框、可编辑区域里，或输入法正在组字时不拦截，交给浏览器原生的撤销。
- 不可撤销时给原因，悬停与读屏都读得到：推送或拉到改写之后撤销栈已清空（US-034）、下一步已被子分支继承（`undoBarrier$`）、访客没有商品写入口。
- 操作历史面板（右侧面板的一个视图，同一时刻只开一个）：本页作用域、本次会话的历史，最新在前；每条写操作类型、描述、相对时间，以及「已撤销」「已失效」「被拒」标记；展开看逐字段的改之前与改之后；面板头写作用域与可撤销、可重做次数。
- 页面骨架：三页同一最大宽度；页头是标题、一句说明与页面动作位；提示区（本地模式、访客、本页语境的说明）用同一个组件；写入成功的提示与失败原因显示在发起写入的那张卡片里，订单页拆开写入与同步共用的 `#error`。
- e2e：Todo 与商品的撤销、重做改走顶栏锚点；阶段 B 新增订单撤销跨实体事务的用例。

### Out of Scope

- 改共享模块的 `HistorySidebarComponent`：dev-rxdb-angular 的树菜单、文件管理器等页面在用；supabase 应用另写面板。
- 统一三页的编辑方式（Todo 双击行内编辑、商品对话框编辑、订单只有新建与删除）：领域不同，不强求一致。
- 在操作历史里点某一条、一次撤销到那里（`undo(step)`）：先做单步，有需求时另开编号。
- 「待推送」标记：随 US-230 阶段 C。
- 「全部页面」的整库历史视图：推送前看整机的修改由 US-230 阶段 C 的待推送清单承担，历史里不再做一份。

## 验收标准

### 阶段 A

| #   | 前置条件                                       | 操作                                         | 预期结果                                                                                                         | 状态 |
| --- | ---------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Alice 在 Todo 页                               | 看顶栏，再切到商品页、首页                   | Todo 与商品两页的编辑组位置、外观相同，作用域标签分别是 Todo、商品；首页没有编辑组                               | ⬜   |
| 2   | Alice 在 Todo 页新建一条，再到商品页改一件商品 | 在商品页点「撤销」，再回 Todo 页点「撤销」   | 商品页撤掉商品的修改，Todo 不动；回到 Todo 页撤掉那条 Todo（「撤销只撤本页」与 US-034 一致）                     | ⬜   |
| 3   | 商品页有可撤销的修改，焦点在页面空白处         | 按 ⌘/Ctrl+Z，再按 ⌘/Ctrl+Shift+Z             | 依次撤销、重做，与点按钮结果相同                                                                                 | ⬜   |
| 4   | 焦点在 Todo 的新建输入框里，已输入文字         | 按 ⌘/Ctrl+Z                                  | 只撤输入框里的文字，数据不动                                                                                     | ⬜   |
| 5   | Alice 推送成功、推上去至少一条                 | 看编辑组                                     | 撤销、重做不可点，原因是「推送之后不能再撤销」；操作历史里那些条目还在，只是不能再撤                             | ⬜   |
| 6   | 访客打开商品页                                 | 看编辑组                                     | 撤销、重做不可点，原因是「访客只读」                                                                             | ⬜   |
| 7   | Todo 页有三条可撤销的操作                      | 打开操作历史，撤销一条                       | 面板列出三条、最新在前，面板头写作用域 Todo 与「可撤销 3」；撤销后那条标「已撤销」，面板头变为可撤销 2、可重做 1 | ⬜   |
| 8   | 操作历史里有一条修改                           | 展开                                         | 逐字段显示改之前与改之后                                                                                         | ⬜   |
| 9   | 操作历史开着                                   | 打开同步中心，或商品的「模拟服务端变更」     | 右侧同一时刻只开一个面板；关掉之后焦点回到打开它的那个按钮                                                       | ⬜   |
| 10  | 三页                                           | 对照页面骨架；在订单页提交只含空格的客户名称 | 三页同一最大宽度、同一页头结构与提示组件；订单页的「先填客户名称」显示在客户卡片里，不在别的卡片                 | ⬜   |
| 11  | 375px 宽的窄屏                                 | 打开三页，再打开操作历史                     | 编辑组只剩图标，页面不出现横向滚动；操作历史是带遮罩的整屏抽屉                                                   | ⬜   |

### 阶段 B

| #   | 前置条件                             | 操作                   | 预期结果                                                               | 状态 |
| --- | ------------------------------------ | ---------------------- | ---------------------------------------------------------------------- | ---- |
| 12  | Alice 在订单页新建了带证件号码的客户 | 点「撤销」             | 客户与证件一起撤掉，不报跨作用域错误；Todo 与商品不受影响              | ⬜   |
| 13  | Alice 给一条订单项挂了一个分类       | 撤销，再重做，然后推送 | 分类先摘掉再挂回；Bob 拉取后看到的是重做后的结果                       | ⬜   |
| 14  | Alice 删了一位有订单、有证件的客户   | 点一次「撤销」         | 客户、他的订单与订单项、证件、分类关联按删除前的样子回来；没有外键错误 | ⬜   |
| 15  | 按 README 起好本地栈                 | 跑远端 e2e             | orders-sync 新增的撤销用例通过，原有场景一条不少                       | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据（实现时补齐，验证层级与 AC 一致）：

- AC#1～#10：`apps/dev-rxdb-supabase/src/app/app-header.spec.ts`（编辑组）、`page-workbench.spec.ts`（登记与快捷键，与 US-230 共用）、`operation-history-panel.spec.ts`（新）；`pnpm nx test dev-rxdb-supabase`。AC#2、#5 另由 `apps/dev-rxdb-supabase-e2e/src/catalog-local-writes.spec.ts` 在真栈上覆盖。
- AC#11：远端 e2e 以 375px 视口断言没有横向滚动、抽屉带遮罩。
- AC#12～#15：`apps/dev-rxdb-supabase-e2e/src/orders-sync.spec.ts`；按 README 起栈后 `pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`。作用域与级联撤销本身的语义由 US-316、US-318 的单测守。

## 技术笔记

- 页面在自己的注入上下文里登记：作用域对象（`history(scope)`）取一次、随登记一起交给服务，不在模板里每次求值都调 `history()`；页面销毁时随 `DestroyRef` 注销。页面自己的状态（如商品页的写入口）通过登记里的「不可用原因」signal 交给顶栏，顶栏不认识任何页面。
- 快捷键只在 `document` 上挂一次，调的是当前登记的撤销、重做；「可编辑目标」按 `input`、`textarea`、`select`、`[contenteditable]` 判，`event.isComposing` 为真时不处理。
- 操作历史面板的数据是 `history(scope).histories$`。它只含本次会话的变更（`HistoryManager` 按 `firstConnectedAt` 起算）——这是「我这次做了什么」的视图，不是待推送清单；会推什么由 US-230 阶段 C 回答。标记来自 `HistoryItem.reverted`、`redoInvalidated` 与 `changes[].rejectedAt`。字段级改前改后与 US-230 阶段 C 共用同一个纯函数。
- 订单的作用域要覆盖关联表 `DemoCategory_DemoOrderItem`：挂分类的那一步只记了它一条。它没有手写的实体类，US-316 按「多对多的两端都在作用域里，关联表就在」处理，与 US-228「关联表的同步配置跟随两端」同口径；订单页只需列出五个实体。
- 删除带子记录的客户（dev 栈访客实测）：历史里是五个独立的 DELETE（客户、订单、订单项、关联行、证件），都没有事务号，客户排在最前；`history().undo()` 插回客户时它还引用着没恢复的证件，`COMMIT` 报 `FOREIGN KEY constraint failed`，撤销栈卡在这一步；`history().undo(5)` 一次撤五步则整组恢复。AC#14 因此以 US-318 为前置。
- 不可撤销原因里「访客只读」来自商品页自己的写入口（`CatalogLocalWrites.$canWrite`）；Todo 对访客是只存本地、照样能写能撤，不显示这条原因。

## 实现文件

- `apps/dev-rxdb-supabase/src/app/page-workbench.ts`（新，与 US-230 共用，先落地的一方建）— 页面登记与快捷键
- `apps/dev-rxdb-supabase/src/app/app-header.ts` — 按登记渲染编辑组
- `apps/dev-rxdb-supabase/src/app/operation-history-panel.ts`（新）— 操作历史视图
- `apps/dev-rxdb-supabase/src/app/side-panel.ts`（新，或随 US-232 / US-230 先建）— 右侧面板壳
- `apps/dev-rxdb-supabase/src/app/todo/todo.page.ts`、`todo.page.html`、`catalog/catalog-synced-panel.ts`、`catalog/catalog-local-writes.ts`、`orders/orders.page.ts` — 移除页面内的撤销、重做与历史侧栏，改为登记；统一页面骨架与写入反馈
- `apps/dev-rxdb-supabase-e2e/src/*.spec.ts` — 撤销、重做改走顶栏；订单撤销用例

## References

- 整体方案与作用域规则：[epic-016](../../epics/epic-016-local-change-workbench.md)
- [US-302 撤销/重做](../collaboration/US-302-undo-redo.md)、[US-315 撤销子分支已继承的变更](../collaboration/US-315-undo-inherited-change-switch-corruption.md)（`undoBarrier$` 的来历）、[US-034 分区实体的本地写入](../core/US-034-bucketed-entity-local-writes.md)、[US-228 多对多关联同步](US-228-supabase-many-to-many-sync.md)、[US-318 级联删除记进同一个事务](../collaboration/US-318-cascade-delete-one-transaction.md)
