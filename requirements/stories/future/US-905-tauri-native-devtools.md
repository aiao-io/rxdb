---
id: US-905
title: Tauri DevTools 调试窗口、transport 与原生存储集成
status: In Progress
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-09-05
tags: [tooling, devtools, desktop, tauri, transport, sqlite, filesystem, security]
---

<!--
INVEST 检查清单:
- [x] Independent: 阶段 1 只依赖 US-904 阶段 C，不等待 US-210 / US-505；阶段 2 只接真实 Tauri providers
- [x] Negotiable: Tauri event 或窄 command 承载消息、provider 注册位置与三平台 smoke 调度可在 plan 阶段冻结
- [x] Valuable: Tauri 开发者获得与 Chrome / Electron 一致的数据库、事件和本地文件调试体验
- [x] Estimable: bootstrap、身份/授权、release 隔离、provider、重启 E2E 与三平台 smoke 已分项
- [x] Small: 不改共享协议、不建面板、不实现数据库导出；两阶段以独立 PR 审查
- [x] Testable: 真实 Tauri 窗口、Rust/WebView transport、1001 条诊断、重启与三平台 smoke 可验收
-->

# 用户故事：Tauri DevTools 调试窗口、transport 与原生存储集成

> 跨故事契约、协议数值与状态机见 [US-904](./US-904-devtools-native-storage-contract.md)（阶段 B 是
> v2 协议的唯一真相源）。本故事在 Tauri 中承载共享面板，并接入 US-210 / US-505 的真实 host。

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Tauri 桌面应用的开发者
**我想要** 在开发态打开与 `rxdb-devtools-extension` 同源的 RxDB 调试面板，检查 Tauri SQLite、实时事件、
storage metadata 与应用作用域内的原生文件
**以便** 在不依赖 Chrome 扩展的前提下，使用一致的界面和诊断语义定位数据库记录、文件索引与文件本体之间的问题

## 运行模型

Tauri WebView 不支持安装 Chrome Manifest V3 扩展，因此本故事不承诺「把 CRX 装进 Tauri」。正确模型是复用
[US-904](./US-904-devtools-native-storage-contract.md) 阶段 C 交付的面板与状态服务，在显式开发配置下
创建标签固定的 `rxdb-devtools` 调试窗口：

```text
Tauri main WebView (@aiao/rxdb-devtools connector)
        | 版本化、双向、严格校验的定向 Tauri transport
        v
rxdb-devtools WebView (共享 DevTools panel)
        | provider request
        v
US-210 SQLite host / US-505 native file host
```

调试窗口不是第二个 RxDB writer，不直接打开 SQLite，也不获得 Tauri SQL / filesystem 原始权限；
它只通过主 WebView 中的 connector 使用受限调试能力。

## 两阶段与启动门禁

| 阶段                                   | 内容                                                                             | 门禁                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **阶段 1：窗口、transport 与产物隔离** | dev window、定向 v2 transport、共享 fake provider 验收、release capability 隔离  | [US-904](./US-904-devtools-native-storage-contract.md) 阶段 C 已交付；**可与 US-210 / US-505 并行**                          |
| **阶段 2：真实 provider 与三平台证据** | 接入 US-210 SQLite / US-505 native files、诊断、Settings、重启 E2E、三平台 smoke | 阶段 1 + [US-210](../adapter/US-210-tauri-sqlite-local-database.md) + [US-505](../plugin/US-505-tauri-local-file-storage.md) |

阶段 1 之所以门禁在 US-904 阶段 C 而不是阶段 B，是因为 **Chrome 是 v2 的参考实现**：先有一个真实平台跑通
四段 relay，Tauri 才不会成为第一个发现协议缺陷的地方。不得等待全部 native host 完成后才开始阶段 1，
也不得由 Tauri adapter 复制或反向修改共享 wire。US-905 不等待 US-904 的 Electron MV3 门禁（阶段 A）
或 Electron 集成（阶段 D）。

## 范围边界

### In Scope

**阶段 1 — 窗口与 transport**

- `dev-rxdb-tauri` 在显式开发配置下创建唯一 `rxdb-devtools` WebView window，并加载共享 panel；关闭配置时
  不注册窗口、快捷入口或调试权限
- 在主 WebView connector 与调试 WebView 之间实现定向 v2 transport，绑定 session、sender identity、
  主窗口 label、调试窗口 label 和 provider owner；承载现有握手、实体查询、全部 `RXDB_EVENT_TYPES`、
  branch、Storage metadata 与版本化 provider 消息，不复制第二套业务协议
- 使用 US-904 阶段 B 的共享 fake `database` / `files` / `settings` providers 和 fixtures，验证所有消息、限额、
  capability/descriptor/mutation policy、transfer、snapshot、错误与生命周期，不复制 Tauri 私有 wire
- dev/release 使用不同 capability 输入；release 产物不含调试窗口 bootstrap、专用 command 或只服务
  `rxdb-devtools` label 的 capability
- wa-sqlite demo 按运行时**真实选中**的 `OPFSCoopSyncVFS`、`IDBBatchAtomicVFS` 或 `unavailable` 映射
  `opfs`、`idb`、`unavailable` 语义 provider，`runtime: tauri` 只用于显示，不能根据 adapter 名、URL 或
  平台猜测行为
- 真实 Tauri 窗口打开、关闭、主窗口刷新、应用退出和同 label 重开证据
- 创建或复用 `apps/dev-rxdb-tauri-e2e`：US-210 与本故事中先开工者用 generator 创建一次，双方只维护
  自己拥有的 spec

**阶段 2 — 真实原生 provider**

- Tauri SQLite provider 通过主 WebView connector 查询实体、全部 `RXDB_EVENT_TYPES`、branch 与
  Storage metadata；调试窗口不直接打开数据库
- Tauri native files provider 只暴露插件专用逻辑根，支持浏览、刷新、上传、下载、新建目录和删除，
  原样复用 US-904 阶段 B 的 RFC 4648 base64 transfer 状态机，provider 声明真实 `maxTransferBytes`，覆盖边界
  大小、乱序/重复/缺块、取消、超时与断连，不在 WebView/Rust 整体缓存文件
- 三个领域只声明 US-904 阶段 B 的语义 kind；显式开发 fixture 以 `capabilities: full` + `mutationPolicy: allow`
  开启文件变更，省略 mutation policy 时保持只读
- 1001 条以上有界 immutable snapshot、两类缺失、临时文件/journal/在途上传排除，以及 US-904 阶段 B 冻结的
  「从请求进入起算、包含等锁」的 deadline 与 `snapshot_busy` / `snapshot_too_large` / `snapshot_expired`
- Settings 数据库下载始终 `export_unsupported`；清理只按 provider 明确能力启用，不操作 WebView
  OPFS / IndexedDB fallback
- 调试 WebView、主 WebView、transport 与 Rust/host 分层校验身份、capability、descriptor、mutation
  policy、操作和逻辑路径；错误响应保留稳定类别但不泄漏绝对路径、SQL 绑定值、加密字段或文件内容
- 真实临时应用目录、SQLite、native files、WebView/Rust/host 重启 E2E
- macOS、Windows、Linux desktop 开发构建的窗口、握手、session 释放和 release capability smoke

### Out of Scope

- 在 Tauri 中加载 Chrome CRX、Manifest V3 background、content script 或 `chrome.*` API
- 让调试窗口获得 SQL、filesystem、shell、原始 event 总线或通用 `invoke` 权限
- 修改 US-210 / US-505 的事务、路径解析、原子写入、补偿或备份域语义
- 数据库导入导出、SQLite/WAL 热备份、export lease、任意 SQL 或应用目录浏览
- Tauri mobile、远程设备调试或网络 attach
- 用 fake/in-process transport 替代真实 Rust/WebView/host E2E

## 验收标准

### 阶段 1：窗口与 transport（AC#1～#8）

| #   | 前置条件                                                                  | 操作                                                             | 预期结果                                                                                                                                     | 状态 |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 分别构建显式 dev 与 release 配置                                          | 检查产物并启动                                                   | dev 只创建一个 `rxdb-devtools` 窗口并握手；release 无入口、bootstrap、专用 command 和只服务该 label 的 capability                            | ✅   |
| 2   | 真实主窗口与调试窗口已打开                                                | 用共享 fake providers 执行查询、事件、授权、transfer 和 snapshot | US-904 阶段 B conformance 全部通过；Tauri 只适配 transport，不复制 panel、provider 类型、fixture、错误码或状态机                             | ⚠️   |
| 3   | 非调试窗口、错误 sender/label，或合法 sender 伪造越权操作                 | 通过 transport 发送                                              | 错误身份在 WebView/transport/Rust 均拒绝；合法 sender 仍受 capability/descriptor/mutation policy 限制，session/label 不能充当授权            | ✅   |
| 4   | session A 有订阅、请求和未完成传输                                        | 关闭窗口，以同 label 重开 B 并投递 A 消息                        | A 的资源释放，B 获得新 UUID v4 session 并拒绝全部旧身份、事件、响应与 chunk                                                                  | ✅   |
| 5   | 主窗口刷新、transport 断开或应用退出                                      | 观察 connector/provider 生命周期                                 | 订阅、计时器、snapshot、请求、传输和临时文件均取消；provider owner 释放，不留下可复用 host session                                           | ✅   |
| 6   | wa-sqlite 分别实际选择 OPFS、IDB、unavailable                             | 打开调试窗口查看 provider                                        | 分别声明 `files: opfs`、`settings: idb` 或结构化 unavailable；均带 `runtime: tauri`，但行为只由 kind/operations 决定                         | ⚠️   |
| 7   | 版本、权限、非法数值/base64、传输乱序/取消、snapshot busy/expired fixture | 通过 Tauri transport 执行                                        | safe-integer guard、decoded-byte 限额、穷举错误和资源释放与 US-904 阶段 B 一致，不增加平台错误码、编码或 fallback                            | ⚠️   |
| 8   | `apps/dev-rxdb-tauri-e2e` 已由 US-210 或本故事创建                        | 检查项目与 specs                                                 | workspace 中只有一个 generator 创建的 E2E project；本故事只拥有 DevTools window/transport/release-isolation specs，不接管 US-210 数据库 spec | ✅   |

### 阶段 2：真实原生 provider（AC#9～#17）

| #   | 前置条件                                                   | 操作                                                   | 预期结果                                                                                                                        | 状态 |
| --- | ---------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 9   | 应用通过 US-210 使用应用作用域 SQLite                      | 查询实体、逐类派发事件并切换 branch                    | 数据、全部 `RXDB_EVENT_TYPES` 和 branch 与主窗口一致；调试窗口不打开数据库、不创建 OPFS/IDB fallback                            | ⚠️   |
| 10  | 应用通过 US-505 使用 native files 并显式允许 mutation      | 浏览并执行正常/零字节/边界大小上传下载、新建目录、删除 | 只操作插件根，字节一致；UI 仅用 `runtime: tauri` 显示来源；全程流式，失败/取消/超时无半写文件或孤儿 metadata                    | ⬜   |
| 11  | 1001 条以上 metadata/files、两类缺失和在途上传             | 读取完整诊断 snapshot                                  | 从请求进入起算的共享 deadline（US-904 阶段 B）覆盖等锁/物化/重试；不漏尾页或误报临时状态；busy/too-large/expired 与共享错误一致 | ⬜   |
| 12  | 打开 Settings                                              | 尝试数据库下载和未声明的清理                           | 下载禁用且强制命令返回 `export_unsupported`；未声明能力返回 `provider_unsupported`，不读取 SQLite/WAL、OPFS/IDB 或其他应用目录  | ⚠️   |
| 13  | 错误窗口/旧 session，或合法窗口在授权组合下伪造操作        | 通过真实 transport 发送                                | 各层拒绝错误身份；未授权 provider 调用为 0，未 opt-in mutation 不执行；响应不含路径、SQL 绑定值、加密字段或文件内容             | ⚠️   |
| 14  | session 有订阅、迟到响应、snapshot 和未完成传输            | 关闭/刷新窗口或退出应用                                | 订阅、请求、snapshot、传输、临时文件和 host session 全释放；重开拒绝旧身份与迟到数据                                            | ⚠️   |
| 15  | 真实临时应用目录、US-210 SQLite 与 US-505 files            | 跑 E2E，重启应用后重新连接                             | 重启前后同一实体和文件一致；证据经过真实 panel/双 WebView/transport/Rust/host，不用 fake 替代                                   | ⚠️   |
| 16  | Tauri provider 接入 US-904 阶段 B conformance 与共享 panel | 运行共享 provider 与 panel 回归                        | 控制面、safe integer、base64、descriptor、分页、授权、错误和 session 重建通过；不等待 Electron，也不复制组件、状态机或 wire     | ⬜   |
| 17  | macOS、Windows、Linux desktop dev/release 构建             | 打开/关闭调试窗口并检查产物                            | 三平台完成加载、握手、session 释放；release 无调试 capability/command/bootstrap，高成本打包 smoke 只在 release 分支或 tag 运行  | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 交付状态

**当前口径（2026-09-05）**：阶段 1 的 8 条 AC 为 **5 条 ✅（#1 #3 #4 #5 #8）、3 条 ⚠️（#2 #6 #7）**。
阶段 2 已于 2026-09-05 开工（C1～C3 与 C4 前三片已落地）：**AC#9 / #12 / #13 / #14 / #15 / #17 转
⚠️，一条都还没关**；#10 / #11 / #16 仍是 ⬜。阶段 1 那三条 ⚠️ 都不再缺 harness，缺的是一次 owner
边界决定或阶段 2 的真实
provider——见[仍未覆盖的三条](#仍未覆盖的三条以及一处需要-owner-划边界的地方)与[发现 7](#发现-7ac7-的--高估了它的证据2026-09-04-复核)。
本节以下两段是 **2026-08-31 的历史快照**，被「[阶段 1 harness 落地与三处实测发现（2026-09-04）](#阶段-1-harness-落地与三处实测发现2026-09-04)」整节取代，保留只为记录当时的判断依据。

**（历史，2026-08-31）阶段 1 已开工并基本落地**（2026-08-30 ～ 08-31，三次提交 `d0a6315` / `563639d` / `198439d`）：
两个启动硬阻塞都已破——`rxdb-devtools` 窗口的独立 capability、`devtools_message` 的
`#[cfg(dev)]` 隔离。当时 8 条 AC 中 **2 条 ✅、6 条 ⚠️**。

⚠️ 的 6 条**不是没写**，而是判据里都含「真实 Tauri 窗口 / 真实构建产物」那一半。
**缺口不在构建环境**：本机 cargo 1.97.1 + tauri-cli 2.11.4 齐全，
`nx run dev-rxdb-tauri-e2e:desktop-smoke` 会先 `tauri build --ci --no-bundle` 出真 release
二进制再驱动它，热 target 下全程约 59s（2026-09-01 实测 4 files / 13 tests 全绿，
含 `devtools-release-isolation` 的 5 条 release 隔离断言 —— 这一跑同时确认了阶段 1 收尾
新增的 `@aiao/rxdb-devtools` 依赖没有把调试入口漏进 release 产物）。
**缺口在 harness**：`desktop-smoke` 按 [US-210](../adapter/US-210-tauri-sqlite-local-database.md)
AC#9 刻意只做进程级驱动、不上 WebDriver，验得了「进程整个退出再拉起、数据还在」，
验不了双 WebView 握手（AC#2）、同 label 重开拒旧身份（AC#4）、退出时的 session 释放（AC#5）。
已落地的那一半是 transport、路由、映射与结构隔离，全部有断言守着。

门禁（本机实测）：`dev-rxdb-tauri` 单测 **21 文件 217 条**（含 `tauri-conformance.spec.ts`
的 **80 条** conformance 断言）、`src-tauri` 的 `#[test]` **25 条**（`lib.rs` 5 + `selfcheck.rs` 20）。

面板版本不再硬编码：`src/devtools/main.ts` 直接 import `src-tauri/tauri.conf.json` 取 `version`
（本 app 没有 `package.json`，那份配置就是它的版本单一来源）。刻意**不**走 `@tauri-apps/api`
的 `getVersion()`——那要给 `rxdb-devtools` 窗口多授一条 `core:app:default`，而 AC#1 的判据正是
这个窗口的 `permissions` 恰为 `['core:event:default']`；版本本来就是构建期常量，没有理由
拿一次运行期 IPC 去换。`tsconfig.app.json` 的 `include` 因此多列了这份 JSON（composite 工程
的 TS6307）。

### 证据落点（2026-08-31 快照）

> 右列的「差的那一半」中，**#1 #3 #4 #5 已由 2026-09-04 的真实双窗口 harness 补齐**（见下一节），
> 只有 **#2 #6** 的右列仍然成立；#7 的右列当时写错了方向，已由[发现 7](#发现-7ac7-的--高估了它的证据2026-09-04-复核)纠正。左列的证据本身没有失效。

| AC    | 已落地的证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ⚠️ 差的那一半                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1    | `apps/dev-rxdb-tauri-e2e/src/devtools-release-isolation.spec.ts`（5 例）：`default.json` 的 `windows` 恰为 `['main']`、`devtools.json` 恰为 `['rxdb-devtools']` 且 `permissions` 只有 `['core:event:default']`（不继承 `core:default` ⇒ 拿不到 window 控制 / SQL / filesystem）、`devtools_message` 与 `open_devtools_window` 两侧的 `#[cfg(dev)]` 都在（含 `generate_handler!` 那一臂）                                                                                                                                                                                                                                                                                                                                                                                                                   | release 隔离是**源码结构证据**（理由见 spec 头注：拿 `strings` 翻二进制会被 renderer 侧的命令名字符串误命中）；「dev 构建真的只起一个窗口并握手」需真实构建                                                                                                                                                                                                                                                |
| #2 #7 | `apps/dev-rxdb-tauri/src/devtools/tauri-conformance.spec.ts` —— 与 `packages/rxdb-devtools/src/__tests__/testing/conformance.spec.ts` 的差别**只有一个 `createNodes`**（`tauri-relay-nodes.ts` 把 Tauri transport 装进四段 relay 的中间两段）。判据、fixture、状态机断言、错误码表一行没复制，这正是 US-904 AC#44 要的结构。80 条断言覆盖 safe-integer guard、decoded-byte 限额、穷举错误、transfer/snapshot 状态机、session 轮换与资源释放                                                                                                                                                                                                                                                                                                                                                                | **「AC#7 的判据全在 transport 语义上，已足 ✅」是错的**（纠正见发现 7）：这条链路里没有一次 `invoke`、没有一个真实 WebView，而 AC#7 的判据栏写的是「通过 Tauri transport 执行」。#2 #7 差的是同一件事——把这些判据在**真实**跨窗口投递上复跑                                                                                                                                                                |
| #3    | Rust 侧 `lib.rs` 的 `devtools_routing::target_label_of()` 白名单两枚已知 label + 2 条 `#[test]`（`routes_between_the_two_known_labels` / `rejects_an_unknown_sender_label`，空串与 `settings` 都拒）。**未知 label 拒绝而不是默认转发到 main**——默认转发会让任何忘了排除的窗口静默拿到这条通道                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 三层里只证到 Rust 这一层 + conformance 的授权断言；真窗口伪造未验                                                                                                                                                                                                                                                                                                                                          |
| #4    | conformance 的 session 轮换断言；Tauri 没有 `MessageChannel`，隔离由 Rust 按窗口 label 路由提供（`tauri-connector-transport.spec.ts` 的 `createSessionPort` 恒返 `undefined`、`closeSessionPort` 空操作即此决策的固化）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 真实关窗 → 同 label 重开 → 拒旧身份，需真窗口                                                                                                                                                                                                                                                                                                                                                              |
| #5    | `tauri-transport.service.spec.ts` 的 `ngOnDestroy 摘除监听并置 disconnected`、`断开后 postFrame 静默丢弃`（不抛错）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 主窗口刷新与应用退出两条路径未在真实环境跑                                                                                                                                                                                                                                                                                                                                                                 |
| #6    | `tauri-vfs-providers.spec.ts`（10 例）：OPFS / IDB / unavailable 三分支的 kind 映射 + 「相同 kind 在不同后端下产出相同的操作与限额，runtime 不参与分叉」，外加 `createWaSqliteDevToolsPorts` 的 5 例装配断言。`runtime` 由调用方传入并**逐领域透传**（`assertRuntimePassesThrough` + 「runtime 不影响 kind / operations / limits」两例守住）：早先映射里恒填 `'tauri'`，而它唯一的运行时调用点只在非 Tauri 下被选中，于是浏览器预览宣告 `tauri`、真窗口宣告 `browser`，两端恰好反了。映射已接进运行时：`setup_rxdb_wa-sqlite.ts` 把**同一次**后端判定（memo 化，适配器与 devtools 共用一个结论）交给 `createWaSqliteDevToolsPorts(backend, opfsRoot, 'browser')` → `getDevToolsConnector({ providers })`；IDB 后端撤掉 `getRootDirectory` 以致 `files` 领域整个不宣告，后端 `unavailable` 则不建 connector | 判据里的「打开调试窗口查看 provider」仍需真实 Tauri 窗口。另外打包后的 Tauri 窗口里桌面候选恒胜出（见 `setup_rxdb.ts` 候选表顺序），这条 wa-sqlite 路径只在 `nx serve` 的浏览器预览里跑——AC#6 的现场核对因此要等阶段 2 的真实 native provider。AC#10「两领域都显示 `tauri`」另有阻塞：`native-files` provider 的 runtime 写死 `'electron'` 且没有覆盖端口（见 `connector-providers.ts` 的 `runtime` 说明） |
| #8    | `apps/dev-rxdb-tauri-e2e` 是 US-210 用 generator 建的唯一 E2E project，本故事只往里加 `devtools-release-isolation.spec.ts`，`desktop-persistence` / `desktop-file-storage` / `desktop-webview-capability` 三份仍归 US-210 / US-505。`desktop-smoke` 的 metadata 已记本故事的 AC#1/AC#8，并注明那份 spec 是纯静态检查、挂在这个 target 下只是搭 `include` 的车，不是真依赖 release 产物                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                          |

## 阶段 1 harness 落地与三处实测发现（2026-09-04）

**缺的一直是 harness，不是构建环境**——这一轮把它建起来了，形态是**扩自检报告**而不是 WebDriver
（`tauri-driver` 在 macOS 上不存在）：

- **新 target `dev-rxdb-tauri:tauri-package-dev`**：裸 `cargo build`。`cfg(dev)` 由 tauri crate 的
  build.rs 按 `has_feature("custom-protocol")` **取反**得出（`tauri-2.11.2/build.rs:255-259`），
  而 `tauri build` 会打开那个 feature——所以 release 产物里调试窗口与 `devtools_message`
  **根本不存在**（这正是 AC#1 的隔离判据），dev 侧判据只能由不带该 feature 的产物来验。
  产物落 `target/debug/`，与 smoke 的 `target/release/` 互不覆盖。
- **报告 schema v2 → v3**：新增 Rust 侧枚举的 `windowLabels` 与主 WebView 上报的 `devtools` 探针。
- **新 target `dev-rxdb-tauri-e2e:devtools-smoke`** + `vitest.devtools.mts`：dev 产物按 `devUrl`
  取前端，所以 spec 自己在**写死的 1420** 上服务前端产物；端口被占时显式失败，不另挑一个
  （另挑一个会让应用连到别的东西上，失败形态退化成「白屏 + 看门狗超时」）。

**AC#1 的 dev 半边已关**：dev 产物实测 `windowLabels` 恰为 `["main", "rxdb-devtools"]`。
这是 US-905 第一次拿到「真实 Tauri 窗口」的证据。窗口集合由 **Rust 侧**枚举而不是 renderer 上报——
让 renderer 说的话，`#[cfg(dev)]` 那道编译期隔离就退化成一句自述。

### 发现 1：中继一直在**广播**，「定向投递」从未成立（已修）

`lib.rs` 原本是 `target.emit("devtools:message", …)`。`Emitter::emit` 读起来像「发给这个窗口」，
实际转身就调 `self.manager().emit(...)`（`tauri-2.11.2/lib.rs:946-950`）——**接收者是谁完全不影响
投递范围**。于是每一帧都同时落到两个 WebView 上，两侧靠 v2 信封的 `direction` 各自丢弃，
功能上看不出异常，而 In Scope 写的「业务数据只发往目标窗口，不落到任何不该看到它的 WebView 上」
一直不成立。

发现经过：握手探针挂在**主窗口**上收调试窗口的帧，却收到一条只可能由主窗口自己发出的
v1 `HANDSHAKE`。已改为 `app.emit_to(target_label, …)`。

### 发现 2：定向投递需要**两侧**都改，只改 Rust 无效（已修）

改完 Rust 后主窗口**仍然**收到自己的帧。成因在 JS 侧：`@tauri-apps/api/event` 的全局 `listen()`
注册的监听 target 是 `EventTarget::Any`，而 Tauri 的投递过滤是 `match_any_or_filter`
（`tauri-2.11.2/event/listener.rs:286`）——**`Any` 监听无视过滤器**，照收所有帧。
三处监听（connector transport、panel transport、探针）已全部改为
`getCurrentWebviewWindow().listen(...)`，绑定到本窗口 label 上，定向投递才真的成立。

### 发现 3：`devtools/` 产物会被 nx 缓存恢复抹掉（**已修**）

两侧都改对之后，主窗口收到**零帧**——调试窗口的面板根本没 bootstrap。真因是构建配置：
`build-devtools`（vite 打面板，产出 `dist/apps/dev-rxdb-tauri/browser/devtools/`）**没有声明
`outputs`**，而 `build` 的 `outputs` 是它的父目录 `dist/apps/dev-rxdb-tauri`。`build` 一旦命中
nx 缓存，恢复产物时整个父目录被换掉，**连带删掉 `devtools/`**；而 `build-devtools` 同时也命中
缓存被跳过，没人再写回去。调试窗口于是 404，面板不 bootstrap，一帧不发。

**修法**：把依赖**反过来**——`build-devtools` dependsOn `build`（原先是 `build` dependsOn
`build-devtools`），并给它声明 `outputs` + `cache: true`，面板产物因此总是**最后**落盘；
缓存命中时 nx 也知道要把 `devtools/` 恢复回来。`tauri.conf.json` 的 `beforeBuildCommand`
随之改成 `nx run dev-rxdb-tauri:build-devtools`（它会带上 `build`，配置仍走 `build` 的
`defaultConfiguration: production`），release 打包因此也拿到完整前端产物。

判别力实测：清空 `dist/` 后重跑，拿到 **20/20 全缓存命中**，而 `devtools/` 与 `index.html`
同时在位——那正是以前必然翻车的那一格。

**AC#1 关闭**：`devtools-window-transport.spec.ts` 三条全绿（原先两条 `it.fails` 已翻成真断言）。
dev 产物的窗口集合恰为 `["main", "rxdb-devtools"]`；主窗口收到调试窗口经真实 Rust 中继送达的
`PROTOCOL_HELLO` + `HANDSHAKE_ACK`，session id 是 UUID v4。这是 US-905 第一次拿到
**两个真实 WebView 完成 v2 握手**的证据。

**AC#2 仍 ⚠️，别把握手当成它**。它的判据是「用共享 fake providers 执行查询、事件、授权、
transfer 和 snapshot，阶段 B conformance **全部**通过」。今天那 80 条 conformance 跑在
`tauri-conformance.spec.ts` 的**进程内**四段 relay 上（`tauri-relay-nodes` 装的 transport），
不是跑在这两个真实窗口之间。握手打通只证明了链路能通，没证明整套状态机在真实窗口上也成立——
把它记成 ✅ 就是拿一条弱证据顶掉一条强判据。剩下的工作是把 conformance 的驱动接到自检报告这条
通道上（harness 已经在了），不再需要新的基础设施。

**仍未覆盖（AC#3～#6 保持 ⚠️）**：伪造身份的真窗口用例、同 label 重开拒旧身份、退出释放、
wa-sqlite 三档 VFS 现场核对。前三条现在有 harness 了（扩自检报告即可），第四条仍需阶段 2 的
真实 native provider 或一个 dev-only 后端强制开关。

**另一处已知、未修**：`tauri dev` 走的是 `beforeDevCommand` 的 Angular dev server，而
`devtools/` 是 vite 另写到 `dist/` 的静态产物——dev server 不服务它，所以 `tauri dev` 下调试窗口
同样 404。本轮的 harness 走的是「静态服务 `dist/`」那条路，不受影响；要让 `tauri dev` 也能用，
得让 dev server 一并服务那个子目录，属另一件事。

**门禁现状**：`dev-rxdb-tauri` 单测 22 文件 222 条、Rust `#[test]` 25 条、
`devtools-smoke` 1 绿 + 2 预期失败、`desktop-smoke` 13 条全绿（release 隔离未回退）。

### 发现 4：Tauri 侧同样缺「对端没了」的信号（已修，AC#4 随之关闭）

补上 AC#4 的用例之后它是红的：同 label 重开调试窗口，主窗口只握上手**一轮**。成因与 Electron 侧
US-904 AC#51 完全同形——connector 的 v2 session 一直 `open`，重开的面板协商不上。
（那边的三处根因里，`#route` 未跳过协商帧与「协商机 sessionId 构造时铸死」都在共享包里，
已随 AC#51 一并修掉；Tauri 这边缺的是第三处：**没有任何东西告诉页面「调试窗口没了」**。）

修法与 Chrome 那侧对称，但落点不同：

- **Rust**（`lib.rs` 的 `on_window_event`）：调试窗口 `Destroyed` 时向 `main` 发一条
  **不带任何 payload** 的 `devtools:peer-gone`。中继按设计不解释协议，它手上没有 session 身份，
  所以只报「对端没了」这个事实。
- **页内 transport**（`tauri-connector-transport.ts`）：它从**自己发出去的** v2 `HANDSHAKE` 上
  记下本次 session，收到讣告时把它翻译成一帧 `DISCONNECT` 交给 connector。
  这是唯一同时知道「对端没了」与「这次 session 是谁」的地方——调试窗口此刻已不存在、
  不可能自己发讣告。与「`HANDSHAKE_ACK` 归面板独有」不冲突：ACK 是协议决定，
  `DISCONNECT` 是传输事实，方向本就是 `both`。

**AC#4 的驱动**：新增 `#[cfg(dev)]` 的 `rxdb_devtools_recycle_window`——关窗与重开只有主进程
做得到，而这套 e2e 是进程级驱动，外面没有手能去点那个窗口的关闭按钮。两道闸让它不是后门：
release 里根本不注册，dev 里还要自检探针已开才放行。它是 `async` + `spawn_blocking` 轮询等
label 释放的：`destroy()` **先返回、后拆窗**，紧接着建同名窗口会撞
「a webview with label `rxdb-devtools` already exists」（实测），而在主线程上 sleep 会把自己
等的那件事一起堵死。

**判据取两个 id 都在且不相等**，不是「最后那个是 UUID」——后者在「一直复用同一个 session」的
实现下同样成立，而那正是 Electron 侧真实发生过的缺陷。报告字段因此是 `sessionIds`（列表）
而不是单值，schema 随之 v3 → v4。

### 发现 5：调试窗口从来没有样式（已修）

`vite.config.devtools.mts` 的注释里写着「只是没有 crx / tailwind」——省略是知道的，后果显然不是：
`devtools.html` 不引任何样式表、`main.ts` 也不 import CSS、配置里没有 tailwind 插件，
于是那个窗口里的共享面板**一条 CSS 规则都没有**。已补 `src/devtools/devtools.css`
（`@import 'tailwindcss'` + 两条 `@source`：本目录的宿主接线与 `modules/rxdb-devtools-panel/src`）、
装上 `@tailwindcss/vite`、并在 `main.ts` import 它。Chrome 扩展那侧是同一类缺陷的较轻版本
（有样式表但 Tailwind v4 的自动来源探测够不到面板项目），详见 US-904 的「面板无样式」一节。

### 发现 6：主窗口刷新后面板不重新协商（**已修**，AC#5 随之关闭）

补 AC#5 的用例时实测：主窗口刷新之后只握上手**两轮**，第三轮不发生。这是 US-904 AC#51 那条缺陷的
**镜像**——那次是 connector 侧不知道面板没了（已修），这次是**面板侧不知道 connector 换了**。
面板的端点在 `v2` 是终态，只有 `connectionEpoch` 变化才换新端点，而 Tauri 下它只在**窗口重建**时
才变；主窗口刷新不碰调试窗口，于是面板一直对着一个已经不存在的 session 说话。

**修法与已修的那一半对称，且落点在面板 library 而不是阶段 B 冻结的协商机**：
`DevToolsEndpointService` 在**协商落定之后**（`v2` / `v1-facade` 两个终态）再收到一条
legacy `HANDSHAKE` 时，换一个新端点重新协商——那条握手是对端重启的唯一证据（connector 每次
`#startNegotiation()` 都会 eager 发一条）。`idle` / `awaiting` 期间收到的握手仍是本轮协商的
正常输入，不重建（那会把刚开的 1,000 ms 决策窗口一起丢掉）。

必须换端点而不是复位状态，理由与 connector 侧同源：session 身份在协商机**构造时**就铸好，
原地复位会让新一轮复用旧身份；面板这边还多一层——`v1-facade` 是终态，旧端点此后对每次请求
只会回 `session_closed`。

判据两处：面板 library 一条单测（落定后再收 legacy 握手 → 换端点 + 重新发 `PROTOCOL_HELLO`），
真实双窗口一条 e2e（主窗口刷新后拿到**第三轮**握手，三轮 session 两两不同）。

### AC#3 关闭：真窗口伪造身份（2026-09-04）

新增 `#[cfg(dev)]` 的 `rxdb_devtools_probe_impostor`：开一扇 label **不在白名单里**的真实窗口
（`rxdb-devtools-impostor`），用 `initialization_script` 让它在页面脚本之前直接
`__TAURI_INTERNALS__.invoke('devtools_message', …)`，敲完即由 Rust 自己把窗口收掉——
不污染 AC#1 的「窗口集合恰为两个」。

这正是白名单存在的理由所写的那个场景：**将来新增的、忘了排除在 capability 之外的窗口**。
冒名窗口拿不到任何 capability（label 不在两份 capability 的 `windows` 里），但**应用自有命令
不经过 capability 门禁**，所以它照样调得到 `devtools_message`；挡住它的只有 label 白名单。

判据取**拒绝计数 > 0** 而不是布尔：`0` 说明那扇窗根本没敲到门、这条用例什么都没验到，
而那与「敲了但被拒」在一个布尔上长得一模一样。报告字段 `devtools.relayRejected`，schema v4 → v5。
纯函数那一半（`target_label_of`）另有两条 Rust 单测，两半各管各的。

### 仍未覆盖的三条，以及一处需要 owner 划边界的地方

- **AC#2（80 条 conformance 跑在真实双窗口上）——不是「纯写用例」，需要先划一条边界。**
  `DevToolsConformanceDriver.open(scenario)` 的契约是**每条用例现装配一次会话**：capability、
  mutationPolicy、两端协议版本、descriptors 与一只可控假时钟都逐例变化（`json-driver.ts` 的
  `JsonDriverContext` 注释写得很直白：「装配必须按 scenario 现算，不能在 driver 构造时固定，
  否则整套矩阵共用第一条用例的授权配置」）。而真实主窗口里的 connector 是 bootstrap 期建的
  **一次性单例**、档位固定，复用不了。
  所以这条要在 demo 应用里再建一套 conformance bootstrap（两窗口各一份、可按 scenario 重建端点、
  时钟可控），并从 vitest 逐例驱动——**与现有 harness 同量级的一块新东西**，且直接撞上本故事
  「阶段 1 的证据只用共享 fake provider，不得夹带真实 host 接线」这条约束：
  **往产品 demo 里塞多少测试脚手架，是需要 owner 定的边界，不是实现细节。**
- **AC#6**：需阶段 2 的真实 native provider，或给 demo 加一个 dev-only 的后端/VFS 强制开关
  （同样是往产品里加开关，与 AC#2 是同一类边界问题）。

### 发现 7：AC#7 的 ✅ 高估了它的证据（2026-09-04 复核）

为 AC#2 找落点时复核了那 80 条 conformance 的实际链路，结论是它**没有经过 Tauri 的任何东西**：

- `tauri-conformance.spec.ts` 用的是 `createFakeEndpointFactory()` + `createJsonConformanceDriver`，
  两端都是 fake 端点、中继是进程内 JSON 中继；
- 号称「把 Tauri transport 装进中间两段」的 `tauri-relay-nodes.ts`，实现是
  `forward(frame, direction)` ——**一个透明转发节点**，既不 `invoke('devtools_message')`、
  也不 `listen`，整条链路里没有一次真实 IPC、没有一个真实 WebView。

它建模的是 Tauri 中继的**形状**（不解析 payload、不按方向分流、逐字节保真），这个模型是准确的，
`tauri-conformance.spec.ts` 的头注也**自己写清楚了**「**没有**覆盖『真实 Rust 命令 / 双 WebView』
那一半」。高估发生在故事这一侧：AC#7 的判据栏写的是「**通过 Tauri transport 执行**」，
而实际执行路径里没有 Tauri transport。

**处置**：AC#7 由 ✅ 改回 ⚠️，并写清它已经覆盖到的那一半（transport **语义**：safe-integer guard、
decoded-byte 限额、穷举错误、transfer/snapshot 状态机、session 轮换、资源释放）与差的那一半
（这些判据在**真实** `invoke` / `listen` 跨窗口投递上复跑一遍）。不是推翻那 80 条断言的价值——
它们是「Tauri 只适配 transport、不复制状态机」这条结构性质的证据，只是不能同时充当
「在真实 transport 上跑过」的证据。

### AC#2 的剩余范围（因发现 7 而收窄）

`tauri-conformance.spec.ts` 头注列为「没覆盖」的两项——跨窗口 `invoke` / `listen` 投递、
窗口关闭/重开——**已由本轮的 `devtools-window-transport.spec.ts` 覆盖**（真实双窗口 v2 握手、
同 label 重开、冒名窗口被拒、主窗口刷新后重新协商）。

所以 AC#2 真正还差的是：**用共享 fake providers 把五类操作（查询、事件、授权、transfer、
snapshot）在两个真实窗口之间跑一遍**。这需要在调试窗口的面板入口里加一个 dev-only 的
conformance runner（由它发起请求），并让主窗口在该模式下用共享 fake providers 装配 connector。

**明确不做的**：把那 80 条断言整套搬到真实窗口上复跑。那要求逐用例重装配两端端点、
并在**两个窗口里各放一只可远程推进的假时钟**（`advanceTime` 的契约要求 driver 掌管全部协议计时器），
与进程内驱动完全重复，成本远大于它能新增的信息量。这条边界写在这里，避免下一个人再权衡一次。

## 阶段 2 第一批：共享包 runtime 参数化 + 身份闸与授权注入（2026-09-05）

阶段 2 拆成四批交付（C1～C4），**本轮只做前两批**，两批都**不关任何 AC**——它们是 C3/C4 的
承重墙。AC 状态表因此一格未动。

### owner 已定的三条边界

| #   | 决定                                                                                                                                                            | 理由                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 面板侧操作（浏览 / 上传 / 下载 / 删除）由**一段 dev-only 的定动作驱动脚本**发起：`include_str!` 进 Rust、`#[cfg(dev)]`、经 `initialization_script` 装进调试窗口 | 三个备选里只有它让脚手架**不进 release**。放进面板 bundle 那个方案要命的地方在于 `frontendDist` 整份嵌进 release 二进制——测试脚手架会随产品一起发；通用 `eval` 命令则直接撞 CSP（`script-src 'self' 'wasm-unsafe-eval'`，无 `unsafe-eval`），且失败形态与「面板没起来」不可区分。本轮不实现，C4 落地                                                                                                                               |
| D2  | `TauriHostAccessService.evaluate` / `reloadInspectedPage` **决定不接**                                                                                          | 那条通道给的是「调试窗口可在被检查页跑任意脚本」，比它经 provider 能拿到的任何东西都大：provider 受 capability / descriptor / mutation policy 三层约束，注入的脚本跑在**主窗口的授权上下文**里，三层一条也管不着。阶段 2 的两个真实 provider 都不需要它；面板上唯一会碰它的 Settings 清理按钮，按 AC#12 本就该以 `provider_unsupported` 收口。两处 `TODO(US-905 阶段 2)` 已改写成决定并由 `tauri-host-access.service.spec.ts` 钉住 |
| D3  | settings provider **改名 + 参数化**（`createDevToolsElectronSettingsProvider()` → `createDevToolsDesktopSettingsProvider(runtime)`），删旧名                    | 两个桌面宿主的 settings 语义完全相同，各写一份就给了 `kind` / `operations` / `limits` 三处分叉的机会，而 AC#12 要的正是「两端读到同一个答案」。破坏性变化已走 API baseline 流程                                                                                                                                                                                                                                                    |

### 发现 8：调试窗口今天就能绕开三层授权直接开库（**已修**，AC#13 的承重点）

`rxdb_desktop_request`（`packages/rxdb-adapter-tauri/rust/src/commands.rs`）此前注入 `window`
**只用于会话记账**，没有任何 label 校验。而两件事叠在一起使它可利用：

- **Tauri 的 capability 只管插件命令**，应用自有命令对每个 webview 开放——这条事实本故事
  AC#3 的冒名窗口用例正是靠它成立（`lib.rs` 里已写明）；
- `DesktopRouter::handle_owned` 的 `reject_foreign_session` 挡的是「用**别人的** sessionId」，
  挡不住「**自己开一个新会话**」。

于是 `rxdb-devtools` 窗口里的任意脚本可以 `invoke('rxdb_desktop_request', {kind:'file.open'})`
拿到自己名下的文件会话，直接读写插件根与应用作用域 SQLite——绕开 connector 的三层授权。
阶段 1 没暴露只因面板不碰它；阶段 2 一接真实 provider，AC#13 的「未授权 provider 调用为 0」
就会变成**假绿**，「调试窗口不持有数据库连接与文件根句柄」这条约束也不成立。

**修法**：`DesktopHost::new` 增第三个**必填**参数（允许发起请求的窗口 label 集合），闸落在
`HostState::handle_from_window`——它是 host 的**唯一**入口，命令层没有第二条路径可以绕过它
（若把闸写在命令体里，将来任何一处 `router.handle_owned(...)` 都能绕开，且没有编译期信号）。
拒绝是普通应答 `{kind:'error', code:'permission_denied'}` 而不是 `Err`（`Err` 会被 Tauri 压平成
字符串，丢掉可判别 code），且不回显 label。**不新增错误码**。demo 侧传 `["main"]`。

判据取**会话计数不变**而不是「返回了 permission_denied」：后者在「先开了再报错」的实现下同样
成立，而那时句柄已经开出去了。两条 Rust 单测覆盖放行与拒绝（含空 label、SQL 与文件两侧）。

### 发现 9：`DevToolsDesktopFilesystem.dispose()` 全仓库零调用点（**未修**，随 C3）

`createDevToolsDesktopFilesystem` 返回的 `dispose()` 用来关 host 的 `file.*` 会话，
**Electron 侧（`apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts`）也没接**。Tauri 上后果更硬：
主窗口**刷新**不触发 `WindowEvent::Destroyed`，Rust 侧不回收，每刷一次泄一条 host 文件会话
（连同它的挂起写入与锁）。AC#14 判据里的「host session 全释放」因此今天不成立。

修法是装配处挂 `pagehide → dispose()`，但那个实例要到 C3 才存在，故随 C3 修。

### 本轮落地清单

- **PR-C1（共享包）**：`native-files-provider` 的 `runtime` 从写死 `'electron'` 改为**必填端口**，
  由 `createConnectorProviders` 的单一 `runtime` 入参喂给全部 descriptor——「files 报 electron、
  database 报 tauri」因此在结构上不可能发生（AC#10 的共享包侧判据）。`nativeFiles` 端口类型
  收窄为 `Omit<…, 'runtime'>`，避免第二个入口。settings provider 按 D3 改名参数化。
  `rxdb-plugin-storage` 的 `transport` 字段 TSDoc 改口径：Tauri 上显式传入是**唯一**生产路径
  （没有 preload 全局键），此前写的「只用于测试」会诱导下一个人把它去掉。
  **不给 runtime 默认值**：默认 `'electron'` 就是让某一端在忘记声明时静默自称成另一端。
- **PR-C2（Rust 身份闸 + 授权注入）**：发现 8 的 label 闸；新 `#[cfg(dev)] mod devtools_config`——
  三个与 Electron 逐字同名的 env（`DEV_RXDB_DEVTOOLS` / `_CAPABILITY` / `_MUTATION`，
  mutation 只认 `allow`、省略即只读）经 Tauri 插件的 `js_init_script` 注入主窗口。
  选它而不是 `invoke`，理由与 Electron 用启动参数同源：connector 是 bootstrap 期一次性单例，
  异步 IPC 到不了那么早，会留一段「按默认档已经可用」的授权空窗；插件初始化脚本在**页面脚本
  之前**同步执行（实测确认它排在 Tauri 注入 `metadata` 之后，故脚本可按窗口 label 自守）。
  未开启时**插件根本不注册**，页面上没有那个全局键，页内 `devToolsRuntimeConfig()` 返回空对象
  交回库默认档。配错就地退出，退出码 4（避开 selfcheck 的 0/1/2/3）。
- **门禁**：`rxdb-devtools` 单测全绿（新增 3 条 runtime / settings 断言，两条经反向改动实测有
  区分力）；`dev-rxdb-tauri` 单测 **24 文件 231 条**（原 22 / 222）；Rust `#[test]` 新增 2 条
  （adapter label 闸）+ 7 条（`plan_from_env` 规则穷举与注入脚本形状）；两个 crate clippy 干净；
  API baseline 已更新，diff 恰为 settings 两个名字的 removed + added。
  真实产物两条也复跑过：`devtools-smoke` **6/6 绿**（真实双窗口，阶段 1 的四条 AC 证据未回退）、
  `desktop-smoke` **14 条绿**（原 13，多的一条是本轮的 release 隔离断言；这一跑同时确认
  release 侧 `#[cfg(dev)]` 关掉后整份仍能编译）。

### PR-C3 第一半：应用侧装配与 host 会话释放（2026-09-05）

`setup_rxdb_desktop.ts` 现在把**真实** native provider 接上了：新导出的
`createDesktopDevToolsProviders({ transport, getStorage })` 产出 `nativeFiles`（US-505 桌面 host，
`kind: 'native-files'`）+ `settings`（`sqlite` 语义）+ `runtime: 'tauri'`，交给 `getDevToolsConnector`。
与 Electron 侧同构，共享包一行没复制；两处差别都是 Tauri 的结构性事实，写在函数注释里：
transport 必须显式传（没有 preload 全局键），以及下面这条。

**发现 9 已修**：装配处挂 `pagehide → filesystem.dispose()`。主窗口刷新不触发 Rust 的
`WindowEvent::Destroyed`，host 不会自己回收，没有这条接线每刷一次泄一条 host 文件会话——
连同它持有的锁，而 `file.lockAcquire` 是没有超时的无限等待。用 `pagehide` 而非 `beforeunload`
（后者在 WKWebView 上不可靠），`dispose()` 幂等。

装配单独导出是为了可测：`default` 里要先建一个真 RxDB 才够得着，而要验的三件事与 RxDB 无关。
新增 `setup_rxdb_devtools.spec.ts` 5 条——文件请求走注入的 transport、逻辑根与 storage 插件同值、
装配期不读 `rxdb.storage`（延迟到 capture）、三领域 runtime 同为 `tauri`、刷新时发出 `file.close`。
后两条经反向改动实测有区分力（把 settings runtime 改回 `electron`、摘掉 pagehide 监听即红）。

**C3 剩余的一半仍未做**：dev-only 驱动脚本的 `postFrame` / `lastAnswer` 两个动作、报告 schema
v5 → v6、以及在真实双窗口上跑 wire 用例的 `devtools-native-provider.spec.ts`。因此
**AC#9/#11/#12/#13/#14/#16 一条都还没关**——上面这些是页内一半的证据，判据里的
「经真实 panel / 双 WebView / transport / Rust / host」那一半要等驱动接好。

### PR-C3 第二半：调试窗口里的 dev-only wire 驱动（2026-09-05）

D1 落地：`src-tauri/devtools_driver.js` 经 `include_str!` + `#[cfg(dev)]` + `initialization_script`
装进调试窗口，且**只在自检探针开着时**注入。release 二进制里连这些字节都不存在——比 Electron
侧「产物在、只是没人加载」强一档，已由 `devtools-release-isolation.spec.ts` 新增的一条守住。

**为什么驱动必须住在调试窗口里**：Rust 中继按发起窗口 label 路由，主窗口发出的帧一律送到
调试窗口。所以一条要让 connector 回答的 `REQUEST` 只能从调试窗口发出，应答也只回到那里。

**为什么是「自己跑完一遍」而不是被远程逐步驱动**：本轮要验的五件事是固定的，固定脚本因此
只需要一个入站帧监听 + 一次出站汇报，不必再开一条控制通道。动作集要扩大（AC#10 的 DOM 操作、
AC#15 的重启比对）时再谈，那是 C4。

它**不放宽任何东西**：用的全是调试窗口本来就有的 `core:event:default`（listen / emit_to）与
应用自有命令 `devtools_message`（面板 transport 自己也在调）。不新增 capability、不新增 Rust
命令，发出去的 `REQUEST` 照样过 connector 的三层授权——这正是 AC#13 想看到的形态。

报告 schema **v5 → v6**，新增 `devtools.native`。字段全是**结果码**不是数据：AC#13 明写响应不得
含路径、SQL 绑定值、加密字段或文件内容，而错误码稳定、可断言、本就要跨端一致。

#### 阶段 2 的 AC 覆盖到哪一步（本轮**一条都不关**）

四条从 ⬜ 调成 ⚠️，因为它们各自被覆盖了一半——但每一条的判据都还含着驱动没做的那部分，
所以没有一条够得着 ✅：

| AC  | 已经拿到的证据                                                                                                                                                                                                                                 | 差的那一半                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| #9  | `files.list` 在真实双窗口 + 真实 host 上答 `ok`（`filesEntryCount` 为真实条目数）                                                                                                                                                              | 数据面本身：实体查询、25 类 `RXDB_EVENT_TYPES` 逐类派发、branch 切换       |
| #12 | 两条拒绝码在真实链路上分别成立：`settings.export` → `export_unsupported`（已声明，走到 provider 才拒）、`settings.clear` → `provider_unsupported`（未声明，descriptor 层就拒）。「不读 SQLite/WAL」由 provider 连 ports 入参都不收这一结构保证 | UI 半边：下载按钮画成禁用态                                                |
| #13 | 伪造 session 的同一条请求被按 session 拒（`session_invalid`），对照组是同操作同参数的那条 `files.list`；Rust 侧窗口 label 闸两条单测；**mutation 开关的两跑对照**（只读那跑写入被拒且盘上零目录，授权那跑写入落盘并被删掉）                    | capability 三档（none / readonly / full）的矩阵与响应脱敏的穷举            |
| #14 | `pagehide → dispose()` 有装配层单测（刷新时发出 `file.close`）                                                                                                                                                                                 | 真实关闭/刷新/退出之后 host 会话计数归零，需要报告里补一个由 Rust 读的计数 |

AC#10 / #11 / #15 / #16 / #17 仍是 ⬜：它们要的 DOM 操作、1001 条快照、重启比对与三平台矩阵都在 C4。

### 发现 10：`HANDSHAKE_ACK` 的方向是 panel → connector（驱动等错了帧）

驱动第一版等 `HANDSHAKE_ACK` 拿 session，结果稳定地等满预算、报 `sessionSeen: false`，
而同一份报告里主窗口的 `handshakeCompleted` 明明是 `true`——两个事实看起来矛盾。

真因是方向：**connector 铸 session，面板只回显**，所以 ACK 是 panel → connector，
根本不会投递到调试窗口。改成从**信封**的 `sessionId` 取（协商完成后每一帧都带），
既准确也不依赖某一种帧先到。

定位它靠的是给驱动加的三个阶段打点（`booted` / `listening` / `session-seen`，复用 `failure`
字段、后到覆盖先到，跑通时它就是 `null`）：`native` 字段在报告里出现、而 `sessionSeen` 为
`false`，一次就把「脚本没注入」和「listen 没通」两种成因排除掉了。

### 发现 11：session 级拒绝落不进请求等待表，于是伪造 session 只看得到超时

`requestId === null` 的 `ERROR` 按协议**不归属任何请求**（session 级），因此它不会命中驱动的
等待表。第一版的结果是 `forgedSession: "timeout"`——而超时与「对端没答」不可区分，
这种弱证据撑不起 AC#13 的「未授权 provider 调用为 0」。

驱动因此单独记最近一条 session 级错误码，超时时优先报它。实测由 `timeout` 变为
**`session_invalid`**：拒绝从此是**观察到的**，不是从沉默里推的。e2e 的断言随之收紧成等值，
并把同一条 `files.list`（同操作、同参数，只差 session）留在旁边当对照组。

### PR-C4 第一片：授权矩阵（2026-09-05）

C2 那条注入链路（`DEV_RXDB_DEVTOOLS*` 三个 env → Rust `devtools_config` 插件 →
`js_init_script` 在页面脚本之前写下全局键 → 页内 connector 定档）此前**只有单测**。
本片给它补上真实窗口证据，做法是同一份产物跑两个进程、只差三个环境变量：

- **只读那一跑**（不设任何 env，缺省即 `capability: full` + `mutationPolicy: omit`）：
  `create-directory` / `delete` 均被拒，且**盘上一个目录都没落**。
- **授权那一跑**（`=1` / `full` / `allow`）：同样两条操作答 `ok`，且盘上确实出现了那个目录、
  被删的那个确实没了。

**判别力不在拒绝码上**：共享包的 `authorizeOperation` 对「没 opt-in 写入」与「这个操作压根
没声明」返回**同一个** `provider_unsupported`（刻意的，免得对端据此枚举 provider 目录）。
所以只读那一跑的判据是磁盘，而这一对照本身也是必需的——注入链路接不上的表现，恰好与
「写入本来就该被拒」一模一样。少了授权那一跑，只读那条用例其实什么都没证明。

### 发现 12：一个进程里驱动会跑不止一遍

授权那一跑第一次是红的：`create-directory` 答 `resource_conflict` 而不是 `ok`。

真因不是权限，是**次数**：探针为了 AC#4 会把调试窗口关掉再以同 label 重开，而重开的那扇窗
又带着这份驱动——于是同一个进程里这段脚本跑了两遍，第二遍撞上自己第一遍留下的目录。
报告取最后一次汇报，所以看到的是冲突。

修法取「让准备步骤幂等」（建之前先删一次、结果不看）而不是「把 `resource_conflict` 也算通过」：
后者会让一次**真实的**冲突缺陷从这条用例底下溜过去。

### 发现 13：阶段打点会把自己伪装成结论（harness 侧的竞态，已修）

授权那一跑出现过「同一份代码一次红一次绿」：红的时候报告里 `native` 的每个字段都是
`undefined`，看起来与「驱动压根没跑」一模一样。

真因在探针这一侧，不在驱动：`waitForNative` 取的是**收到的第一条**汇报，而阶段打点
（`stage:booted` / `stage:listening`）也是汇报。打点恰好落在等待窗口里时，等待就带着一份
「结论」提前返回了——那份结论除了 `sessionSeen: false` 什么都没有。**为定位问题加的诊断
设施，自己成了下一个假信号的来源。**

修法两条，缺一不可：

- 打点**不结束等待**（按 `failure` 的 `stage:` 前缀识别），只有结论才结束；
- 但打点仍然**进快照**——驱动真卡住时，最后那个 stage 是唯一的线索。

`app.config.ts` 那侧随之改成「只等待、不取返回值」，最终带走的是 `settle()` 交出的那一条
（当时是**最新**一条；这一半已被[发现 14](#发现-14取最新一条结论在跨重启比对下没有判别力) 改成**第一条**）。
两条新单测把这两半都钉住（打点先到时等待不提前结束；只有打点时快照里留的就是打点）。

### 两处过程性缺陷（都已修，记下来是因为它们都曾伪装成别的东西）

- **新断言放在了拥有 `run` 的 `describe` 外面**，报 `ReferenceError: run is not defined`——
  4 条用例全红，但它们**一次都没读到报告**。红得像「驱动没通」，实际与驱动无关。
- **注入给探针的 `listen` 适配器把 payload 钉死成 `string`**，而驱动汇报通道送的是对象。
  这条是 Angular 构建报出来的；`nx typecheck` 因为命中缓存报了绿——与
  [[nx-build-hides-ts-errors]] 同一类坑的镜像版本。

### PR-C4 第二片：跨重启的 wire 比对（2026-09-05）

AC#15 要的是「重启前后同一实体和文件一致，且证据经过真实 panel/双 WebView/transport/Rust/host」。
本片让**同一份产物、同一个应用数据目录跑两个进程**，两跑的环境变量逐字相同，差别只在「第几次跑」：

- **files 一半**：驱动动手之前先 `files.list` 一次，看它上次留下的那个目录在不在
  （`keptDirSeen`）。第一跑必须是 `false`、第二跑必须是 `true`。
- **database 一半**：经真实 wire `database.query('DesktopLaunch')` 数行数（`launchRowCount`）。
  这一条与报告自己的 `launchCount` 是**两条独立路径**——后者由页内 repository 数出来，前者穿过
  面板 → IPC → Rust 中继 → provider。只回**行数**不回文档：AC#13 明写响应不得含 SQL 绑定值与
  加密字段，而行数已经足够比对。

报告 schema **v6 → v8**，新增 `devtools.native` 的这三格。

**行数只能断言区间，不能断言相等**：`devtoolsProbe` 开着时一个进程会 bootstrap **两遍**
（`probeDevToolsWindow` 自己 `location.reload()` 一次），所以 `launchCount` 每进程 +2，而驱动
的那次查询发生在**刷新之前**。写成相等会得到一条恒红的断言，而把它调松成「非零」又什么都
不证明——取「第一跑 ≤ 1、第二跑 ≥ 上一跑的 `launchCount`」，两端都由启动次数的算术推出来。

### 发现 14：「取最新一条结论」在跨重启比对下没有判别力

[发现 12](#发现-12一个进程里驱动会跑不止一遍) 说的是同一个进程里驱动会跑两遍；当时的修法
（准备步骤幂等）解决了 `resource_conflict`，但留下了一个更深的问题：**报告留的是第二遍的结论**。

第二遍看到的世界已经被第一遍改过——「重启之后那个目录还在」与「本进程第一遍刚把它建出来」
在第二遍眼里**完全同形**。于是跨重启比对失去全部判别力：全新的数据目录上 `keptDirSeen` 也是
`true`。只有第一遍的前置条件是已知的（这个进程还没碰过存储）。

改成留**第一条**结论（打点仍不算结论，[发现 13](#发现-13阶段打点会把自己伪装成结论harness-侧的竞态已修) 那条规则不变）。
`app.config.ts` 那句「最终带走的是 `settle()` 交出的最新那条」随之作废。

### 发现 15：第一遍驱动被 AC#4 的回收杀在半路

改成「留第一条」之后第一跑仍然红着，而报告给出了自证的证据：全新数据目录上
`filesEntryCount: 2` + `keptDirSeen: true`——那是**第一遍已经把目录建出来之后**的世界。

真因是顺序：探针拿到第一轮握手就立刻 `recycleDevToolsWindow()`，而第一遍驱动此时还差着
那条伪造 session 的请求（它一条就要等满 4s `ANSWER_TIMEOUT_MS`）。窗口被销毁，第一遍
**一条结论都没发出来**，于是「第一条」实际选中的是第二遍。

修法是把 `waitForNative()` 挪到回收**之前**：先让第一遍跑完再回收。两件事本来就没有依赖，
先后顺序此前是随手定的。顺带把「刷新前后两份快照怎么合」提成 `mergeDevToolsProbeRounds`
纯函数并补 5 条单测——其中一条钉住「刷新后到达的结论不顶掉带过来的那一份」：回收之后
第二遍照跑，它跑完与主窗口刷新谁先谁后没有保证，晚一步就落在刷新后的观察者上。

### 发现 16：驱动的第一条 `files.list` 早于应用建出存储根

前一条修完，两条**只读档**的老断言反而红了：`files.list` 答 `resource_not_found` 而不是 `ok`。

存储根不是启动就在盘上的——它由应用自己那一步 storage probe 上传探针文件时建出来，而调试
窗口是 Rust 在 `setup()` 里与主窗口**一起**建的。驱动因此会早于应用完成初始化就问出第一条
list。这条 race 一直都在，只是被「取第二遍结论」掩盖着：第二遍跑在十秒之后，那时根早就有了。

修法是让驱动**只对 `resource_not_found` 这一个码**重试到根出现为止（上限 8s）。不对
`permission_denied` / `provider_unsupported` 重试：那些是**判定结果**，重试多少次都该是同一个
答案，对它们重试等于把一次真实的拒绝拖成超时。等满预算就照实报 `resource_not_found`。

e2e 侧同时补了一条：第一跑先断言 `filesList === 'ok'`，再断言 `keptDirSeen === false`。
少了前一条，「没看见那个目录」与「根本没读成」同形——一个从来读不通的链路也能把负对照骗绿。

**本片关掉的**：AC#15 由 ⬜ 提到 ⚠️。保留在于「一致」只验到了目录的**存在**与实体的**行数**，
没有逐字段比对文档内容，也没有校验文件字节（那是 AC#10 的判据）。

### PR-C4 第三片：三平台矩阵接进发布链路（2026-09-05）

AC#17 要的三平台结论，本地一台 macOS 给不出来；能在本地做完的是**接线**，以及让接线本身
被一条 PR 门禁看着。

`release-desktop.yml` 的 `tauri-smoke` 加**一步**跑 `devtools-smoke`，不加 job——文件开头那条
⚠️ 写着「新增 job 必须同步加进 `gate` 的 `needs` 和断言列表」，漏改就是一条形同虚设的门禁；
而这一步要的 Rust 工具链、WebKitGTK 开发库与 Xvfb 与上一步完全同一套，另起一个 job 等于把
那份安装税在三个 runner 上再交一遍。三处配套改动：

- `timeout-minutes` 60 → 90。这个 job 现在冷编译**两份** Rust 产物（release 与 dev debug），
  两个 profile 不共享产物（正是 `tauri-package-dev` 落 `target/debug` 的理由），是两份全量
  而不是一份加增量；Windows 上单份实测就是 20-30 分钟。
- `WEBKIT_DISABLE_DMABUF_RENDERER` 从步级挪到 job 级。原来那条注释写的就是「设在 job 级」，
  代码却设在步上——加一步之后这处不一致会变成 Linux 上的白屏，而白屏与「应用真有 bug」
  不可区分。
- 新步带 `if: ${{ !cancelled() }}`。默认语义下上一步一红就整个跳过，三平台矩阵里会缺掉
  「调试窗口在这个平台上到底行不行」的结论，且缺得毫无痕迹。

### 发现 17：门禁的判据不能只活在被门禁保护的那条链路里

第一版想把这条结构检查写成 `apps/dev-rxdb-tauri-e2e/src/*.spec.ts`——那个目录下的文件会被
`vitest.smoke.mts` 的 `src/**` 收进 `desktop-smoke`，而 `desktop-smoke` **只在发布链路上跑**。
于是「这一步还在不在」的判据，自己被排除在了每天几十次的 PR 门禁之外：删掉那一步的 PR 全绿，
下一次发现是在发一个 tag 的时候。

改落 `scripts/audit/release-desktop-gate.spec.mjs`，走 PR 门禁的 `pnpm test-scripts`。它读真实的
`release-desktop.yml`，钉住上面四条（三平台矩阵、`!cancelled()`、timeout 下界、job 级 env），
外加一条既有性质：高成本 smoke 只在 release / 手动 / 改本文件的 PR 上触发（无裸 `push:`，
`pull_request:` 必须带 `paths:`）。切分 YAML 的两个纯函数另有 4 条合成输入的用例。

`extractJob` 找不到 job 时**抛错**而不是返回空数组：下游断言全是「正文里有没有某一行」的形态，
空数组会让它们一条不剩地变成真空真——门禁被整个删掉时反而全绿，正是本节要防的那件事。

**本片关掉的**：AC#17 由 ⬜ 提到 ⚠️。判据的后两截已成立——release 无调试
capability/command/bootstrap 由 `devtools-release-isolation.spec.ts` 的 7 条结构证据钉住，
「高成本 smoke 只在 release 分支或 tag 运行」由本片新增的用例钉住。保留的是**第一截**：
「三平台完成加载、握手、session 释放」目前只有 macOS 一列的实测，ubuntu / windows 两列要等
这份 workflow 在 PR 上跑一次才拿得到（它自带 `pull_request.paths` 触发，第一次真实运行就发生
在改动它的那个 PR 上）。在那次运行给出结果之前，AC#17 不能提 ✅。

## 技术约束

- **两阶段必须是独立的 PR / commit 序列**：阶段 1 的证据只用共享 fake provider，不得夹带真实 host 接线。
- Tauri transport 复用 US-904 阶段 B 的 v2 与「宽外层、严内层」解析；外层必须能返回 `protocol_unsupported`，
  版本匹配后未知消息、额外字段、错误 direction、错误 session 和非预期窗口标签一律拒绝。
- Tauri event 与窄 command 两案必须在 plan 阶段用跨窗口定向投递、调用方身份校验、取消语义和测试可控性
  决策；不得暴露通用 `invoke(command, payload)` 或广播未脱敏业务数据。
- 每次创建窗口都由主 WebView connector/provider owner 在 HANDSHAKE 生成新 `sessionId`，panel 只回显，
  transport 将其绑定主窗口 label、调试窗口 label 和 provider owner；session 不是授权 secret，Rust 侧
  不能仅凭可复用的 `rxdb-devtools` label 接受消息。
- 调试窗口 capability 按 `rxdb-devtools` label 最小授权，不继承主窗口的 SQL / filesystem 权限；dev/release
  使用不同的 capability 输入，release 产物静态检查不得包含只服务调试窗口的授权、command 名或 bootstrap 入口。
  调试窗口 capability 只限制 Rust/WebView 权限，不能替代业务操作授权。
- 主 WebView 是唯一 RxDB connector 与 provider owner；调试窗口不持有数据库连接与文件根句柄
  或业务 service 实例。provider 只通过 US-210 / US-505 的窄 host 接缝工作，不暴露通用 SQL/filesystem command。
- session 只做关联，不做授权；capability、descriptor 和 mutation policy 在 connector 与 Rust/host 两侧重复校验。
- 共享面板固定消费 US-904 阶段 C 的 `modules/rxdb-devtools-panel/`：同 `modules/` 其余成员，经 tsconfig paths
  以源码嵌入接入（该 library 不进 pnpm workspace），依赖关系由 Nx 项目图记录，**不复制源码**。
- v2 的 ID、在途/总预算、transfer 时限、session 轮换、base64、safe integer、分页上限、snapshot deadline
  与穷举错误全部继承 US-904 阶段 B；Tauri 不放宽限制，也不在本文件复述这些数值。
- Chrome / Electron / Tauri 各用薄 transport driver 运行同一 conformance suite；原生启动与打包 smoke 可按
  runner 拆分，不强迫三种自动化运行时共用同一个 spec 文件。

## 实现文件

- `apps/dev-rxdb-tauri/src/` — 共享 panel bootstrap、Tauri transport adapter、provider 注册与开发入口
- `apps/dev-rxdb-tauri/src-tauri/` — label/sender 绑定的窗口、消息桥、受限 Rust host 接线与 dev-only capability
- `packages/rxdb-adapter-tauri/src/` — Tauri SQLite 只读诊断 provider
- `packages/rxdb-plugin-storage/src/` — Tauri native files 调试 provider
- `apps/dev-rxdb-tauri-e2e/` — 共享 project，由 US-210 / US-905 先开工者创建一次；本故事拥有窗口、
  transport、release 隔离、native provider、重启、安全边界与三平台 specs
- `requirements/api-baseline/` — 只有新增公开入口时同步

## References

- [US-904 DevTools 原生本地存储调试](./US-904-devtools-native-storage-contract.md) — 阶段 B 冻结 v2 协议，
  阶段 C 交付共享面板与 Chrome 参考实现
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [US-210 Tauri 连接应用作用域 SQLite 文件](../adapter/US-210-tauri-sqlite-local-database.md)
- [US-505 Tauri 本地文件存储](../plugin/US-505-tauri-local-file-storage.md)
