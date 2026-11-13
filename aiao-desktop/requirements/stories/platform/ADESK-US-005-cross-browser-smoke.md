---
id: ADESK-US-005
title: 跨浏览器与窄屏验收
status: Backlog
priority: Medium
epic: ADESK-EPIC-001
created: 2026-11-13
updated: 2026-11-13
tags: [platform, e2e, cross-browser, responsive]
dependsOn: [ADESK-US-008, ADESK-US-101, ADESK-US-102]
capabilities: []
---

# 用户故事：跨浏览器与窄屏验收

## 作为/我想要/以便

**作为** 在 Safari、Firefox 或小窗口里使用 Aiao Desktop 的人
**我想要** 桌面在这些环境里照常打开、核心流程可用
**以便** 不被限定在 Chrome 上，遇到不支持的能力也有明确的支持边界说明。

## 范围边界

### In Scope

- 冒烟在 WebKit（Playwright 的 Safari 引擎）与 Firefox 上跑正式构建，引擎入口由 [ADESK-US-008](ADESK-US-008-smoke-suite.md) 提供；失败的检查项要么修复，要么按浏览器能力差异明确降级（降级项写入能力矩阵，不静默假绿）。
- 窄屏（390×844）与触屏仿真下的核心交互：菜单栏、Dock、启动台、窗口拖动与缩放可用；打开的窗口不跑出屏幕。窄屏承诺的是最低限度的可用，不做移动端专门设计；如果产品决定不支持窄屏，就改成提示页，并改写 AC#2、#3。
- 按实际验收结果写明浏览器支持矩阵：只在真实验收过的组合上声明支持（产品约定：只在 Chromium 上验证过的行为不写成跨浏览器支持）。Playwright 的 WebKit 不等于 Safari：声明支持 Safari 前要在真机 Safari 上复验一次，复验前只写「WebKit 通过」。
- 高依赖能力按浏览器分档验收：终端（COOP/COEP 与 Vivari）、游戏（WebGL、指针锁定）、集成应用（Orbit iframe 与跨源隔离）在每个档位写明可用性；验收覆盖全部已交付行为，任一行为在非 Chromium 上不可用都写入降级矩阵。

### Out of Scope

- 与 Chrome 逐像素一致：字体、抗锯齿等渲染差异只记录不修。
- iOS Safari 的 PWA 行为、移动端的独立交互设计。
- 视觉回归的像素级对比。

## 验收标准

| #   | 前置条件                                          | 操作                                          | 预期结果                                                         | 状态 |
| --- | ------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- | ---- |
| 1   | 本机或 CI 有 WebKit 与 Firefox 的 Playwright 驱动 | 在两种浏览器上跑 `aiao-desktop-e2e:e2e`       | 全部检查项通过，或降级项在能力矩阵写明原因；没有页面错误         | ⬜   |
| 2   | 任意已验证浏览器                                  | 在 390×844 视口打开桌面                       | 菜单栏与 Dock 不溢出且可操作，打开的窗口不跑出屏幕，没有横向滚动 | ⬜   |
| 3   | 触屏仿真                                          | 用触摸手势点 Dock、打开启动台、拖动窗口标题栏 | 核心流程可用；不可用的手势在能力矩阵明确列出                     | ⬜   |
| 4   | Safari 与 Firefox 的验收完成                      | 更新能力矩阵、README 与验收台账               | 浏览器支持范围写明，只有验收过的组合声明支持                     | ⬜   |
| 5   | 两种浏览器各连跑两轮冒烟                          | 观察两次结果                                  | 没有时序性 flake；出现的 flake 已修复或记录在案                  | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：第 1、2、3、5 条由 `aiao-desktop-e2e:e2e` 的跨浏览器参数化运行覆盖（外网请求同样全部拦截）；第 4 条由能力矩阵与验收台账的更新体现，随需求门禁检查链接与格式。终端与游戏在非 Chromium 上的分档结论同样写入能力矩阵。

## 技术笔记

- [smoke.mjs](../../../apps/e2e/src/smoke.mjs) 目前按 Chromium 无头假设编写（启动参数、等待策略、外网拦截）；跨浏览器需要按引擎参数化启动与等待，并核对两个引擎各自的 CDP 能力；参数化由 [ADESK-US-008](ADESK-US-008-smoke-suite.md) 提供。
- Vivari 的浏览器支持决定终端在非 Chromium 上的可用档位；若 Vivari 不支持，终端的验收结论是「在该浏览器不可用」的明确降级，而不是删除检查项。
- 修复成本高时以「明确降级」为先：能力矩阵写明差异，比静默跳过或放宽断言更符合产品约定。

## 实现文件

- `aiao-desktop/apps/e2e/src/smoke.mjs` — 跨浏览器参数化、窄屏与触屏检查项。
- `aiao-desktop/requirements/capability-matrix.md` — 浏览器支持矩阵与降级记录。
- `aiao-desktop/apps/web/src/app/` — 验收暴露的布局与交互修复。

## References

- [ADESK-US-101 桌面外壳与内置应用基线](../desktop/ADESK-US-101-desktop-shell-baseline.md)
- [ADESK-US-102 本地数据与真实磁盘](../desktop/ADESK-US-102-local-data-and-real-disk.md)
- [能力矩阵](../../capability-matrix.md)
