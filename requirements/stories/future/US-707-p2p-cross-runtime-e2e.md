---
id: US-707
title: 跨运行时 demo 与多实例 e2e
status: Backlog
priority: Medium
epic: epic-011-p2p-file-share
created: 2026-10-26
updated: 2026-10-26
tags: [p2p, demo, e2e, playwright, electron]
---

# 用户故事：跨运行时 demo 与多实例 e2e

## 作为/我想要/以便

**作为** 维护者
**我想要** 一个可复现的多实例验收环境——两个浏览器上下文模拟两台机器、桌面端双进程真实互传
**以便** P2P 能力进入 CI 门禁，运行时缺口一眼可见

## 范围边界

### In Scope

- `apps/` 下 demo 接入（沿用 storage 插件无框架绑定的做法：service 层一次实现，demo 直接调用，见 [US-502](../plugin/US-502-storage-plugin.md)「三框架对称」）
- Playwright 两个 browser context 模拟两台机器：完成一次 ≥ 1 MiB 文件的 P2P 传输，断言字节一致
- 流量隔离断言：中断服务器域路由后传输仍完成（证明字节没经服务器）
- 无 peer 回退服务器用例（US-706 AC#1 的自动化半边）
- Electron 双进程用例（主进程两实例互传）

### Out of Scope

- Tauri 双进程用例暂缓（以 [US-505](../plugin/US-505-tauri-local-file-storage.md) 的 Tauri 文件存储成熟为前置）——但登记为 **epic 关闭条件**：未补齐前 epic 不得关 Done
- 性能基线（基准测试另开故事，不进本故事）

## 验收标准

| #   | 前置条件                           | 操作                          | 预期结果                                   | 状态 |
| --- | ---------------------------------- | ----------------------------- | ------------------------------------------ | ---- |
| 1   | demo 运行中，两个 browser context  | 一方向另一方拉取 ≥ 1 MiB 文件 | 传输完成，字节一致                         | ⬜   |
| 2   | 同上，连接建立后服务器域路由被中断 | 拉取                          | 传输仍完成（流量隔离：验证字节不经服务器） | ⬜   |
| 3   | 两个 context 均无持有 peer         | 拉取                          | 回退服务器下载成功                         | ⬜   |
| 4   | Electron 应用两实例                | 互传                          | 传输完成，字节一致                         | ⬜   |
| 5   | 全部用例                           | 入 CI                         | 进入仓库门禁，不依赖人工环境               | ⬜   |

## 技术笔记

- 新用例形态：现有 e2e 是单应用内交互；本故事新增「两台机器之间字节流 + 流量隔离」形态（复验口径见 epic-011「为什么单列一个 Epic」）。流量隔离断言中断的是**已建立连接之后**的服务器路由；浏览器断外网**新建**连接的信令边界见 [US-704](US-704-p2p-manifest-discovery.md)
- 三框架对称只约束 UI 部分（如传输进度组件）；service 层无框架绑定，三端 demo 同 US-502 直接调用
- 浏览器双 context 的 WebRTC 握手若受同一 browser 实例限制（实现时实测），退路为双 browser 实例或手动 SDP 注入
