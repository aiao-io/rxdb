---
id: RV-083
title: 看板 v1 收尾清单：US-539 阶段 A 缺口与交互约定未落码项
status: Open # Open / Resolved
created: 2026-10-22
updated: 2026-10-22
pr: # 修复 PR 链接，Resolved 时填
---

# Review：看板 v1 收尾清单

对 `claude/xenodochial-leakey-5a7c4d` 分支看板功能对照 GitHub Projects 交互与
[US-539](../stories/domain/US-539-board-tri-framework-ui.md)「交互约定」表的一次差距评审。
全部为补缺口项，不扩产品范围；逐条解决后整份删除（工作流见
[reviews README](README.md#工作流)）。档 2 的 GitHub Projects 风格增强不在此清单，
见 [board-v2-github-projects-style](../domain-research/board-v2-github-projects-style.md)。

## 问题

### P1：e2e 缺口（US-539 阶段 A 三条 ⚠️）

1. **AC#9 拖列改序的鼠标半边未做**。键盘前移 / 后移已验；视图有拖列实现（`board-view.tsx`
   列头整头 draggable），缺 Playwright 真实拖拽用例。证据：US-539 验收注记。
2. **AC#10 标签创建 / 改名 / 改色 / 删除的 e2e 未做**。服务层已验
   （`packages/rxdb-plugin-board/src/label-service.ts`），三端 spec 无对应用例。
   证据：US-539 验收注记。
3. **AC#12 / #13 截止日展示与错误状态的分支 e2e 未做**。截止日「已逾期 / 今天到期 /
   纯日期」三态、跨午夜刷新、首次加载 / 读失败重试、保存中与保存失败的分支用例均缺。
   证据：US-539 验收注记。

### P1：三端宿主验收缺口（AC#4 / #5）

4. **AC#4 三端宿主无备份恢复入口**。启动页三入口（新建空看板 / 装载演示数据 / 从备份恢复）
   与工具菜单只在独立 demo（`apps/dev-rxdb-board`）落地，三端宿主
   （`apps/dev-rxdb-{angular,react,vue}` 看板页）没有恢复入口。证据：US-539 验收注记
   （AC#4 ⚠️）与 US-537 技术笔记（「三端宿主的恢复入口……三端 demo 待补」）。
5. **AC#5 恢复中写门禁仅服务层与独立 demo 验收**。三端宿主没有恢复入口，自然未验
   「恢复中暂停写入、浏览可用、失败后解除」的门禁状态与反馈。证据：US-539 验收注记
   （AC#5 ⚠️）。领域写入口复核门禁已由服务层守住，此处缺的是三端验收。

### P1：交互约定未落码

6. **无首屏加载态与读取失败重试**。US-539 交互约定「读取」行要求首次加载显示加载态、
   失败显示原因与重试；三端视图（`packages/rxdb-plugin-board-{angular,react,vue}/`
   的 `board-view.html` / `board-view.tsx` / `board-view.vue`）均未见加载 / 失败分支结构。
   这是功能缺口，不只是测试缺口：AC#13 的用例要先落码再补。约定：「读取失败不呈现可写的空板」。
7. **三端视图均无标签改色入口**。三端 `use-board.ts` 均已暴露 `recolorLabel`
   （angular L111 / react L92 / vue L90，actions 接线在 L307 / L278 / L277），但三端视图
   均未接线——列头菜单与标签条只有改名、删除。改色入口缺失三端对称，补齐时保持对称。
8. **卡片无独立拖动手柄**。US-539 交互约定「卡片」行要求「拖动手柄与打开详情有独立可
   访问名称」；当前整卡 draggable、未见手柄元素，按约定核对补齐或调整可访问结构。

### P2：US-540 阶段 B 的 demo 用例未落

9. `apps/dev-rxdb-board-e2e/src/board-closed-loop.spec.ts` 只有阶段 A 闭环 6 条
   （L48 / L93 / L132 / L156 / L178 / L212）；多板搜索隔离与升级重开的 demo 侧用例
   （US-540 阶段 B 表内 ⬜）未落。

### P2：页面小修（可选）

10. 跨列拖拽无过渡动画：落点反馈是静态 box-shadow 插入线（`board-view.css` L254-278），
    卡片落位瞬间跳变。
11. 无 `?` 快捷键面板；F2 内联编辑未实现。US-539 约定允许「编辑标题」按钮路径替代 F2
    （已满足），F2 与快捷键面板属对齐 GitHub Projects 键盘体系的增强项，a11y 加分。

### P0：适配器缺陷（单独排期，不阻塞看板 v1 关闭）

12. **sqlite-wasm idb vfs 干净关闭后重连丢已提交行**。证据：`board-upgrade.browser.spec.ts`
    两条 `it.skip` 与 `TODO(SQLC-待开)`（L39、L104-107）。表结构在、行全丢；挡 US-540
    升级重开验收的「干净断开（disconnect）后重连」路径，页面重载路径（demo 常规重开）
    不受影响（spec L106 注明）。属适配器包缺陷，另行跟踪；AC#13 的验收路径口径
    （重载 vs 干净断开）需在 US-540 注记写清后与本条对齐。

## 根因

阶段 A 按「领域半边 + e2e 半边」分批交付：移动、搜索、备份等主流程先闭环，交互状态类约定
（加载 / 失败态、改色入口、拖动手柄）未在阶段 A 验收中逐条对表，分支用例后置。

## 修复方案

1. 三端 e2e 补 AC#9 鼠标拖列、AC#10 标签 CRUD 用例（真实拖拽沿用现有 board.spec 手法）。
2. 三端视图补首屏加载态与读取失败重试（约定表「读取」行），再补 AC#12 / #13 分支用例
   （截止日三态、跨午夜、保存中 / 保存失败）。
3. 列头菜单或标签条加改色入口（三端对称，消费现成 `recolorLabel`），补 e2e。
4. 卡片补独立拖动手柄（独立可访问名称），或按约定调整可访问结构。
5. `apps/dev-rxdb-board-e2e` 补 US-540 阶段 B 的 demo 用例（多板搜索隔离、升级重开）。
6. 可选：跨列过渡动画、`?` 快捷键面板、F2 内联编辑。
7. 适配器缺陷另立跟踪（`TODO(SQLC-待开)` 已登记），修法与回归在适配器包内完成。

## 解决记录

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
