---
id: US-230
title: dev-rxdb-supabase 顶栏统一推送与拉取：整机同步只有一处入口，同步中心列出会推什么
status: Backlog
priority: Medium
epic: epic-016-local-change-workbench
created: 2026-11-26
updated: 2026-11-26
tags: [adapter, supabase, sync, demo, ux, e2e]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 阶段 A 只动 dev-rxdb-supabase 与它的 e2e，不依赖核心改动；阶段 B 以 US-317 为前置
- [x] Negotiable (可协商): 顶栏的视觉细节、同步中心的分区顺序留待实现时定；作用域与入口位置已定
- [x] Valuable (有价值): 三页各放一组推拉控件、背后是同一个整机方法，范围只能靠文案解释；推送前看不到会推什么
- [x] Estimable (可估算): 顶栏同步组 + 根级推拉命令 + 同步中心视图 + 三页移除控件 + 四个远端 e2e 改锚点
- [ ] Small (小): 两个阶段各一个 PR，阶段 B 等 US-317
- [x] Testable (可测试): 组件单测 + 远端 e2e（两个浏览器上下文）
-->

# 用户故事：顶栏统一推送与拉取

## 作为/我想要/以便

**作为** 在 dev-rxdb-supabase 里评估 local-first 同步的开发者
**我想要** 推送、拉取、待推待拉数与被拒的推送只在顶栏出现一次，并能打开一个同步中心，看清这次会推哪些修改、每条改了什么
**以便** 换一页不用重新找同步按钮，也不会误以为某一页的「推送」只推这一页

## 现状

1. 三页各放一组同步控件，形状各不相同，背后调的是同一个整机方法：
   - [`TodoPage`](../../../apps/dev-rxdb-supabase/src/app/todo/todo.page.ts) 的拉取、推送直接调 `syncManager.pull()` / `push()`；按钮只有图标，读屏名是英文（`aria-label="Pull"`、`aria-label="Push"`），数字大于 0 时才贴在按钮上。
   - 商品的「同步」[`CatalogSyncedPanel.sync()`](../../../apps/dev-rxdb-supabase/src/app/catalog/catalog-synced-panel.ts) 只拉商品一个仓库：

     ```ts
     const result = await this.#rxdb.syncManager.pullRepository('public', 'CatalogItem', { fetchAll: true });
     ```

     推送 [`CatalogLocalWrites.push()`](../../../apps/dev-rxdb-supabase/src/app/catalog/catalog-local-writes.ts) 却是整机的 `syncManager.push()`。

   - [`OrdersPage`](../../../apps/dev-rxdb-supabase/src/app/orders/orders.page.ts) 单独一张「同步」卡片，「待拉 N」「待推 N」常显在按钮外面。
2. 范围靠文案解释。订单页的同步卡片里写着：

   ```html
   推送、拉取的是本机全部的修改（包括 Todo 页的），数字与它的范围一致。
   ```

   [README](../../../apps/dev-rxdb-supabase/README.md) 的商品一节也专门说明「推送」包括 Todo 页的修改。按钮长在页面里，用户只能靠读这句话知道它推的不止本页。

3. 被拒清单 [`SyncRejectionsPanel`](../../../apps/dev-rxdb-supabase/src/app/sync-rejections-panel.ts) 三页各挂一份（Todo 只在能同步时挂），自带 Todo 页的边距 `class="mx-auto mb-3 max-w-4xl px-4"`，嵌进商品卡片里也是这套边距。
4. 结果反馈三种写法：Todo 只在失败时显示 `$syncError`，成功什么也不说；商品写「第 N 次同步完成：拉取 X 条变更，落库 Y 条。」；订单写「推送完成：推上去 N 条」。
5. 待推数只有数字。口径的唯一实现是 [`updatePushableCount`](../../../packages/rxdb-plugin-history/src/undo-redo-apply.ts)（当前分支上没撤销、没推上去的变更，再按仓库的推送资格与水位线裁剪，一个事务算一条），没有对应的清单；应用自己拼查询会与待推数对不上，清单由 [US-317](../collaboration/US-317-pushable-histories.md) 补。

## 交付阶段

| 阶段 | 内容                                                                                     | 前置                                                                                                                             | 状态 |
| ---- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A    | 顶栏同步组；同步中心的状态、最近一次结果与被拒清单；三页移除各自的推拉控件；e2e 改走顶栏 | 无                                                                                                                               | ⬜   |
| B    | 同步中心的「待推送」清单与字段级改前改后；操作历史里还在待推送集合中的条目带 ↑ 标记      | [US-317](../collaboration/US-317-pushable-histories.md)；[US-231](US-231-supabase-unified-undo-history.md) 阶段 A 的操作历史面板 | ⬜   |

两个阶段都是当前承诺；阶段 B 的前置落地之前，本故事不关闭。

## 范围边界

### In Scope

- 顶栏同步组：「拉取」调 `syncManager.pull({ fetchAll: true })`，「推送」调 `syncManager.push()`；按钮上是待拉 ↓M、待推 ↑N（`pullableCount$` / `pushableCount$`）；进行中显示进度、两个按钮都不可点；不可用时悬停与读屏都能读到原因。
- 轮次计数：顶栏同步组带 `data-sync-round`，每轮推拉结束（成功或失败）加 1，取代 `catalog-sync`、`orders-sync` 上的 `data-sync-count`，e2e 的等待写法不变。
- 一行结果：拉到多少、落库多少、推上去多少、被拒多少；有失败仓库时写出仓库与原因；推上去 ≥ 1 条时写明「推送前的修改不能再撤销」（与 US-034 一致）。
- 同步中心（右侧面板的一个视图，与 US-231、US-232 共用面板壳，同一时刻只开一个）：当前身份与本地库、当前分支（只读）、在线状态、待推待拉数、最近一次结果、被拒清单；有被拒时顶栏开关上带标记。
- 会话已在别的标签页换成另一个身份（`RxDBIdentityMismatchError`）时，结果行给「重新加载」，替代商品面板里原有的那颗按钮。
- 三页移除推拉控件与各自的被拒清单；页面只留本页语境的说明：商品同步规则下那句「改了规则之后点「同步」」改为指向顶栏「拉取」，订单页保留 [`describeDependencyRejections`](../../../apps/dev-rxdb-supabase/src/app/orders/orders-interactions.ts) 给出的「它的客户已不在远端」说明。
- 本地模式（没有 Supabase 配置）顶栏不出现同步组。
- e2e：remote-sync、catalog-sync、catalog-local-writes、orders-sync 的推拉一律经顶栏，场景一条不删。
- README 的演示步骤按新入口改写。
- 阶段 B：「待推送」按页面（实体）分组、一个事务一行，展开看逐字段的改之前与改之后；清单条数等于顶栏 ↑N。

### Out of Scope

- 「检查远端」（GitHub Desktop 的 Fetch origin，可接 `syncManager.refreshPullableCount()`）：待拉数由实时通知累加，演示里还没有它不准的症状；出现症状时另开编号。
- 一颗「同步」主按钮（`syncManager.sync()` 先拉后推）：演示要分别展示推和拉，两颗显式按钮更好讲。
- 待拉取的明细：远端只给计数。
- 把侧栏的分支选择器挪进顶栏：`BranchManager` 不动，同步中心只读显示当前分支。
- 自动同步。

## 验收标准

### 阶段 A

| #   | 前置条件                                                 | 操作                      | 预期结果                                                                                                         | 状态 |
| --- | -------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 远端模式，Alice                                          | 依次打开 Todo、商品、订单 | 顶栏有「拉取」「推送」与同步中心开关，三页完全相同；页面内容区没有拉取、推送、同步按钮，也没有「被拒的推送」区块 | ⬜   |
| 2   | Alice 在 Todo 页新建一条 Todo，在订单页新建一位客户      | 在商品页点顶栏「推送」    | 推送前 ↑ 是 2，推送后数字消失；另一个浏览器的 Bob 拉取后，Todo 页与订单页都能看到这两条                          | ⬜   |
| 3   | 访客，同步规则只关注数码                                 | 点顶栏「拉取」            | 与原「同步」同效：关注分类的公开商品落进本机，未关注的不进；没有权限错误                                         | ⬜   |
| 4   | 访客关注了「家居」；Alice 在模拟服务端把一件公开商品收回 | 访客点「拉取」            | 新匹配的行补快照，收回的那件从本机消失（US-033 原有的分区同步 e2e 改走顶栏后照样通过）                           | ⬜   |
| 5   | 本地模式（没有 Supabase 配置）                           | 打开 Todo 页              | 顶栏没有同步组，页面里也没有残留的推拉按钮                                                                       | ⬜   |
| 6   | Alice 本机没有待推送的修改                               | 看「推送」                | 不可点，悬停与读屏都能读到「没有待推送的修改」                                                                   | ⬜   |
| 7   | 任一已连接的身份                                         | 点「拉取」或「推送」      | 进行中两颗按钮都不可点并显示进度；结束后 `data-sync-round` 加 1，结果行写明条数；失败时写出失败的仓库与原因      | ⬜   |
| 8   | Bob 已在远端删了一条 Todo，Alice 本机改了它              | Alice 推送                | 结果行写「被拒 1 条」，同步中心开关上出现标记；打开同步中心看到这条被拒：实体、操作、原因「已被删除」与代码      | ⬜   |
| 9   | Bob 删了一位客户并推送；Alice 没拉取就给他新建订单并推送 | 看订单页                  | 订单页仍指出「它的客户「X」已不在远端」（`orders-dependency-notices`），被拒的订单列在同步中心                   | ⬜   |
| 10  | 另一个标签页换了身份                                     | 本页点「拉取」            | 被身份守卫拦下，结果行写明身份不匹配并给「重新加载」，本地数据不动                                               | ⬜   |
| 11  | 375px 宽的窄屏                                           | 打开三页，再打开同步中心  | 顶栏同步组只剩图标与数字，页面不出现横向滚动；同步中心是带遮罩的整屏抽屉，Esc 与点遮罩都能关，关掉后焦点回到开关 | ⬜   |
| 12  | 按 README 起好本地栈                                     | 跑远端 e2e                | remote-sync、catalog-sync、catalog-local-writes、orders-sync 的场景一条不少，推拉全部经顶栏的锚点                | ⬜   |

### 阶段 B

| #   | 前置条件                                | 操作                   | 预期结果                                                     | 状态 |
| --- | --------------------------------------- | ---------------------- | ------------------------------------------------------------ | ---- |
| 13  | Alice 在 Todo、商品、订单三页各改了一些 | 打开同步中心「待推送」 | 按页面分组、一个事务一行；同一时刻的行数之和等于顶栏 ↑N      | ⬜   |
| 14  | 清单里有一条修改、一条新建、一条删除    | 逐条展开               | 修改逐字段显示改之前与改之后；新建只有改之后；删除只有改之前 | ⬜   |
| 15  | 访客在本机建了几条 Todo（只存本机）     | 打开「待推送」         | 一条都不出现，与访客的 ↑N 为 0 一致                          | ⬜   |
| 16  | Alice 有三条待推送                      | 撤销一条，再推送       | 撤销掉的那条先离开清单；推送成功后清单清空，与 ↑N 同时归零   | ⬜   |
| 17  | 操作历史面板开着（US-231 阶段 A）       | 写入一条，再推送       | 写入后这条带 ↑ 标记；推送成功后标记消失                      | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据（实现时补齐，验证层级与 AC 一致）：

- AC#1、#5、#6、#7、#11：`apps/dev-rxdb-supabase/src/app/app-header.spec.ts`（同步组）、`apps/dev-rxdb-supabase/src/app/sync-center.spec.ts`（新）；`pnpm nx test dev-rxdb-supabase`。AC#11 的窄屏另在远端 e2e 里以 375px 视口断言没有横向滚动。
- AC#2～#4、#8～#10、#12：`apps/dev-rxdb-supabase-e2e/src/` 下 `remote-sync.spec.ts`、`catalog-sync.spec.ts`、`catalog-local-writes.spec.ts`、`orders-sync.spec.ts`；按 README 起栈后 `pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`。
- AC#13～#17：`sync-center.spec.ts` 的清单用例（替身 `pushableHistories$`）+ `remote-sync.spec.ts` 新增「清单行数等于 ↑N」的真栈用例。

## 技术笔记

- 推拉命令、进行中、最近一次结果与轮次放一个根级服务（暂名 `SyncCommands`），顶栏与同步中心共用；页面不再持有 `$syncing`、`$syncCount`。待推待拉数直接读 `versionManager.pushableCount$` / `pullableCount$`，在线状态与被拒读 [`useSyncState`](../../../packages/rxdb-angular/src/use-sync-state.ts)，应用里不再数一遍。
- 拉取带 `fetchAll: true`：全局 [`pull()`](../../../packages/rxdb-plugin-sync/src/pull.ts) 本来就覆盖按条件与按区同步的仓库（`pullFilterRepositories`、`pullBucketedRepositories`），带上 `fetchAll` 才与原商品「同步」的一次拉到底等价。Todo 与订单原先不带，改了之后一次拉完所有页，用户不用连点。
- 访客的全局拉取（**推断**，以 AC#3 的真栈用例为准）：[`demoSyncOverrides`](../../../apps/dev-rxdb-supabase/src/app/demo-sync-overrides.ts) 把访客的 Todo 与订单改成只存本地，不参与拉取，实际只拉商品。如果批量日志拉取在没有日志仓库可拉时仍对 anon 发 `rxdb_pull_changes` 并被拒（US-225 不给 anon 日志协议），先在同步插件修「没有日志仓库就不发批量请求」，另开编号作为阶段 A 的前置；不在应用里按身份绕路。
- 「推送」对访客天然不可点：访客的 Todo 与订单只存本地、商品写入口关闭，`pushableCount$` 为 0，不需要单独的身份判断。
- 推上去 ≥ 1 条时 [`SyncManager.push()`](../../../packages/rxdb-plugin-sync/src/SyncManager.ts) 清空撤销栈（`clearSyncedHistory()`），结果行据此写「推送前的修改不能再撤销」。
- 页面写入不再因推送而禁用：`CatalogLocalWrites.$busy` 原先把推送也算进去；推送在飞时的撤销由在飞认领（`buildLastPushedMap`）兜住，不需要锁写入口。
- 阶段 B 的清单只消费 US-317 的流。字段级改前改后的取值规则与 working-tree 页的 [`buildFieldDiff`](../../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.diff-format.ts) 同口径：新建只有新值、删除只有旧值、修改取两侧字段的并集。应用之间不能互相 import，在 supabase 应用里按同一规则写一份纯函数并单测，US-231 的操作历史面板共用它。
- e2e 锚点：`sync-pull`、`sync-push`、`sync-pullable-count`、`sync-pushable-count`、`sync-result`、`sync-center-toggle`、`sync-center`；被拒清单沿用 `sync-rejections-panel`，挪进同步中心。读屏名改成中文「拉取」「推送」，`remote-sync.spec.ts` 里按 `Pull` / `Push` 找按钮的写法随之改。
- 顶栏原先在本地模式下悬浮（`header-floating`，没有身份信息时不占一行）；有了同步组与 US-231 的编辑组之后，「顶栏有内容就占一行」，只剩菜单按钮时才悬浮。

## 实现文件

- `apps/dev-rxdb-supabase/src/app/app-header.ts` — 顶栏同步组与同步中心开关
- `apps/dev-rxdb-supabase/src/app/sync-commands.ts`（新）— 根级推拉命令、进行中、最近一次结果与轮次
- `apps/dev-rxdb-supabase/src/app/sync-center.ts`（新）— 同步中心视图；阶段 B 加待推送清单
- `apps/dev-rxdb-supabase/src/app/sync-rejections-panel.ts` — 挪进同步中心，去掉 Todo 页的边距
- `apps/dev-rxdb-supabase/src/app/todo/todo.page.ts`、`todo.page.html`、`catalog/catalog-synced-panel.ts`、`catalog/catalog-local-writes.ts`、`orders/orders.page.ts` — 移除页面内的推拉与被拒清单
- `apps/dev-rxdb-supabase-e2e/src/*.spec.ts` — 推拉改走顶栏
- `apps/dev-rxdb-supabase/README.md` — 演示步骤

## References

- 整体方案与交付顺序：[epic-016](../../epics/epic-016-local-change-workbench.md)
- 参考形态（工具栏与 Changes 列表，不搬提交语义）：[working-tree.page.html](../../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.page.html)
- [US-034 推送后锁定撤销](../core/US-034-bucketed-entity-local-writes.md)、[US-218 被拒清单（AC#16）](US-218-supabase-rls-push-integrity.md)、[US-225 访客不进日志协议](US-225-supabase-sync-protocol-access-baseline.md)、[US-227 订单演示](US-227-supabase-relational-sync-demo.md)
