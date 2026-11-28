---
id: US-230
title: dev-rxdb-supabase 顶栏统一推送与拉取：页面登记要哪些按钮，待拉数准确，推之前看得见会推什么
status: In Review
priority: Medium
epic: epic-016-local-change-workbench
created: 2026-11-26
updated: 2026-11-27
tags: [adapter, supabase, sync, demo, ux, e2e]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 阶段 A 只动 dev-rxdb-supabase 与它的 e2e；阶段 B 以 US-233、阶段 C 以 US-317 为前置
- [x] Negotiable (可协商): 顶栏的视觉细节、同步中心的分区顺序留待实现时定；登记方式与推拉作用域已定
- [x] Valuable (有价值): 三页各放一组推拉控件、背后是同一个整机方法；推送后一刷新，拉取徽标冒出一个拉了也没变化的大数
- [x] Estimable (可估算): 页面登记服务 + 顶栏同步组 + 同步中心视图 + 三页移除控件 + 四个远端 e2e 改锚点
- [ ] Small (小): 三个阶段各一个 PR，B、C 各等一个前置
- [x] Testable (可测试): 组件单测 + 远端 e2e（两个浏览器上下文）
-->

# 用户故事：顶栏统一推送与拉取

## 作为/我想要/以便

**作为** 在 dev-rxdb-supabase 里评估 local-first 同步的开发者
**我想要** 推送、拉取只在顶栏出现一次，数字准确，并能打开一个同步中心看清待推待拉的都是哪些实体、这次会推哪些修改、每条改了什么
**以便** 换一页不用重新找同步按钮，也不会以为某一页的「推送」只推这一页、某一页的「拉取」只拉这一页

## 背景

三页原先各放一组同步控件，形状各不相同：Todo 页的拉取、推送是整机的；商品页的「同步」只拉商品一个仓库，「推送」却是整机的；
订单页单独一张同步卡片，「待拉 N」「待推 N」常显在按钮外面。推送与拉取都作用于整个本地库，范围只靠文案解释——dev 栈上在订单页、
商品页各新建一条，到 Todo 页点「推送」，两条一起推上去。被拒清单三页各挂一份，结果反馈三种写法，待推数只有数字、没有清单。

推上去至少一条时，[`HistoryManager`](../../../packages/rxdb-plugin-history/src/HistoryManager.ts) 的 `captureUndoHistory(branchId)`
把**整条分支**的撤销会话置为 `cleared`，不是只清推了的实体，所以推拉不按页拆，统一放进顶栏。待拉数不准（推完一刷新，徽标冒出一个
拉了也没变化的大数）的根因与修法见 [US-233](US-233-supabase-pullable-count-accuracy.md)；待推送清单的口径见
[US-317](../collaboration/US-317-pushable-histories.md)。

## 入口设计：页面登记，顶栏渲染

- 一个根级服务（暂名 `PageWorkbench`）：页面进入时登记自己要哪几个按钮、每个按钮的命令与状态，离开时自动注销；顶栏只按当前登记渲染，没登记的按钮不显示（首页什么都不登记）。
- 一个命令的形状：执行（`run()`）、计数、进行中、不可用原因，后三者是 signal，由页面按自己的状态更新（如商品页对访客给出「访客只读」）。顶栏里没有任何按页面判断的分支。
- 撤销、重做由页面登记本页作用域的命令（[US-231](US-231-supabase-unified-undo-history.md)）；推送、拉取三页都登记同一组整机命令（根级 `SyncCommands`），不各写一份。
- 推拉不做成按页的原因（实测）：推上去至少一条时，[`HistoryManager`](../../../packages/rxdb-plugin-history/src/HistoryManager.ts) 的 `captureUndoHistory(branchId)` 把**整条分支**的撤销会话置为 `cleared`，不是只清推了的实体。只推本页，别的页还没推的修改也会一起失去撤销；按页的待拉数要逐仓库向远端查，US-233 修好之前也不准。

## 交付阶段

| 阶段 | 内容                                                                                                                         | 前置                                                                                                                             | 状态 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A    | 页面登记服务与顶栏同步组；同步中心的状态、最近一次结果、被拒清单与按实体分列的待推待拉；三页移除各自的推拉控件；e2e 改走顶栏 | 无                                                                                                                               | ✅   |
| B    | 待拉数准确：推送后刷新不把自己推的算进去，按区同步的实体按真实条数                                                           | [US-233](US-233-supabase-pullable-count-accuracy.md)                                                                             | ✅   |
| C    | 同步中心的「待推送」清单与字段级改前改后；操作历史里还在待推送集合中的条目带 ↑ 标记                                          | [US-317](../collaboration/US-317-pushable-histories.md)；[US-231](US-231-supabase-unified-undo-history.md) 阶段 A 的操作历史面板 | ✅   |

三个阶段都是当前承诺；前置落地之前，本故事不关闭。

## 范围边界

### In Scope

- 页面登记服务：登记、注销、顶栏按登记渲染；同一时刻只有当前页面的登记生效。
- 顶栏同步组：「拉取」调 `syncManager.pull({ fetchAll: true })`，「推送」调 `syncManager.push()`；按钮上是待拉 ↓M、待推 ↑N（`pullableCount$` / `pushableCount$`），并标明「整机」；进行中显示进度、两个按钮都不可点；不可用时悬停与读屏都能读到原因。
- 轮次计数：顶栏同步组带 `data-sync-round`，每轮推拉结束（成功或失败）加 1，取代 `catalog-sync`、`orders-sync` 上的 `data-sync-count`，e2e 的等待写法不变。
- 每轮结果弹一条消息（toast，右下角，盖在页面与两侧面板之上）：拉到多少、落库多少、推上去多少、被拒多少；有失败仓库时写出仓库与原因；推上去至少一条时写明「推送前的修改不能再撤销」（与 US-034 一致）。成功的几秒后自己消失，有被拒的（警告）与失败的（错误）留到用户关掉；最近一轮的结果另在同步中心的「最近一次」里。
- 同步中心（右侧面板的一个视图，与 US-231、US-232 共用面板壳，同一时刻只开一个）：当前身份与本地库、当前分支（只读）、在线状态、待推待拉数、按实体分列的待推待拉、最近一次结果、被拒清单；有被拒时顶栏开关上带标记。
- 会话已在别的标签页换成另一个身份（`RxDBIdentityMismatchError`）时，错误消息上给「重新加载」，替代商品面板里原有的那颗按钮。
- 三页移除推拉控件与各自的被拒清单；页面只留本页语境的说明：商品同步规则下那句「改了规则之后点「同步」」改为指向顶栏「拉取」，订单页保留 [`describeDependencyRejections`](../../../apps/dev-rxdb-supabase/src/app/orders/orders-interactions.ts) 给出的「它的客户已不在远端」说明。
- 本地模式（没有 Supabase 配置）顶栏不出现同步组。
- e2e：remote-sync、catalog-sync、catalog-local-writes、orders-sync 的推拉一律经顶栏，场景一条不删。
- README 的演示步骤按新入口改写。
- 阶段 B：接上 US-233 修好的计数，补真栈用例。
- 阶段 C：「待推送」按页面（实体）分组、一个事务一行，展开看逐字段的改之前与改之后；清单条数等于顶栏 ↑N。

### Out of Scope

- 按页推送、拉取（页面登记只推本页、只拉本页的命令）：解锁条件是历史插件改成按仓库清撤销栈（推了哪些实体只清哪些）、待拉数按仓库准确（US-233）；满足后另开编号。
- 「检查远端」（GitHub Desktop 的 Fetch origin）：待拉数的不准由 US-233 在根上修，修完之后没有手动重算的需要。
- 一颗「同步」主按钮（`syncManager.sync()` 先拉后推）：演示要分别展示推和拉，两颗显式按钮更好讲。
- 待拉取的明细：远端只给计数。
- 把侧栏的分支选择器挪进顶栏：`BranchManager` 不动，同步中心只读显示当前分支。
- 自动同步。

## 验收标准

### 阶段 A

| #   | 前置条件                                                 | 操作                            | 预期结果                                                                                                                         | 状态 |
| --- | -------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 远端模式，Alice                                          | 依次打开 Todo、商品、订单、首页 | Todo、商品、订单三页顶栏有「拉取」「推送」与同步中心开关，完全相同；首页没有；页面内容区没有拉取、推送、同步按钮与「被拒的推送」 | ✅   |
| 2   | Alice 在 Todo 页新建一条 Todo，在订单页新建一位客户      | 在商品页点顶栏「推送」          | 推送前 ↑ 是 2，推送后数字消失；另一个浏览器的 Bob 拉取后，Todo 页与订单页都能看到这两条                                          | ✅   |
| 3   | 访客，同步规则只关注数码                                 | 点顶栏「拉取」                  | 与原「同步」同效：关注分类的公开商品落进本机，未关注的不进；没有权限错误                                                         | ✅   |
| 4   | 访客关注了「家居」；Alice 在模拟服务端把一件公开商品收回 | 访客点「拉取」                  | 新匹配的行补快照，收回的那件从本机消失（US-033 原有的分区同步 e2e 改走顶栏后照样通过）                                           | ✅   |
| 5   | 本地模式（没有 Supabase 配置）                           | 打开 Todo 页                    | 顶栏没有同步组，页面里也没有残留的推拉按钮                                                                                       | ✅   |
| 6   | Alice 本机没有待推送的修改                               | 看「推送」                      | 不可点，悬停与读屏都能读到「没有待推送的修改」                                                                                   | ✅   |
| 7   | 任一已连接的身份                                         | 点「拉取」或「推送」            | 进行中两颗按钮都不可点并显示进度；结束后 `data-sync-round` 加 1，弹出的消息写明条数；失败时写出失败的仓库与原因                  | ✅   |
| 8   | Bob 已在远端删了一条 Todo，Alice 本机改了它              | Alice 推送                      | 消息写「被拒 1 条」并留到关掉，同步中心开关上出现标记；打开同步中心看到这条被拒：实体、操作、原因「已被删除」与代码              | ✅   |
| 9   | Bob 删了一位客户并推送；Alice 没拉取就给他新建订单并推送 | 看订单页                        | 订单页仍指出「它的客户「X」已不在远端」（`orders-dependency-notices`），被拒的订单列在同步中心                                   | ✅   |
| 10  | 另一个标签页换了身份                                     | 本页点「拉取」                  | 被身份守卫拦下，错误消息写明身份不匹配并给「重新加载」，本地数据不动                                                             | ✅   |
| 11  | Alice 在订单页新建一位客户、在商品页改了一件商品，未推送 | 在 Todo 页打开同步中心          | 按实体列出待推：客户与商品各一条，Todo 没有；读的人一眼看出推送会带上别的页的修改                                                | ✅   |
| 12  | 375px 宽的窄屏                                           | 打开三页，再打开同步中心        | 顶栏同步组只剩图标与数字，页面不出现横向滚动；同步中心是盖住页面的抽屉，左边留一条遮罩；Esc 与点遮罩都能关，关掉后焦点回到开关   | ✅   |
| 13  | 按 README 起好本地栈                                     | 跑远端 e2e                      | remote-sync、catalog-sync、catalog-local-writes、orders-sync 的场景一条不少，推拉全部经顶栏的锚点                                | ✅   |

### 阶段 B

| #   | 前置条件                                             | 操作                       | 预期结果                                                  | 状态 |
| --- | ---------------------------------------------------- | -------------------------- | --------------------------------------------------------- | ---- |
| 14  | Alice 在订单页、商品页各新建一条并推送；没有别人在写 | 刷新页面                   | 顶栏 ↓ 为 0，同步中心没有待拉的实体                       | ✅   |
| 15  | Bob 在 Alice 所在的租户区里改了一件商品              | Alice 刷新页面，再拉取     | 刷新后 ↓ 为 1、同步中心写商品 1；拉取后归 0，改动落进本机 | ✅   |
| 16  | Bob 推送了一条 Todo                                  | Alice 不刷新与刷新各看一次 | 两次都是 ↓1                                               | ✅   |

### 阶段 C

| #   | 前置条件                                | 操作                   | 预期结果                                                     | 状态 |
| --- | --------------------------------------- | ---------------------- | ------------------------------------------------------------ | ---- |
| 17  | Alice 在 Todo、商品、订单三页各改了一些 | 打开同步中心「待推送」 | 按页面分组、一个事务一行；同一时刻的行数之和等于顶栏 ↑N      | ✅   |
| 18  | 清单里有一条修改、一条新建、一条删除    | 逐条展开               | 修改逐字段显示改之前与改之后；新建只有改之后；删除只有改之前 | ✅   |
| 19  | 访客在本机建了几条 Todo（只存本机）     | 打开「待推送」         | 一条都不出现，与访客的 ↑N 为 0 一致                          | ✅   |
| 20  | Alice 有三条待推送                      | 撤销一条，再推送       | 撤销掉的那条先离开清单；推送成功后清单清空，与 ↑N 同时归零   | ✅   |
| 21  | 操作历史面板开着（US-231 阶段 A）       | 写入一条，再推送       | 写入后这条带 ↑ 标记；推送成功后标记消失                      | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据（单测：`pnpm nx test dev-rxdb-supabase`；远端 e2e：按 README 起栈后 `pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`，两轮见 e2e 的 README）：

- AC#1、#6：`apps/dev-rxdb-supabase-e2e/src/workbench.spec.ts` 的「三页的顶栏一样」；`apps/dev-rxdb-supabase/src/app/app-header.spec.ts`、`page-workbench.spec.ts`。
- AC#2、#17、#20、#21：`workbench.spec.ts` 的「在商品页推送，Todo 与订单页没推的修改一起推上去」；清单分组与改前改后另由 `sync-center.spec.ts`、`operation-history-panel.spec.ts` 覆盖。
- AC#3、#4：`apps/dev-rxdb-supabase-e2e/src/catalog-sync.spec.ts` 的分区同步用例（拉取经顶栏）。
- AC#5：`apps/dev-rxdb-supabase-e2e/src/home.spec.ts` 的本地模式用例（`pnpm nx run dev-rxdb-supabase-e2e:e2e`）；`app-header.spec.ts`。
- AC#7：`sync-commands.spec.ts`（进行中两颗都不可点、轮次、结果与消息）、`sync-outcome.spec.ts`（条数与失败仓库）、`toasts.spec.ts`；e2e 全部经 `support/workbench.ts` 按 `data-sync-round` 等一轮结束、按 `data-source` 找这一轮的消息。
- AC#8：`apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts` 的 gone 被拒用例。
- AC#9：`apps/dev-rxdb-supabase-e2e/src/orders-sync.spec.ts` 的「AC#1～#4」用例。
- AC#10：`remote-sync.spec.ts` 的「another tab switched identity」用例；`sync-commands.spec.ts`、`toast-outlet.spec.ts`。
- AC#11：`workbench.spec.ts` 的「撤销只撤本页……同步中心按实体列出待推」。
- AC#12：`workbench.spec.ts` 的 375px 用例；`side-panel.spec.ts`。
- AC#13：`e2e-remote` 全部通过。
- AC#14～#16：`apps/dev-rxdb-supabase-e2e/src/sync-counts.spec.ts`（第二轮单独串行跑）；计数口径的单测见 US-233。
- AC#18：`field-diff.spec.ts`（新建只有改之后、删除只有改之前、修改取并集）、`sync-center.spec.ts`。
- AC#19：`orders-sync.spec.ts` 的访客用例（访客的 Todo 与订单同为只存本机的实体，见 `demo-sync-overrides.ts` 的 `VISITOR_LOCAL_ONLY_ENTITIES`）。

## 技术笔记

- 页面登记：`PageWorkbench.register(registration)` 在页面的注入上下文里调用，用 `DestroyRef` 注销；顶栏读当前登记的 signal，四个按钮按固定顺序排，缺哪个就不渲染哪个。快捷键（US-231）也只调登记的撤销、重做。
- 推拉命令、进行中、最近一次结果与轮次放根级 `SyncCommands`，页面登记的是它的命令，顶栏与同步中心读它的状态；页面不再持有 `$syncing`、`$syncCount`。在线状态与被拒读 [`useSyncState`](../../../packages/rxdb-angular/src/use-sync-state.ts)。
- 拉取带 `fetchAll: true`：全局 [`pull()`](../../../packages/rxdb-plugin-sync/src/pull.ts) 本来就覆盖按条件与按区同步的仓库（`pullFilterRepositories`、`pullBucketedRepositories`），带上 `fetchAll` 才与原商品「同步」的一次拉到底等价。Todo 与订单原先不带，改了之后一次拉完所有页，用户不用连点。
- 访客的全局拉取（dev 栈实测）：访客的 Todo 与订单解析为 `local`，不推不拉；批量日志拉取对 anon 发出的 `rxdb_change` 查询只涉及在线浏览实体与系统实体，返回 200；随后按区拉商品。取消关注「家居」后整块移除，重新关注后拉到它的公开商品、成本显示「无权读取」，没有失败仓库，待拉归 0。复验：以访客打开商品页，经 Angular 调试接口（`ng.ɵgetInjectorProviders`）取到 `RxDB` 实例，调 `syncManager.pull({ fetchAll: true })`，对照网络请求与本机商品；AC#3、#4 的真栈用例是正式入口。
- 「推送」对访客天然不可点：访客的 Todo 与订单只存本地、商品写入口关闭，`pushableCount$` 为 0，不需要单独的身份判断。
- 推上去至少一条时 [`SyncManager.push()`](../../../packages/rxdb-plugin-sync/src/SyncManager.ts) 调 `clearSyncedHistory()`，清的是整条分支的撤销栈，消息据此写「推送前的修改不能再撤销」。
- 按实体分列用 `syncManager.getAllRepositorySyncStatus({ hasPendingChanges: true })`，在 ↑ / ↓ 变化与每轮推拉结束时重算。它按仓库各数各的：跨实体的事务（如带证件新建客户）在每个实体下各算一条，合计可能大于 ↑N——同步中心写明这一点，阶段 C 的清单才是按事务的准数。
- 页面写入不再因推送而禁用：`CatalogLocalWrites.$busy` 原先把推送也算进去；推送在飞时的撤销由在飞认领（`buildLastPushedMap`）兜住，不需要锁写入口。
- 阶段 C 的清单只消费 US-317 的流。字段级改前改后的取值规则与 working-tree 页的 [`buildFieldDiff`](../../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.diff-format.ts) 同口径：新建只有新值、删除只有旧值、修改取两侧字段的并集。应用之间不能互相 import，在 supabase 应用里按同一规则写一份纯函数并单测，US-231 的操作历史面板共用它。
- e2e 锚点：`sync-pull`、`sync-push`、`sync-pullable-count`、`sync-pushable-count`、`sync-center-toggle`、`sync-center`、`workbench-sync-group`（`data-sync-round`）、`side-panel`（`data-view`）；每轮的消息是 `toast`，`data-source` 为 `sync-round-<轮次>`、`data-kind` 为轻重；被拒清单沿用 `sync-rejections-panel`，挪进同步中心。读屏名是中文「拉取」「推送」。
- 消息（`toasts.ts` 的 `Toasts`、`toast-outlet.ts`）只放刚做完的事：推拉结果、撤销重做失败、写入成功、切换身份失败。播报区域一直挂着，错误另带 `role="alert"`。会一直成立的状态（本地模式、访客、会话在别处换了身份、订单的依赖说明）留在页面里；表单与编辑框里的失败原因也留在原处，原生 `<dialog>` 的模态在浏览器顶层之上，消息盖不过它。
- 不能点的按钮用 `aria-disabled` 而不是 `disabled`，原因写在 `title` 里：悬停与读屏都读得到，Playwright 的 `toBeDisabled()` 也认 `aria-disabled`。
- 身份守卫拦下时，消息不转述守卫的英文报错，写「身份不匹配……重新加载打开新身份的库」（`sync-commands.ts` 的 `IDENTITY_MISMATCH_REASON`）。
- 顶栏右侧只留切换身份的下拉框：身份名与说明不另占一行，放在下拉框的悬停提示与读屏描述（`aria-describedby`）里，同步中心也写着。
- 同步中心按实体分列的数字还在查时写「正在查」、查失败时写原因，不先说「没有待推、待拉的实体」。
- 待拉数的绝对值断言（AC#14～#16）放在 `sync-counts.spec.ts`，`e2e-remote` 的第二轮单独串行跑：↓N 是整机对所有仓库的计数，Todo 与订单又是登录身份共享的，与其它用例并行时数字会被别的写入打乱。
- 顶栏原先在本地模式下悬浮（`header-floating`，没有身份信息时不占一行）；有了登记的按钮之后，「顶栏有内容就占一行」，只剩菜单按钮时才悬浮。

## 实现文件

- `apps/dev-rxdb-supabase/src/app/page-workbench.ts`（新）— 页面登记服务（与 US-231 共用，先落地的一方建）
- `apps/dev-rxdb-supabase/src/app/app-header.ts` — 按登记渲染同步组与同步中心开关
- `apps/dev-rxdb-supabase/src/app/sync-commands.ts`（新）— 根级推拉命令、进行中、最近一次结果与轮次
- `apps/dev-rxdb-supabase/src/app/sync-center.ts`（新）— 同步中心视图；阶段 C 加待推送清单
- `apps/dev-rxdb-supabase/src/app/sync-outcome.ts`（新）— 一轮推拉的说法（条数、被拒、失败仓库）
- `apps/dev-rxdb-supabase/src/app/toasts.ts`、`toast-outlet.ts`（新）— 操作结果的消息与它的槽位
- `apps/dev-rxdb-supabase/src/app/side-panel.ts`（新）— 右侧面板壳（与 US-231、US-232 共用）
- `apps/dev-rxdb-supabase/src/app/field-diff.ts`、`change-diff.ts`、`history-describe.ts`、`entity-labels.ts`（新）— 改前改后、历史项的说法与实体的中文叫法（与 US-231 共用）
- `apps/dev-rxdb-supabase/src/app/sync-rejections-panel.ts` — 挪进同步中心，去掉 Todo 页的边距
- `apps/dev-rxdb-supabase/src/app/todo/todo.page.ts`、`todo.page.html`、`catalog/catalog-synced-panel.ts`、`catalog/catalog-local-writes.ts`、`orders/orders.page.ts` — 移除页面内的推拉与被拒清单，改为登记
- `apps/dev-rxdb-supabase-e2e/src/support/workbench.ts`（新）、`workbench.spec.ts`（新）、`sync-counts.spec.ts`（新）、其余 `*.spec.ts` — 推拉改走顶栏
- `apps/dev-rxdb-supabase-e2e/project.json` — `e2e-remote` 分两轮：并行的场景用例，再单独串行跑计数用例
- `apps/dev-rxdb-supabase/README.md`、`apps/dev-rxdb-supabase-e2e/README.md` — 演示步骤与 e2e 的跑法

## References

- 整体方案与交付顺序：[epic-016](../../epics/epic-016-local-change-workbench.md)
- 参考形态（工具栏与 Changes 列表，不搬提交语义）：[working-tree.page.html](../../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.page.html)
- [US-034 推送后锁定撤销](../core/US-034-bucketed-entity-local-writes.md)、[US-218 被拒清单（AC#16）](US-218-supabase-rls-push-integrity.md)、[US-225 访客不进日志协议](US-225-supabase-sync-protocol-access-baseline.md)、[US-227 订单演示](US-227-supabase-relational-sync-demo.md)、[US-233 待拉数准确](US-233-supabase-pullable-count-accuracy.md)
