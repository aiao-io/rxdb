---
id: US-211
title: 多端小程序宿主（支付宝 / 抖音 / 百度 / QQ）
status: In Progress
priority: Medium
epic: epic-004-future-features
created: 2026-08-16
updated: 2026-10-04
tags: [adapter, miniprogram, alipay, douyin, baidu, qq, wa-sqlite, experimental, multi-platform]
---

<!--
INVEST 检查清单:
- [x] Independent: 只依赖已 Done 的 US-209 微信路径；不阻塞桌面 / 搜索 / 工作树
- [x] Negotiable: 阶段 B 落地哪一个「第一个非微信平台」由可行性矩阵决定；矩阵现在只剩抖音一个候选
- [x] Valuable: 关掉今天就能踩到的口是心非——Taro 脚手架有 build:alipay/tt/qq/swan，适配器只登记了 wechat host
- [x] Estimable: 阶段 A 是契约 + 矩阵；B / C 是「一个平台一个 host」，工作量按平台切
- [ ] Small: 五个平台加宿主抽象不是一个迭代能吞的。按 A / B / C 分批，不拆 US-211a 文件
- [x] Testable: 微信回归、可行性文件、逐平台 fail-fast 与文档口径都有独立 AC
-->

# 用户故事：多端小程序宿主

> [US-209](./US-209-miniprogram-adapter.md) 已 Done，且其「仅微信、实验性、单连接、无崩溃恢复」
> 是**长期口径**，不是本故事可以顺手改掉的脚注。本故事是它的后续：先抽出平台无关宿主，
> 再按可行性门禁逐个放行非微信小程序。**阶段没关，文档就不许写「支持该平台」。**

## 交付阶段

| 阶段 | 状态 | 交付                                                                                                                                                                                                                   | AC 区段   | 门禁                                                                |
| ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| A    | ✅   | 宿主契约 + 平台可行性矩阵；微信路径零行为变化                                                                                                                                                                          | AC#1～8   | US-209 已 Done；**不**把任何新平台标成受支持                        |
| B    | ⚠️   | 第一个非微信 host：抖音 `tt`。v9 实验在开发者工具与 iOS 全 pass，已登记 `douyin`；Taro tt demo 开发者工具走查通过、iOS 真机走查通过，Android 真机未做（AC#14）                                                         | AC#9～15  | 阶段 A + 抖音 `decision: supported`                                 |
| C    | ⚠️   | 其余第一档平台：支付宝 / 百度 / QQ 已判 `unsupported`，只剩拒绝路径与文档口径；经复议改判 `supported` 的平台按阶段 B 标准实现。支付宝拒绝路径已交，按改判标准缺正式 host 与三个环境的合格报告（AC#17）；百度 / QQ 待做 | AC#16～21 | 阶段 B；每个平台独立 `supported` 才能进实现，`unsupported` 只写原因 |

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
   `build:alipay` / `build:tt` / `build:qq` / `build:swan`，Nx 只给微信（`build` / `serve`）、抖音（`build-tt` / `serve-tt`）
   与支付宝（`build-alipay` / `serve-alipay`）接了 target（见 [project.json](../../../apps/dev-rxdb-miniprogram/project.json)），
   验证口径见 [examples/README.md](../../../examples/README.md)。QQ / 百度的脚本刻意保留：删掉只是把症状盖住，能力并没有交付。
   支付宝的 target 也不是支持：产物在 `dist-alipay/`，demo 一开就走 adapter 的拒绝路径，页面显示
   `MiniProgramUnsupportedPlatformError` 与判定原因，不建库（AC#17）。2026-10-04 之前 `build:alipay` 连编译都过不去，
   产物目录又与微信同为 `dist/`、开跑先清空微信产物，修法见技术笔记「新平台 host 的落点」。
2. 平台登记表 [`MINI_PROGRAM_PLATFORM_IDS`](../../../packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts)
   只有 `wechat` 与 `douyin`，用 `host` 注入别的平台会抛 `MiniProgramUnknownPlatformError`
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

- 实现抖音 `tt` host（矩阵里唯一的候选，v9 实验已改判 `supported`，带 caveat `android-unverified`）
- 该平台缺 WASM / 同步 FS / 可信随机源时 fail-fast，**不**降级、**不**复用微信全局
- 文档、包 README、`compatibility.md` 只把**这一个**平台从「不支持」改成「实验性支持」，并列出与微信相同的单连接 / 无崩溃恢复边界
- 提供可复述的手工验证入口（扩展 taro 对应 `build:*`，或独立 fixture + 开发者工具步骤）

**阶段 C — 其余第一档平台**

- 支付宝 `my`、百度 `swan`、QQ `qq` 已判 `unsupported`：矩阵写明判定理由与复议条件，代码路径拒绝这些平台 id；经复议改判 `supported` 的平台才实现
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

| #   | 前置条件                                            | 操作                                                                                                | 预期结果                                                                                                                                                                                                                                          | 状态 |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 现有微信接入代码只传 `wechat` + `wasmRuntime`       | 跑 `pnpm nx test rxdb-adapter-miniprogram`                                                          | 全绿；公开微信 API、能力名、错误文案与 US-209 一致                                                                                                                                                                                                | ✅   |
| 2   | 包主入口                                            | 阅读 `WaSqliteMiniProgramOptions`                                                                   | 新增平台无关的 `host` 注入点（`WaSqliteMiniProgramHostOptions`，adapter 收二者联合 `WaSqliteMiniProgramAdapterOptions`）；`WaSqliteMiniProgramOptions` 仍是可 `extends` 的微信形状 interface，标明为微信 host 的便利形状                          | ✅   |
| 3   | 微信 host 已连接                                    | 对同一数据库文件开第二个连接                                                                        | 仍抛「不支持同一数据库的并发连接」，语义与 `wechat-file-vfs.ts` 的 `ACTIVE_DATABASES` 一致                                                                                                                                                        | ✅   |
| 4   | 仓库 `requirements/`                                | 查阅本故事旁的可行性文件                                                                            | 微信 / 支付宝 / 抖音 / 百度 / QQ 五行齐全，每行含 WASM 实例化、同步 FS、随机源、用户目录、`fsync`/锁/原子 rename 的证据链接，以及 `supported`/`unsupported`/`unknown`。见[可行性矩阵](./miniprogram-platform-feasibility.md)                      | ✅   |
| 5   | 阶段 A 合并前                                       | 阅读 `website/docs/compatibility.md` 小程序专节与根 README                                          | 仍写「仅微信、实验性」；不出现「支持支付宝 / 抖音 / 百度 / QQ」                                                                                                                                                                                   | ✅   |
| 6   | 调用方传入未知 `platform` id                        | 创建 adapter / 准备 runtime                                                                         | 抛稳定错误，列出已知平台 id，不回退到微信全局                                                                                                                                                                                                     | ✅   |
| 7   | `createWechatFileVFS` / `prepareMiniProgramRuntime` | 对照 [api-baseline/rxdb-adapter-miniprogram.json](../../api-baseline/rxdb-adapter-miniprogram.json) | 旧符号仍在；若新增通用符号，走 API baseline 更新，不静默改名                                                                                                                                                                                      | ✅   |
| 8   | 阶段 A 的可行性结论                                 | 复核「第一个非微信平台」                                                                            | 正文或可行性文件写明阶段 B 锁定的平台 id；若第一档全部 `unsupported`，阶段 B/C 在本表标注跳过原因，不进入实现。结论：阶段 B 锁定抖音 `tt`，v9 实验后改判 `supported`（caveat：Android 未验证）；支付宝 / 百度 / QQ 判 `unsupported`，见可行性矩阵 | ✅   |

### 阶段 B — 第一个非微信 host（抖音）

| #   | 前置条件                                                     | 操作                                                                                                                | 预期结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 状态 |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 9   | 抖音矩阵为 `supported`                                       | 注入抖音 host（不传 `wechat`），写入、`disconnect`、重连                                                            | 数据仍在；库文件落在 `tt.getEnvInfoSync().common.USER_DATA_PATH` 下（不读已弃用的 `tt.env`），经 `tt.getFileSystemManager()` 的同步 API 读写，不读取 `wx`。`douyin-host.spec.ts`（Node 替身）与 spike `dist-smoke.spec.ts`（vm 沙箱跑打包产物）用正式 `createDouyinMiniProgramHost`；开发者工具与 iOS 真机的 v9 报告跑的是同一套 adapter 代码，host 字段同形但当时借 `wechat` id                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ✅   |
| 10  | 抖音 host 缺 WASM、同步 FS、用户目录、安全随机源中的任意几项 | `assertMiniProgramRuntimeCapabilities({ host, … })`；`prepareMiniProgramHostRuntime(host)`                          | 预检一次列出全部缺失项，平台能力名带抖音前缀（`TTWebAssembly.instantiate` / `tt.getFileSystemManager` / `tt.getEnvInfoSync().common.USER_DATA_PATH`）；`MiniProgramFileSystemManager` 的五个同步方法都在才算同步 FS 可用；拿不到随机数时 `prepareMiniProgramHostRuntime` reject。**不**降级到 `Math.random`，**不**碰微信全局。`douyin-host.spec.ts` 覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅   |
| 11  | 抖音 host 已连接                                             | 对同一数据库文件开第二个连接                                                                                        | 与微信相同：拒绝并发，不静默共享句柄。`douyin-host.spec.ts` 覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ✅   |
| 12  | 用户目录剩余配额放不下整库刷盘                               | 持续写入直到刷盘失败                                                                                                | 事务以 `SQLITE_FULL` 失败、不报成功；调用方经 `cause` 链拿得到平台原文（抖音 `user dir saved file size limit exceeded`）。开发者工具与 iOS 真机 v9 实测：写块 `.155` 时撞配额，`SQLITE_FULL`，cause 链末端是平台原文；不清理直接重开 19 / 19 行、`integrity_check` ok；失败后的库状态按「无崩溃恢复」口径写进文档                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ✅   |
| 13  | 公开文档                                                     | 阅读 compatibility 专节、包 README、根 README                                                                       | 抖音从「不支持」改为「实验性支持」，保留单连接 / rollback journal / 无崩溃恢复边界；「~10MB 级」的内存缓冲口径与平台配额分开写（抖音用户目录总共 10M，库文件与 `-journal` 共用）；其他平台仍写不支持。compatibility 专节、包 README、根 README 已改                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | ✅   |
| 14  | 手工验证入口                                                 | 按文档在开发者工具与 Android / iOS 真机上走一遍                                                                     | 步骤可复述，写明开发者工具、基础库与客户端版本。走 taro 就新增抖音 Nx target，并在 [examples/README.md](../../../examples/README.md) 标明「已验证」或「仍未验证」，禁止含糊（Android 暂缓，按「仍未验证」写）；demo 现有的微信耦合见技术笔记。现状：Taro demo 加了 `build-tt` / `serve-tt`（产物 `dist-tt/`），examples/README 写明「开发者工具 + iOS 已验证（spike v9），Android 仍未验证」。Taro tt 产物：开发者工具（4.5.6，基础库未记录）走查通过——首次打开的初始化失败（comlink 模块顶层读 `globalThis`）由构建期把整份产物的 `globalThis` 改指入口登记的真实全局对象修复；iOS 真机实测加载即 `ReferenceError: Can't find variable: TextEncoder`（RxDB 核心等包模块顶层构造编码器，先于 adapter polyfill），已把五个包改成首次使用时创建、vm 去掉编码全局加载 `dist-tt/` 通过；2026-10-02 iOS 真机走查通过（客户端与基础库版本未记录） | ⚠️   |
| 15  | 微信回归                                                     | `pnpm nx test rxdb-adapter-miniprogram`；`pnpm nx run-many -t build typecheck lint --projects=dev-rxdb-miniprogram` | 全绿；微信公开 API、能力名、错误文案不变。2026-10-02 实测：adapter 225 条测试全绿，api-surface 与基线一致，`dev-rxdb-miniprogram-e2e:e2e-devtools` 16/16 通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ✅   |

### 阶段 C — 支付宝 / 百度 / QQ

| #   | 前置条件                                      | 操作                                                                                                              | 预期结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 状态 |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 16  | 某第一档平台经复议改判 `supported` 且尚未实现 | 按阶段 B 同等标准落地 host                                                                                        | AC#9～#14 对该平台同样成立。因可行性 `unsupported` 跳过：支付宝 / 百度 / QQ 都判 `unsupported`，没有平台经复议改判；支付宝经探针在模拟器与 iOS 真机调试复核（2026-10-04），判定不变；按改判标准，支付宝要先写正式 host，再跑模拟器、iOS 预览、Android 预览                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | ⬜   |
| 17  | 某第一档平台矩阵为 `unsupported`              | 传入该平台 id                                                                                                     | 连接前失败，错误指向可行性文件中的原因；不存在「当成微信跑一下」的分支。支付宝已交：拒绝表 `MINI_PROGRAM_UNSUPPORTED_PLATFORMS`（`host.ts`）登记 `alipay`，抛 `MiniProgramUnsupportedPlatformError`（继承未知平台错误，`blockers` 与矩阵 YAML 一致，文案带判定理由与章节标题）；预检、随机源准备、VFS、`createWaSqliteMiniProgramClient` 都在加载 wasm 与碰宿主能力前失败，不读 `wx`。`unsupported-platform.spec.ts` 用 `?raw` 解析矩阵核对两张表。2026-10-03 至 04 用探针（`apps/dev-rxdb-miniprogram-alipay-probe`）在模拟器与 iOS 真机调试上复核：按文档化标准两项阻断都成立（Worker 里没有 `my`，逻辑层没有任何随机源），阻断项不变；iOS 逻辑层另有未文档化的标准 `WebAssembly`，证据见矩阵支付宝一节「实验」。探针 v3 改成与抖音 spike 同构的 TS 工程，经实验 host 把 adapter 跑一遍：模拟器起初被拦在 adapter 之前（没有真实全局对象与 `BigInt`），实验 host 加三处绕行（Object.prototype getter 找回全局对象并补 `BigInt` / `queueMicrotask`、用户文件垫分帧头避开空写入、wasm 改读 base64 文本副本——模拟器把代码包二进制当 UTF-8 文本读）后建库、读写、重开全部通过；这些是实验做法，不改变按文档化标准的判定；模拟器自动化 `dev-rxdb-miniprogram-alipay-probe-e2e:e2e-devtools`。iOS 真机调试 v3 代码包丢了 `.base64.txt` 副本，adapter 停在打开库；探针 v4 改按构建指纹选 wasm 字节来源，v5 把超限写入改按 adapter VFS 的视角判（整块落盘或撞配额都算对）。iOS 真机调试 v4 / v5（2026-10-04）：wasm 直接读原文件，adapter 经逻辑层标准 `WebAssembly` 建库、读写、重开全部通过，三处绕行只用上补 `queueMicrotask`；v5 findings 为 WASM / 同步 FS / 随机源（经 Worker 桥接）/ 持久化 pass、用户目录 unknown（没撞上配额）。非调试的预览模式与 Android 未跑，它们决定支付宝能否改判，不影响本条：拒绝路径已收口。同日定下矩阵的「改判标准」：未文档化但实测可用的能力可以作为依据，但三个环境都要用正式 host 合格。支付宝的阻断项因此改成 `devtools-unverified` / `ios-unverified` / `android-unverified`（已有实验走的是实验 host、iOS 是真机调试，都不算），拒绝表文案同步；`unsupported-platform.spec.ts` 另按改判标准从 `undocumented` 与 `evidence` 推导第一档每行的判定、阻断项与 caveat。demo 的 `build-alipay` 产物（`dist-alipay/`）2026-10-04 在开发者工具 3.10.15 模拟器（基础库 2.10.15）里走查：页面显示「初始化失败」与上述错误全文（阻断项、已知平台、矩阵章节），产物里没有 wa-sqlite；拒绝路径原先用的 `Object.hasOwn` 换成了 `Object.prototype.hasOwnProperty.call`（见技术笔记），`unsupported-platform.spec.ts` 删掉 `Object.hasOwn` 后照样判定。demo 在支付宝真机上没走查：要在工具里关联真实 AppID。百度 / QQ 仍走未知平台错误（指向文件、不带原因），待登记 | ⚠️   |
| 18  | 第一档平台都处理完毕（实现或明确拒绝）        | 阅读 compatibility 专节                                                                                           | 四个第一档平台（含抖音）每行都有「实验性支持」或「不支持 + 原因」，没有「各种小程序」这种集合句。专节已拆成逐平台表（微信 / 抖音 / 支付宝 / 百度 / QQ 各一行），原来「支付宝 / 百度 / QQ 不支持（缺…或…）」的集合句已删；前置条件要等百度 / QQ 的 AC#17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ⚠️   |
| 19  | 观察档平台（京东等）                          | 传入其平台 id                                                                                                     | 一律按未知平台拒绝；矩阵里可以有 `unknown` 行，代码不得出现半成品 host。`unsupported-platform.spec.ts` 对矩阵里每个观察档 id 断言：不在拒绝表、抛 `MiniProgramUnknownPlatformError` 而非其子类                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ✅   |
| 20  | 覆盖率门禁                                    | `pnpm nx test rxdb-adapter-miniprogram --coverage` 后跑 `pnpm audit:coverage --projects=rxdb-adapter-miniprogram` | 四项指标 ≥ 80%；低于 `coverage-baseline.json` 上次值时脚本只报 WARN，PR 里写明原因。2026-10-03（支付宝 PR）：statements 98.44 / branches 96.46 / functions 100 / lines 98.66，门禁通过；statements、lines 低于基线 99 报 WARN。原因不在本 PR（`host.ts` 100%）：基线记于 2026-09-23，阶段 B 之后 `structured-clone-polyfill.ts`（86%）与 `subframe-glue.ts`（80%）拉低总数                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | ✅   |
| 21  | 微信 + 已支持的非微信 host                    | 全量 `pnpm nx test rxdb-adapter-miniprogram`                                                                      | 全绿；平台 fixture 不得互相污染全局对象。`douyin-host.spec.ts`「AC#21 微信与抖音同进程」覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。因可行性 `unsupported` 而跳过的条目标 ⬜，
并在行内注记「因可行性 `unsupported` 跳过」——不引入模板之外的符号。

## 技术笔记

### 新平台 host 的落点

- host 工厂放 `src/hosts/<id>.ts`，返回完整的 `MiniProgramHost`（参照 `createWechatMiniProgramHost`）；
  `requestRandomValues` 按契约每次给新缓冲区，拿不到恰好 `length` 字节就 reject。
- 登记表 `MINI_PROGRAM_PLATFORM_IDS` 在 `mini-program.interface.ts`；`resolveMiniProgramHost`、微信工厂与
  `MiniProgramUnknownPlatformError` 在 `host.ts`。新 id 与它的 host 实现同一个 PR 落地，登记表里不许有半成品。
- VFS 不按平台复制：`createMiniProgramFileVFS(module, { host, databaseName })` 已经平台无关。新平台的 errMsg 原文
  （缺文件、目录已存在、配额满）进 VFS 的判定正则与测试 fixture；顺手收紧 `mkdirRecursive` 的 `/exist|already/i`，
  它连 `not exist` 也会当成「目录已存在」吞掉。
- demo 的微信耦合已在阶段 B 拆掉：`src/runtime-preflight.ts` 的 `currentDemoRuntime()` 按构建期 `TARO_ENV`
  选微信 / 抖音宿主，其余平台交给 adapter 的 `assertMiniProgramPlatformId` 判定（支付宝抛拒绝表的
  `MiniProgramUnsupportedPlatformError`，没登记的抛未知平台错误）；`src/rxdb-demo.ts` 调
  `prepareMiniProgramHostRuntime(runtime.host)`，建库路径按 `TARO_ENV` 在构建期门住，微信 / 抖音以外的产物里没有 RxDB 栈。
  新平台进 demo 要补：`currentDemoRuntime` 的分支与 `rxdb-demo.ts` 的构建期门；`config/index.ts` 里单列的产物目录
  （`dist-<平台>/`，`dist/` 归微信，Taro 开跑先清空产物目录）、wasm 复制（只给有建库路径的平台）与构建 target；
  开发者工具读的 `project.<平台>.json`；Nx 的 `build-<平台>` / `serve-<平台>` target。
- 支付宝 demo 构建只为拒绝路径，有两处和微信 / 抖音不同。Taro 4.2.1 的支付宝平台插件往产物里加 `.browserslistrc`，
  vite runner 的 `modifyBuildAssets` 代理只认 bundle 里已有的产物，读 `undefined.type` 抛错；
  `patches/@tarojs__vite-runner@4.2.1.patch` 的 `mini/emit.js` 一段让新增产物改走 `emitFile`。
  `project.alipay.json` 的 `compileOptions.transpile` 不能删（空对象就够）：支付宝开发者工具（编译器 0.108.16）
  见到它才用 babel 7 编译 JS，没有它走 babel 6，Taro 运行时 `taro.js` 编译失败（CE1000.02）；
  构建 target 因此用 babel 7 档实测过的 es2018。
- 拒绝路径跑在没核实过的宿主上，不能依赖宿主可能没有的内置，否则拒绝信息会被 `TypeError` 顶掉。
  `assertMiniProgramPlatformId` 原先用的 `Object.hasOwn` 是整个支付宝产物里唯一的 ES2022 内置，iOS 15.4 之前的
  JavaScriptCore 没有它，已换成 `Object.prototype.hasOwnProperty.call`。

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
都被文档否掉了，抖音是第一档里唯一剩下的。现行口径是矩阵的「改判标准」：支付宝因此从文档否决改成缺证据（见 AC#17），
抖音按它仍是 `supported`。
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

| 阶段 | 路径                                                                           | 职责                                                                                     |
| ---- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| A    | `packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts`              | `MiniProgramHost` / 平台登记表 `MINI_PROGRAM_PLATFORM_IDS`                               |
| A    | `packages/rxdb-adapter-miniprogram/src/host.ts`                                | `resolveMiniProgramHost`、微信 host 工厂、未知平台错误                                   |
| A    | `packages/rxdb-adapter-miniprogram/src/error-message.ts`                       | 从 `errMsg` / `message` 取报错文案，VFS 与 host 共用                                     |
| A    | `packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts`                     | 通用文件 VFS；微信封装保留                                                               |
| A    | `packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts`                | 按 host 预检；微信文案不变                                                               |
| A    | `packages/rxdb-adapter-miniprogram/src/runtime-polyfills.ts`                   | host 随机源；`wx` 路径保留                                                               |
| A    | `requirements/stories/adapter/miniprogram-platform-feasibility.md`             | 可行性矩阵                                                                               |
| B/C  | `packages/rxdb-adapter-miniprogram/src/hosts/<id>.ts`                          | 每平台一个 host 工厂，禁止共享「像 wx 的全局」                                           |
| B/C  | `packages/rxdb-adapter-miniprogram/src/__tests__/`                             | 每平台 fixture，不碰真实微信全局                                                         |
| B/C  | `website/docs/compatibility.md`、包 README、根 README、`examples/README.md`    | 按已关闭阶段改口径                                                                       |
| B    | `packages/rxdb-adapter-miniprogram/src/hosts/douyin.ts`                        | `createDouyinMiniProgramHost`：分块布局、绝对 wasm 路径、`tt.getRandomValues`            |
| B    | `apps/dev-rxdb-miniprogram-douyin-spike/`                                      | 真机实验与报告（矩阵抖音一节的证据）                                                     |
| B    | `apps/dev-rxdb-miniprogram/`                                                   | 按 host 注入；`build-tt` / `serve-tt` 手工入口（不进 CI）                                |
| C    | `packages/rxdb-adapter-miniprogram/src/host.ts`                                | 拒绝表 `MINI_PROGRAM_UNSUPPORTED_PLATFORMS`、`MiniProgramUnsupportedPlatformError`       |
| C    | `packages/rxdb-adapter-miniprogram/src/__tests__/unsupported-platform.spec.ts` | `?raw` 解析可行性矩阵，核对登记表 / 拒绝表 / 观察档 / 改判标准                           |
| C    | `apps/dev-rxdb-miniprogram/`                                                   | `build-alipay` / `serve-alipay` 手工入口（不进 CI）、`project.alipay.json`；只走拒绝路径 |
| C    | `patches/@tarojs__vite-runner@4.2.1.patch`                                     | `mini/emit.js` 一段：支付宝平台插件新增的 `.browserslistrc` 改走 `emitFile`              |

## References

- [US-209 微信小程序 wa-sqlite 适配器](./US-209-miniprogram-adapter.md) — 本故事的前置与不可回退边界
- [包 README：能力边界](../../../packages/rxdb-adapter-miniprogram/README.md)
- [compatibility.md 小程序专节](../../../website/docs/compatibility.md)
- [apps/dev-rxdb-miniprogram/](../../../apps/dev-rxdb-miniprogram/) — Taro 多端命令与「仅 weapp 已验证」的落点
- [US-207 / US-210](./US-207-desktop-local-database.md) — 「先抽 host、再按运行时拆阶段」的同构先例；契约本身不复用
