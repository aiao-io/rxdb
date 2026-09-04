---
id: US-905
title: Tauri DevTools 调试窗口、transport 与原生存储集成
status: In Progress
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-09-01
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
| 3   | 非调试窗口、错误 sender/label，或合法 sender 伪造越权操作                 | 通过 transport 发送                                              | 错误身份在 WebView/transport/Rust 均拒绝；合法 sender 仍受 capability/descriptor/mutation policy 限制，session/label 不能充当授权            | ⚠️   |
| 4   | session A 有订阅、请求和未完成传输                                        | 关闭窗口，以同 label 重开 B 并投递 A 消息                        | A 的资源释放，B 获得新 UUID v4 session 并拒绝全部旧身份、事件、响应与 chunk                                                                  | ⚠️   |
| 5   | 主窗口刷新、transport 断开或应用退出                                      | 观察 connector/provider 生命周期                                 | 订阅、计时器、snapshot、请求、传输和临时文件均取消；provider owner 释放，不留下可复用 host session                                           | ⚠️   |
| 6   | wa-sqlite 分别实际选择 OPFS、IDB、unavailable                             | 打开调试窗口查看 provider                                        | 分别声明 `files: opfs`、`settings: idb` 或结构化 unavailable；均带 `runtime: tauri`，但行为只由 kind/operations 决定                         | ⚠️   |
| 7   | 版本、权限、非法数值/base64、传输乱序/取消、snapshot busy/expired fixture | 通过 Tauri transport 执行                                        | safe-integer guard、decoded-byte 限额、穷举错误和资源释放与 US-904 阶段 B 一致，不增加平台错误码、编码或 fallback                            | ✅   |
| 8   | `apps/dev-rxdb-tauri-e2e` 已由 US-210 或本故事创建                        | 检查项目与 specs                                                 | workspace 中只有一个 generator 创建的 E2E project；本故事只拥有 DevTools window/transport/release-isolation specs，不接管 US-210 数据库 spec | ✅   |

### 阶段 2：真实原生 provider（AC#9～#17）

| #   | 前置条件                                                   | 操作                                                   | 预期结果                                                                                                                        | 状态 |
| --- | ---------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 9   | 应用通过 US-210 使用应用作用域 SQLite                      | 查询实体、逐类派发事件并切换 branch                    | 数据、全部 `RXDB_EVENT_TYPES` 和 branch 与主窗口一致；调试窗口不打开数据库、不创建 OPFS/IDB fallback                            | ⬜   |
| 10  | 应用通过 US-505 使用 native files 并显式允许 mutation      | 浏览并执行正常/零字节/边界大小上传下载、新建目录、删除 | 只操作插件根，字节一致；UI 仅用 `runtime: tauri` 显示来源；全程流式，失败/取消/超时无半写文件或孤儿 metadata                    | ⬜   |
| 11  | 1001 条以上 metadata/files、两类缺失和在途上传             | 读取完整诊断 snapshot                                  | 从请求进入起算的共享 deadline（US-904 阶段 B）覆盖等锁/物化/重试；不漏尾页或误报临时状态；busy/too-large/expired 与共享错误一致 | ⬜   |
| 12  | 打开 Settings                                              | 尝试数据库下载和未声明的清理                           | 下载禁用且强制命令返回 `export_unsupported`；未声明能力返回 `provider_unsupported`，不读取 SQLite/WAL、OPFS/IDB 或其他应用目录  | ⬜   |
| 13  | 错误窗口/旧 session，或合法窗口在授权组合下伪造操作        | 通过真实 transport 发送                                | 各层拒绝错误身份；未授权 provider 调用为 0，未 opt-in mutation 不执行；响应不含路径、SQL 绑定值、加密字段或文件内容             | ⬜   |
| 14  | session 有订阅、迟到响应、snapshot 和未完成传输            | 关闭/刷新窗口或退出应用                                | 订阅、请求、snapshot、传输、临时文件和 host session 全释放；重开拒绝旧身份与迟到数据                                            | ⬜   |
| 15  | 真实临时应用目录、US-210 SQLite 与 US-505 files            | 跑 E2E，重启应用后重新连接                             | 重启前后同一实体和文件一致；证据经过真实 panel/双 WebView/transport/Rust/host，不用 fake 替代                                   | ⬜   |
| 16  | Tauri provider 接入 US-904 阶段 B conformance 与共享 panel | 运行共享 provider 与 panel 回归                        | 控制面、safe integer、base64、descriptor、分页、授权、错误和 session 重建通过；不等待 Electron，也不复制组件、状态机或 wire     | ⬜   |
| 17  | macOS、Windows、Linux desktop dev/release 构建             | 打开/关闭调试窗口并检查产物                            | 三平台完成加载、握手、session 释放；release 无调试 capability/command/bootstrap，高成本打包 smoke 只在 release 分支或 tag 运行  | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 交付状态

**阶段 1 已开工并基本落地**（2026-08-30 ～ 08-31，三次提交 `d0a6315` / `563639d` / `198439d`）：
两个启动硬阻塞都已破——`rxdb-devtools` 窗口的独立 capability、`devtools_message` 的
`#[cfg(dev)]` 隔离。8 条 AC 中 **2 条 ✅、6 条 ⚠️**，阶段 2（AC#9～#17）未开工。

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

### 证据落点

| AC    | 已落地的证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ⚠️ 差的那一半                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1    | `apps/dev-rxdb-tauri-e2e/src/devtools-release-isolation.spec.ts`（5 例）：`default.json` 的 `windows` 恰为 `['main']`、`devtools.json` 恰为 `['rxdb-devtools']` 且 `permissions` 只有 `['core:event:default']`（不继承 `core:default` ⇒ 拿不到 window 控制 / SQL / filesystem）、`devtools_message` 与 `open_devtools_window` 两侧的 `#[cfg(dev)]` 都在（含 `generate_handler!` 那一臂）                                                                                                                                                                                                                                                                                                                                                                                                                   | release 隔离是**源码结构证据**（理由见 spec 头注：拿 `strings` 翻二进制会被 renderer 侧的命令名字符串误命中）；「dev 构建真的只起一个窗口并握手」需真实构建                                                                                                                                                                                                                                                |
| #2 #7 | `apps/dev-rxdb-tauri/src/devtools/tauri-conformance.spec.ts` —— 与 `packages/rxdb-devtools/src/__tests__/testing/conformance.spec.ts` 的差别**只有一个 `createNodes`**（`tauri-relay-nodes.ts` 把 Tauri transport 装进四段 relay 的中间两段）。判据、fixture、状态机断言、错误码表一行没复制，这正是 US-904 AC#44 要的结构。80 条断言覆盖 safe-integer guard、decoded-byte 限额、穷举错误、transfer/snapshot 状态机、session 轮换与资源释放                                                                                                                                                                                                                                                                                                                                                                | AC#7 的判据全在 transport 语义上，已足 ✅；AC#2 的判据含「真实主窗口与调试窗口已打开」，JSON 定向中继替不了                                                                                                                                                                                                                                                                                                |
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
