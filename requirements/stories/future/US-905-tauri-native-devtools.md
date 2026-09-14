---
id: US-905
title: Tauri DevTools 调试窗口、transport 与原生存储集成
status: Done
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-09-14
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
- **把共享包那整套 conformance 断言搬到真实窗口上复跑**：那要求逐用例重装配两端端点，并在两个窗口里
  各放一只可远程推进的假时钟（`advanceTime` 的契约要求 driver 掌管全部协议计时器），与进程内驱动完全
  重复，成本远大于它能新增的信息量。AC#2 只要求五类操作各在真实双窗口上走通一遍

## 验收标准

### 阶段 1：窗口与 transport（AC#1～#8）

| #   | 前置条件                                                                  | 操作                                                             | 预期结果                                                                                                                                     | 状态 |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 分别构建显式 dev 与 release 配置                                          | 检查产物并启动                                                   | dev 只创建一个 `rxdb-devtools` 窗口并握手；release 无入口、bootstrap、专用 command 和只服务该 label 的 capability                            | ✅   |
| 2   | 真实主窗口与调试窗口已打开                                                | 用共享 fake providers 执行查询、事件、授权、transfer 和 snapshot | US-904 阶段 B conformance 全部通过；Tauri 只适配 transport，不复制 panel、provider 类型、fixture、错误码或状态机                             | ✅   |
| 3   | 非调试窗口、错误 sender/label，或合法 sender 伪造越权操作                 | 通过 transport 发送                                              | 错误身份在 WebView/transport/Rust 均拒绝；合法 sender 仍受 capability/descriptor/mutation policy 限制，session/label 不能充当授权            | ✅   |
| 4   | session A 有订阅、请求和未完成传输                                        | 关闭窗口，以同 label 重开 B 并投递 A 消息                        | A 的资源释放，B 获得新 UUID v4 session 并拒绝全部旧身份、事件、响应与 chunk                                                                  | ✅   |
| 5   | 主窗口刷新、transport 断开或应用退出                                      | 观察 connector/provider 生命周期                                 | 订阅、计时器、snapshot、请求、传输和临时文件均取消；provider owner 释放，不留下可复用 host session                                           | ✅   |
| 6   | wa-sqlite 分别实际选择 OPFS、IDB、unavailable                             | 打开调试窗口查看 provider                                        | 分别声明 `files: opfs`、`settings: idb` 或结构化 unavailable；均带 `runtime: tauri`，但行为只由 kind/operations 决定                         | ✅   |
| 7   | 版本、权限、非法数值/base64、传输乱序/取消、snapshot busy/expired fixture | 通过 Tauri transport 执行                                        | safe-integer guard、decoded-byte 限额、穷举错误和资源释放与 US-904 阶段 B 一致，不增加平台错误码、编码或 fallback                            | ✅   |
| 8   | `apps/dev-rxdb-tauri-e2e` 已由 US-210 或本故事创建                        | 检查项目与 specs                                                 | workspace 中只有一个 generator 创建的 E2E project；本故事只拥有 DevTools window/transport/release-isolation specs，不接管 US-210 数据库 spec | ✅   |

### 阶段 2：真实原生 provider（AC#9～#17）

| #   | 前置条件                                                   | 操作                                                   | 预期结果                                                                                                                                          | 状态 |
| --- | ---------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 9   | 应用通过 US-210 使用应用作用域 SQLite                      | 查询实体、逐类派发事件并切换 branch                    | 数据、全部 `RXDB_EVENT_TYPES` 和 branch 与主窗口一致；调试窗口不打开数据库、不创建 OPFS/IDB fallback                                              | ✅   |
| 10  | 应用通过 US-505 使用 native files 并显式允许 mutation      | 浏览并执行正常/零字节/边界大小上传下载、新建目录、删除 | 只操作插件根，字节一致；UI 仅用 `runtime: tauri` 显示来源；全程流式，失败/取消/超时无半写文件或孤儿 metadata                                      | ✅   |
| 11  | 1001 条以上 metadata/files、两类缺失和在途上传             | 读取完整诊断 snapshot                                  | 从请求进入起算的共享 deadline（US-904 阶段 B）覆盖等锁/物化/重试；不漏尾页或误报临时状态；busy/too-large/expired 与共享错误一致                   | ✅   |
| 12  | 打开 Settings                                              | 尝试数据库下载和未声明的清理                           | 下载禁用且强制命令返回 `export_unsupported`；未声明能力返回 `provider_unsupported`，不读取 SQLite/WAL、OPFS/IDB 或其他应用目录                    | ✅   |
| 13  | 错误窗口/旧 session，或合法窗口在授权组合下伪造操作        | 通过真实 transport 发送                                | 各层拒绝错误身份；未授权 provider 调用为 0，未 opt-in mutation 不执行；响应不含路径、SQL 绑定值、加密字段或文件内容                               | ✅   |
| 14  | session 有订阅、迟到响应、snapshot 和未完成传输            | 关闭/刷新窗口或退出应用                                | 订阅、请求、snapshot、传输、临时文件和 host session 全释放；重开拒绝旧身份与迟到数据                                                              | ✅   |
| 15  | 真实临时应用目录、US-210 SQLite 与 US-505 files            | 跑 E2E，重启应用后重新连接                             | 重启前后同一实体和文件一致；证据经过真实 panel/双 WebView/transport/Rust/host，不用 fake 替代                                                     | ✅   |
| 16  | Tauri provider 接入 US-904 阶段 B conformance 与共享 panel | 运行共享 provider 与 panel 回归                        | 控制面、safe integer、base64、descriptor、分页、授权、错误和 session 重建通过；不等待 Electron，也不复制组件、状态机或 wire                       | ✅   |
| 17  | macOS、Windows、Linux desktop dev/release 构建             | 打开/关闭调试窗口并检查产物                            | 三平台完成加载、握手、session 释放；release 无调试 capability/command/bootstrap；打包 smoke 随 release 发布、手动 dispatch 与桌面链路相关 PR 触发 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 交付状态

AC 表的「状态」列是唯一口径：阶段 1 八条全 ✅（含本阶段收尾的 #2 #6 #7）；阶段 2 九条全 ✅（#9～#17）。
AC#17 三平台实测的调度已从「只在 release 分支/tag」改为「release 发布 + 手动 dispatch + 桌面链路相关
PR」（`release-desktop.yml` 的 PR paths 扩到桌面链路本身）；三平台证据由 PR #58 的
[Release Desktop run 34854848883](https://github.com/aiao-io/rxdb/actions/runs/34854848883) 回填——
ubuntu / macOS / Windows 的 packaging smoke 与 devtools smoke 全绿，desktop-gate 通过。
win32 的回填过程修掉一处真实缺陷：首跑里 idb 档在 Windows 上挂到 60s 看门狗报 `timedOut`（既不是
ok 也不是诚实失败），挂点是模块 SharedWorker 传输——WebView2 上 worker 脚本不开始。强制档因此改走
与 opfs 档同形态的 dedicated Worker（`resolveWaSqliteIdbTransport`，生产路径保留 SharedWorker 让
多标签页共享同一条连接），win32 的 idb 档随即按冻结真值 `ok` 通过。linux 的 idb 真值按首跑回填
`failed`（WebKitGTK 页面上下文没有 `navigator.storage`，见 gear spec 的平台事实表）。

阶段 1 收尾补上了原先三条 ⚠️ 的证据，全部落在打包产物上的真实双窗口走查：

- **AC#2**（fake providers 五类操作走真实双窗口）：新增
  `apps/dev-rxdb-tauri-e2e/src/devtools-provider-gear.spec.ts`，由 dev-only 档位
  `DEV_RXDB_DEVTOOLS_PROVIDER_SOURCE=fake` 把共享 `DevToolsFakeProviderSet` 装配进主窗口 connector，
  经真实 `invoke` / `emit_to` 中继到调试窗口，由 `devtools_driver.js` 的 `runFake()` 分叉走查查询、事件、
  授权、transfer、snapshot 五类。五类里换掉的只是 connector 背后的 provider，中继、wire 校验、面板协商
  与能力镜像都是真的——这正是「Tauri 只适配 transport、不复制状态机」的证据。fake 档覆盖 full+ok、
  只读授权半边，以及 snapshot 的 busy / too_large / expired 三场景。
- **AC#6**（VFS 三态映射）：同文件新增三档 `DEV_RXDB_DEVTOOLS_FORCE_VFS=opfs|idb|unavailable` 的
  process-level 走查。`opfs` 档面板 descriptors 报 `files: opfs` + `settings: opfs`；`idb` 档报
  `settings: idb` 且 `files` 不宣告（无文件根，是现状行为）；`unavailable` 档应用库诚实失败——打开即抛、
  报 failed + 退出码 1、devtools 探针根本没跑。强制档只改 `setup_rxdb_wa-sqlite.ts` 的后端选择与 runtime
  传递，映射语义仍由 `selectWaSqliteBackend` 纯函数与 `tauri-vfs-providers.ts` 钉住。三态按平台分表冻结
  `darwin` 真值（`win32` / `linux` 为假设，由 CI 三 OS 矩阵首跑回填）。
- **AC#7**（真实链路复跑 conformance 判据）：`devtools-window-transport.spec.ts` 在**真实** `invoke` /
  `listen` 跨窗口投递上复跑 safe-integer guard、decoded-byte 限额、非法 base64、snapshot 分页 / 越界 /
  expired 双开、事件订阅与 EVENT 帧计数、transfer 乱序/取消/资源释放。判据、fixture、错误码表沿用
  `packages/rxdb-devtools` 的共享 suite，不新增平台错误码、编码或 fallback。

阶段 2 收尾补上的是**真实 host** 半边证据，全部经真实 wire（面板 → IPC → Rust 中继 → native host）：

- **AC#9**（query/events 之外补 branch 走查）：`devtools_driver.js` 的 `runReal()` 增加
  `database.get-branches` 与 `database.switch-branch` 两步——后者切到当前已激活分支，
  `versionManager.switchBranch` 对同分支是 no-op 成功，探针零副作用。没开写入授权时 switch-branch
  被 mutation policy 按写操作拒（`provider_unsupported`，与「未声明」同码——AC#13 的刻意不可区分），
  授权档下走通答 `ok`；报告探针面 v10→v11（`branchesList` / `branchCount` / `branchSwitch`）。
- **AC#10 / #12 / #13 / #14 / #15**：真实 host 的字节往返、settings 两码、伪造 session、建删目录、
  取消无半写、逃逸、2^53、非法 base64、跨重启比对等已在 `devtools-window-transport.spec.ts` 全部落位，
  随本次收尾全绿复核；US-908 已关的两条缺陷（`TRANSFER_CANCEL` 排空在途写入、
  `pagehide → filesystem.dispose()`）正是 AC#14 资源释放的最后两道坑。
- **AC#11**（1001+ 快照走查）：`devtools-window-transport.spec.ts` 新增真实存储根播种 1001 个小文件的
  进程级走查——首页 ok → 翻页至 complete → 记录数 ≥ 1001（默认页大小 100 意味着至少 11 页），
  双开 expired 与越界 pageSize 同码复核；播种不经 wire、不撞 `.rxdb-tmp` 过滤与 32 MiB 字节上限。
- **AC#16**（conformance 架构对齐）：Tauri 半边与 Electron 同构——`tauri-conformance.spec.ts` 以薄
  transport 驱动 + 共享 fake 端点跑同一套 control-plane / data-plane suite，「真实 host 半边」由
  `devtools-window-transport.spec.ts` 的 wire 走查承担。这是 US-904/906 已关过的架构形态；不把整套
  conformance 断言搬到真实窗口复跑（故事 Out-of-Scope 明确不做）。
- **AC#17**（三平台）：release 隔离半边由 `devtools-release-isolation.spec.ts` 钉住；win32/linux
  实测的调度改为桌面相关 PR 与 release 发布都跑（`release-desktop.yml` 的 PR paths 扩到桌面链路）。
  首跑暴露出 win32 的 idb 档 SharedWorker 传输挂起，强制档改走 dedicated Worker 修复后，
  三平台 smoke 全绿（run 34854848883），本 AC 关闭。

三档开关（provider 源 / snapshot 场景 / VFS 强制）与驱动档位键全部 `#[cfg(dev)]` 编进 dev 二进制，
release 产物静态不含；`devtools-release-isolation.spec.ts` 已钉住三档 env 名只出现在 `devtools_config.rs`
且驱动档位键不出现在 lib.rs 的 `cfg(dev)` 之外。

`TRANSFER_CANCEL` 不等在途写入、以及 `DevToolsDesktopFilesystem.dispose()` 在 Electron 装配处未接线
（Tauri 装配处已接 `pagehide`），两条缺陷由
[US-908](./US-908-devtools-transfer-session-defects.md) 认领并关闭，不在本故事范围内。

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
- **面板侧的操作驱动是 dev-only 注入脚本**：`src-tauri/devtools_driver.js` 经 `include_str!` + `#[cfg(dev)]`
  编进 Rust、由 `initialization_script` 装进调试窗口，release 二进制里连这些字节都不存在。不把它放进面板
  bundle——`frontendDist` 整份嵌进 release 二进制，脚手架会随产品一起发；也不提供通用 `eval` command——
  它撞 CSP（`script-src 'self' 'wasm-unsafe-eval'`，无 `unsafe-eval`），且失败形态与「面板没起来」不可区分。
- **不接 `evaluate` / `reloadInspectedPage` 通道**：它给的是「调试窗口可在被检查页跑任意脚本」，比经
  provider 能拿到的任何东西都大——provider 受 capability / descriptor / mutation policy 三层约束，注入的
  脚本却跑在**主窗口的授权上下文**里，三层一条也管不着。面板上唯一会碰它的 Settings 清理按钮，按 AC#12
  本就该以 `provider_unsupported` 收口。这条决定由 `tauri-host-access.service.spec.ts` 钉住。
- **两个桌面宿主共用同一个 settings provider**（`createDevToolsDesktopSettingsProvider(runtime)`），
  不各写一份：两端 settings 语义完全相同，分成两份就给了 `kind` / `operations` / `limits` 三处分叉的
  机会，而 AC#12 要的正是「两端读到同一个答案」。
- **面板产物不落进 `build` 的产物树**：`build-devtools` 输出 `dist/devtools/dev-rxdb-tauri`，经 `build` 的
  `assets` 拷进 `browser/devtools/`；`build` 与 `serve` 各自 `dependsOn: ['build-devtools']`（dev-server
  executor 在进程内跑 buildTarget，不会执行 `build` 的 `dependsOn`）。两个 target 共写一棵产物树会被 nx
  的缓存恢复整目录抹掉，而 dev server 只服务 build target 的产物与 assets、不服务另一个 target 的
  `outputPath`——面板缺席时的失败形态是 SPA 回退**静默返回主应用**（窗口开着、有内容、不报错），不是 404。
  接线由 `apps/dev-rxdb-tauri/src/app/build-config.spec.ts` 守住。

## 实现文件

- `apps/dev-rxdb-tauri/src/` — 共享 panel bootstrap、Tauri transport adapter、provider 注册与开发入口
- `apps/dev-rxdb-tauri/src-tauri/` — label/sender 绑定的窗口、消息桥、受限 Rust host 接线与 dev-only capability
- `packages/rxdb-devtools/src/rxdb/` — 数据库域 provider：`devtools.init(rxdb, getEntityMetadata)` 直连应用 RxDB 实例
  （调试窗口不打开数据库；`rxdb-adapter-tauri` 刻意零 DevTools 导出，SQLite 只由 Rust host 打开）
- `packages/rxdb-plugin-storage/src/` — Tauri native files 调试 provider（含 snapshot 走查链）
- `apps/dev-rxdb-tauri-e2e/` — 共享 project，由 US-210 / US-905 先开工者创建一次；本故事拥有窗口、
  transport、release 隔离、native provider、重启、安全边界与三平台 specs
- `requirements/api-baseline/` — 只有新增公开入口时同步

## References

- [US-904 DevTools 原生本地存储调试](./US-904-devtools-native-storage-contract.md) — 阶段 B 冻结 v2 协议，
  阶段 C 交付共享面板与 Chrome 参考实现
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [US-908 DevTools 传输取消与桌面文件会话缺陷](./US-908-devtools-transfer-session-defects.md) — 本故事读出
  但不修的两条缺陷
- [US-210 Tauri 连接应用作用域 SQLite 文件](../adapter/US-210-tauri-sqlite-local-database.md)
- [US-505 Tauri 本地文件存储](../plugin/US-505-tauri-local-file-storage.md)
