---
id: US-505
title: Tauri 本地文件存储
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-08-15
updated: 2026-08-15
tags: [plugin, storage, desktop, tauri, filesystem]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 前置（US-504 接缝、US-210 meta adapter）交付后可独立设计与交付；在此之前停在 Backlog
- [x] Negotiable (可协商): 传输层用官方 plugin-fs 直连还是最小 Rust command 在 plan 阶段二选一
- [x] Valuable (有价值): Tauri 应用的文件与 SQLite 同域备份，且不必授予全文件系统权限
- [x] Estimable (可估算): 复用 US-504 接缝，只补 Tauri 传输与权限面
- [x] Small (小): 不含 Electron、不含接缝设计本身、不含迁移工具
- [x] Testable (可测试): 持久化、权限面、webview 差异门禁、三平台打包均有独立 AC
-->

# 用户故事：Tauri 本地文件存储

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Tauri 桌面应用的开发者
**我想要** `rxdb-plugin-storage` 把文件内容写进应用作用域的数据目录，而不是 webview 管理的存储
**以便** 文件与 [US-210](../adapter/US-210-tauri-sqlite-local-database.md) 的 SQLite 数据库同域备份，且不必为此授予 shell 或全文件系统权限

## 来源与边界

本故事是 [US-504](./US-504-electron-local-file-storage.md) 的 Tauri 半边，拆分手法与
US-207 → US-210 相同：Electron 侧前置已齐备、可即刻排期；Tauri 侧被两个前置卡住，
绑在一条故事里等于让能交付的一半陪跑。

1. **meta 无处安放**：storage 插件要求 `rxdb.config.sync.local` 配置一个可连接的
   adapter（`ensureLocalReady` 只校验其存在并 `connect()` 成功，**无**「本地/桌面」类型
   判别，见 US-504 2026-08-15 评审）；「同域备份」要成立，meta 必须落在 Tauri 的桌面
   SQLite adapter 上，而它是
   [US-210](../adapter/US-210-tauri-sqlite-local-database.md)（Backlog，事务门禁未验证）。
   US-210 不落地，meta 只能留在 webview 存储 —— 恰是 US-504 AC#9 明令拒绝的「备份域
   撕裂」组合；该错配拒绝在 Tauri 侧同样适用。
2. **接缝未抽出**：文件系统后端接缝由 US-504 定义并冻结（含物理名编码与锁归宿决策），
   本故事只做 Tauri 传输实现。若 Tauri 侧发现接缝不足以承载，改动回到 US-504 那一层，
   不在本故事另起一套（同 US-210 对 US-207 的纪律）。

### 为什么不直接用 webview OPFS

- Tauri 的 webview 矩阵是三家：WebView2（Chromium）没有问题；WKWebView 与 WebKitGTK 的
  **主线程 `createWritable()` 支持晚且随版本参差**，`move()` 缺失 —— 服务的写路径在旧
  WebKit 上直接不可用。具体版本边界不信文档与兼容表，实现前用集成测试锁定（同 US-210
  对路径解析的态度）。
- 即便可用，blob 活在 webview data store（WKWebsiteDataStore / WebKitGTK 对应物），与
  应用数据目录分属两个生命周期域 —— 和 US-504 可行性结论里驳回「Electron OPFS 本来能跑」
  的理由完全同构。
- 与 Tauri PGlite 被否决的原因（PGlite `BaseFilesystem` 是**同步**契约，异步 Tauri
  command 无法逐次代理，见 [epic-004](../../epics/epic-004-future-features.md) 拆分理由）
  不同：US-504 的存储接缝是**全异步**契约，`@tauri-apps/plugin-fs` 的
  `open() / read() / write() / seek()` 同为异步分块接口，可以代理。这正是本故事可行的根据。

### In Scope

- 复用 US-504 的文件系统接缝，Tauri 传输层二选一：官方 `@tauri-apps/plugin-fs` 直连，或
  最小 Rust command（见技术笔记）
- capability 权限面收敛到应用数据目录下的存储根子目录，不授予 shell 或全文件系统读写
- 存储根与 US-210 的 SQLite 文件同在应用作用域数据目录，备份拷贝一次带走两者
- 流式分帧与「临时文件 + rename 原子替换」语义与 US-504 对齐
- `dev-rxdb-tauri` 演示接入 + 在 `apps/dev-rxdb-tauri-e2e`（US-210 AC#9 新建）上扩展
  重启持久化用例

### Out of Scope

- Electron 运行时（[US-504](./US-504-electron-local-file-storage.md)）
- 浏览器 / PWA / 小程序存储行为变化；OPFS 默认后端冻结
- 已有 OPFS 数据迁移到原生目录的搬家工具
- blob 参与远端同步（US-502 不变）
- 让用户选择存储根位置；任意目录授权需要独立的安全模型
- 监听其他进程直接改写存储根产生的变更

## 验收标准

| #   | 前置条件                                                          | 操作                                                       | 预期结果                                                                                                                                                     | 状态 |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Tauri 应用启用桌面文件后端，capability 只含存储根子目录           | `upload()` 一个文件，退出应用，重启后 `read()`             | 字节与上传一致；物理文件位于应用数据目录内的存储根；webview data store 无新增内容；未授予额外 shell 或全文件系统权限                                          | ⬜   |
| 2   | 桌面后端已接入                                                    | 以桌面后端为注入实现复跑 storage 插件现有全部行为用例      | 与 OPFS 后端行为一致，无跳过项                                                                                                                                 | ⬜   |
| 3   | 应用已写入若干文件与目录                                          | 退出应用，把应用数据目录整体拷贝到新位置，启动             | `list()` 结构完整，逐文件 `read()` 字节一致 —— meta（US-210 的 SQLite）与文件本体在同一备份域                                                                 | ⬜   |
| 4   | renderer 构造恶意路径（`../`、绝对路径、盘符、NUL、Windows 保留名） | 经传输层发起文件操作                                       | Rust 侧拒绝并返回稳定可判别错误；capability 作用域之外无任何写入                                                                                               | ⬜   |
| 5   | 上传/读取超过预览上限量级（≥ 50 MiB）的文件                       | 全程观察内存与中断行为                                     | 分帧流式完成，内容不整体进 JS 堆；中途 abort 或杀进程后重启，无半写文件、无孤儿 meta                                                                           | ⬜   |
| 6   | 三家 webview（WebView2 / WKWebView / WebKitGTK）                  | 触发 `download()` 保存与 `fetch()` 远程缓存                | 保存路径行为被集成测试锁定（WKWebView 无 `showSaveFilePicker`、`<a download>` 行为未定，正是门禁对象）；`fetch()` 在自定义协议 origin 下的 CORS 行为被锁定或有可判别错误 | ⬜   |
| 7   | 构建打包后的 Tauri 应用                                           | 在 macOS、Windows、Linux CI 中运行文件持久化 smoke test    | 三平台均通过；测试使用真实临时目录而非 mock 或浏览器存储                                                                                                       | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#6 是本故事特有的未知量：Electron 只有一个 Chromium，Tauri 是三家 webview 的矩阵，
> `download()` / `fetch()` 这两个**不经 host** 的 renderer 侧路径在三家上的行为差异必须
> 被测试钉住，而不是假设与 Chromium 一致。
>
> AC#7 复用 US-210 AC#9 建立的 `apps/dev-rxdb-tauri-e2e` 与三平台打包矩阵；打包 smoke
> test 成本高，只在 release 分支或 tag 触发，不进 PR 门禁。

## 技术笔记

### 传输二选一（plan 阶段冻结）

| 方案                   | 做法                                                                         | 主要风险                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@tauri-apps/plugin-fs` | capability 限定存储根，接缝直接映射到 `open() / read() / write() / seek()` | rename 原子替换与 fsync 档位的跨平台语义依赖插件实现；capability 粒度是否能收敛到子目录需验证；AC#4 要求的「稳定可判别错误」形状由插件 capability 层决定，需与粒度一并验证，作为二选一判据 |
| 最小 Rust command      | 自写分帧读写 command，持有文件句柄与临时文件提交逻辑                         | 自维护权限项与句柄生命周期；悬挂句柄的回收要额外设计（同 US-210 事务 ID 的顾虑）               |

两案共用约束：物理名编码、临时文件提交与失败补偿语义由 US-504 冻结，本故事不得另订一套。

### 锁归宿

`PathLockManager` 的 Web Locks 在 WKWebView / WebKitGTK 上的可用性与跨 webview 窗口语义
必须单独验证；US-504 若把临界区下沉 host 侧，本故事跟随该决策（Rust 侧串行化），不做
Tauri 特有的第三种方案。

### 依赖

- [US-210](../adapter/US-210-tauri-sqlite-local-database.md) — meta 的 Tauri 桌面 SQLite
  adapter 与 `apps/dev-rxdb-tauri-e2e` 套件；**未交付前本故事不可开工**
- [US-504](./US-504-electron-local-file-storage.md) — 文件系统接缝、协议消息形状、物理名
  编码与锁归宿决策

## 实现文件

- `packages/rxdb-plugin-storage/src/` — Tauri 传输客户端（复用 US-504 接缝）
- `apps/dev-rxdb-tauri/src-tauri/` — capability 收敛与必要的文件 command
- `apps/dev-rxdb-tauri/src/app/` — 演示接入
- `apps/dev-rxdb-tauri-e2e/` — AC#1 / #3 / #7 的重启、备份与打包用例（由 US-210 AC#9 新建）
- `requirements/api-baseline/` — 若新增公开 API 则同步基线

## References

- [US-504 Electron 本地文件存储](./US-504-electron-local-file-storage.md) — 本故事的来源与共享接缝
- [US-210 Tauri 连接应用作用域 SQLite 文件](../adapter/US-210-tauri-sqlite-local-database.md) — meta adapter 前置
- [US-502 Storage 插件](./US-502-storage-plugin.md) — 现有 OPFS 实现与 API 承诺
- [Tauri FS Plugin](https://v2.tauri.app/plugin/file-system/)
- [Tauri Capabilities](https://v2.tauri.app/security/capabilities/)
