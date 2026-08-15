---
id: US-504
title: Electron 本地文件存储
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-08-15
updated: 2026-08-15
tags: [plugin, storage, desktop, electron, filesystem]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): US-207 的 host 契约已随 `@aiao/rxdb-adapter-desktop@0.0.25` 发布，本故事只消费不改动其承诺
- [x] Negotiable (可协商): 文件系统接缝的两种抽法（handle shim / 窄接口）在 plan 阶段二选一
- [x] Valuable (有价值): 文件与桌面 SQLite 落在同一备份域，拷一个目录即完整带走应用数据
- [x] Estimable (可估算): 单一运行时（Electron）+ 单一后端（node:fs），OPFS 行为冻结不动
- [x] Small (小): 不含 Tauri（US-505）、不含 OPFS→原生迁移工具、不含远端同步
- [x] Testable (可测试): 重启持久化、备份恢复、流式有界、失败补偿、双窗口互斥、错配拒绝均有独立 AC
-->

# 用户故事：Electron 本地文件存储

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Electron 桌面应用的开发者
**我想要** `rxdb-plugin-storage` 把文件内容写进应用数据目录里的原生文件，而不是 WebView 的 OPFS
**以便** 文件与桌面 SQLite 数据库（[US-207](../adapter/US-207-desktop-local-database.md)）落在同一个可备份、可迁移的目录里，拷贝应用数据目录即可完整带走 metadata 与文件本体

## 可行性结论（2026-08-15 评审）

结论：**✅ 可行，且改造面收敛**。依据：

1. **OPFS 根入口唯一，但句柄调用面广。** `RxdbFileStorage` 的文件系统访问全部经由标准
   `FileSystemDirectoryHandle` / `FileSystemFileHandle` 接口，OPFS 特定入口只有一处 ——
   `getStorageRootHandle()` 里的 `navigator.storage.getDirectory()`（`storage.service.ts`）。
   `move()` 做了特性检测并有 copy+delete 回退；`entries()` 是硬要求，后端必须提供目录
   枚举。注意「把根句柄换掉、其余服务逻辑（路径锁、回滚 journal、临时文件提交、流式
   落盘）原样保留」**只对 handle shim 案成立**：根句柄之后服务全程直接调用句柄 API
   （`getDirectoryHandle` / `removeEntry` / `createWritable` / `getFile` / `move`），
   若 plan 阶段选窄接口案，改造面是全部这些调用点（2026-08-15 二次评审修正措辞，
   避免接缝决策被锚在「换根零改动」的预期上）。
2. **host 模式现成。** US-207 已交付 renderer/host 双入口契约与安全基线（窄 preload、
   类型化校验、协议版本、路径白名单）。文件传输是同一模式下的新消息类型，不需要新抽象。
3. **「Electron 里 OPFS 本来能跑」不构成反例。** Electron renderer 是 Chromium，插件不改
   也能用 —— 但 blob 落在 Chromium profile 管理的存储里，与 US-207 特意逃离的
   OPFS/IndexedDB 是同一个域。US-207 已实证该域的危险性：Chromium 启动时清掉了
   `userData/databases` 里它不认识的库文件，静默丢数据。meta 在原生 SQLite、blob 在
   webview 存储 = 备份拷不走一致整体，恢复后 meta 指向不存在的文件。

反向约束：本故事不改浏览器行为，OPFS 后端保持默认且与现状一致（Never break userspace）。

## 范围边界

### In Scope

- 在 `rxdb-plugin-storage` 内抽出文件系统接缝：服务的文件访问经由可注入的后端，OPFS 是
  默认实现，桌面原生是第二个实现；两种抽法见技术笔记，plan 阶段冻结
- Electron 主进程 host 把文件内容写进应用数据目录内的专用存储根，与 US-207 的
  `rxdb-data` 同级；目录名纳入既有「不与 Chromium 在 userData 下自用的目录重名」名单断言
  （`desktop-sqlite-bridge.spec.ts`）
- 文件消息作为桌面 host 协议内的新消息类型走既有 `request` / `subscribe` 通道，**不新增
  preload 方法** —— US-207 的「`__aiaoRxdbDesktopHost__` 暴露面恰为 request / subscribe」
  e2e 断言保持成立（口径限于该全局：preload 另暴露 demo 用的 `electron` 全局
  （platform / versions / runDemo），不属于桌面 host 桥，不在断言范围内）
- host 侧对 renderer 传入路径二次校验（renderer 不可信）：名称模式校验沿用
  `assertValidDesktopDatabaseName` 的白名单哲学（注意该函数只校验**逻辑名**、显式拒绝
  路径语义），路径逃逸拦截对齐 host 侧 `createDatabasePathResolver` 的做法 —— AC#4 的
  防线主体是后者；逻辑名→物理名的编码方案见技术笔记
- 大文件分帧流式传输，保持服务层现有「临时文件 → 提交 → 失败补偿」语义；host 侧写临时
  文件 + `rename` 原子替换
- `RxdbFileStorage` 现有**全部**公开 API 在桌面后端可用，清单以 `RxdbFileStorage` 类的
  公开方法面（TS 类型层）为准，不手抄（2026-08-15 评审：手抄清单漏掉了 `createDirectory` /
  `getMeta` / `init` / `revokeObjectUrl` / `destroy`，其中前两个是功能性方法；二次评审：
  `requirements/api-baseline/rxdb-plugin-storage.json` 只记录**模块级导出**、不追踪类
  实例方法，不能拿它当这份清单）；AC#2「复跑现有全部行为用例、无跳过项」兜底
- storage 插件没有三框架绑定包（对照 search 插件的 `rxdb-plugin-search-{angular,react,vue}`），
  三框架侧是 demo 页面直连 service —— 桌面后端在 service 层一次实现即对全部调用方透明，
  不存在「绑定层改动」这一项
- 桌面文件后端要求 meta adapter 同为桌面 SQLite（US-207）：文件落原生目录而 meta 落
  webview 存储的「备份域撕裂」组合以稳定错误码拒绝，见 AC#9
- `dev-rxdb-electron` 演示接入 + e2e 用真实 userData 验证重启后文件读回；演示的单文件
  保存一律调用 `service.download()`；ZIP 批量/文件夹下载（`download()` 不覆盖、三个
  web demo 各自手写落盘的场景）不进 Electron demo 范围 —— 不复制第四份手写
  `showSaveFilePicker` + `<a download>` 逻辑（见 Out of Scope 的存量债务说明）

### Out of Scope

- Tauri 运行时（[US-505](./US-505-tauri-local-file-storage.md)，被 US-210 前置）
- 浏览器 / PWA / 小程序的存储行为变化；OPFS 默认后端冻结
- 已有 OPFS 数据迁移到原生目录的搬家工具；需要时另立 story
- blob 参与远端同步（US-502 已声明 blob 只覆盖单机，不变）
- 让用户选择存储根位置；存储根恒在应用数据目录内
- 监听其他进程直接改写存储根产生的变更
- 收敛三个 web demo 重复实现的 **ZIP 批量下载**落盘逻辑（2026-08-15 评审核实的存量
  债务，二次评审修正范围：单文件下载三端**均已**调用 `service.download()`，手写
  `showSaveFilePicker` + `<a download>` 只在 ZIP 批量/文件夹下载路径 ——
  `apps/dev-rxdb-angular/.../storage.page.ts`、`apps/dev-rxdb-react/.../storage.tsx`、
  `apps/dev-rxdb-vue/.../useStorageTransfer.ts` 三份高度雷同，且 zip 路径三端都绕开
  `ObjectUrlRegistry`：React / Vue 为 `createObjectURL` + `setTimeout` 延迟 revoke，
  Angular 为同步 revoke）—— 另立清理项处理；本故事只承诺 Electron demo 不新增第四份

## 验收标准

| #   | 前置条件                                                          | 操作                                                                         | 预期结果                                                                                                                                                   | 状态 |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Electron 应用启用桌面文件后端                                     | `upload()` 一个文件，退出应用，重启后 `read()`                               | 字节与上传一致；物理文件位于应用数据目录内的存储根，Chromium profile 的 File System / IndexedDB 目录无新增内容                                             | ⬜   |
| 2   | 桌面后端已接入                                                    | 以桌面后端为注入实现复跑 storage 插件现有全部行为用例                        | 与 OPFS 后端行为一致，无跳过项                                                                                                                             | ⬜   |
| 3   | 应用已写入若干文件与目录                                          | 退出应用，把应用数据目录整体拷贝到新 `--user-data-dir`，启动                 | `list()` 结构完整，逐文件 `read()` 字节一致 —— meta（SQLite）与文件本体在同一备份域                                                                        | ⬜   |
| 4   | renderer 构造恶意路径（`../`、绝对路径、盘符、NUL、Windows 保留名） | 经协议发起文件操作                                                           | host 拒绝并返回稳定可判别错误码；存储根之外无任何写入                                                                                                      | ⬜   |
| 5   | 上传/读取超过预览上限量级的文件（≥ 50 MiB，即 `DEFAULT_PREVIEW_LIMIT_BYTES` 默认值，可经 `previewLimitBytes` 配置，`storage.service.ts`） | 全程观察内存与中断行为                                                       | 分帧流式完成，内容不整体进 JS 堆；传输中途 abort 或杀进程后重启，路径上要么旧内容要么新内容，无半写文件，无孤儿 meta                                       | ⬜   |
| 6   | 磁盘满或存储根无写权限                                            | `upload()` / `fetch()`                                                       | 稳定错误码 + 原始原因；现有补偿语义成立（meta 与文件不脱钩），不回退 OPFS/内存                                                                             | ⬜   |
| 7   | 同一应用开两个窗口                                                | 并发 `upload()` 同一路径（其一 overwrite）                                   | 串行化执行，结果等价于某一种顺序执行；无文件删失、无孤儿 meta（STOR-002 的临界区跨窗口成立）                                                               | ⬜   |
| 8   | web 应用照常使用插件（不配桌面后端）                              | 构建 + 运行现有浏览器测试                                                    | 行为与包体不变；桌面后端代码不进浏览器 bundle；新增子路径入口按 `KNOWN_UNCOVERED_SUBPATHS` 流程登记（[US-601](../tooling/US-601-subpath-api-surface-baseline.md) 缺口敞开期间人工审查其导出面） | ⬜   |
| 9   | 启用桌面文件后端，但 `sync.local` 配置的不是桌面 SQLite adapter（如 wa-sqlite / OPFS） | 初始化 storage 插件                                                          | 以稳定可判别错误码拒绝启用，不启动文件后端、不静默降级 —— 「文件在原生目录、meta 在 webview 存储」的备份域撕裂组合被禁止（无 fallback 铁律）；`ensureLocalReady` 现无 adapter 类型判别，该校验须在桌面后端接入点新增 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#7 的锁归宿是本故事最大的设计决策：`PathLockManager` 现用 Web Locks（按 rootDir
> 命名空间的同源锁），两个 BrowserWindow 同 origin 同 profile 时成立，但这是对 Chromium
> 实现的假设而非契约。另注意（2026-08-15 二次评审）：`PathLockManager` 在
> `navigator.locks` 缺失时**静默降级为进程内队列**（`path-lock.ts`），该回退在多窗口下
> 不提供任何互斥且不报错 —— 锁归宿决策必须把它列为不充分项：缺 Web Locks 时要么临界区
> 下沉 host 侧，要么以可判别错误拒绝多窗口场景，不得静默单进程化（无 fallback 铁律）。
> plan 阶段必须决定「继续依赖 Web Locks 并用双窗口 e2e 钉住」还是「临界区下沉 host 侧
> 兜底」；该决策同时约束 [US-505](./US-505-tauri-local-file-storage.md)（WKWebView 的
> Web Locks 可用性另算）。

## 技术笔记

### 接缝二选一（plan 阶段冻结）

| 方案        | 做法                                                                                       | 主要风险                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| handle shim | renderer 侧实现 `FileSystemDirectoryHandle` 兼容代理，底层走 IPC；service 零改动           | 要仿真 `File`（含 `stream()` / `slice()`）与 `createWritable` 的「副本写 + close 原子替换」语义，接口面大且随规范漂移 |
| 窄接口      | 从 service 抽 `StorageFilesystem`（openRead / openWrite / move / remove / list / exists）  | 要重构 service 内部调用点；换来的是接口面固定、逐后端可独立测试                                     |

两案共同约束：接缝层不得丢掉现有回滚 journal 语义；桌面后端可为 `move()` 提供原生
rename，而不是走 copy+delete 回退。

### 写入原子性映射

OPFS `createWritable` 天然是「写副本、`close()` 原子替换」；node:fs 的等价物是「写临时
文件 + `fs.rename`」。service 层另有自己的快照补偿（`readFileIfExists` /
`restoreFileState`），host 实现不得把这套语义偷换成就地写 —— AC#5 的「无半写文件」靠的
是这两层叠加。

### 物理文件名编码

OPFS 名字空间宽松，NTFS 不是：`? * : " < > |`、`CON` / `NUL` 等保留名、结尾空格与点在
Windows 上非法或有陷阱。两条路：收窄逻辑名字符集（破坏与 OPFS 后端的行为一致性），或
逻辑名→物理名做确定性编码（保留任意逻辑名，**倾向此案**）。plan 阶段冻结；host 白名单
校验以**物理名**为准。

### 传输与协议

- 文件消息复用 `@aiao/rxdb-adapter-desktop` 的 host 协议通道与
  `DESKTOP_HOST_PROTOCOL_VERSION` 协商；两端版本不一致时按既有拒绝路径处理
- renderer 入口不得出现 `node:fs` —— 同 US-207 对 `node:sqlite` 的承诺。源码层已有自动
  防线：`packages/rxdb-adapter-desktop/src/__tests__/public-api.spec.ts` 的
  「keeps every Node builtin behind the host entry」import 图断言会自动覆盖新增的文件
  客户端模块（若客户端落在 storage 插件包内，需为该包补同型断言）；产物层（minify /
  bundle 后）的自动门禁已移除（见 US-207），发布前手工 `pnpm pack` 验证仍是最后一道
- `download()` 不经 host：Blob 已在 renderer，Chromium 的 `showSaveFilePicker` 与
  `<a download>` 回退照旧
- `fetch()` 远程缓存逻辑不变：renderer 侧 `globalThis.fetch` → 流式写入改走注入后端

### 依赖

- [US-207](../adapter/US-207-desktop-local-database.md) 的 host / preload / 协议版本模式
  （已随 `@aiao/rxdb-adapter-desktop@0.0.25` 发布）；不依赖其未关闭的 AC#8 打包矩阵
- metadata 侧无新依赖：桌面场景下 `rxdb.config.sync.local` 应配置桌面 SQLite adapter
  （US-207 已交付）。注意 `ensureLocalReady` 实际只校验 `config.sync.local` 存在并
  `connect()` 成功（严格说还前置 `assertActive()` 与 `init()`，但均与 adapter 类型
  无关），**没有**「adapter 是否本地/桌面」的运行时判别 —— 错配拒绝由 AC#9 承担，
  不能指望 `ensureLocalReady` 把关

## 实现文件

- `packages/rxdb-plugin-storage/src/` — 文件系统接缝、OPFS 默认后端、桌面后端 renderer 客户端
- `packages/rxdb-adapter-desktop/src/` — host 协议新增文件消息类型（renderer 入口零 node 依赖不变式保持）
- `apps/dev-rxdb-electron/src-electron/` — 文件 host：存储根解析、路径校验、流式落盘
- `apps/dev-rxdb-electron-e2e/` — AC#1 / #3 的重启与备份恢复 e2e
- `requirements/api-baseline/` — 新公开 API 基线；新增子路径入口同步 `KNOWN_UNCOVERED_SUBPATHS`

## References

- [US-502 Storage 插件](./US-502-storage-plugin.md) — 现有 OPFS 实现与 API 承诺
- [US-207 Electron 连接本地 SQLite 文件](../adapter/US-207-desktop-local-database.md) — host 契约、安全基线、`rxdb-data` 目录命名教训
- [US-505 Tauri 本地文件存储](./US-505-tauri-local-file-storage.md) — 复用本故事接缝的 Tauri 半边
- [US-601 子路径入口纳入 API 表面基线](../tooling/US-601-subpath-api-surface-baseline.md) — AC#8 的登记流程
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
