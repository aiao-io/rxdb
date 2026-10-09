---
id: US-211
title: 多端小程序宿主（支付宝 / 抖音 / 百度 / QQ）
status: In Progress
priority: Medium
epic: epic-004-future-features
created: 2026-08-16
updated: 2026-10-09
tags: [adapter, miniprogram, alipay, douyin, baidu, qq, wa-sqlite, experimental, multi-platform]
---

<!--
INVEST 检查清单:
- [x] Independent: 只依赖已 Done 的 US-209 微信路径；不阻塞桌面 / 搜索 / 工作树
- [x] Negotiable: 阶段 B 落地的「第一个非微信平台」由可行性矩阵决定，选定的是抖音
- [x] Valuable: 关掉口是心非——Taro 脚手架有 build:alipay/tt/qq/swan，适配器只登记经矩阵放行的平台
- [x] Estimable: 阶段 A 是契约 + 矩阵；B / C 是「一个平台一个 host」，工作量按平台切
- [ ] Small: 五个平台加宿主抽象不是一个迭代能吞的。按 A / B / C 分批，不拆 US-211a 文件
- [x] Testable: 微信回归、可行性文件、逐平台 fail-fast 与文档口径都有独立 AC
-->

# 用户故事：多端小程序宿主

> [US-209](./US-209-miniprogram-adapter.md) 已 Done，且其「仅微信、实验性、单连接、无崩溃恢复」
> 是**长期口径**，不是本故事可以顺手改掉的脚注。本故事是它的后续：先抽出平台无关宿主，
> 再按可行性门禁逐个放行非微信小程序。**阶段没关，文档就不许写「支持该平台」。**

## 交付阶段

| 阶段 | 状态 | 交付                                                                                                                                                                                                                                                                                                                                             | AC 区段   | 门禁                                                                |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------- |
| A    | ✅   | 宿主契约 + 平台可行性矩阵；微信路径零行为变化                                                                                                                                                                                                                                                                                                    | AC#1～8   | US-209 已 Done；**不**把任何新平台标成受支持                        |
| B    | ⚠️   | 第一个非微信 host：抖音 `tt`。v9 实验在开发者工具与 iOS 全 pass，已登记 `douyin`；Taro tt demo 开发者工具走查通过、iOS 真机走查通过，Android 真机未做（AC#14）                                                                                                                                                                                   | AC#9～15  | 阶段 A + 抖音 `decision: supported`                                 |
| C    | ⚠️   | 其余第一档平台：经复议改判 `supported` 的平台按阶段 B 标准实现，`unsupported` 的只剩拒绝路径与文档口径。支付宝 2026-10-04 凭开发者工具与 iOS 的 v7 报告、Android 书面豁免改判 `supported`（实验性），已登记 `alipay`、正式 host 从包入口导出；Android 真机补验与 demo 真机走查待做（AC#16）。百度 / QQ 判 `unsupported`，按未知平台拒绝（AC#17） | AC#16～21 | 阶段 B；每个平台独立 `supported` 才能进实现，`unsupported` 只写原因 |

某平台判 `unsupported` 只关掉该平台，不连坐整条故事。阶段 B 分两个 PR：PR1 只做平台无关修复（`runtimeGlobal` / `fileLayout` /
`defaultWasmPath` 三个宿主字段、配额报 `SQLITE_FULL` 并透传原文、同步 FS 五方法预检、sqlite-core 去 latin1），
微信零行为变化；PR2 登记 `douyin`（`createDouyinMiniProgramHost`）并加 Taro tt target。不许用「微信 host 凑合能跑」冒充交付。

一个 PR 只许交付一个阶段；阶段 C 内部可以按平台拆 PR，但必须落在本文件的 AC 上，
**不创建 `US-211a` / `US-211-alipay` 这类中间文件。**

## 作为/我想要/以便

**作为** 用 Taro / 自建多端工具链同时打微信与其他小程序的开发者
**我想要** 用同一套 RxDB 数据层，按平台注入不同的小程序 host（WASM / 同步文件 / 安全随机源）
**以便** 不必为支付宝、抖音、百度、QQ 各写一套仓库，同时**在平台缺能力时立刻失败**，
而不是把 `wx` 硬塞进 `my` / `tt` 里碰运气

## 今天就能踩到的症状

这些不是规划冲动，是仓库里已经写在纸面上的口是心非：

1. [apps/dev-rxdb-miniprogram/package.json](../../../apps/dev-rxdb-miniprogram/package.json) 保留
   `build:alipay` / `build:tt` / `build:qq` / `build:swan`，Nx 只给微信（`build-weapp` / `serve`）、抖音（`build-tt` / `serve-tt`）
   与支付宝（`build-alipay` / `serve-alipay`）接了 target（见 [project.json](../../../apps/dev-rxdb-miniprogram/project.json)），
   验证口径见 [examples/README.md](../../../examples/README.md)。QQ / 百度的脚本刻意保留：删掉只是把症状盖住，能力并没有交付。
   `build` 聚合三端。支付宝产物在 `dist-alipay/`，demo 已接支付宝宿主，开发者工具模拟器走查通过（AC#16）；
   各平台产物目录单列，不与微信共用 `dist/`（Taro 开跑先清空产物目录），见技术笔记「新平台 host 的落点」。
2. 平台登记表 [`MINI_PROGRAM_PLATFORM_IDS`](../../../packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts)
   登记 `wechat`、`douyin` 与 `alipay` 三个平台，用 `host` 注入别的平台会抛 `MiniProgramUnknownPlatformError`
   （[host.ts](../../../packages/rxdb-adapter-miniprogram/src/host.ts)）。
3. 微信便利形状 `wechat` 仍是结构化类型：形状吻合的 `tt` 可以当 `wechat` 传进去，运行时被当成微信 host，
   报错前缀、能力名、随机源 `source` 全写成微信。这条路没被拦住，但不是支持。

## 范围边界

### In Scope

**阶段 A — 宿主契约与可行性**

- 从微信特化类型抽出 `MiniProgramHost`：同步文件、用户数据目录、安全随机源、平台 id
- `MiniProgramWasmRuntime` 保持路径实例化契约（小程序 WASM 普遍不接受 URL / `ArrayBuffer`）
- 微信变成**一个** host 实现；现有 `wechat` / `wasmRuntime` / `createWechatFileVFS` /
  `prepareMiniProgramRuntime(wx)` **全部保留**，行为与错误文案不变
- 为第一档平台写出机器可读可行性文件，每个平台必须是
  `supported` / `unsupported` / `unknown` 三选一，并附可复验证据
- 公开文档与能力矩阵继续写「仅微信」；阶段 A **不**扩大支持声明

**阶段 B — 第一个非微信平台（抖音）**

- 实现抖音 `tt` host（阶段 B 选型时唯一的候选，v9 实验已改判 `supported`，带 caveat `android-unverified`）
- 该平台缺 WASM / 同步 FS / 可信随机源时 fail-fast，**不**降级、**不**复用微信全局
- 文档、包 README、`compatibility.md` 只把**这一个**平台从「不支持」改成「实验性支持」，并列出与微信相同的单连接 / 无崩溃恢复边界
- 提供可复述的手工验证入口（扩展 taro 对应 `build:*`，或独立 fixture + 开发者工具步骤）

**阶段 C — 其余第一档平台**

- 百度 `swan`、QQ `qq` 已判 `unsupported`：矩阵写明判定理由与复议条件，代码路径拒绝这些平台 id；经复议改判 `supported` 的平台才实现。支付宝 `my` 已经复议改判 `supported`（实验性，Android 书面豁免）
- 每个新平台同步一行兼容性文档，禁止「小程序 = 全端」这种集合表述
- 未点名的候选（京东 / 快手 / 小红书 / 企业微信）只允许作为矩阵行存在，本故事不实现

### 平台档位

| 档位 | 平台                            | 全局对象                    | 本故事承诺                     |
| ---- | ------------------------------- | --------------------------- | ------------------------------ |
| 已交 | 微信                            | `wx` + `WXWebAssembly`      | US-209，实验性，本故事不得回退 |
| 第一 | 支付宝 / 抖音 / 百度 / QQ       | `my` / `tt` / `swan` / `qq` | 阶段 B / C，受可行性门禁       |
| 观察 | 京东 / 快手 / 小红书 / 企业微信 | 阶段 A 矩阵可列 `unknown`   | **不实现**；要做另立故事       |

### Out of Scope

- 把 US-209 的微信路径升格成「与 wa-sqlite 同级的受支持适配器」
- WAL、Worker / SharedWorker、多页面并发、崩溃恢复保证——除非某平台可行性**证明**具备
  可靠 `fsync`、文件锁与原子 rename，且另开故事，不在本文件顺手承诺
- 小程序侧 FTS5 / `@aiao/rxdb-plugin-search`（缺口仍由能力矩阵记录，不归本故事）
- 把 [apps/dev-rxdb-miniprogram/](../../../apps/dev-rxdb-miniprogram/) 升格成「受支持的产品级示例」；
  阶段 B 即使给它加抖音 target，它也只是手工验证入口
- uni-app / 快应用 / React Native / Harmony 作为一等运行时
- 改 `ADAPTER_NAME`（保持 `wa-sqlite-miniprogram`）
- 删除或重命名已发布的微信符号：`RxDBAdapterWaSqliteMiniProgram`、`MiniProgramWechatApi`、
  `createWechatFileVFS`、`prepareMiniProgramRuntime`

## 验收标准

### 阶段 A — 宿主契约与可行性矩阵

| #   | 前置条件                                            | 操作                                                                                                | 预期结果                                                                                                                                                                                                                                                                                                                 | 状态 |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 现有微信接入代码只传 `wechat` + `wasmRuntime`       | 跑 `pnpm nx test rxdb-adapter-miniprogram`                                                          | 全绿；公开微信 API、能力名、错误文案与 US-209 一致                                                                                                                                                                                                                                                                       | ✅   |
| 2   | 包主入口                                            | 阅读 `WaSqliteMiniProgramOptions`                                                                   | 新增平台无关的 `host` 注入点（`WaSqliteMiniProgramHostOptions`，adapter 收二者联合 `WaSqliteMiniProgramAdapterOptions`）；`WaSqliteMiniProgramOptions` 仍是可 `extends` 的微信形状 interface，标明为微信 host 的便利形状                                                                                                 | ✅   |
| 3   | 微信 host 已连接                                    | 对同一数据库文件开第二个连接                                                                        | 仍抛「不支持同一数据库的并发连接」，语义与 `wechat-file-vfs.ts` 的 `ACTIVE_DATABASES` 一致                                                                                                                                                                                                                               | ✅   |
| 4   | 仓库 `requirements/`                                | 查阅本故事旁的可行性文件                                                                            | 微信 / 支付宝 / 抖音 / 百度 / QQ 五行齐全，每行含 WASM 实例化、同步 FS、随机源、用户目录、`fsync`/锁/原子 rename 的证据链接，以及 `supported`/`unsupported`/`unknown`。见[可行性矩阵](./miniprogram-platform-feasibility.md)                                                                                             | ✅   |
| 5   | 阶段 A 合并前                                       | 阅读 `website/docs/compatibility.md` 小程序专节与根 README                                          | 仍写「仅微信、实验性」；不出现「支持支付宝 / 抖音 / 百度 / QQ」                                                                                                                                                                                                                                                          | ✅   |
| 6   | 调用方传入未知 `platform` id                        | 创建 adapter / 准备 runtime                                                                         | 抛稳定错误，列出已知平台 id，不回退到微信全局                                                                                                                                                                                                                                                                            | ✅   |
| 7   | `createWechatFileVFS` / `prepareMiniProgramRuntime` | 对照 [api-baseline/rxdb-adapter-miniprogram.json](../../api-baseline/rxdb-adapter-miniprogram.json) | 旧符号仍在；若新增通用符号，走 API baseline 更新，不静默改名                                                                                                                                                                                                                                                             | ✅   |
| 8   | 阶段 A 的可行性结论                                 | 复核「第一个非微信平台」                                                                            | 正文或可行性文件写明阶段 B 锁定的平台 id；若第一档全部 `unsupported`，阶段 B/C 在本表标注跳过原因，不进入实现。结论：阶段 B 锁定抖音 `tt`，v9 实验后改判 `supported`（caveat：Android 未验证）；百度 / QQ 判 `unsupported`；支付宝经 v7 判 `supported`（caveat：`android-unverified`、`quota-unobserved`），见可行性矩阵 | ✅   |

### 阶段 B — 第一个非微信 host（抖音）

| #   | 前置条件                                                     | 操作                                                                                                                | 预期结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 状态 |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 9   | 抖音矩阵为 `supported`                                       | 注入抖音 host（不传 `wechat`），写入、`disconnect`、重连                                                            | 数据仍在；库文件落在 `tt.getEnvInfoSync().common.USER_DATA_PATH` 下（不读已弃用的 `tt.env`），经 `tt.getFileSystemManager()` 的同步 API 读写，不读取 `wx`。`douyin-host.spec.ts`（Node 替身）与 spike `dist-smoke.spec.ts`（vm 沙箱跑打包产物）用正式 `createDouyinMiniProgramHost`；开发者工具与 iOS 真机的 v9 报告跑的是同一套 adapter 代码，host 字段同形但当时借 `wechat` id                                                                                                                                                                                                                                                                                                                                                                                           | ✅   |
| 10  | 抖音 host 缺 WASM、同步 FS、用户目录、安全随机源中的任意几项 | `assertMiniProgramRuntimeCapabilities({ host, … })`；`prepareMiniProgramHostRuntime(host)`                          | 预检一次列出全部缺失项，平台能力名带抖音前缀（`TTWebAssembly.instantiate` / `tt.getFileSystemManager` / `tt.getEnvInfoSync().common.USER_DATA_PATH`）；`MiniProgramFileSystemManager` 的五个同步方法都在才算同步 FS 可用；拿不到随机数时 `prepareMiniProgramHostRuntime` reject。**不**降级到 `Math.random`，**不**碰微信全局。`douyin-host.spec.ts` 覆盖                                                                                                                                                                                                                                                                                                                                                                                                                  | ✅   |
| 11  | 抖音 host 已连接                                             | 对同一数据库文件开第二个连接                                                                                        | 与微信相同：拒绝并发，不静默共享句柄。`douyin-host.spec.ts` 覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ✅   |
| 12  | 用户目录剩余配额放不下整库刷盘                               | 持续写入直到刷盘失败                                                                                                | 事务以 `SQLITE_FULL` 失败、不报成功；调用方经 `cause` 链拿得到平台原文（抖音 `user dir saved file size limit exceeded`）。开发者工具与 iOS 真机 v9 实测：写块 `.155` 时撞配额，`SQLITE_FULL`，cause 链末端是平台原文；不清理直接重开 19 / 19 行、`integrity_check` ok；失败后的库状态按「无崩溃恢复」口径写进文档                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ✅   |
| 13  | 公开文档                                                     | 阅读 compatibility 专节、包 README、根 README                                                                       | 抖音从「不支持」改为「实验性支持」，保留单连接 / rollback journal / 无崩溃恢复边界；「~10MB 级」的内存缓冲口径与平台配额分开写（抖音用户目录总共 10M，库文件与 `-journal` 共用）；其他平台仍写不支持。compatibility 专节、包 README、根 README 已改                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅   |
| 14  | 手工验证入口                                                 | 按文档在开发者工具与 Android / iOS 真机上走一遍                                                                     | 步骤可复述，写明开发者工具、基础库与客户端版本。走 taro 就新增抖音 Nx target，并在 [examples/README.md](../../../examples/README.md) 标明「已验证」或「仍未验证」，禁止含糊（Android 暂缓，按「仍未验证」写）；demo 现有的微信耦合见技术笔记。现状：Taro demo 加了 `build-tt` / `serve-tt`（产物 `dist-tt/`），examples/README 写明「开发者工具 + iOS 已验证（spike v9），Android 仍未验证」。Taro tt 产物在开发者工具（4.5.6，基础库未记录）与 iOS 真机（2026-10-02，客户端与基础库版本未记录）走查通过。两条真机前提有守卫：产物里除入口登记的真实全局对象外没有自由的 `globalThis`（`verify/dist.spec.ts`）；RxDB 各包不在模块顶层构造 `TextEncoder` / `TextDecoder`——iOS 逻辑层没有它们，adapter 的 polyfill 晚于模块求值（spike `dist-smoke.spec.ts` 的 `bare` 模式） | ⚠️   |
| 15  | 微信回归                                                     | `pnpm nx test rxdb-adapter-miniprogram`；`pnpm nx run-many -t build typecheck lint --projects=dev-rxdb-miniprogram` | 全绿；微信公开 API、能力名、错误文案不变。2026-10-02 实测：adapter 225 条测试全绿，api-surface 与基线一致，`dev-rxdb-miniprogram-e2e:e2e-devtools` 16/16 通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ✅   |

### 阶段 C — 支付宝 / 百度 / QQ

| #   | 前置条件                                      | 操作                                                                                                              | 预期结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 状态 |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 16  | 某第一档平台经复议改判 `supported` 且尚未实现 | 按阶段 B 同等标准落地 host                                                                                        | AC#9～#14 对该平台同样成立。支付宝判 `supported`（2026-10-04）：正式 host `createAlipayMiniProgramHost` + `createAlipayWasmRuntime`（`src/hosts/alipay*.ts`，`alipay-host.spec.ts` 等 Node 替身覆盖分块重开、配额 `SQLITE_FULL`、第二连接拒绝、三宿主共存）已登记 `alipay` 并从包入口与 `/runtime` 导出，Worker 脚本经 `./alipay-random-worker.js` 导出；探针 v7 在开发者工具与 iOS 真机（扫码运行，非真机调试）五行全 pass，Android 没有设备，由维护者书面豁免（`waived: [android]`，caveat `android-unverified`），矩阵写明复验计划。Taro demo 已接支付宝宿主（AC#14 的手工入口）：2026-10-04 开发者工具 3.10.15 模拟器（基础库 2.10.15）走查，建库与验证完成、运行时能力 11/11（`BigInt` / `queueMicrotask` 由宿主补）；demo 未上真机。未完成：Android v7 预览报告；demo 的 iOS / Android 真机走查（iOS 真机调试待复测，见技术笔记）。百度 / QQ 判 `unsupported`，跳过                                                                                                                                                                                                                   | ⚠️   |
| 17  | 某第一档平台矩阵为 `unsupported`              | 传入该平台 id                                                                                                     | 连接前失败，错误指向可行性文件中的原因；不存在「当成微信跑一下」的分支。拒绝表 `MINI_PROGRAM_UNSUPPORTED_PLATFORMS`（`host.ts`）与错误类 `MiniProgramUnsupportedPlatformError` 留给「判 `unsupported` 且写了 host」的平台，现为空：支付宝判 `supported`，百度 / QQ 没写 host。拒绝路径抛 `MiniProgramUnsupportedPlatformError`（继承未知平台错误，`blockers` 与矩阵 YAML 一致，文案带判定理由与章节标题）；预检、随机源准备、VFS、`createWaSqliteMiniProgramClient` 都在加载 wasm 与碰宿主能力前失败，不读 `wx`，也不依赖宿主可能没有的 ES2022 内置（见技术笔记）。`unsupported-platform.spec.ts` 用 `?raw` 解析矩阵，核对「拒绝表每项在矩阵里都是 `unsupported` 且阻断项一致」与「登记表 == supported 集合」，并按[改判标准](./miniprogram-platform-feasibility.md#改判标准)从 `undocumented` 与 `evidence` 推导第一档每行的判定、阻断项与 caveat；拒绝路径的报错由错误类单测与按表循环覆盖。百度 / QQ 门 1 就不过、没写 host，按未知平台拒绝（`MiniProgramUnknownPlatformError`，指向文件、不带原因），有意不进拒绝表（`host.ts` 注释）。支付宝探针逐版的实验记录见矩阵支付宝一节「实验」 | ✅   |
| 18  | 第一档平台都处理完毕（实现或明确拒绝）        | 阅读 compatibility 专节                                                                                           | 四个第一档平台（含抖音）每行都有「实验性支持」或「不支持 + 原因」，没有「各种小程序」这种集合句。专节是逐平台表（微信 / 抖音 / 支付宝 / 百度 / QQ 各一行），没有集合句；百度 / QQ 不进拒绝表，按未知平台拒绝，「不支持」行写明原因并指回可行性矩阵                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ⚠️   |
| 19  | 观察档平台（京东等）                          | 传入其平台 id                                                                                                     | 一律按未知平台拒绝；矩阵里可以有 `unknown` 行，代码不得出现半成品 host。`unsupported-platform.spec.ts` 对矩阵里每个观察档 id 断言：不在拒绝表、抛 `MiniProgramUnknownPlatformError` 而非其子类                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ✅   |
| 20  | 覆盖率门禁                                    | `pnpm nx test rxdb-adapter-miniprogram --coverage` 后跑 `pnpm audit:coverage --projects=rxdb-adapter-miniprogram` | 四项指标 ≥ 80%；低于 `coverage-baseline.json` 上次值时脚本只报 WARN，PR 里写明原因。2026-10-03（支付宝 PR）：statements 98.44 / branches 96.46 / functions 100 / lines 98.66，门禁通过；statements、lines 低于基线 99 报 WARN。原因不在本 PR（`host.ts` 100%）：基线记于 2026-09-23，阶段 B 之后 `structured-clone-polyfill.ts`（86%）与 `subframe-glue.ts`（80%）拉低总数                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ✅   |
| 21  | 微信 + 已支持的非微信 host                    | 全量 `pnpm nx test rxdb-adapter-miniprogram`                                                                      | 全绿；平台 fixture 不得互相污染全局对象。`douyin-host.spec.ts`「AC#21 微信与抖音同进程」覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。因可行性 `unsupported` 而跳过的条目标 ⬜，
并在行内注记「因可行性 `unsupported` 跳过」——不引入模板之外的符号。

## 技术笔记

### 新平台 host 的落点

- host 工厂放 `src/hosts/<id>.ts`，返回完整的 `MiniProgramHost`（参照 `createWechatMiniProgramHost`）；
  `requestRandomValues` 按契约每次给新缓冲区，拿不到恰好 `length` 字节就 reject。
- 登记表 `MINI_PROGRAM_PLATFORM_IDS` 在 `mini-program.interface.ts`；`resolveMiniProgramHost`、微信工厂与
  `MiniProgramUnknownPlatformError` 在 `host.ts`。新 id 与它的 host 实现同一个 PR 落地，登记表里不许有半成品。
- VFS 不按平台复制：`createMiniProgramFileVFS(module, { host, databaseName })` 已经平台无关。新平台的 errMsg 原文
  （缺文件、目录已存在、配额满）进 VFS 的判定正则与测试 fixture；`isAlreadyExistsError` 先排除缺失类文案，
  `does not exist` 不会被当成「目录已存在」。
- demo 的微信耦合已在阶段 B 拆掉：`src/runtime-preflight.ts` 的 `currentDemoRuntime()` 按构建期 `TARO_ENV`
  选微信 / 抖音 / 支付宝宿主，其余平台直接报错；`src/rxdb-demo.ts` 调 `prepareMiniProgramHostRuntime(runtime.host)` 后建库。
  新平台进 demo 要补：`currentDemoRuntime` 的分支；`config/index.ts` 的 `demoPlatform()` 与 `vitePlugins()`、单列的产物目录
  （`dist-<平台>/`，`dist/` 归微信，Taro 开跑先清空产物目录）；运行时文件（US-219 起由 `@aiao/rxdb-taro` 发出，原 `config/assets-vite-plugin.ts`）；
  开发者工具读的 `project.<平台>.json`；Nx 的 `build-<平台>` / `serve-<平台>` target，并挂进聚合的 `build`。
  构建不走 babel：`config/no-babel-vite-plugin.ts` 去掉 Taro 注入的两处 babel 转译，语法降级（含 RxDB 包的私有成员）全由 esbuild 按构建目标做。
- 支付宝 demo 构建有几处和微信 / 抖音不同。模拟器逻辑层没有 `globalThis`，realm 插件（US-219 起在 `@aiao/rxdb-taro/vite`，原 `config/realm-vite-plugin.ts`）在入口经
  `Object.prototype` getter 登记真实全局对象（同抖音的构建期改名）；没有 `BigInt`，`config/lazy-chunk-vite-plugin.ts` 把只经动态
  `import()` 可达的 RxDB 栈并进 `rxdb-lazy.js`，等宿主 `prepareRuntime` 补完再求值（Taro 的 `manualChunks` 按引用数把它拆进
  页面静态 `require` 的 common / vendors）；代码包另有 wasm 的 base64 副本与随机数 Worker，`project.alipay.json` 用
  `transpile.script.ignore` 让工具别给 Worker 塞 core-js。Taro 的支付宝平台插件（4.3.0 仍如此）往产物里加 `.browserslistrc`，
  vite runner 的 `modifyBuildAssets` 代理只认 bundle 里已有的产物，读 `undefined.type` 抛错；
  `patches/@tarojs__vite-runner@4.3.0.patch` 的 `mini/emit.js` 一段让新增产物改走 `emitFile`。
  `project.alipay.json` 的 `compileOptions.transpile` 不能删（空对象就够）：支付宝开发者工具（编译器 0.108.16）
  见到它才用 babel 7 编译 JS，没有它走 babel 6，Taro 运行时 `taro.js` 编译失败（CE1000.02）；
  构建 target 因此用 babel 7 档实测过的 es2018。
  真机调试（Boatman 解释器）里 demo 起初渲染就抛 React #31：Boatman 提升 `var` 时不进标签语句，React reconciler
  `beginWork` 在 `e:{…}` 里的 `var o` 没登记，`case 5` 的 `o=a.children` 写穿到工厂闭包的 `Symbol.for("react.element")`。
  `config/labeled-var-hoist-vite-plugin.ts` 在 `generateBundle` 把标签语句里的 `var` 补声明到函数开头；本地用 Boatman
  加载真机调试包复现，修前 #31、修后与原生一致（2026-10-04），iOS 真机调试待复测。
  #31 修掉后，真机调试接着在连库时报 `Target has no entity status: it is not an attached RxDB entity`。原因是 Boatman
  的成员赋值调完 setter 会再读 getter，而 `RxDBBranch` / `RxDBChange` 的关系属性写成了 `parent$!:` 字段。在 es2018
  产物里，构造时会执行 `this.parent$ = void 0`，碰到原型上的关系 getter，而 STATUS 这时还没挂上。改成 `declare` 后修复
  （`packages/rxdb/src/__tests__/system/system-relation-fields.spec.ts` 守住）。另外，define 语义下这些字段原本也会遮住
  原型 getter。demo 会在控制台逐步打出 `[dev-rxdb-miniprogram] …` 步骤，失败时打出 stack 与 cause 链。本地 Boatman 跑通
  连库、CRUD、重连（2026-10-04），iOS 真机调试待复测。
- 拒绝路径跑在没核实过的宿主上，不能依赖宿主可能没有的内置，否则拒绝信息会被 `TypeError` 顶掉。
  `assertMiniProgramPlatformId` 用 `Object.prototype.hasOwnProperty.call` 而不用 `Object.hasOwn`：后者是整个支付宝产物里唯一的
  ES2022 内置，iOS 15.4 之前的 JavaScriptCore 没有它（`unsupported-platform.spec.ts` 在删掉 `Object.hasOwn` 的环境里守住）。

### 走查证据对应的构建

抖音 spike v9、支付宝探针 v7 与 Taro demo 的各次走查，跑在 `@subframe7536/sqlite-wasm` 1.3.1（wasm 727646 字节）与 Taro 4.2.1 的构建上。
adapter、demo 与支付宝 wasm 指纹锁的也是 1.3.1：1.4.0 的 glue 读 wasm 导出的 Global，iOS 的 `WXWebAssembly` 不导出，真机初始化即失败
（原因与 `subframe-glue-exported-globals.spec.ts` 门禁见 [US-219](./US-219-taro-plugin.md)），所以矩阵证据与当前 adapter 是同一份 wasm。
没复跑的是 Taro 4.3.0 + demo 去 babel 的构建：微信开发者工具已走查（US-219 AC#9 的微信半边），抖音、支付宝的开发者工具与真机都还没有；
复跑后在矩阵各平台「实验」一行补报告。

### 可行性文件（阶段 A 产物）

路径：`requirements/stories/adapter/miniprogram-platform-feasibility.md`
（本故事的附件，不是新的 US）。每行至少回答：

1. 官方 WASM 入口是什么、是否只接受代码包路径
2. 是否有**同步** `accessSync` / `readFileSync` / `writeFileSync` / `unlinkSync` / `mkdirSync`
3. 可信随机源 API 与基础库版本
4. 用户数据目录常量
5. 有没有 `fsync`、文件锁、原子 rename——没有就写「崩溃恢复：无」，不要用「 theoretically 接近 POSIX」糊弄
6. 证据：官方文档 URL 与本地可复验实验（开发者工具、基础库与客户端版本）。第一档按矩阵的
   [改判标准](./miniprogram-platform-feasibility.md#改判标准)判定：门 0 架构约束；门 1 三项硬依赖的来源
   （文档化 / 实测 / 缺失），缺失可以只凭文档判 `unsupported`，但要写判定理由与复议条件；门 2 正式 host 的五行探针；
   门 3 开发者工具加 iOS / Android 非调试真机，依赖未文档化能力的平台三个环境都要合格

`unknown` 不是可以开工的绿灯。阶段 B / C 只吃 `supported`。

### 阶段 B 只有抖音一个候选

阶段 B 选型时按当时「只认文档化能力」的口径，支付宝（WASM 只在 Worker）、百度与 QQ（没有文档化的安全随机 API）
都被文档否掉了，抖音是第一档里唯一剩下的。现行口径是矩阵的「改判标准」：按它支付宝判 `supported`（AC#16），抖音仍是 `supported`。
实验与结论见[可行性矩阵](./miniprogram-platform-feasibility.md)抖音一节：开发者工具与 iOS 真机 v9 全 pass，
改判 `supported`；Android 真机没跑，记为 caveat `android-unverified`，补跑全 pass 前对外只写「实验性支持」。
不许为了「先有个非微信」去用异步 FS 冒充同步 VFS，也不许在 Worker 里私自 polyfill。

### 不变的能力上限

本故事扩大的是**平台集合**，不是**能力集合**。下列对所有新 host 仍然成立，除非另立故事推翻：

- `journal_mode = DELETE`，不是 WAL
- JS 层单连接
- 整库缓冲，只适合 ~10MB 级的兼容性验证。这是内存缓冲的口径，不是平台配额：抖音用户目录总共 10M，
  库文件、`-journal` 与回滚余量共用。覆盖写计旧文件，单文件布局只能用到一半左右；抖音 host 用 64 KiB 分块，
  v9 实测库长到约 9.5 MiB（153 块）才撞配额，撞后重开数据完整
- 随机源耗尽即抛错，不降级
- 包继续标「实验性」

### 与搜索、桌面、子路径门禁的边界

- FTS5 仍不在白名单里，见 [capability-matrix](../../capability-matrix.md) 脚注。本故事不碰
  `SUPPORTED_SEARCH_ADAPTERS`。
- 子路径导出表面仍由 [US-601](../tooling/US-601-subpath-api-surface-baseline.md) 认领。
  给 `/runtime` 加符号，PR 必须按现行 versioning 政策声明破坏性。往 `MINI_PROGRAM_PLATFORM_IDS` 登记新平台
  会放宽导出类型 `MiniProgramPlatformId` 与 `MiniProgramRuntimeSource`；API baseline 只记符号名，抓不到这种变化，
  PR 要按同一政策自己声明。
- 不把小程序 VFS 接到 [US-207](./US-207-desktop-local-database.md) 的桌面 host 契约上。
  两者都叫 host，运行时完全不是一类东西。

## 实现文件

| 阶段 | 路径                                                                           | 职责                                                                                                |
| ---- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| A    | `packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts`              | `MiniProgramHost` / 平台登记表 `MINI_PROGRAM_PLATFORM_IDS`                                          |
| A    | `packages/rxdb-adapter-miniprogram/src/host.ts`                                | `resolveMiniProgramHost`、微信 host 工厂、未知平台错误                                              |
| A    | `packages/rxdb-adapter-miniprogram/src/error-message.ts`                       | 从 `errMsg` / `message` 取报错文案，VFS 与 host 共用                                                |
| A    | `packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts`                     | 通用文件 VFS；微信封装保留                                                                          |
| A    | `packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts`                | 按 host 预检；微信文案不变                                                                          |
| A    | `packages/rxdb-adapter-miniprogram/src/runtime-polyfills.ts`                   | host 随机源；`wx` 路径保留                                                                          |
| A    | `requirements/stories/adapter/miniprogram-platform-feasibility.md`             | 可行性矩阵                                                                                          |
| B/C  | `packages/rxdb-adapter-miniprogram/src/hosts/<id>.ts`                          | 每平台一个 host 工厂，禁止共享「像 wx 的全局」                                                      |
| B/C  | `packages/rxdb-adapter-miniprogram/src/__tests__/`                             | 每平台 fixture，不碰真实微信全局                                                                    |
| B/C  | `website/docs/compatibility.md`、包 README、根 README、`examples/README.md`    | 按已关闭阶段改口径                                                                                  |
| B    | `packages/rxdb-adapter-miniprogram/src/hosts/douyin.ts`                        | `createDouyinMiniProgramHost`：分块布局、绝对 wasm 路径、`tt.getRandomValues`                       |
| B    | `apps/dev-rxdb-miniprogram-douyin-spike/`                                      | 真机实验与报告（矩阵抖音一节的证据）                                                                |
| B    | `apps/dev-rxdb-miniprogram/`                                                   | 按 host 注入；`build-tt` / `serve-tt` 手工入口（构建随 `build` 进 CI，走查手工）                    |
| C    | `packages/rxdb-adapter-miniprogram/src/host.ts`                                | 拒绝表 `MINI_PROGRAM_UNSUPPORTED_PLATFORMS`、`MiniProgramUnsupportedPlatformError`                  |
| C    | `packages/rxdb-adapter-miniprogram/src/__tests__/unsupported-platform.spec.ts` | `?raw` 解析可行性矩阵，核对登记表 / 拒绝表 / 观察档 / 改判标准                                      |
| C    | `apps/dev-rxdb-miniprogram/`                                                   | `build-alipay` / `serve-alipay`（随聚合 `build` 进 CI）、`project.alipay.json`；demo 已接支付宝宿主 |
| C    | `patches/@tarojs__vite-runner@4.3.0.patch`                                     | `mini/emit.js` 一段：支付宝平台插件新增的 `.browserslistrc` 改走 `emitFile`                         |

## References

- [US-209 微信小程序 wa-sqlite 适配器](./US-209-miniprogram-adapter.md) — 本故事的前置与不可回退边界
- [包 README：能力边界](../../../packages/rxdb-adapter-miniprogram/README.md)
- [compatibility.md 小程序专节](../../../website/docs/compatibility.md)
- [apps/dev-rxdb-miniprogram/](../../../apps/dev-rxdb-miniprogram/) — Taro 多端命令与各端验证状态的落点
- [US-207 / US-210](./US-207-desktop-local-database.md) — 「先抽 host、再按运行时拆阶段」的同构先例；契约本身不复用
