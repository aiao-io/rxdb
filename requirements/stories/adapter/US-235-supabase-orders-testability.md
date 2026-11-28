---
id: US-235
title: dev-rxdb-supabase 订单页一个窗口就能测：页面上写明怎么测，远端数据看得见，没推的行标出来
status: Done
priority: Medium
epic: epic-016-local-change-workbench
created: 2026-11-27
updated: 2026-11-27
tags: [adapter, supabase, demo, ux, e2e]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动订单页、它的单测与远端 e2e；用到的 RxDB 能力（待推送清单 US-317、关联行 id US-228）都已落地
- [x] Negotiable (可协商): 布局、文案与场景划分留待实现时定；单窗口验证与不新增 SQL 已定
- [x] Valuable (有价值): 订单页只有表单和一段说明，测一步就要再开一个浏览器登录 Bob，推上去没有、远端级联删了什么都看不见
- [x] Estimable (可估算): 场景指引 + 远端数据面板 + 未推送标记 + 示例数据 + 嵌套布局；一个 PR
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 组件单测 + 远端 e2e
-->

# 用户故事：订单页一个窗口就能测

## 作为/我想要/以便

**作为** 打开订单页、想确认关系数据推拉同步的开发者
**我想要** 页面直接告诉我按什么步骤测、每一步应该看到什么，推送之后在同一个窗口里看到远端落下了什么，还能模拟别人改远端
**以便** 不读 README、不必另开浏览器登录另一个身份，也能把一对多、级联删除、外键被拒、多对多与一对一的推拉走一遍

## 背景

[US-227](US-227-supabase-relational-sync-demo.md) 交付的订单页是三张平铺的卡片（客户、分类、订单）加一段说明。测试步骤只写在 README 里；每一步的结果——推上去没有、远端级联删了什么、别人删了客户会怎样——都要另开一个浏览器登录 Bob 才看得到。页面上本机新建、还没推送的行与已同步的行长得一样；订单与客户之间只靠一行「客户：X」文字关联，看不出整棵树；订单项的数量、单价输入框没有提示，演示数据只能随手乱填。

## 范围边界

### In Scope

- **怎么测**：页面上按场景列出步骤与每一步的预期：推送、级联删除、拉取、外键被拒、多对多、撤销、两人并发（唯一要两个浏览器的）、访客。页签切换，能收起，收没收起记在本机浏览器里（切换身份会重新加载页面）。
- **远端数据**：页头开关在右侧面板（[US-232](US-232-supabase-catalog-server-drawer.md) 的面板壳）直接读远端六张表，按客户 → 证件 / 订单 → 订单项 → 分类嵌套展示，远端有、本机还没有的行标「本机没有」；每轮推拉结束自动重读，也能手动刷新。
- **模拟别人改远端**：面板里「在远端删除客户」「在远端删除订单」「模拟别人新建一组」以当前身份直接写业务表；同步触发器把它们连同外键级联删掉的行记进日志，日志不带本机 clientId，拉取时像别人推上来的。
- **未推送标记**：按待推送清单（[US-317](../collaboration/US-317-pushable-histories.md)）给每一行标「未推送」，新建与修改各有说法；刚挂上、还没推送的分类按关联行 id（[US-228](US-228-supabase-many-to-many-sync.md)）标黄。只在连着远端时订阅。
- **生成示例数据**：一次 `saveMany` 写下带证件的客户、他的一张订单与两条订单项（同一个事务，一次撤销、一次推送）。
- **嵌套布局**：客户卡片里是证件与订单，订单下面是订单项与分类；新建订单的表单在客户卡片里（不再选客户），写入失败的原因显示在这位客户的卡片里；新建的客户排在最上面；订单项的数量默认 1，数量、单价带可见标签。
- **访客**：访客提示里加「切换成 Alice」。

### Out of Scope

- 远端拒绝与冲突的新展示：被拒清单仍在同步中心，订单页上方的依赖提示不变。
- 在远端模拟「挂上分类」：要按 US-228 的公式派生关联行 id，两人并发挂同一个分类留给两个浏览器。
- 新增 SQL、RPC 或适配器能力；React / Vue 演示。

## 验收标准

| #   | 前置条件                                  | 操作                                               | 预期结果                                                                                         | 状态 |
| --- | ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 1   | Alice 打开订单页                          | 看页面                                             | 「怎么测」展开着，页签是八个场景，选中的场景列出步骤与预期；左右方向键换场景                     | ✅   |
| 2   | 同上                                      | 点「生成示例数据」                                 | 本机多出带证件的客户、他的订单与两条订单项，同一个事务；五行都标「未推送」                       | ✅   |
| 3   | AC#2 之后，打开「远端数据」               | 点顶栏「推送」                                     | 推上去 5 条、不被拒；「未推送」消失；面板自动重读，远端是同样的一组，证件号一致                  | ✅   |
| 4   | AC#3 之后                                 | 在面板里删这位客户，本机给他新建订单并推送，再拉取 | 推送被拒 1 条，页面上方指出是哪位客户，订单从本机撤掉；拉取之后客户也从本机消失                  | ✅   |
| 5   | 面板开着                                  | 点「模拟别人新建一组」，再拉取                     | 远端多出一组、客户订单订单项标「本机没有」；拉取后标记消失，本机这一组嵌套对得上、没有「未推送」 | ✅   |
| 6   | AC#5 之后                                 | 在面板里删这张订单，再拉取                         | 本机的订单与订单项一起消失，客户还在                                                             | ✅   |
| 7   | 访客                                      | 打开「远端数据」                                   | 只有说明，不读远端、没有按钮                                                                     | ✅   |
| 8   | 纯本地模式（没有 Supabase 配置）          | 打开订单页、写几行                                 | 没有「怎么测」、远端数据开关与「未推送」标记                                                     | ✅   |
| 9   | US-227 的场景（两个浏览器）与 US-231 撤销 | 跑 `orders-sync.spec.ts` 原有用例                  | 一条不少；订单建在客户卡片里，「订单在哪位客户的卡片里」代替原来的「客户：X」文字断言            | ✅   |
| 10  | 375px 窄屏                                | 打开订单页、生成示例数据、打开远端数据             | 页面不横向滚动；远端数据是带遮罩的抽屉                                                           | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据（单测：`pnpm nx test dev-rxdb-supabase -- src/app/orders`；远端 e2e：按 README 起栈后
`pnpm nx run dev-rxdb-supabase-e2e:e2e-remote --grep="Orders relational sync"`）：

- AC#1：`orders-scenario-guide.spec.ts`（页签、方向键、收起记住）。
- AC#2～#6：`orders-sync.spec.ts`「US-235 一个窗口测完」，只开 Alice 一个窗口；单测 `orders.page.spec.ts`（生成示例数据、未推送标记、挂上未推送的分类）、`orders-remote-panel.spec.ts`（嵌套展示、本机没有、自动重读、模拟写入与失败）、`orders-remote.spec.ts`（查询与写入顺序）。
- AC#7：`orders-remote-panel.spec.ts`「访客」。
- AC#8：`orders.page.spec.ts`「没连远端」。
- AC#9：`orders-sync.spec.ts` 原有四条用例。
- AC#10：手工核对（Playwright 脚本，375×800，Alice，生成示例数据并新建分类之后）：`html`、`#layout-content`、`#layout-topbar` 的 `scrollWidth` 都等于视口宽，`main` 里没有元素超出视口，远端数据以带遮罩的抽屉打开；`workbench.spec.ts` 的窄屏用例另在空数据下守住订单页不横向滚动。

## 技术笔记

- **为什么单窗口**：Alice 与 Bob 共享全部订单，订单页演示的是外键关系的推拉，不是按身份授权；「别人」的修改只要是远端日志里不带本机 clientId 的写入就行。面板以当前身份直接写业务表走触发器模式：级联删掉的子行各落一条 DELETE 日志（[US-224](US-224-supabase-cascade-delete-change-log.md) 的对照段），拉取时本机跟着删。商品页「模拟服务端变更」是同一个做法。
- **新建一组的写入顺序**：客户与证件互相持有外键、都不是 DEFERRABLE。先写不带证件引用的客户，再写证件，再补客户的证件引用，然后订单、订单项；分几次请求，中途失败时已写的行留在远端，面板刷新后看得到。
- **未推送的口径**：`pushableHistories$` 每次写入都全量重查（US-317 的取舍），只在连着远端时订阅；本地模式下实体没有被覆盖成只存本地，订阅会把本机写入都标成「未推送」，而那时根本没有推送。删除的行本机已经没有，不标；删了什么在同步中心的待推送里看。
- **示例数据的 id**：`orderTreeRows` 先定下各行 id、填好外键，本机 `saveMany` 与远端逐表写共用同一份行；名字带四位后缀，多次生成不重名，也认得出哪几行是一组。
- **面板内容的注入**：同 US-232，订单页把面板写在 `<ng-template cdkPortal>` 里，经 `RightPanel.provide('server', …)` 交给右侧槽位；本机全部行的 id 由页面绑定进面板，用来标「本机没有」。

## 实现文件

- `apps/dev-rxdb-supabase/src/app/orders/orders.page.ts` — 嵌套布局、页头的生成示例数据与远端数据开关、未推送标记
- `apps/dev-rxdb-supabase/src/app/orders/orders-scenarios.ts`、`orders-scenario-guide.ts`（新）— 怎么测
- `apps/dev-rxdb-supabase/src/app/orders/orders-remote.ts`、`orders-remote-panel.ts`（新）— 读写远端与面板
- `apps/dev-rxdb-supabase/src/app/orders/unpushed-badge.ts`（新）— 未推送标记
- `apps/dev-rxdb-supabase/src/app/orders/orders-interactions.ts` — `groupBy`、`pendingRows`、`attachmentId`、`orderTreeDraft` / `orderTreeRows`
- `apps/dev-rxdb-supabase-e2e/src/orders-sync.spec.ts` — 嵌套布局的断言、单窗口用例
- `apps/dev-rxdb-supabase/README.md` — 「关系数据」一节改为按页面上的「怎么测」试

## References

- [US-227 关系数据的推拉同步演示](US-227-supabase-relational-sync-demo.md) — 订单页与它的场景
- [US-232 商品「模拟服务端变更」收进右侧抽屉](US-232-supabase-catalog-server-drawer.md) — 面板壳与「模拟服务端」的先例
- [US-317 待推送清单](../collaboration/US-317-pushable-histories.md) — 未推送标记的数据来源
- 整体方案：[epic-016](../../epics/epic-016-local-change-workbench.md)
