---
id: US-707
title: 跨运行时 demo 与多实例 e2e
status: In Progress
priority: Medium
epic: epic-011-p2p-file-share
created: 2026-10-26
updated: 2026-11-04
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
- Electron 与 Tauri 各自双进程的真实互传用例；Tauri 验收由本故事阶段 B 明确认领

### Out of Scope

- 性能基线（基准测试另开故事，不进本故事）

## 交付形态

owner 决定（2026-11-04）：

- **独立 demo 项目** `apps/dev-rxdb-p2p`，用 Angular 实现。三框架对称约束的是库 API；这个项目不进三个 dev 应用，也不另做 React / Vue 版。
- **服务端**：Cloudflare Worker 承载前端静态资源、信令 Durable Object（在线状态、转发 SDP、签发连接票据）与 R2 服务器回退；Supabase 承载认证与清单同步（`rxdb-plugin-sync` + Supabase 适配器）。认证合同见 [US-704 开工前置](US-704-p2p-manifest-discovery.md#开工前置)。
- **本轮只做阶段 A 的浏览器半边**：AC#1～#3，以及 AC#5、#6 的浏览器部分。Electron 双进程（AC#4）仍属阶段 A，留到下一轮；阶段 B 不变。
- **验收环境**：`apps/dev-rxdb-p2p-e2e` 新增 demo 用例。Playwright 起 `wrangler dev`（本地 workerd 模拟 Durable Object 与 R2）和本 checkout 专属的隔离 Supabase 栈（`docker/supabase-ci-up.sh`），不依赖 Cloudflare 账号，也不依赖外网。

## 交付阶段

| 阶段 | 交付                                        | 前置                                                      | 关闭条件                                  | 状态 |
| ---- | ------------------------------------------- | --------------------------------------------------------- | ----------------------------------------- | ---- |
| A    | 浏览器双上下文、Electron 双进程与服务器回退 | US-704/705/706 对应能力，认证宿主已选定                   | AC#1～6、#8 的浏览器/Electron 半边        | ⚠️   |
| B    | Tauri 双进程、离线局域网与大文件自动化      | US-705 桌面通道、US-706 桌面链路安全；真实 Tauri 测试环境 | AC#6～8，Tauri 的相同块协议与清理合同通过 | ⬜   |

US-505 已交付，不再用“文件存储成熟”代指未知前置。若真实 Tauri 测试环境仍有缺口，须明确宿主、命令与待补能力；
本故事 A/B 都通过后才能 Done，epic-011 不再持有无人认领的 Tauri 关闭条件。

## 验收标准

| #   | 前置条件                                                                          | 操作                                         | 预期结果                                                                                                        | 状态 |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | demo 运行中，两个 browser context                                                 | 一方向另一方拉取 ≥ 1 MiB 文件                | 传输完成，字节一致                                                                                              | ✅   |
| 2   | 同上，连接建立后服务器域路由被中断                                                | 拉取                                         | 传输仍完成（流量隔离：验证字节不经服务器）                                                                      | ✅   |
| 3   | 两个 context 均无持有 peer                                                        | 拉取                                         | 回退服务器下载成功                                                                                              | ✅   |
| 4   | Electron 应用两实例                                                               | 互传                                         | 传输完成，字节一致                                                                                              | ⬜   |
| 5   | 全部用例                                                                          | 入 CI                                        | 进入仓库门禁，不依赖人工环境                                                                                    | ⚠️   |
| 6   | 浏览器已建立直连；桌面 peer 持有效离线凭据与文件，同步服务器断开超过 presence TTL | 继续浏览器传输；桌面通过局域网新建连接并拉取 | 浏览器既有连接继续，桌面发现/探测恢复可用性；未连过的浏览器在信令不可达时明确报连接前置不满足，不伪装可离线新建 | ⚠️   |
| 7   | Tauri 打包测试宿主两实例、真实临时目录                                            | 经相同块协议互传、断开续传、取消与注入写失败 | 结果逐字节一致；续传不重拉已完成块，失败/取消无已发布半文件，资源释放；证据经过真实 WebView/Rust/文件宿主       | ⬜   |
| 8   | US-705 AC#8 的浏览器与桌面文件大小、受控慢接收端                                  | 运行大文件与多源调度夹具                     | 缓冲上限与清理合同通过；内存/吞吐归档，多源正确性不使用“比单源更快”墙钟断言                                     | ⬜   |

## 验收证据

阶段 A 浏览器半边：`pnpm nx run dev-rxdb-p2p-e2e:e2e-remote`（配置 [playwright.demo.config.ts](../../../apps/dev-rxdb-p2p-e2e/playwright.demo.config.ts)）。
demo 的构建产物经 wrangler 起 Worker（静态资源、信令 Durable Object、本地 R2），认证与清单同步走真实 Supabase；
两个浏览器上下文各登录一台设备，字节一致以两端 OPFS 里落盘文件的 SHA-256 等于清单 `contentHash` 为准，直接读盘，不经应用代码。
`nx e2e` 有用例失败时也可能返回 0，以 `test-output/playwright/output/.last-run.json` 为准。

- **AC#1**：[transfer.spec.ts](../../../apps/dev-rxdb-p2p-e2e/src/demo/transfer.spec.ts)「AC#1」，1 MiB 经 P2P 直传。
- **AC#2**：同文件「AC#2」。先建会话，再断开两端的信令连接（`routeWebSocket` 代理后主动关闭并拒绝重连），拦截 Worker 的 `/api/**` 与 Supabase 的全部请求，传输仍经 P2P 完成。
- **AC#3**：同文件「AC#3」。持有方上传服务器副本后关闭，下载走 R2 回退。
- **AC#5**：`e2e-remote` 目标由 CI 自动编入 e2e 矩阵并拉起 supabase action；首次 CI 运行确认前保持 ⚠️。
- **AC#6 浏览器部分**：已建立的会话在信令断开后继续传（AC#2 用例）；没连过的设备在信令不可达时显示「信令不可达」，下载按钮为「持有者离线」（「AC#6」用例）。桌面半边归阶段 B。

## 技术笔记

- 新用例形态：现有 e2e 是单应用内交互；本故事新增「两台机器之间字节流 + 流量隔离」形态（复验口径见 epic-011「为什么单列一个 Epic」）。流量隔离断言中断的是**已建立连接之后**的服务器路由；浏览器断外网**新建**连接的信令边界见 [US-704](US-704-p2p-manifest-discovery.md)
- 三框架对称只约束 UI 部分（如传输进度组件）；service 层无框架绑定，三端 demo 同 US-502 直接调用
- 浏览器双 context 的 WebRTC 握手在同一个 Chromium 实例里可行：[US-708](US-708-p2p-peer-session.md) 的验收夹具 `apps/dev-rxdb-p2p-e2e` 由用例搬运整份 SDP，启动参数关掉 mDNS 主机候选、允许回环地址。本故事的多实例用例可在该项目上扩展：接入 demo、认证宿主、服务器回退与 Electron / Tauri 进程
