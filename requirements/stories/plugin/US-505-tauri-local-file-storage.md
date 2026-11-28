---
id: US-505
title: Tauri 本地文件存储
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-08-15
updated: 2026-11-16
tags: [plugin, storage, desktop, tauri, filesystem]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 前置（US-504 接缝、US-210 meta adapter）交付后可独立设计与交付；在此之前停在 Backlog
- [x] Negotiable (可协商): 传输层选最小 Rust command（plugin-fs 直连已否决，见技术笔记）
- [x] Valuable (有价值): Tauri 应用的文件与 SQLite 同域备份，且不必授予全文件系统权限
- [x] Estimable (可估算): 复用 US-504 接缝，只补 Tauri 传输与权限面
- [x] Small (小): 不含 Electron、不含接缝设计本身、不含迁移工具
- [x] Testable (可测试): 持久化、权限面、webview 差异门禁、三平台打包、错误路径、双窗口互斥、包体纯净、错配拒绝均有独立 AC（AC#8–#11 对齐 US-504 AC#6–#9）
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

1. **meta 落在 Tauri 桌面 SQLite adapter 上**：storage 插件要求 `rxdb.config.sync.local` 配置一个可连接的
   adapter（`ensureLocalReady` 只校验其存在并 `connect()` 成功，**无**「本地/桌面」类型
   判别，见 US-504 技术笔记）；「同域备份」要成立，meta 必须落在
   [US-210](../adapter/US-210-tauri-sqlite-local-database.md)（已 Done）的 Tauri 桌面
   SQLite adapter 上，留在 webview 存储即 US-504 AC#9 明令拒绝的「备份域撕裂」组合；
   该错配拒绝在 Tauri 侧同样适用（本故事 AC#11 固定）。
2. **接缝由 US-504 定义**：文件系统后端接缝由 US-504 定义并冻结（含物理名编码与锁归宿决策），
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
- `dev-rxdb-tauri` 演示接入 + 在 US-210 已创建的 `apps/dev-rxdb-tauri-e2e` 上扩展本故事拥有的
  重启持久化用例

### Out of Scope

- Electron 运行时（[US-504](./US-504-electron-local-file-storage.md)）
- 浏览器 / PWA / 小程序存储行为变化；OPFS 默认后端冻结
- 已有 OPFS 数据迁移到原生目录的搬家工具
- blob 参与远端同步（US-502 不变）
- 让用户选择存储根位置；任意目录授权需要独立的安全模型
- 监听其他进程直接改写存储根产生的变更

## 验收标准

| #   | 前置条件                                                                                | 操作                                                    | 预期结果                                                                                                                                                                                    | 状态 |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Tauri 应用启用 Rust 文件宿主，物理根固定为 `app_data_dir()/rxdb-files`                  | `upload()` 一个文件，退出应用，重启后 `read()`          | 字节与上传一致；物理文件位于该存储根；webview data store 无新增内容；未授予额外 shell 或全文件系统权限                                                                                      | ✅   |
| 2   | 桌面后端已接入                                                                          | 以桌面后端为注入实现复跑 storage 插件现有全部行为用例   | 与 OPFS 后端行为一致，无跳过项                                                                                                                                                              | ✅   |
| 3   | 应用已写入若干文件与目录                                                                | 退出应用，把应用数据目录整体拷贝到新位置，启动          | `list()` 结构完整，逐文件 `read()` 字节一致 —— meta（US-210 的 SQLite）与文件本体在同一备份域                                                                                               | ✅   |
| 4   | renderer 构造恶意路径（`../`、绝对路径、盘符、NUL、Windows 保留名）或指向根外的符号链接 | 经传输层发起文件操作                                    | Rust 侧路径解析拒绝并返回稳定可判别错误；规范化与符号链接解析后的目标仍须位于存储根内，根外内容零改动                                                                                       | ✅   |
| 5   | 上传/读取超过预览上限量级（≥ 50 MiB）的文件                                             | 全程观察内存与中断行为                                  | 分帧流式完成，内容不整体进 JS 堆；中途 abort 或杀进程后重启，无半写文件、无孤儿 meta                                                                                                        | ✅   |
| 6   | 三家 webview（WebView2 / WKWebView / WebKitGTK）                                        | 触发 `download()` 保存与 `fetch()` 远程缓存             | 保存路径行为被集成测试锁定（WKWebView 无 `showSaveFilePicker`、`<a download>` 行为未定，正是门禁对象）；`fetch()` 在自定义协议 origin 下的 CORS 行为被锁定或有可判别错误                    | ✅   |
| 7   | 构建打包后的 Tauri 应用                                                                 | 在 macOS、Windows、Linux CI 中运行文件持久化 smoke test | 三平台均通过；测试使用真实临时目录而非 mock 或浏览器存储                                                                                                                                    | ✅   |
| 8   | 磁盘满或存储根无写权限                                                                  | `upload()` / `fetch()`                                  | 稳定可判别错误 + 原始原因；补偿语义成立（meta 与文件不脱钩），不回退 webview 存储/内存（对齐 US-504 AC#6）                                                                                  | ✅   |
| 9   | 同一应用开两个 webview 窗口                                                             | 并发 `upload()` 同一路径（其一 overwrite）              | 串行化执行，结果等价于某一种顺序执行；无文件删失、无孤儿 meta —— 锁归宿决策在 Tauri webview 矩阵上成立，Web Locks 缺失时不得静默单进程化（对齐 US-504 AC#7，见技术笔记）                    | ✅   |
| 10  | web 应用照常使用插件（不配桌面后端）                                                    | 构建 + 运行现有浏览器测试                               | 行为与包体不变；Tauri 传输客户端代码不进浏览器 bundle；新增子路径入口进 api-baseline 多入口快照（对齐 US-504 AC#8）                                                                         | ✅   |
| 11  | 启用桌面文件后端，但 `sync.local` 配置的不是 US-210 的 Tauri 桌面 SQLite adapter        | 初始化 storage 插件                                     | 以稳定可判别错误拒绝启用，不启动文件后端、不静默降级 —— 备份域撕裂组合被禁止（对齐 US-504 AC#9，无 fallback 铁律；判别载体跟随 US-504 技术笔记「错误判别载体」的决策，本故事 AC#4 / #8 同） | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

文件访问边界由 Rust 的 [`resolve_within_root()`](../../../packages/rxdb-adapter-tauri/rust/src/file/mod.rs)
与协议路径校验承担；存储根名由 [`STORAGE_DIRECTORY`](../../../packages/rxdb-adapter-tauri/rust/src/paths.rs) 定义。
应用自定义 command 的权限面见 [`lib.rs`](../../../packages/rxdb-adapter-tauri/rust/src/lib.rs)「权限面」，
不以 `plugin-fs` capability 作为 AC#1 / #4 的前置。

> AC#6 是本故事特有的未知量：Electron 只有一个 Chromium，Tauri 是三家 webview 的矩阵，
> `download()` / `fetch()` 这两个**不经 host** 的 renderer 侧路径在三家上的行为差异必须
> 被测试固定，而不是假设与 Chromium 一致。
>
> AC#7 复用 US-210 已建立的 `apps/dev-rxdb-tauri-e2e`（`desktop-smoke` target）与三平台打包矩阵；打包
> smoke test 随 release 发布、手动 dispatch 与桌面链路相关 PR 触发（`release-desktop.yml` 的 PR paths）。

## 交付状态

传输层与 Rust 文件宿主已接入 demo，11 条当前 AC 通过。
AC#6 / #7 的三平台交付证据见 [Release Desktop run 33476341615](https://github.com/aiao-io/rxdb/actions/runs/33476341615)；
`desktop-webview-capability.spec.ts` 在 WebView2 / WKWebView / WebKitGTK 上核对 `EXPECTED_BY_PLATFORM`。

US-210 只提供 AC#1 / #7 所需的 `apps/dev-rxdb-tauri-e2e` 与三平台打包矩阵，本故事提供文件持久化 specs。
其他 AC 不以 US-210 整体状态为前置。AC#11 的通过路径由
`apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts` 的 `TAURI_ADAPTER_NAME` 配置保证；
`selectLocalBackend()` 在 Tauri 窗口选择 `sqlite-tauri`，浏览器预览选择 wa-sqlite。

### 范围决策：共用 e2e 工程

文件持久化用例扩展 US-210 的进程级三平台驱动；本故事不另建 e2e 工程。
交互与 WebView 能力由各自 spec 验收，不用进程级持久化成功替代。

### 证据落点

| AC       | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #2       | `packages/rxdb-adapter-tauri/conformance/storage-parity.spec.ts` —— US-504 的 15 组行为套件经 `@aiao/rxdb-plugin-storage/testing` 原样跑在真实 Rust 宿主进程 + 真实临时目录上，测试体不知道自己跑在哪个后端上，零跳过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| #4       | `file/protocol.rs` 的 `rejects_every_path_shape_that_could_escape_the_storage_root`（26 种形状：`..` / 绝对路径 / 盘符 / 反斜杠 / NUL / 控制字符 / 尾点尾空格 / Windows 保留名 / 超长段）+ `file/mod.rs` 的 `refuses_paths_that_resolve_outside_the_storage_root`（拼完再比根前缀）、`refuses_symlinks_that_point_outside_the_storage_root`（根与目标各取规范形式再比一次，读 / 写 / 移动 / 删除四条通路全挡，根外内容零改动）与 `follows_symlinks_that_stay_inside_the_storage_root`（解析后仍在根内的链接照常放行，不过度封堵）、`never_leaks_the_physical_root_in_a_response`。越界路径在**解析层**即被拒，根本走不到任何 fs 调用；`capabilities/default.json` 全程零改动，只有 `core:*` 窗口权限，无 `fs`、无 `shell`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| #9       | `file/locks.rs` 的 11 条仲裁用例 + `file/mod.rs` 的 `blocks_a_second_writer_until_the_first_releases`（两个真实线程经派发器争同一把独占锁）与 `wakes_a_queued_waiter_when_its_session_closes`（两个独立会话 = 两个窗口，沿用 US-504 AC#7 的口径）。跨窗口成立的结构依据是 `DesktopHost` 由 `app.manage()` 托管在 Tauri `State` 上，全应用一个实例，SQL 与文件两套协议共用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| #10      | `requirements/api-baseline/rxdb-plugin-storage.json` 的 `entries` 含 `./testing`，由 API surface 审计守护；传输客户端在 `@aiao/rxdb-adapter-tauri`，浏览器入口 `setup_rxdb_wa-sqlite.ts` 使用 OPFS 默认后端，插件 node / browser 套件共同验证。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| #11      | `apps/dev-rxdb-tauri/src/app/setup_rxdb_storage.spec.ts` 的 `refuses to build on a non-desktop adapter`（连 `code === 'adapter_mismatch'` 一起断言）+ US-504 `desktop-filesystem.spec.ts` 的两例上游覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| #1 #3    | `apps/dev-rxdb-tauri-e2e/src/desktop-file-storage.spec.ts`（2 例，跑在**装好的产物**上，`desktop-smoke` target）。AC#1：同一 `appDataDir` 启两次 —— 首启 `existedBefore=false`、次启 `existedBefore=true` 且 digest / byteLength 不变、`launchCount` 1→2；再到 `<appDataDir>/rxdb-files/` 下递归收普通文件，恰好 1 个且其 sha256 等于报告里的 digest。三条缺一不可：只看 `launchCount` 证明的是 SQLite 活着，只看 `existedBefore` 证明的是「有个地方」记得住，只有第三条把内容钉死在**被指定的应用数据目录**下的原生文件上。AC#3：`cpSync` 把 `<appDataDir>` 整棵树拷走，先核副本里 `rxdb-data/` 的库文件 sha256 与原件一致、`rxdb-files/` 下的内容也在，再拿副本当 `appDataDir` 启动 —— `launchCount` 从副本里的 1 涨到 2（元数据跟来了）**且** `existedBefore=true`、digest 不变（内容也跟来了）。一次 `cp -r` 同时带走两族数据，这就是「同一备份域」的可操作含义；分别验证两者各自存在证不了它。**保留项**：「webview data store 无新增内容」没有直接断言（进程外检视不了 WKWebsiteDataStore），反证是 `existedBefore` 随 `appDataDir` 切换即回到 false —— webview 存储不按 appDataDir 分域。进程级那一层的证据仍在 `conformance/storage-persistence.spec.ts`，两层不重复 |
| #5       | `packages/rxdb-adapter-tauri/conformance/storage-large-file.spec.ts`（2 例，62 s）。写：52 MiB 经 `openWrite()` 分 13 帧（4 MiB = `DESKTOP_HOST_MAX_FILE_CHUNK_BYTES`）灌进真实临时目录，块内容按偏移确定性生成，JS 侧全程不持整份 buffer；写完到磁盘上核字节数与 sha256。读：走 `openRead()` 的 `ReadableStream` 逐帧滚动摘要，`--expose-gc` 稳住基线后逐帧采 `heapUsed`，断言峰值增量只有**一帧量级**，且不到刻意整份累积的 `readBlob()` 峰值的一半 —— 「内容不整体进 JS 堆」由两条曲线的**对比**给出，而不是一个拍脑袋的绝对阈值。中断与半写语义仍由既有 `#[test]` 覆盖：分帧（`reports_eof_only_on_the_last_frame`）、提交前目标不动（`keeps_the_target_untouched_until_the_write_commits`）、abort 不碰目标（`abandons_a_write_without_touching_the_target`）、会话关闭清理未提交写入与临时文件（`discards_pending_writes_when_the_session_closes`）                                                                                                                                                                                                                                                                                                                    |
| #8       | `packages/rxdb-adapter-tauri/conformance/storage-disk-full.spec.ts`（2 例）—— 真把盘写满，不是 mock：macOS 用 `hdiutil attach ram://` + `diskutil eraseVolume` 挂一个小容量**虚拟卷**，Linux 用 tmpfs，Windows 无免权限路径故平台跳过（沿用 `reports_an_unwritable_storage_root_as_permission_denied` 的 unix-only 先例）。往卷里灌超过容量的字节，四条一起断：抛 `StorageBackendError` 且 `code === 'disk_full'`、`detail` 只含相对路径（AC#4 不回归）、目标文件**不存在**（原子提交只在 `rename` 之后可见）、父目录下没有遗留 `.{write_id}.rxdb-tmp`（漏临时文件是真实缺陷，应该在这里红，而不是等磁盘某天被塞满）。无写权限那一半仍由 `file/mod.rs` 的 `reports_an_unwritable_storage_root_as_permission_denied`（`chmod 0o555` 真封目录）覆盖；补偿语义（meta 与文件不脱钩）由 US-504 `desktop-failure.spec.ts` 在服务层覆盖                                                                                                                                                                                                                                                                                                                                             |
| #6 #7 ✅ | `apps/dev-rxdb-tauri-e2e/src/desktop-webview-capability.spec.ts` 与 `apps/dev-rxdb-tauri/src/app/webview-probe.ts` 验证真实打包 WebView 的下载分支、同源 fetch 与 CSP 拒绝；三平台取值与持续验收入口见「三 OS 矩阵与 `EXPECTED_BY_PLATFORM`」。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

门禁复现入口：

| 门禁                | 复现命令                                                                        |
| ------------------- | ------------------------------------------------------------------------------- |
| Rust 宿主 + demo    | `pnpm nx run-many -t cargo-test -p rxdb-adapter-tauri,dev-rxdb-tauri`           |
| Rust lint（零警告） | `pnpm nx run-many -t cargo-clippy -p rxdb-adapter-tauri,dev-rxdb-tauri`         |
| 一致性套件          | `pnpm nx test-conformance rxdb-adapter-tauri`                                   |
| renderer 单测       | `pnpm nx test dev-rxdb-tauri`                                                   |
| 打包产物 e2e        | `pnpm nx desktop-smoke dev-rxdb-tauri-e2e`                                      |
| 存储插件与适配器    | `pnpm nx run-many -t lint test build -p rxdb-plugin-storage,rxdb-adapter-tauri` |

文件宿主的 Rust 用例落在 `rust/src/file/` 的 `locks.rs` / `mod.rs` / `protocol.rs` 三个文件里。
`rxdb-adapter-tauri` 即原 `rxdb-adapter-desktop`，US-207 E3 拆包后更名。

> `desktop-smoke` 带一个 globalSetup（`warm-up.ts`），它**不产生断言**，只把 Windows 首次拉起产物的
> 一次性冷启动成本付在断言之外，见下节。

### 三 OS 矩阵与 `EXPECTED_BY_PLATFORM`

`desktop-webview-capability.spec.ts` 的 `EXPECTED_BY_PLATFORM` 包含 `darwin` / WKWebView、
`linux` / WebKitGTK、`win32` / WebView2 的真实观测值。下载验证分支选择器至少一条可用，
不触发原生保存对话框；同源 fetch 必须读回相同字节。
跨源请求在当前 CSP 下返回可判别的 `StorageOfflineError` 且服务端零命中，不为测试放宽 CSP。
缺少平台观测行时用例显式失败并输出实测值，不能猜值或跳过。

持续复验入口是 `release-desktop.yml` 的 `tauri-smoke` 三 OS 矩阵，交付证据见
[run 33476341615](https://github.com/aiao-io/rxdb/actions/runs/33476341615)。
`apps/dev-rxdb-tauri-e2e/src/warm-up.ts` 的 globalSetup 在断言前支付 Windows 首次创建 WebView2 profile
的冷启动成本，预热自身不产生验收断言。

### 从 US-504 继承的三条决策

| 决策         | US-504 的结论                                                                                                                   | 对本故事的影响                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件系统接缝 | 窄接口 `StorageFilesystem`（`packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts`），经插件选项 `filesystem` 注入 | Tauri 侧只实现该接口 + 传输层，服务层的回滚 journal / 临时文件提交 / 快照补偿一行都不用重写                                                         |
| 锁归宿       | 临界区**下沉 host 侧**：后端提供 `lockBackend`，桌面后端构造期即断言其存在，不存在静默单进程化路径                              | AC#9 改由 Rust 侧串行化承担；WKWebView / WebKitGTK 的 Web Locks 可用性**不是风险项**，无需验证                                                      |
| 错误判别载体 | 新增 `StorageBackendError { code: StorageBackendErrorCode; detail? }`，现有 9 个错误类原样不动                                  | AC#4 / #8 / #11 的「稳定可判别错误」即该类；Rust 侧错误码按 US-504 的 `BACKEND_ERROR_CODES` 同型映射，未知码一律落 `backend_internal_error`，不裸抛 |

另有一条 US-504 已定、本故事需照抄的行为分歧：物理名编码后单个路径分段超过 255 UTF-8
字节即抛 `StorageBackendError('name_too_long')`，不做哈希截断（截断不可逆，会打断
`copyDirectory` / `listEntries` 的物理名 → 逻辑路径回推）。

## 包边界与共享验收

- Rust 文件宿主位于 `packages/rxdb-adapter-tauri/rust/src/file/`；`router.rs` 在 SQL 解析前精确分流文件请求，
  `error.rs` 映射 `FileNotFound` / `InvalidFilePath` / `DiskFull` / `WriteAborted`。
- 文件一致性用例位于该包的 `conformance/`，`storage-parity.spec.ts` 从 `@aiao/rxdb-plugin-storage/testing`
  取得共享套件，不复制断言。
- 存储插件的 `./desktop` 入口只依赖 `@aiao/rxdb-adapter-sqlite-core/desktop-host`；运行时包仅供测试使用，
  浏览器 bundle 不含 Node builtin 与 Tauri 依赖。
- `adapter_mismatch` 按共享 `DESKTOP_HOST_ADAPTER_NAMES` / `isDesktopHostAdapterName` 判定桌面适配器集合。
- Rust 接缝是普通 crate，应用通过 `generate_handler!` 注册窄命令；不引入 `fs` / `shell` 插件或额外 capability。

## 技术笔记

### 传输二选一（已冻结：最小 Rust command）

| 方案                        | 做法                                                                       | 主要风险                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@tauri-apps/plugin-fs`     | capability 限定存储根，接缝直接映射到 `open() / read() / write() / seek()` | rename 原子替换与 fsync 档位的跨平台语义依赖插件实现；capability 粒度是否能收敛到子目录需验证；AC#4 要求的「稳定可判别错误」形状由插件 capability 层决定，需与粒度一并验证，作为二选一判据 |
| **最小 Rust command（选）** | 自写分帧读写 command，持有文件句柄与临时文件提交逻辑                       | 自维护权限项与句柄生命周期；悬挂句柄的回收要额外设计（同 US-210 事务 ID 的顾虑）                                                                                                           |

**判据是 `lockBackend`，不是上表的任何一条风险**：US-504 已冻结「临界区下沉 host 侧、
桌面后端构造期断言 `lockBackend` 存在、不留静默单进程化路径」。plugin-fs 只提供文件
读写原语，**给不出跨窗口的锁仲裁**，选它就等于 AC#9 无法成立。附带的两条：plugin-fs
路线要在 renderer 侧复制 `desktop.ts` 约 490 行等价逻辑；而复用既有 `rxdb_desktop_request`
命令则**一条 capability 都不用加**——`generate_handler!` 注册的自定义命令不受 capability
门禁约束（只有 `core:` / `plugin:` 前缀才是，见
`packages/rxdb-adapter-tauri/rust/src/lib.rs` 的「权限面」小节），物理根由 Rust 侧写死为
`app_data_dir()` 子目录，比 AC#1 原本设想的「capability 收敛到子目录」更强。

plugin-fs 路线的那几项验证（`open() / read() / write() / seek()` 的异步形状、
rename 原子替换与 fsync 跨平台语义、capability 子目录粒度）因未选中而无需进行。

两案共用约束（对已选方案依然生效）：物理名编码、临时文件提交与失败补偿语义由 US-504
冻结，本故事不得另订一套；错误判别载体同样跟随 US-504（见其技术笔记「错误判别载体」）。

### 锁归宿（US-504 已冻结）

US-504 把临界区**下沉 host 侧**（后端提供 `lockBackend`，桌面后端构造期断言其存在），
本故事跟随该决策走 Rust 侧串行化。Web Locks 在 WKWebView / WebKitGTK 上的可用性与跨
webview 窗口语义因此不影响 AC#9，无需验证。

一处相关的待清理项：`PathLockManager` 在 `navigator.locks` 缺失时会**静默降级为进程内
队列**（`path-lock.ts`），多窗口下等于没有互斥且不报错。锁下沉后桌面路径不再触及该
分支 —— 但它对**浏览器**路径依然成立，属 `path-lock.ts` 自身，不在本故事。

### 依赖

- [US-210](../adapter/US-210-tauri-sqlite-local-database.md) — meta 的 Tauri 桌面 SQLite adapter。
  该 adapter 已可被 `sync.local` 配置，AC#11 的通过
  分支存在（见「交付状态」）；共享的 `apps/dev-rxdb-tauri-e2e` 与三平台打包矩阵已由
  US-210 提供，本故事在其上扩展文件持久化 specs，
  不构成业务前置
- [US-504](./US-504-electron-local-file-storage.md) — 文件系统接缝、协议消息形状、物理名
  编码与锁归宿决策

## 实现文件

- `packages/rxdb-adapter-tauri/rust/src/file/` — Rust 文件宿主，本故事的主体（US-210 T2
  从 `apps/dev-rxdb-tauri/src-tauri/src/rxdb/file/` 迁入本包）：
  `protocol.rs`（请求解析与路径校验，逐条对齐 `desktop-host-protocol.ts`）、
  `locks.rs`（FIFO 的 shared / exclusive 仲裁，队首拿不到就整队停住，独占请求不被共享流饿死）、
  `mod.rs`（派发；临时文件 `fsync` 后 `rename` 原子替换、资源挂在会话上、永不 reject）
- `packages/rxdb-adapter-tauri/rust/src/router.rs` — 一条 IPC 通道上的两套协议：按
  `kind` **精确成员判定**（`is_file_request`，不是 `file.` 前缀匹配）分流，且**必须先于**
  SQL 解析器；`error.rs` 补 `FileNotFound` / `InvalidFilePath` / `DiskFull` / `WriteAborted`
  四个变体对齐 renderer 侧错误码
- `packages/rxdb-plugin-storage/src/testing.ts` + `src/__tests__/storage-backend-parity.suite.ts`
  — US-504 的行为套件抽成 `./testing` 子路径，供包外后端复用（AC#2 的载体）
- `packages/rxdb-adapter-tauri/conformance/storage-parity.spec.ts` / `storage-persistence.spec.ts`
  — 在真实 Rust 宿主进程上跑上述套件（AC#2）与持久性用例（AC#1 / #3 的进程级证据）。
  两条 spec 随 US-210 T4 从 `apps/dev-rxdb-tauri/conformance/` 迁入本包，一律经
  `../src/index.js` 桶文件取符号（自引用不能走包名，见该包 `conformance/rust-adapter-factory.ts` 的说明）
- `apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts` + `pages/storage/` — 演示接入：
  一个 transport 同时喂 storage 插件与桌面 adapter；单文件保存一律走 `service.download()`，
  不新增第四份手写 `showSaveFilePicker`
- `apps/dev-rxdb-tauri/src-tauri/capabilities/` — **零改动**（自定义命令不受 capability 门禁）
- `packages/rxdb-adapter-tauri/conformance/storage-large-file.spec.ts`（AC#5：52 MiB 实测 +
  流式读的内存曲线对比）与 `storage-disk-full.spec.ts`（AC#8：真实小容量卷）。
  `vitest.conformance.mts` 为前者在 `test.execArgv` 上加了 `--expose-gc`（Vitest 4 已移除
  `poolOptions` 那条老路径）；全局 `testTimeout` 为 60 s，52 MiB 两条用例各自 180 s（`LARGE_FILE_TIMEOUT_MS`）
- `apps/dev-rxdb-tauri/src/app/webview-probe.ts` — 渲染端能力探针（AC#6）：只记录事实 +
  做真实网络，绝不触发原生对话框；摘要算法与 `storage-probe.ts` 共用导出的 `sha256Hex`，
  两条探针必须逐字节同一个口径。经 `rxdb-initializer.ts` 的 `probeWebview` 手柄接入，
  探针失败落 `status: 'failed'` 而不是让 initializer reject（TAURI-01：一 reject 就白窗口）
- `apps/dev-rxdb-tauri/src-tauri/src/selfcheck.rs` — 自检报告 schema v2（+`storage` +`webview`）与可选第三环境变量 `DEV_RXDB_TAURI_PROBE_BASE_URL`；原有「两个变量必须成对」
  的铁律不动，第三个单独校验，未开自检却设了它即配置错误（退出码 3）
- `apps/dev-rxdb-tauri-e2e/` — 共享 project，由 US-210 创建；本故事拥有
  `desktop-file-storage.spec.ts`（AC#1 / #3）、`desktop-webview-capability.spec.ts`
  （AC#6 / #7）与共用的 `stored-files.ts`（两条 spec 对「递归到哪一层、算不算符号链接」
  必须给同一个答案，各写一份的分歧会以「某平台偶发少一个文件」的形态出现）
- `requirements/api-baseline/` — 若新增公开 API 则同步基线

## References

- [US-504 Electron 本地文件存储](./US-504-electron-local-file-storage.md) — 本故事的来源与共享接缝
- [US-207 Electron 连接本地 SQLite 文件](../adapter/US-207-desktop-local-database.md) — 桌面本地 SQLite 的 Electron 半边；本故事不覆盖
- [US-210 Tauri 连接应用作用域 SQLite 文件](../adapter/US-210-tauri-sqlite-local-database.md) — 桌面本地 SQLite 的 Tauri 半边；本故事的 meta adapter 前置
- [US-502 Storage 插件](./US-502-storage-plugin.md) — 现有 OPFS 实现与 API 承诺
- [Tauri FS Plugin](https://v2.tauri.app/plugin/file-system/)
- [Tauri Capabilities](https://v2.tauri.app/security/capabilities/)
