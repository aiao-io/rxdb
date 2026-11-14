---
id: ADESK-US-005
title: Chrome 与窄屏验收
status: Done
priority: Medium
epic: ADESK-EPIC-001
created: 2026-11-13
updated: 2026-11-14
tags: [platform, e2e, chrome, responsive]
dependsOn: [ADESK-US-008, ADESK-US-101, ADESK-US-102]
capabilities: []
---

# 用户故事：Chrome 与窄屏验收

## 作为/我想要/以便

**作为** 在桌面 Chrome 或小窗口里使用 Aiao Desktop 的人
**我想要** 桌面、文件与已交付应用的核心流程可用
**以便** 在本轮约定的浏览器范围内可靠使用产品。

## 范围边界

### In Scope

- 按 [D-19](../../decisions.md#d-19只验收桌面-chrome)，本轮只验收桌面 Chrome。正式构建的自动回归使用 Chromium，真实 Chrome 的游戏、GPU 与集成应用证据单独标明环境。
- 核心流程包含桌面、文件、持久化、应用启动与编辑；终端、游戏及集成应用各自保留已有验收证据和边界。
- 窄屏（390×844）与触屏仿真覆盖菜单栏、Dock、启动台、窗口拖动与缩放，打开的窗口不能跑出屏幕。只承诺最低限度可用，不做移动端专门设计。
- 连续两轮完整冒烟，保留失败样本与已知不稳定项；结论只写“两轮未出现 flake”。
- 能力矩阵、README 与验收台账统一写明 Chrome 范围，自动化和真实浏览器记录分别归档。

### Out of Scope

- Safari、Firefox、Playwright WebKit 的必验与支持承诺；既有结果保留为历史证据，不作为本轮关闭条件。
- iOS Safari、PWA 行为及移动端的独立交互设计。
- 字体、抗锯齿等逐像素视觉一致性与视觉回归。

## 验收标准

| #   | 前置条件                         | 操作                                      | 预期结果                                                                           | 状态 |
| --- | -------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- | ---- |
| 1   | 正式构建与受控 Chromium 驱动可用 | 运行 aiao-desktop-e2e:e2e                 | 全部检查项通过，无缺项或页面错误；真实 Chrome 的高依赖能力记录分别注明环境         | ✅   |
| 2   | Chrome/Chromium 已验证环境       | 在 390×844 视口打开桌面                   | 菜单栏与 Dock 不溢出且可操作，打开的窗口不跑出屏幕，没有横向滚动                   | ✅   |
| 3   | Chrome/Chromium 触屏仿真         | 点 Dock、打开启动台、拖动标题栏并缩放窗口 | 核心流程可用，不将仿真写成 iOS 或其他浏览器真机支持                                | ✅   |
| 4   | 用户已按 D-19 收敛浏览器范围     | 更新能力矩阵、README 与验收台账           | 只承诺本轮 Chrome 验收范围；其他浏览器记录标明历史或可选，不再保留 Safari 必验阻塞 | ✅   |
| 5   | 同一正式构建的两轮完整冒烟       | 比较两次结果与失败记录                    | 两轮均全部通过，既有失败样本保留；只声明“两轮未出现 flake”                         | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 验收证据

- [Chromium 第一轮](../../evidence/2026-11-14/chromium-browser-support-verify-2.json)与[第二轮](../../evidence/2026-11-14/chromium-browser-support-verify.json)使用相同入口指纹，两轮均为24组、479项通过，分别297.1秒与301.4秒；包含窄屏与触屏交互，原始聚合日志与环境在各报告中关联。第二轮[完整聚合](../../evidence/2026-11-14/verify-browser-support-3.txt)共56任务通过。本次两轮未出现flake。
- [真实 Chrome 游戏第三轮](../../evidence/2026-11-14/saltline-gpu-final-3.json)与前两轮记录覆盖 GPU、指针锁定及游戏输入；真实浏览器版本和产物摘要以原记录为准。游戏资产摘要与当前正式产物一致，入口摘要不同的旧记录不写成当前整站重跑。
- [Chrome 范围调整记录](../../evidence/2026-11-14/chrome-only-scope.json)、[能力矩阵](../../capability-matrix.md)、[README](../../README.md)与[验收台账](../../verification-report.md)共同覆盖#4。
- 原有[跨浏览器复验](../../evidence/2026-11-14/browser-support.md)、[Safari 后续记录](../../evidence/2026-11-14/safari-product-followup.json)及[再次游戏检查](../../evidence/2026-11-14/safari-game-probe.json)保留为D-19之前的历史范围证据；Safari 的未完成观察没有改为通过。

本故事当前 AC 全部通过；US-008已按 [D-20](../../decisions.md#d-20接受两项回溯基线例外并批准本次正式发布) 关闭，全部硬依赖满足，故事置Done。物理键盘与 VoiceOver 分别由 US-107、US-108 负责，本决策不关闭它们的验收项。

## 实现文件

- [smoke.mjs](../../../apps/e2e/src/smoke.mjs)：正式构建的 Chromium 回归与可选多引擎入口。
- [能力矩阵](../../capability-matrix.md)：当前浏览器承诺与能力边界。

## References

- [ADESK-US-101 桌面外壳与内置应用基线](../desktop/ADESK-US-101-desktop-shell-baseline.md)
- [ADESK-US-102 本地数据与真实磁盘](../desktop/ADESK-US-102-local-data-and-real-disk.md)
- [D-19](../../decisions.md#d-19只验收桌面-chrome)
