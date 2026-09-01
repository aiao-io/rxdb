---
id: US-505
title: Tauri 本地文件存储
status: In Progress
priority: Medium
epic: epic-004-future-features
created: 2026-08-15
updated: 2026-09-01
tags: [plugin, storage, desktop, tauri, filesystem]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 前置（US-504 接缝、US-210 meta adapter）交付后可独立设计与交付；在此之前停在 Backlog
- [x] Negotiable (可协商): 传输层用官方 plugin-fs 直连还是最小 Rust command 在 plan 阶段二选一
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

1. **meta 无处安放**：storage 插件要求 `rxdb.config.sync.local` 配置一个可连接的
   adapter（`ensureLocalReady` 只校验其存在并 `connect()` 成功，**无**「本地/桌面」类型
   判别，见 US-504 技术笔记）；「同域备份」要成立，meta 必须落在 Tauri 的桌面
   SQLite adapter 上，而它是
   [US-210](../adapter/US-210-tauri-sqlite-local-database.md)。US-210 不落地，meta 只能留在
   webview 存储 —— 恰是 US-504 AC#9 明令拒绝的「备份域撕裂」组合；该错配拒绝在 Tauri 侧
   同样适用（本故事 AC#11 固定）。
   **该前置已解除**：US-210 已 `Done`（10 条 AC 全绿），本条记录的是拆分当时的理由，不是现状。
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

| #   | 前置条件                                                                         | 操作                                                    | 预期结果                                                                                                                                                                                    | 状态 |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Tauri 应用启用桌面文件后端，capability 只含存储根子目录                          | `upload()` 一个文件，退出应用，重启后 `read()`          | 字节与上传一致；物理文件位于应用数据目录内的存储根；webview data store 无新增内容；未授予额外 shell 或全文件系统权限                                                                        | ✅   |
| 2   | 桌面后端已接入                                                                   | 以桌面后端为注入实现复跑 storage 插件现有全部行为用例   | 与 OPFS 后端行为一致，无跳过项                                                                                                                                                              | ✅   |
| 3   | 应用已写入若干文件与目录                                                         | 退出应用，把应用数据目录整体拷贝到新位置，启动          | `list()` 结构完整，逐文件 `read()` 字节一致 —— meta（US-210 的 SQLite）与文件本体在同一备份域                                                                                               | ✅   |
| 4   | renderer 构造恶意路径（`../`、绝对路径、盘符、NUL、Windows 保留名）              | 经传输层发起文件操作                                    | Rust 侧拒绝并返回稳定可判别错误；capability 作用域之外无任何写入                                                                                                                            | ✅   |
| 5   | 上传/读取超过预览上限量级（≥ 50 MiB）的文件                                      | 全程观察内存与中断行为                                  | 分帧流式完成，内容不整体进 JS 堆；中途 abort 或杀进程后重启，无半写文件、无孤儿 meta                                                                                                        | ✅   |
| 6   | 三家 webview（WebView2 / WKWebView / WebKitGTK）                                 | 触发 `download()` 保存与 `fetch()` 远程缓存             | 保存路径行为被集成测试锁定（WKWebView 无 `showSaveFilePicker`、`<a download>` 行为未定，正是门禁对象）；`fetch()` 在自定义协议 origin 下的 CORS 行为被锁定或有可判别错误                    | ⚠️   |
| 7   | 构建打包后的 Tauri 应用                                                          | 在 macOS、Windows、Linux CI 中运行文件持久化 smoke test | 三平台均通过；测试使用真实临时目录而非 mock 或浏览器存储                                                                                                                                    | ⚠️   |
| 8   | 磁盘满或存储根无写权限                                                           | `upload()` / `fetch()`                                  | 稳定可判别错误 + 原始原因；补偿语义成立（meta 与文件不脱钩），不回退 webview 存储/内存（对齐 US-504 AC#6）                                                                                  | ✅   |
| 9   | 同一应用开两个 webview 窗口                                                      | 并发 `upload()` 同一路径（其一 overwrite）              | 串行化执行，结果等价于某一种顺序执行；无文件删失、无孤儿 meta —— 锁归宿决策在 Tauri webview 矩阵上成立，Web Locks 缺失时不得静默单进程化（对齐 US-504 AC#7，见技术笔记）                    | ✅   |
| 10  | web 应用照常使用插件（不配桌面后端）                                             | 构建 + 运行现有浏览器测试                               | 行为与包体不变；Tauri 传输客户端代码不进浏览器 bundle；新增子路径入口按 `KNOWN_UNCOVERED_SUBPATHS` 流程登记（对齐 US-504 AC#8）                                                             | ✅   |
| 11  | 启用桌面文件后端，但 `sync.local` 配置的不是 US-210 的 Tauri 桌面 SQLite adapter | 初始化 storage 插件                                     | 以稳定可判别错误拒绝启用，不启动文件后端、不静默降级 —— 备份域撕裂组合被禁止（对齐 US-504 AC#9，无 fallback 铁律；判别载体跟随 US-504 技术笔记「错误判别载体」的决策，本故事 AC#4 / #8 同） | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#6 是本故事特有的未知量：Electron 只有一个 Chromium，Tauri 是三家 webview 的矩阵，
> `download()` / `fetch()` 这两个**不经 host** 的 renderer 侧路径在三家上的行为差异必须
> 被测试固定，而不是假设与 Chromium 一致。
>
> AC#7 复用 US-210 已建立的 `apps/dev-rxdb-tauri-e2e`（`desktop-smoke` target）与三平台打包矩阵；打包
> smoke test 成本高，只在 release 分支或 tag 触发，不进 PR 门禁。

## 交付状态

传输层与 Rust 文件宿主已实现并接入 demo，11 条 AC 中 **9 条 ✅、2 条 ⚠️**。

⚠️ 的两条是 AC#6 / #7：specs 已写完并在 macOS 本机全绿，但它们的判据是**三平台真实
webview**，本机只核得动 WKWebView 一列。三平台真值**已于 2026-08-31 全部回填**
（PR #48 的三 OS 首跑输出），关闭这两条只差一次**跑绿的** `release-desktop.yml`
`workflow_dispatch`（见文末「剩余一步」）。

**US-210 不是本故事的整体前置**，被它前置的只有 AC#1 / #7。这条前置（`apps/dev-rxdb-tauri-e2e`
project + 三平台打包矩阵）已由 US-210 建好（其 AC#1 / #9 同日关闭），
缺的只剩本故事自己的文件持久化 specs；其余 9 条不依赖打包。AC#11 的通过分支也一直存在——
`apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts` 已把 `sync.local.adapter` 配成
`TAURI_ADAPTER_NAME`（US-207 E3 把原来的 `DESKTOP_ADAPTER_NAME` 拆成
`sqlite-electron` / `sqlite-tauri` 两个名字；`selectLocalBackend()` 在 Tauri 窗口下选它、
浏览器预览下回落 wa-sqlite），「跑的是 wa-sqlite」只在浏览器预览分支为真。
可达性按**逐条 AC** 核对，不按依赖故事的整体状态一票否决。

### 范围决策：e2e 工程不由本故事建（前置已由 US-210 落地）

`apps/dev-rxdb-tauri-e2e` **不在本故事范围内**——本故事当年卡在「tauri-driver 不支持 macOS，
建一个只能在 CI 上盲跑的 e2e 工程，代价与风险都由本故事独担而收益归两者」。这条前置已于
2026-08-17 由 US-210 建好，且方案是**进程级驱动、三平台统一不上 WebDriver**（比 tauri-driver
更强，详见 [US-210 AC#9](../adapter/US-210-tauri-sqlite-local-database.md) 的改判说明）。
本故事只需在其上扩展自己拥有的文件持久化用例，不再背负建 e2e 工程的代价。

### 证据落点

| AC       | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #2       | `packages/rxdb-adapter-tauri/conformance/storage-parity.spec.ts` —— US-504 的 15 组行为套件经 `@aiao/rxdb-plugin-storage/testing` 原样跑在真实 Rust 宿主进程 + 真实临时目录上，测试体不知道自己跑在哪个后端上，零跳过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| #4       | `file/protocol.rs` 的 `rejects_every_path_shape_that_could_escape_the_storage_root`（26 种形状：`..` / 绝对路径 / 盘符 / 反斜杠 / NUL / 控制字符 / 尾点尾空格 / Windows 保留名 / 超长段）+ `file/mod.rs` 的 `refuses_paths_that_resolve_outside_the_storage_root`（拼完再比根前缀）、`refuses_symlinks_that_point_outside_the_storage_root`（根与目标各取规范形式再比一次，读 / 写 / 移动 / 删除四条通路全挡，根外内容零改动）与 `follows_symlinks_that_stay_inside_the_storage_root`（解析后仍在根内的链接照常放行，不过度封堵）、`never_leaks_the_physical_root_in_a_response`。越界路径在**解析层**即被拒，根本走不到任何 fs 调用；`capabilities/default.json` 全程零改动，只有 `core:*` 窗口权限，无 `fs`、无 `shell`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| #9       | `file/locks.rs` 的 11 条仲裁用例 + `file/mod.rs` 的 `blocks_a_second_writer_until_the_first_releases`（两个真实线程经派发器争同一把独占锁）与 `wakes_a_queued_waiter_when_its_session_closes`（两个独立会话 = 两个窗口，沿用 US-504 AC#7 的口径）。跨窗口成立的结构依据是 `DesktopHost` 由 `app.manage()` 托管在 Tauri `State` 上，全应用一个实例，SQL 与文件两套协议共用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| #10      | `scripts/audit/api-surface.mjs` 的 `KNOWN_UNCOVERED_SUBPATHS` 已登记 `rxdb-plugin-storage` 的 `./testing`（现为 29 包 API 表面核对通过）；`rxdb-plugin-storage` node 214/214 + browser 20/20 全绿（2026-08-18 复测；node 侧从 200 涨到 214 是 US-504／US-505 后续补的用例，browser 侧一条未动）。Tauri 传输客户端本来就在运行时包里（US-207 拆包后是 `@aiao/rxdb-adapter-tauri`，当时叫 `@aiao/rxdb-adapter-desktop`），浏览器 bundle 走 `setup_rxdb_wa-sqlite.ts` 的 OPFS 默认后端                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| #11      | `apps/dev-rxdb-tauri/src/app/setup_rxdb_storage.spec.ts` 的 `refuses to build on a non-desktop adapter`（连 `code === 'adapter_mismatch'` 一起断言）+ US-504 `desktop-filesystem.spec.ts` 的两例上游覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| #1 #3    | `apps/dev-rxdb-tauri-e2e/src/desktop-file-storage.spec.ts`（2 例，跑在**装好的产物**上，`desktop-smoke` target）。AC#1：同一 `appDataDir` 启两次 —— 首启 `existedBefore=false`、次启 `existedBefore=true` 且 digest / byteLength 不变、`launchCount` 1→2；再到 `<appDataDir>/rxdb-files/` 下递归收普通文件，恰好 1 个且其 sha256 等于报告里的 digest。三条缺一不可：只看 `launchCount` 证明的是 SQLite 活着，只看 `existedBefore` 证明的是「有个地方」记得住，只有第三条把内容钉死在**被指定的应用数据目录**下的原生文件上。AC#3：`cpSync` 把 `<appDataDir>` 整棵树拷走，先核副本里 `rxdb-data/` 的库文件 sha256 与原件一致、`rxdb-files/` 下的内容也在，再拿副本当 `appDataDir` 启动 —— `launchCount` 从副本里的 1 涨到 2（元数据跟来了）**且** `existedBefore=true`、digest 不变（内容也跟来了）。一次 `cp -r` 同时带走两族数据，这就是「同一备份域」的可操作含义；分别验证两者各自存在证不了它。**保留项**：「webview data store 无新增内容」没有直接断言（进程外检视不了 WKWebsiteDataStore），反证是 `existedBefore` 随 `appDataDir` 切换即回到 false —— webview 存储不按 appDataDir 分域。进程级那一层的证据仍在 `conformance/storage-persistence.spec.ts`，两层不重复                                                                                                                                                                                                                                                                                                                               |
| #5       | `packages/rxdb-adapter-tauri/conformance/storage-large-file.spec.ts`（2 例，62 s）。写：52 MiB 经 `openWrite()` 分 13 帧（4 MiB = `DESKTOP_HOST_MAX_FILE_CHUNK_BYTES`）灌进真实临时目录，块内容按偏移确定性生成，JS 侧全程不持整份 buffer；写完到磁盘上核字节数与 sha256。读：走 `openRead()` 的 `ReadableStream` 逐帧滚动摘要，`--expose-gc` 稳住基线后逐帧采 `heapUsed`，断言峰值增量只有**一帧量级**，且不到刻意整份累积的 `readBlob()` 峰值的一半 —— 「内容不整体进 JS 堆」由两条曲线的**对比**给出，而不是一个拍脑袋的绝对阈值。中断与半写语义仍由既有 `#[test]` 覆盖：分帧（`reports_eof_only_on_the_last_frame`）、提交前目标不动（`keeps_the_target_untouched_until_the_write_commits`）、abort 不碰目标（`abandons_a_write_without_touching_the_target`）、会话关闭清理未提交写入与临时文件（`discards_pending_writes_when_the_session_closes`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| #8       | `packages/rxdb-adapter-tauri/conformance/storage-disk-full.spec.ts`（2 例）—— 真把盘写满，不是 mock：macOS 用 `hdiutil attach ram://` + `diskutil eraseVolume` 挂一个小容量**虚拟卷**，Linux 用 tmpfs，Windows 无免权限路径故平台跳过（沿用 `reports_an_unwritable_storage_root_as_permission_denied` 的 unix-only 先例）。往卷里灌超过容量的字节，四条一起断：抛 `StorageBackendError` 且 `code === 'disk_full'`、`detail` 只含相对路径（AC#4 不回归）、目标文件**不存在**（原子提交只在 `rename` 之后可见）、父目录下没有遗留 `.{write_id}.rxdb-tmp`（漏临时文件是真实缺陷，应该在这里红，而不是等磁盘某天被塞满）。无写权限那一半仍由 `file/mod.rs` 的 `reports_an_unwritable_storage_root_as_permission_denied`（`chmod 0o555` 真封目录）覆盖；补偿语义（meta 与文件不脱钩）由 US-504 `desktop-failure.spec.ts` 在服务层覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| #6 #7 ⚠️ | `apps/dev-rxdb-tauri-e2e/src/desktop-webview-capability.spec.ts`（4 例）+ 渲染端 `apps/dev-rxdb-tauri/src/app/webview-probe.ts`（8 条单测）。探针必须跑在**真实打包 webview** 里：`download()` 与 `fetch()` 都是 renderer 侧路径，压根不经 host，stdio 宿主进程测不到。它**绝不触发原生保存对话框** —— 对话框会挂到 60 s 看门狗，失败形态与真实渲染挂死无法区分，所以锁的是 `download()` 的**分支选择器**（`showSaveFilePicker` / `<a download>` / blob URL 至少一条可用，`storage.service.ts` 的分支前提不落空），不是对话框本身。`fetch()` 这半的正面证据是**同源** `storage.fetch(${origin}/index.html)` 缓存进原生文件后逐字节核回；两条跨源路由（带 / 不带 `Access-Control-Allow-Origin`）照发，用来记录事实：本机两者给出**同一个** `StorageOfflineError` 且本地服务**零命中** —— 拦截发生在 CSP（`tauri.conf.json` 的 `connect-src 'self' ipc: http://ipc.localhost`），请求根本没出渲染进程，与 CORS 无关。为一条断言去放宽产品 CSP 是拿真实安全边界换绿灯，没做；AC#6 允许「被锁定**或有可判别错误**」，这正是后者。AC#7 随同一份 spec 落进 `release-desktop.yml` `tauri-smoke` 的三 OS 矩阵（`desktop-smoke` 的 `include` 自动拾取，不新增 job —— 新增 job 得同步改 `gate` 的 `needs`，没必要）。**保留原因**（2026-08-31 已收窄）：`EXPECTED_BY_PLATFORM` **三行都已回填**——`darwin` 本机核过，`linux` / `win32` 按 PR #48 的三 OS 首跑真实输出回填。缺行时用例会带着可直接粘贴的字面量抛错，所以首跑红一次是锁定过程本身，不是失败。现在保留的只是「还没有一次三 OS 全绿的跑」，见「剩余一步」 |

门禁（2026-08-29 收尾后本机实测，括号内为 2026-08-18 迁包时记录的旧值）：`cargo test`
**154 条**（crate 131 + demo 23，其中文件宿主 `file/` 占 41 条 = `locks.rs` 11 +
`mod.rs` 19 + `protocol.rs` 11；旧值 147 = 131 + 16，demo 侧 +7 全在 `selfcheck.rs`，
是报告 schema v2 与第三个环境变量的校验用例）、`cargo clippy` 零警告、
`test-conformance` **12 文件 609 条**（旧值 10 文件 605 条；+2 文件即
`storage-large-file` / `storage-disk-full`）、`dev-rxdb-tauri` 单测 **17 文件 118 条**
（旧值 14 文件 94 条）、`dev-rxdb-tauri-e2e:desktop-smoke` **3 文件 8 条**、
`rxdb-plugin-storage` node **9 文件 215 条**（旧值 214 条）、`rxdb-adapter-tauri`
（原 `rxdb-adapter-desktop`，US-207 E3 拆包后更名）lint/test/build 全绿。

> 迁包那次的数字变动与「迁包」本身无关：`#[test]` 总数在迁包前（`39dba16`）与迁包后
> 都是 **147**，一条不多一条不少；增长来自 US-207／US-210 期间补的用例，迁包只搬位置。
>
> **上面的门禁数字是 2026-08-29 收尾那一刻的快照，不要按今天重跑的数字对账**：`dev-rxdb-tauri` 单测已涨到
> **21 文件 213 条**、`desktop-smoke` 已涨到 **4 文件**，增量全部来自
> [US-905](../future/US-905-tauri-native-devtools.md) 阶段 1 补的 devtools transport / conformance /
> release 隔离用例，与本故事无关。本故事自己的用例一条未动。
>
> 另外 `desktop-smoke` 现在带一个 globalSetup（`warm-up.ts`），它**不产生断言**，
> 所以用例条数不受影响，见「剩余一步」。

### 剩余一步（本机做不了）

**回填已做完，只差一次跑绿。** 2026-08-31 的 PR [aiao-io/rxdb#48](https://github.com/aiao-io/rxdb/pull/48)
真实触发了 `release-desktop.yml`，`tauri-smoke` 的三 OS 矩阵跑到了
`desktop-webview-capability.spec.ts`，`EXPECTED_BY_PLATFORM` 现在**三行齐全**：

| 平台     | 来源                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `darwin` | 本机 WKWebView 核过的真值（2026-08-29）                                                                                                                    |
| `linux`  | 真实 Ubuntu / WebKitGTK 观测回填（2026-08-31）：CSP 先于 CORS 拦截、服务端零命中；Ubuntu 那一行已跑绿                                                      |
| `win32`  | 真实 Windows / WebView2 观测回填（2026-08-31，`1acd2fb`）：`engine: chromium`，三条保存分支全可用，两条跨源路由同样落 `StorageOfflineError` 且服务端零命中 |

首跑按设计红在「能力事实与本平台被冻结的取值一致」—— 用例把该平台真实观测打印成**可直接粘贴**的
字面量，这是「把未知量钉住」的正常形态，不是缺陷。先猜一个期望值再让 CI 纠正它，比在文档里写
「行为大概与 Chromium 一致」强。

同一跑还暴露一个与本故事 AC 无关、但会挡住跑绿的环境问题：**Windows 首次拉起刚构建出来的
产物**（第一次创建 WebView2 profile）稳定超过 60s 看门狗，而后续每次启动只要 1-3s；victim
与是哪条 spec 无关，只与「最早」有关（12:24Z 那轮是 `desktop-persistence.spec.ts`，后两轮是
`desktop-file-storage.spec.ts`）。已由 `apps/dev-rxdb-tauri-e2e/src/warm-up.ts` globalSetup
把这一次性冷启动成本付在断言之外解决（预热本身**不断言**，见该文件的 `@remarks`）。

所以现在只剩：**再触发一次 `workflow_dispatch`，三 OS 全绿**，AC#6 / #7 即从 ⚠️ 升 ✅，
本故事可关闭。同一次跑也会同时关掉 [US-208](../adapter/US-208-electron-pglite-data-directory.md) 的 AC#10。

### 从 US-504 继承的三条决策（不再是开放项）

| 决策         | US-504 的结论                                                                                                                   | 对本故事的影响                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件系统接缝 | 窄接口 `StorageFilesystem`（`packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts`），经插件选项 `filesystem` 注入 | Tauri 侧只实现该接口 + 传输层，服务层的回滚 journal / 临时文件提交 / 快照补偿一行都不用重写                                                         |
| 锁归宿       | 临界区**下沉 host 侧**：后端提供 `lockBackend`，桌面后端构造期即断言其存在，不存在静默单进程化路径                              | AC#9 改由 Rust 侧串行化承担；WKWebView / WebKitGTK 的 Web Locks 可用性**不是风险项**，无需验证                                                      |
| 错误判别载体 | 新增 `StorageBackendError { code: StorageBackendErrorCode; detail? }`，现有 9 个错误类原样不动                                  | AC#4 / #8 / #11 的「稳定可判别错误」即该类；Rust 侧错误码按 US-504 的 `BACKEND_ERROR_CODES` 同型映射，未知码一律落 `backend_internal_error`，不裸抛 |

另有一条 US-504 已定、本故事需照抄的行为分歧：物理名编码后单个路径分段超过 255 UTF-8
字节即抛 `StorageBackendError('name_too_long')`，不做哈希截断（截断不可逆，会打断
`copyDirectory` / `listEntries` 的物理名 → 逻辑路径回推）。

## 随 Tauri 包化搬迁（已完成，2026-08-18）

本故事的 Rust 文件宿主与两条一致性 spec 原先都在 `apps/dev-rxdb-tauri/` 里，已跟着
[US-210「Tauri 包化」](../adapter/US-210-tauri-sqlite-local-database.md#tauri-包化)
（T1～T7 全部关闭）搬进 `packages/rxdb-adapter-tauri`：Rust 侧落
`rust/src/file/`，一致性 spec 落 `conformance/`；renderer 侧受
[US-207「包边界重整」](../adapter/US-207-desktop-local-database.md#包边界重整)
的改名影响，该半边已随 E1～E5 落地。搬迁**没改本故事任何一条 AC 的语义**——
`#[test]` 总数迁包前后都是 147，两条一致性 spec 的断言一个字未动，
S3／S4 两处口径按下表改完，S5 因 US-210 定形为**普通 crate**而无需改。

| #     | 任务                                                                                                                                           | 完成判据                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1 ✅ | `src-tauri/src/rxdb/file/`（`protocol.rs` / `locks.rs` / `mod.rs`）与 `router.rs` 的两协议分流随 crate 迁入新包，`error.rs` 的四个文件变体同行 | 已达成：三个文件落 `packages/rxdb-adapter-tauri/rust/src/file/`，`router.rs` 与 `error.rs`（`FileNotFound` / `InvalidFilePath` / `DiskFull` / `WriteAborted` 四变体）同行；`cargo test` 在新位置全绿（crate 131 条，含 `file/` 的 41 条）；`is_file_request` 精确成员判定在 `handle()` 与 `handle_owned()` 两条通路上仍**先于** SQL 解析器（顺序颠倒是静默 bug，不是编译错误） |
| S2 ✅ | `conformance/storage-parity.spec.ts` / `storage-persistence.spec.ts` 迁入新包                                                                  | 已达成：两条 spec 落 `packages/rxdb-adapter-tauri/conformance/`，与 US-210 的 8 条 SQL spec 合计复现 **605 条 / 10 文件**（0 skipped）；`storage-parity` 仍从 `@aiao/rxdb-plugin-storage/testing` 取套件，不在新包里复制一份                                                                                                                                                   |
| S3 ✅ | AC#10 证据句改口径为新包名（`@aiao/rxdb-adapter-tauri`）；`rxdb-plugin-storage` 的 `./desktop` 子路径按 US-207 E5 改指共享层而非运行时包       | 已达成：`src/desktop.ts` 只 import `@aiao/rxdb-adapter-sqlite-core/desktop-host`，运行时包降为 devDependency（仅测试用），浏览器 bundle 不含 Node builtin 与 Tauri 依赖                                                                                                                                                                                                        |
| S4 ✅ | AC#11 的 `adapter_mismatch` 判据跟随 US-207 E3 的 `ADAPTER_NAME` 分裂（`desktop` → `sqlite-electron` / `sqlite-tauri`）重写拒绝条件            | 已达成：判据从单个名字改为集合 `DESKTOP_HOST_ADAPTER_NAMES`（`desktop-adapter-name.ts`），逐个点名换成 `isDesktopHostAdapterName`；`refuses to build on a non-desktop adapter` 的用例名对应的正是这个集合，仍名副其实                                                                                                                                                          |
| S5 ✅ | 「传输二选一」小节引用的 `rxdb/mod.rs` capability 论证跟随 US-210 的插件形态决策                                                               | 已达成且**论证零改动**：US-210 定形为**普通 crate 而非 Tauri 插件**，命令仍由宿主应用 `generate_handler!` 注册，不带 `plugin:` 前缀 ⇒ 不进 capability 门禁。本故事「`capabilities/` 全程零改动」「一条 capability 都不用加」两句原样成立；引用位置从 `rxdb/mod.rs` 迁到 `packages/rxdb-adapter-tauri/rust/src/lib.rs` 的「权限面」小节                                         |

搬迁本身不解任何一条 AC：AC#1 / #3 / #6 / #7 当时缺的是本故事自己的 specs
（`apps/dev-rxdb-tauri-e2e` 与三平台打包矩阵已由 US-210 建好）。这些 specs 已于
2026-08-29 补齐，见「证据落点」与「剩余一步」。

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
  US-210 建好（其 AC#1 / #9 同日关闭），本故事只需在其上扩展自己的 specs，
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
  `poolOptions` 那条老路径），并把 `testTimeout` 提到 180 s
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
