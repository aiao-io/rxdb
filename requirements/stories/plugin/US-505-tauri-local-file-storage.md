---
id: US-505
title: Tauri 本地文件存储
status: In Progress
priority: Medium
epic: epic-004-future-features
created: 2026-08-15
updated: 2026-08-16
tags: [plugin, storage, desktop, tauri, filesystem]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 前置（US-504 接缝、US-210 meta adapter）交付后可独立设计与交付；在此之前停在 Backlog
- [x] Negotiable (可协商): 传输层用官方 plugin-fs 直连还是最小 Rust command 在 plan 阶段二选一
- [x] Valuable (有价值): Tauri 应用的文件与 SQLite 同域备份，且不必授予全文件系统权限
- [x] Estimable (可估算): 复用 US-504 接缝，只补 Tauri 传输与权限面
- [x] Small (小): 不含 Electron、不含接缝设计本身、不含迁移工具
- [x] Testable (可测试): 持久化、权限面、webview 差异门禁、三平台打包、错误路径、双窗口互斥、包体纯净、错配拒绝均有独立 AC（AC#8–#11 对齐 US-504 AC#6–#9，2026-08-15 二次评审补齐）
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
   [US-210](../adapter/US-210-tauri-sqlite-local-database.md)（写下时 Backlog、事务门禁未验证；
   2026-08-16 已是 In Progress，AC#2–#8 通过）。
   US-210 不落地，meta 只能留在 webview 存储 —— 恰是 US-504 AC#9 明令拒绝的「备份域
   撕裂」组合；该错配拒绝在 Tauri 侧同样适用（本故事 AC#11 钉住）。
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
- `dev-rxdb-tauri` 演示接入 + 在 US-210 / US-905 阶段 1 先开工者创建的 `apps/dev-rxdb-tauri-e2e`
  上扩展本故事拥有的重启持久化用例

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
| 1   | Tauri 应用启用桌面文件后端，capability 只含存储根子目录                          | `upload()` 一个文件，退出应用，重启后 `read()`          | 字节与上传一致；物理文件位于应用数据目录内的存储根；webview data store 无新增内容；未授予额外 shell 或全文件系统权限                                                                        | ⚠️   |
| 2   | 桌面后端已接入                                                                   | 以桌面后端为注入实现复跑 storage 插件现有全部行为用例   | 与 OPFS 后端行为一致，无跳过项                                                                                                                                                              | ✅   |
| 3   | 应用已写入若干文件与目录                                                         | 退出应用，把应用数据目录整体拷贝到新位置，启动          | `list()` 结构完整，逐文件 `read()` 字节一致 —— meta（US-210 的 SQLite）与文件本体在同一备份域                                                                                               | ⚠️   |
| 4   | renderer 构造恶意路径（`../`、绝对路径、盘符、NUL、Windows 保留名）              | 经传输层发起文件操作                                    | Rust 侧拒绝并返回稳定可判别错误；capability 作用域之外无任何写入                                                                                                                            | ✅   |
| 5   | 上传/读取超过预览上限量级（≥ 50 MiB）的文件                                      | 全程观察内存与中断行为                                  | 分帧流式完成，内容不整体进 JS 堆；中途 abort 或杀进程后重启，无半写文件、无孤儿 meta                                                                                                        | ⚠️   |
| 6   | 三家 webview（WebView2 / WKWebView / WebKitGTK）                                 | 触发 `download()` 保存与 `fetch()` 远程缓存             | 保存路径行为被集成测试锁定（WKWebView 无 `showSaveFilePicker`、`<a download>` 行为未定，正是门禁对象）；`fetch()` 在自定义协议 origin 下的 CORS 行为被锁定或有可判别错误                    | ⬜   |
| 7   | 构建打包后的 Tauri 应用                                                          | 在 macOS、Windows、Linux CI 中运行文件持久化 smoke test | 三平台均通过；测试使用真实临时目录而非 mock 或浏览器存储                                                                                                                                    | ⬜   |
| 8   | 磁盘满或存储根无写权限                                                           | `upload()` / `fetch()`                                  | 稳定可判别错误 + 原始原因；补偿语义成立（meta 与文件不脱钩），不回退 webview 存储/内存（对齐 US-504 AC#6）                                                                                  | ⚠️   |
| 9   | 同一应用开两个 webview 窗口                                                      | 并发 `upload()` 同一路径（其一 overwrite）              | 串行化执行，结果等价于某一种顺序执行；无文件删失、无孤儿 meta —— 锁归宿决策在 Tauri webview 矩阵上成立，Web Locks 缺失时不得静默单进程化（对齐 US-504 AC#7，见技术笔记）                    | ✅   |
| 10  | web 应用照常使用插件（不配桌面后端）                                             | 构建 + 运行现有浏览器测试                               | 行为与包体不变；Tauri 传输客户端代码不进浏览器 bundle；新增子路径入口按 `KNOWN_UNCOVERED_SUBPATHS` 流程登记（对齐 US-504 AC#8）                                                             | ✅   |
| 11  | 启用桌面文件后端，但 `sync.local` 配置的不是 US-210 的 Tauri 桌面 SQLite adapter | 初始化 storage 插件                                     | 以稳定可判别错误拒绝启用，不启动文件后端、不静默降级 —— 备份域撕裂组合被禁止（对齐 US-504 AC#9，无 fallback 铁律；判别载体跟随 US-504 技术笔记「错误判别载体」的决策，本故事 AC#4 / #8 同） | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#6 是本故事特有的未知量：Electron 只有一个 Chromium，Tauri 是三家 webview 的矩阵，
> `download()` / `fetch()` 这两个**不经 host** 的 renderer 侧路径在三家上的行为差异必须
> 被测试钉住，而不是假设与 Chromium 一致。
>
> AC#7 复用 US-210 / US-905 阶段 1 先开工者建立的 `apps/dev-rxdb-tauri-e2e` 与三平台打包矩阵；打包 smoke
> test 成本高，只在 release 分支或 tag 触发，不进 PR 门禁。

## 交付状态（2026-08-16）

传输层与 Rust 文件宿主已实现并接入 demo，11 条 AC 中 **5 条 ✅、4 条 ⚠️、2 条 ⬜**。

### 上一节「阻塞状态（2026-08-15）」为何作废

原结论是「本故事的代码在 US-210 交付前**不可达**：AC#11 要求 `sync.local` 不是 Tauri
桌面 SQLite adapter 就拒绝启用，没有该 adapter，判别的通过分支永远为假，任何实现代码
都是死代码」。开工前复核发现该论据的事实前提已不成立，其中一条**当时写下时就是错的**：

- `apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts` 早已把 `sync.local.adapter` 配成
  `DESKTOP_ADAPTER_NAME`（`selectLocalBackend()` 在 Tauri 窗口下选它、浏览器预览下回落
  wa-sqlite）。「`apps/dev-rxdb-tauri` 当前跑的是 wa-sqlite」只在浏览器预览分支为真，
  AC#11 的通过分支因此一直存在，实现代码不是死代码。
- 「US-210 未交付」被当成了全有全无的门禁，但真正被前置的只是 AC#1 / #7 —— 它们缺的是
  `apps/dev-rxdb-tauri-e2e` 与三平台打包矩阵，与 US-210 自己敞开的 AC#1 / #9 是同一个缺口，
  而不是本故事**特有**的阻塞。其余 9 条 AC 不依赖打包。

保留这一段是因为它记录了一次**把「共享的下游缺口」误判为「本故事的上游阻塞」**的推理
错误：判据应当逐条 AC 核对可达性，而不是按依赖故事的整体状态一票否决。

### 本轮的范围决策

`apps/dev-rxdb-tauri-e2e` **本轮不建**。tauri-driver 不支持 macOS（本机无法验证），且它
与 US-210 AC#1 / #9 卡在同一处；建一个只能在 CI 上盲跑的 e2e 工程，代价与风险都由本故事
独担而收益归两者。代价是 AC#1 / #3 / #6 / #7 只能如实留在 ⚠️ / ⬜，不粉饰。

### 证据落点

| AC       | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #2       | `apps/dev-rxdb-tauri/conformance/storage-parity.spec.ts` —— US-504 的 15 组行为套件经 `@aiao/rxdb-plugin-storage/testing` 原样跑在真实 Rust 宿主进程 + 真实临时目录上，测试体不知道自己跑在哪个后端上，零跳过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| #4       | `file/protocol.rs` 的 `rejects_every_path_shape_that_could_escape_the_storage_root`（26 种形状：`..` / 绝对路径 / 盘符 / 反斜杠 / NUL / 控制字符 / 尾点尾空格 / Windows 保留名 / 超长段）+ `file/mod.rs` 的 `refuses_paths_that_resolve_outside_the_storage_root`（拼完再比根前缀）、`refuses_symlinks_that_point_outside_the_storage_root`（根与目标各取规范形式再比一次，读 / 写 / 移动 / 删除四条通路全挡，根外内容零改动）与 `follows_symlinks_that_stay_inside_the_storage_root`（解析后仍在根内的链接照常放行，不过度封堵）、`never_leaks_the_physical_root_in_a_response`。越界路径在**解析层**即被拒，根本走不到任何 fs 调用；`capabilities/default.json` 全程零改动，只有 `core:*` 窗口权限，无 `fs`、无 `shell` |
| #9       | `file/locks.rs` 的 12 条仲裁用例 + `file/mod.rs` 的 `blocks_a_second_writer_until_the_first_releases`（两个真实线程经派发器争同一把独占锁）与 `wakes_a_queued_waiter_when_its_session_closes`（两个独立会话 = 两个窗口，沿用 US-504 AC#7 的口径）。跨窗口成立的结构依据是 `DesktopHost` 由 `app.manage()` 托管在 Tauri `State` 上，全应用一个实例，SQL 与文件两套协议共用                                                                                                                                                                                                                                                                                                                                                 |
| #10      | `scripts/audit/api-surface.mjs` 的 `KNOWN_UNCOVERED_SUBPATHS` 已登记 `rxdb-plugin-storage` 的 `./testing`（28 包 API 表面核对通过）；`rxdb-plugin-storage` node 200/200 + browser 20/20 未变。Tauri 传输客户端本来就在 `@aiao/rxdb-adapter-desktop`，浏览器 bundle 走 `setup_rxdb_wa-sqlite.ts` 的 OPFS 默认后端                                                                                                                                                                                                                                                                                                                                                                                                          |
| #11      | `apps/dev-rxdb-tauri/src/app/setup_rxdb_storage.spec.ts` 的 `refuses to build on a non-desktop adapter`（连 `code === 'adapter_mismatch'` 一起断言）+ US-504 `desktop-filesystem.spec.ts` 的两例上游覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| #1 #3 ⚠️ | `apps/dev-rxdb-tauri/conformance/storage-persistence.spec.ts` —— 宿主进程被杀后字节仍在磁盘上（并逐字节比对 `rxdb-files/` 下那个**原生文件**，堵死「内容藏在别处也能通过读回断言」）、整目录 `cp -r` 到新位置后结构与字节完整。**缺口**：杀的是 stdio 宿主进程而不是装好的 .app / .exe，窗口生命周期、单实例锁、安装包布局都没覆盖；「webview data store 无新增内容」无 webview 可断言；AC#3 的「与 SQLite 同一备份域」由 `paths.rs` 的 `rxdb-data` / `rxdb-files` 同挂 `app_data_dir()` 结构性成立，未在同一用例里连 SQLite 一起拷                                                                                                                                                                                       |
| #5 ⚠️    | 分帧（`reports_eof_only_on_the_last_frame`）、提交前目标不动（`keeps_the_target_untouched_until_the_write_commits`）、abort 不碰目标（`abandons_a_write_without_touching_the_target`）、会话关闭清理未提交写入与临时文件（`discards_pending_writes_when_the_session_closes`）均已钉住。**缺口**：≥ 50 MiB 的实测与「内容不整体进 JS 堆」的内存观测都没做 —— 语义正确 ≠ 规模验证                                                                                                                                                     |
| #8 ⚠️    | `file/mod.rs` 的 `reports_an_unwritable_storage_root_as_permission_denied`（`chmod 0o555` 真封目录，unix-only：Windows 目录 ACL 不吃 `chmod`）。**缺口**：磁盘满只有 `error_code_for` 的映射表兜着，没有用例真把盘写满；补偿语义（meta 与文件不脱钩）由 US-504 `desktop-failure.spec.ts` 在服务层覆盖，未在 Rust 宿主上重跑                                                                                                                                                                                                         |

门禁：`cargo test` 113 条、`cargo clippy` 零警告、`test-conformance` 9 文件 602 条、
`dev-rxdb-tauri` 单测 12 文件 70 条、`rxdb-plugin-storage` + `rxdb-adapter-desktop`
lint/test/build 全绿。

### 剩余缺口（本故事关闭前必须补）

1. **AC#6 / #7**：需要 `apps/dev-rxdb-tauri-e2e` 与三平台打包矩阵，与
   [US-210](../adapter/US-210-tauri-sqlite-local-database.md) AC#1 / #9 是同一件事，
   由先开工者建一次。AC#6 还额外要求三家真实 webview，本机无法覆盖。
2. **AC#1 / #3**：上条落地后补「打包应用真实重启」与「拷贝应用数据目录后启动」两段 e2e，
   届时可从 ⚠️ 升 ✅。
3. **AC#5 / #8**：≥ 50 MiB 实测 + 内存观测；磁盘满用例（可用小容量 loopback / ramdisk）。

### 从 US-504 继承的三条决策（不再是开放项）

| 决策         | US-504 的结论                                                                                                                   | 对本故事的影响                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件系统接缝 | 窄接口 `StorageFilesystem`（`packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts`），经插件选项 `filesystem` 注入 | Tauri 侧只实现该接口 + 传输层，服务层的回滚 journal / 临时文件提交 / 快照补偿一行都不用重写                                                         |
| 锁归宿       | 临界区**下沉 host 侧**：后端提供 `lockBackend`，桌面后端构造期即断言其存在，不存在静默单进程化路径                              | AC#9 改由 Rust 侧串行化承担；WKWebView / WebKitGTK 的 Web Locks 可用性**不再是风险项**，「锁归宿」笔记中的验证任务随之作废                          |
| 错误判别载体 | 新增 `StorageBackendError { code: StorageBackendErrorCode; detail? }`，现有 9 个错误类原样不动                                  | AC#4 / #8 / #11 的「稳定可判别错误」即该类；Rust 侧错误码按 US-504 的 `BACKEND_ERROR_CODES` 同型映射，未知码一律落 `backend_internal_error`，不裸抛 |

另有一条 US-504 已定、本故事需照抄的行为分歧：物理名编码后单个路径分段超过 255 UTF-8
字节即抛 `StorageBackendError('name_too_long')`，不做哈希截断（截断不可逆，会打断
`copyDirectory` / `listEntries` 的物理名 → 逻辑路径回推）。

## 技术笔记

### 传输二选一（2026-08-16 冻结：最小 Rust command）

| 方案                        | 做法                                                                       | 主要风险                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@tauri-apps/plugin-fs`     | capability 限定存储根，接缝直接映射到 `open() / read() / write() / seek()` | rename 原子替换与 fsync 档位的跨平台语义依赖插件实现；capability 粒度是否能收敛到子目录需验证；AC#4 要求的「稳定可判别错误」形状由插件 capability 层决定，需与粒度一并验证，作为二选一判据 |
| **最小 Rust command（选）** | 自写分帧读写 command，持有文件句柄与临时文件提交逻辑                       | 自维护权限项与句柄生命周期；悬挂句柄的回收要额外设计（同 US-210 事务 ID 的顾虑）                                                                                                           |

**判据是 `lockBackend`，不是上表的任何一条风险**：US-504 已冻结「临界区下沉 host 侧、
桌面后端构造期断言 `lockBackend` 存在、不留静默单进程化路径」。plugin-fs 只提供文件
读写原语，**给不出跨窗口的锁仲裁**，选它就等于 AC#9 无法成立。附带的两条：plugin-fs
路线要在 renderer 侧复制 `desktop.ts` 约 490 行等价逻辑；而复用既有 `rxdb_desktop_request`
命令则**一条 capability 都不用加**——`generate_handler!` 注册的自定义命令不受 capability
门禁约束（只有 `core:` / `plugin:` 前缀才是，见 `rxdb/mod.rs`），物理根由 Rust 侧写死为
`app_data_dir()` 子目录，比 AC#1 原本设想的「capability 收敛到子目录」更强。

三次评审留下的验证任务（确认 plugin-fs 的 `open() / read() / write() / seek()` 异步形状、
rename 原子替换与 fsync 跨平台语义、capability 子目录粒度）随选型作废——这些都只是
plugin-fs 路线的判据，未选则无需验证。

两案共用约束（对已选方案依然生效）：物理名编码、临时文件提交与失败补偿语义由 US-504
冻结，本故事不得另订一套；错误判别载体同样跟随 US-504（见其技术笔记「错误判别载体」）。

### 锁归宿（US-504 已冻结，本节留作背景）

~~`PathLockManager` 的 Web Locks 在 WKWebView / WebKitGTK 上的可用性与跨 webview 窗口语义
必须单独验证~~ —— US-504 已把临界区**下沉 host 侧**（后端提供 `lockBackend`，桌面后端
构造期断言其存在），本故事跟随该决策走 Rust 侧串行化，Web Locks 在三家 webview 上的
可用性因此不再影响 AC#9，无需验证。

原顾虑保留作背景：`PathLockManager` 在 `navigator.locks` 缺失时会**静默降级为进程内
队列**（`path-lock.ts`），多窗口下等于没有互斥且不报错。锁下沉后桌面路径不再触及该
分支 —— 但它对**浏览器**路径依然成立，是 `path-lock.ts` 自身的待清理项，不属本故事。

### 依赖

- [US-210](../adapter/US-210-tauri-sqlite-local-database.md) — meta 的 Tauri 桌面 SQLite adapter。
  ~~adapter 未交付前本故事不可开工~~ —— 该 adapter 已可被 `sync.local` 配置，AC#11 的通过
  分支存在（见「交付状态」）；实际共享的只剩 `apps/dev-rxdb-tauri-e2e` 与三平台打包矩阵，
  它同样卡着 US-210 自己的 AC#1 / #9，可由 [US-905](../future/US-905-tauri-native-devtools.md)
  阶段 1 先创建，不构成业务前置
- [US-504](./US-504-electron-local-file-storage.md) — 文件系统接缝、协议消息形状、物理名
  编码与锁归宿决策

## 实现文件

- `apps/dev-rxdb-tauri/src-tauri/src/rxdb/file/` — Rust 文件宿主，本故事的主体：
  `protocol.rs`（请求解析与路径校验，逐条对齐 `desktop-host-protocol.ts`）、
  `locks.rs`（FIFO 的 shared / exclusive 仲裁，队首拿不到就整队停住，独占请求不被共享流饿死）、
  `mod.rs`（派发；临时文件 `fsync` 后 `rename` 原子替换、资源挂在会话上、永不 reject）
- `apps/dev-rxdb-tauri/src-tauri/src/rxdb/router.rs` — 一条 IPC 通道上的两套协议：按
  `kind` **精确成员判定**（`is_file_request`，不是 `file.` 前缀匹配）分流，且**必须先于**
  SQL 解析器；`error.rs` 补 `FileNotFound` / `InvalidFilePath` / `DiskFull` / `WriteAborted`
  四个变体对齐 renderer 侧错误码
- `packages/rxdb-plugin-storage/src/testing.ts` + `src/__tests__/storage-backend-parity.suite.ts`
  — US-504 的行为套件抽成 `./testing` 子路径，供包外后端复用（AC#2 的载体）
- `apps/dev-rxdb-tauri/conformance/storage-parity.spec.ts` / `storage-persistence.spec.ts`
  — 在真实 Rust 宿主进程上跑上述套件（AC#2）与持久性用例（AC#1 / #3 的进程级证据）
- `apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts` + `pages/storage/` — 演示接入：
  一个 transport 同时喂 storage 插件与桌面 adapter；单文件保存一律走 `service.download()`，
  不新增第四份手写 `showSaveFilePicker`
- `apps/dev-rxdb-tauri/src-tauri/capabilities/` — **零改动**（自定义命令不受 capability 门禁）
- `apps/dev-rxdb-tauri-e2e/` — 共享 project，由 US-210 / US-905 阶段 1 先开工者创建一次；本故事只拥有
  AC#1 / #3 / #7 / #9 的重启、备份、打包与双窗口 specs。**本轮未创建**，见「本轮的范围决策」
- `requirements/api-baseline/` — 若新增公开 API 则同步基线

## References

- [US-504 Electron 本地文件存储](./US-504-electron-local-file-storage.md) — 本故事的来源与共享接缝
- [US-210 Tauri 连接应用作用域 SQLite 文件](../adapter/US-210-tauri-sqlite-local-database.md) — meta adapter 前置
- [US-502 Storage 插件](./US-502-storage-plugin.md) — 现有 OPFS 实现与 API 承诺
- [Tauri FS Plugin](https://v2.tauri.app/plugin/file-system/)
- [Tauri Capabilities](https://v2.tauri.app/security/capabilities/)
