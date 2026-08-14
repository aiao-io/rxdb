---
id: US-209
title: 微信小程序 wa-sqlite 适配器
status: In Review
priority: Medium
epic: epic-004-future-features
created: 2026-08-13
updated: 2026-08-13
tags: [adapter, miniprogram, wechat, wa-sqlite, experimental]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只依赖已 Done 的 wa-sqlite 适配器契约，不阻塞其他 story
- [x] Negotiable (可协商): /runtime 子路径是否纳入 api-baseline、taro demo 是否进 CI 都可讨论
- [x] Valuable (有价值): 把已发布但无需求覆盖的实验性包纳入门禁与文档，消除"能力承诺与实际支持不符"
- [x] Estimable (可估算): 剩余工作是门禁登记与文档修正，边界清晰
- [x] Small (小): 适配器实现已合并（92 个单测通过），本故事只承接收尾项
- [x] Testable (可测试): 每条 AC 都对应一条可执行的门禁命令或可 diff 的文档位置

补记（2026-08-13）：本 story 是补写的。`@aiao/rxdb-adapter-miniprogram` 自 0.0.24 起已发布，
但 requirements/ 下一直没有对应需求文件（见 status-overview.md「已知的需求覆盖缺口」）。
已实现能力按事实标 ✅ 并附证据，剩余缺口标 ⬜。
-->

# 用户故事：微信小程序 wa-sqlite 适配器

## 作为/我想要/以便

**作为** 在微信小程序里做 Local-first 原型验证的开发者
**我想要** 用与 Web 端一致的 `RxDBAdapterWaSqliteMiniProgram` 在小程序逻辑层跑通 wa-sqlite 持久化
**以便** 不必为小程序另写一套数据层，同时**明确知道**这条路径的能力边界（实验性、单连接、无崩溃恢复保证）

## 范围边界

### In Scope

- 微信小程序逻辑层的 wa-sqlite 加载（`WXWebAssembly.instantiate`）与运行时能力预检
- 基于 `wx.getFileSystemManager()` 的同步文件 VFS，rollback journal 模式
- 安全随机源引导：`wx.getRandomValues` 预取随机池，**不降级**到非密码学随机
- 微信 Babel 把同步回调误判为 `AsyncFunction` 的规避
- 把本包纳入覆盖率门禁、API baseline 决策与公开文档能力矩阵
- 修正仓库中「微信/Alipay」这类超出实际支持范围的表述

### Out of Scope

- 支付宝 / 抖音 / 百度 / QQ 等其他小程序平台（本适配器仅支持微信逻辑层）
- WAL 模式、Worker / SharedWorker、多页面并发连接
- 崩溃恢复保证（微信文件 API 无可靠 `fsync`、文件锁与原子 rename）
- 大数据量场景（整库缓冲在内存，仅适用于 ~10MB 级兼容性验证）
- 把 taro demo 变成受支持的产品级示例——它只作为手工验证入口

## 验收标准

| #   | 前置条件                                         | 操作                                              | 预期结果                                                                                                                 | 状态 |
| --- | ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 小程序运行时缺少 `BigInt` / `WXWebAssembly` 等   | 调用 `assertMiniProgramRuntimeCapabilities()`     | 抛出列出全部缺失能力名的错误，不进入连接流程                                                                             | ✅   |
| 2   | 运行时无原生 `crypto.getRandomValues`            | 调用 `prepareMiniProgramRuntime(wx)` 后消耗随机数 | 由 `wx.getRandomValues` 预取的池供给；池耗尽时抛错，**任何情况下都不降级**到 `Math.random`                               | ✅   |
| 3   | 已注册微信文件 VFS                               | 对同一数据库文件发起第二个连接                    | 抛出「微信文件 VFS 不支持同一数据库的并发连接」，而不是静默共享句柄                                                      | ✅   |
| 4   | 微信 Babel 环境                                  | 注册 `update_hook` / `create_function` 等同步回调 | 回调经 `getPrototypeOf → null` 的 Proxy 包装，不被误判为 `AsyncFunction`                                                 | ✅   |
| 5   | 打包产物含 `wa-sqlite.wasm`                      | 运行 `node scripts/audit/wa-sqlite-integrity.mjs` | `.cjs` 与 `.wasm` 的 SHA-256 与固定值一致                                                                                | ✅   |
| 6   | CI 测试分道配置                                  | 运行 `pnpm nx test rxdb-adapter-miniprogram`      | 12 个 spec / 92 个用例全绿，且该项目在 `scripts/ci/plan-test-lanes.mjs` 中有明确分道                                     | ✅   |
| 7   | `scripts/audit/coverage-baseline.json`           | 运行 `node scripts/audit/coverage-check.mjs`      | 本包在 baseline 中登记并被校验（当前**缺失**，实测 99.84% stmts / 97.12% branch / 100% funcs / 100% lines 不受门禁保护） | ⬜   |
| 8   | `exports` 中的 `./runtime` 子路径                | 运行 `node scripts/audit/api-surface.mjs`         | `prepareMiniProgramRuntime` 等 5 个运行时导出要么纳入 baseline，要么在 story 与脚本注释中记录为**已知不覆盖**            | ⬜   |
| 9   | `website/docs/compatibility.md`                  | 查阅包表格与运行时/存储表格                       | 出现 `@aiao/rxdb-adapter-miniprogram` 行，并标注实验性、仅微信、单连接、无崩溃恢复保证                                   | ⬜   |
| 10  | 根 `README.md` 第 87 行与第 152 行               | 阅读小程序相关表述                                | 不再声称支持 Alipay；与包 README「仅支持微信小程序逻辑层」一致                                                           | ⬜   |
| 11  | `packages/rxdb-adapter-miniprogram/src/index.ts` | 阅读文件头                                        | 只有一个 `@packageDocumentation` 块（当前第 1–9 行与第 10–18 行**逐字重复**）                                            | ⬜   |
| 12  | `examples/taro-react-todo/`                      | 查阅其在仓库中的定位说明                          | 要么纳入某条可执行校验（至少 `typecheck`），要么在 examples README 中显式声明「不在 CI 覆盖范围、需手工验证」            | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### 已实现的关键约束

- **运行时预检**：`runtime-capabilities.ts` 检查 11 项能力（`moduleFactory` / `WXWebAssembly.instantiate` /
  `wx.getFileSystemManager` / `wx.env.USER_DATA_PATH` / `BigInt` / `crypto.getRandomValues` / `structuredClone` /
  `TextEncoder` / `TextDecoder` / `performance.now` / `queueMicrotask`），缺失即 fail-fast。
- **随机源**：`runtime-polyfills.ts` 用 `RUNTIME_SOURCE_MARKER` 标记每个 polyfill 的来源
  （`missing` / `native` / `polyfill` / `wechat`）。原生可用时短路，否则预取上限
  `MAX_MINI_PROGRAM_RANDOM_POOL_SIZE = 1_048_576` 字节的池。这条「宁可抛错也不降级」的设计
  是本适配器与普通 polyfill 的核心差异，改动前需重新评审。
- **文件 VFS**：`wechat-file-vfs.ts` 把整库缓冲在内存，经 `writeFileSync` 落盘。
  `xLock` / `xUnlock` 是 no-op，`xShmMap` / `xShmLock` 返回 `SQLITE_IOERR`——
  并发安全**由模块级 `ACTIVE_DATABASES` 集合在 JS 层强制单连接**来保证，不是由 SQLite 锁保证。
- **PRAGMA**：`journal_mode = DELETE`（不是 WAL）、`temp_store = memory`、`foreign_keys = ON`、
  `cache_size = -${cacheSizeKb}`。
- **同步回调**：`synchronous-callbacks.ts` 按 `CALLBACK_ARGUMENTS` 定位每个 API 的回调参数位并加 Proxy 包装。

### 剩余缺口的成因

- **AC#8**：`scripts/audit/api-surface.mjs:41` 明确记录了 v1 边界「只扫主入口 `src/index.ts`，
  不覆盖 package.json `exports` 子路径入口」。本包是少数真的用了子路径导出的包，所以缺口在这里首次暴露。
  两种收敛方式（扩展扫描器 vs. 记录为已知不覆盖）都可接受，但必须二选一并写下来。
- **AC#12**：根 `pnpm-workspace.yaml:6` 含 `- '!examples/*'`，`pnpm nx show projects` 里没有 taro 项目，
  因此 `examples/taro-react-todo/` 完全在 CI 之外。这是有意的（Taro 4 工具链与 Nx 图不共存），
  但现状没有任何地方说明这一点，读者会误以为它受 CI 保护。

## 实现文件

- `packages/rxdb-adapter-miniprogram/` — 微信小程序 wa-sqlite 适配器
- `packages/rxdb-adapter-miniprogram/src/runtime.ts` — `/runtime` 子路径入口（随机源引导）
- `examples/taro-react-todo/` — Taro + React 手工验证 demo（不在 CI 覆盖范围）
- `scripts/audit/wa-sqlite-integrity.mjs` — wasm/cjs 资产 SHA-256 固定

## References

- [包 README：能力边界与已知限制](../../../packages/rxdb-adapter-miniprogram/README.md)
- [US-204 SQLite WASM 适配器](US-204-sqlite-wasm-adapter.md) — 本适配器复用其 wa-sqlite 客户端契约
- [兼容性矩阵](../../../website/docs/compatibility.md) — AC#9 的落点
