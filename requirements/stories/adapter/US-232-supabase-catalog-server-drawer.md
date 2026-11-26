---
id: US-232
title: dev-rxdb-supabase 商品「模拟服务端变更」收进右侧抽屉：主界面先看本机数据，需要时再打开
status: Backlog
priority: Medium
epic: epic-016-local-change-workbench
created: 2026-11-26
updated: 2026-11-26
tags: [adapter, supabase, demo, ux, e2e]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动商品页与它的 e2e；不依赖 US-230 / US-231，先落地时顺手建右侧面板的壳
- [x] Negotiable (可协商): 抽屉宽度、开关的图标与文案留待实现时定；非模态与默认收起已定
- [x] Valuable (有价值): 辅助用的服务端模拟器常驻半个页面，和演示的主角（本机同步的数据）抢位置；窄屏上要滚到最底才找得到
- [x] Estimable (可估算): 商品页单栏 + 抽屉与开关 + 面板壳 + 两个远端 e2e 先开抽屉
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 组件单测 + 远端 e2e
-->

# 用户故事：商品「模拟服务端变更」收进右侧抽屉

## 作为/我想要/以便

**作为** 打开商品目录的开发者
**我想要** 页面先只呈现身份、本机同步的商品与在线浏览，「模拟服务端变更」放进一个按需从右侧打开的抽屉，开着的时候仍能拉取、看到本机怎么变
**以便** 第一眼看到的是演示的主角——按身份同步到本机的数据，服务端模拟器这个辅助工具不和它抢位置

## 现状

1. [`CatalogPage`](../../../apps/dev-rxdb-supabase/src/app/catalog/catalog.page.ts) 在宽屏把页面切成两栏，右栏常驻 [`CatalogServerPanel`](../../../apps/dev-rxdb-supabase/src/app/catalog/catalog-server-panel.ts)：

   ```html
   <div class="grid items-start gap-4 @4xl:grid-cols-2">
     <aside class="min-w-0" aria-label="模拟服务端变更" data-testid="catalog-operations"></aside>
   </div>
   ```

   组件注释给的理由是「改完服务端点「同步」不用上下翻找」。这个理由成立，代价是服务端模拟器和本机数据各占半个页面；窄屏上它排在本机商品与在线浏览之后，要滚到最下面。

2. 访客打开时，右栏只有一段「访客只能读公开数据」的说明（`server-panel-visitor`），照样占满半个页面。
3. 写远端成功后的提示固定写着「去点「同步」看本机数据怎么变」，[US-230](US-230-supabase-header-sync.md) 把「同步」换成顶栏「拉取」之后这句要跟着改。
4. 页面已经用原生 `<dialog>` 做模态：编辑框 [`CatalogItemEditor`](../../../apps/dev-rxdb-supabase/src/app/catalog/catalog-item-editor.ts) 与远端历史 [`CatalogItemHistory`](../../../apps/dev-rxdb-supabase/src/app/catalog/catalog-item-history.ts)。服务端模拟器不适合照这个做法改成模态弹框，理由见技术笔记。

## 范围边界

### In Scope

- 商品页改为单栏，与 [US-231](US-231-supabase-unified-undo-history.md) 的页面骨架同宽；页头的页面动作位放「模拟服务端变更」开关（按钮，带 `aria-expanded` 与 `aria-controls`），默认收起，访客也有这个开关。
- 抽屉从右侧打开，内容就是现有的 `CatalogServerPanel`：成员关系、租户商品列表、编辑、可见范围、删除、新增，行为不变。
- 宽屏（≥ 768px）非模态：抽屉占右侧一栏，页面与顶栏照常可操作——能点拉取、能看着本机商品变化；窄屏是带遮罩的整屏抽屉。
- 收起：关闭按钮与 Esc；打开时焦点进抽屉标题，收起后回到开关。抽屉里的编辑框照常叠在上面，Esc 先关编辑框、再关抽屉。
- 提示文案：US-230 落地后「去点「同步」…」改为指向顶栏的「拉取」，落地前保持原文。
- 右侧面板壳（标题、关闭、Esc、焦点归还、窄屏遮罩）做成可复用组件，US-230 的同步中心与 US-231 的操作历史直接用；同一时刻只开一个面板的约束由 US-231 验收。
- e2e：catalog-sync 与 catalog-local-writes 里用到服务端模拟器的步骤，先经开关打开抽屉。

### Out of Scope

- 服务端模拟器的功能与它的文案（上面那句提示除外）。
- 跨刷新记住抽屉开没开：演示与 e2e 都从收起开始，行为确定。
- 精简「身份与权限」卡片：保留原样；当前身份与本地库在 US-230 的同步中心里另有一份，是否删这张卡片等 US-230 落地后再评。

## 验收标准

| #   | 前置条件               | 操作                                                                  | 预期结果                                                                                               | 状态 |
| --- | ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---- |
| 1   | Alice 在宽屏打开商品页 | 看页面                                                                | 单栏：身份与权限、本机同步的商品、在线浏览；看不到成员关系与租户商品列表；页头有「模拟服务端变更」开关 | ⬜   |
| 2   | 同上                   | 点开关                                                                | 右侧打开抽屉，内容与原来的右栏相同；开关 `aria-expanded` 为真；焦点在抽屉标题上                        | ⬜   |
| 3   | 抽屉开着               | 在抽屉里把一件公开商品收回为内部，再拉取（US-230 前是页面的「同步」） | 不用关抽屉：本机商品列表随拉取更新，抽屉仍开着                                                         | ⬜   |
| 4   | 抽屉开着               | 点一件商品的「编辑」，按 Esc，再按 Esc                                | 第一次 Esc 关编辑框、抽屉仍开；第二次关抽屉，焦点回到开关                                              | ⬜   |
| 5   | 访客                   | 打开抽屉                                                              | 显示原有的访客说明（`server-panel-visitor`），没有可操作的按钮                                         | ⬜   |
| 6   | 375px 宽的窄屏         | 打开抽屉，点遮罩                                                      | 打开时是带遮罩的整屏抽屉，页面不出现横向滚动；点遮罩收起                                               | ⬜   |
| 7   | 按 README 起好本地栈   | 跑 catalog-sync、catalog-local-writes 远端 e2e                        | 场景一条不少；用到服务端模拟器的步骤先经开关打开抽屉                                                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据（实现时补齐，验证层级与 AC 一致）：

- AC#1、#2、#4、#5：`apps/dev-rxdb-supabase/src/app/catalog/catalog.page.spec.ts`（单栏与开关）、`apps/dev-rxdb-supabase/src/app/side-panel.spec.ts`（新：焦点、Esc 次序）；`pnpm nx test dev-rxdb-supabase`。
- AC#3、#6、#7：`apps/dev-rxdb-supabase-e2e/src/catalog-sync.spec.ts`、`catalog-local-writes.spec.ts`（AC#6 用 375px 视口）；按 README 起栈后 `pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`。

## 技术笔记

- 为什么不用模态弹框：服务端模拟器的用法是「改远端 → 拉取 → 看本机怎么变」。模态会盖住本机列表，还得先关掉才能点拉取，正好丢掉原两栏布局想保住的那一步（改完不用翻找）。宽屏非模态抽屉保住这一步，同时把主界面让给本机数据；窄屏放不下两栏，才退成带遮罩的模态。
- 宽屏不能用 `<dialog>.showModal()`：它让抽屉以外的页面变成惰性，点不了拉取。宽屏用 `show()` 或普通的侧栏元素（`role="complementary"` 加标题），窄屏遮罩态再用 `showModal()` 拿到浏览器的焦点约束与 Esc。
- 抽屉内容的注入：`CatalogRemoteState`、`CatalogLocalWrites` 是 `CatalogPage` 的页面级 providers。抽屉由商品页自己渲染时天然拿得到；改由应用壳的右侧面板槽渲染时用 `TemplatePortal`，它的注入器跟着模板的声明处走，同样拿得到。先落地时选前者即可，面板壳组件两种用法都要支持。
- e2e 加一个 `openServerDrawer(page)` 辅助，在原有用到服务端模拟器的步骤之前调用；`server-item`、「加入星河零售」「退出星河零售」这些锚点不变。

## 实现文件

- `apps/dev-rxdb-supabase/src/app/catalog/catalog.page.ts` — 单栏、页头开关、抽屉
- `apps/dev-rxdb-supabase/src/app/catalog/catalog-server-panel.ts` — 提示文案
- `apps/dev-rxdb-supabase/src/app/side-panel.ts`（新）— 右侧面板壳
- `apps/dev-rxdb-supabase-e2e/src/catalog-sync.spec.ts`、`catalog-local-writes.spec.ts` — 先开抽屉
- `apps/dev-rxdb-supabase/README.md` — 商品一节的「模拟服务端变更」说明

## References

- 整体方案：[epic-016](../../epics/epic-016-local-change-workbench.md)
- [US-033 按授权分区同步](../core/US-033-identity-scoped-read-sync.md)（服务端模拟器演示的是它的 AC#3～#7）、[US-229 远端变更历史](US-229-supabase-change-history.md)
