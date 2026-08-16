---
id: US-211
title: 多端小程序宿主（支付宝 / 抖音 / 百度 / QQ）
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-08-16
updated: 2026-08-16
tags: [adapter, miniprogram, alipay, douyin, baidu, qq, wa-sqlite, experimental, multi-platform]
---

<!--
INVEST 检查清单:
- [x] Independent: 只依赖已 Done 的 US-209 微信路径；不阻塞桌面 / 搜索 / 工作树
- [x] Negotiable: 阶段 B 落地哪一个「第一个非微信平台」由阶段 A 可行性矩阵决定，不在开工前锁死支付宝
- [x] Valuable: 关掉今天就能踩到的口是心非——Taro 脚手架有 build:alipay/tt/qq/swan，适配器却只认 wx
- [x] Estimable: 阶段 A 是契约 + 矩阵；B / C 是「一个平台一个 host」，工作量按平台切
- [ ] Small: 五个平台加宿主抽象不是一个迭代能吞的。按 A / B / C 分批，不拆 US-211a 文件
- [x] Testable: 微信回归、可行性文件、逐平台 fail-fast 与文档口径都有独立 AC
-->

# 用户故事：多端小程序宿主

> [US-209](./US-209-miniprogram-adapter.md) 已 Done，且其「仅微信、实验性、单连接、无崩溃恢复」
> 是**长期口径**，不是本故事可以顺手改掉的脚注。本故事是它的后续：先抽出平台无关宿主，
> 再按可行性门禁逐个放行非微信小程序。**阶段没关，文档就不许写「支持该平台」。**

## 交付阶段

| 阶段 | 状态 | 交付                                                                  | AC 区段   | 门禁                                                                |
| ---- | ---- | --------------------------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| A    | ⬜   | 宿主契约 + 平台可行性矩阵；微信路径零行为变化                         | AC#1～8   | US-209 已 Done；**不**把任何新平台标成受支持                        |
| B    | ⬜   | 第一个非微信 host（默认候选支付宝；以阶段 A 矩阵的 `supported` 为准） | AC#9～14  | 阶段 A + 该平台 `decision: supported`                               |
| C    | ⬜   | 其余第一档平台（抖音 / 百度 / QQ）按矩阵逐个放行                      | AC#15～20 | 阶段 B；每个平台独立 `supported` 才能进实现，`unsupported` 只写原因 |

阶段 A 可以单独合并。阶段 B / C 在对应平台可行性为 `unsupported` 时**只阻塞该平台**，
不把整条故事标 `Blocked`，也不许用「微信 host 凑合能跑」冒充交付。

一个 PR 只许交付一个阶段；阶段 C 内部可以按平台拆 PR，但必须落在本文件的 AC 上，
**不创建 `US-211a` / `US-211-alipay` 这类中间文件。**

## 作为/我想要/以便

**作为** 用 Taro / 自建多端工具链同时打微信与其他小程序的开发者
**我想要** 用同一套 RxDB 数据层，按平台注入不同的小程序 host（WASM / 同步文件 / 安全随机源）
**以便** 不必为支付宝、抖音、百度、QQ 各写一套仓库，同时**在平台缺能力时立刻失败**，
而不是把 `wx` 硬塞进 `my` / `tt` 里碰运气

## 今天就能踩到的症状

这些不是规划冲动，是仓库里已经写在纸面上的口是心非：

1. [examples/taro-react-todo/package.json](../../../examples/taro-react-todo/package.json) 保留
   `build:alipay` / `build:tt` / `build:qq` / `build:swan`，但
   [examples/README.md](../../../examples/README.md) 写死「只有 `build:weapp` 经过验证」。
   多端命令在，数据层不在。
2. 公开构造函数仍要求 `wechat: MiniProgramWechatApi` 与 `wasmRuntime: WXWebAssembly`，见
   `WaSqliteMiniProgramOptions`
   （[mini-program.interface.ts](../../../packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts)）。
   支付宝全局是 `my`，抖音是 `tt`，没有合法的注入点。
3. 运行时预检与错误文案绑死微信：
   `assertMiniProgramRuntimeCapabilities()` 抛
   `微信小程序运行时缺少 RxDB 必需能力: …`，能力名是
   `WXWebAssembly.instantiate` / `wx.getFileSystemManager` / `wx.env.USER_DATA_PATH`
   （[runtime-capabilities.ts](../../../packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts)）。
4. 随机源只认 `wx.getRandomValues`
   （[runtime-polyfills.ts](../../../packages/rxdb-adapter-miniprogram/src/runtime-polyfills.ts) 的
   `requestWechatRandomPool`）。
5. US-209 之前根 README 写过「微信 / Alipay」——需求是真的，实现从来没有。
   US-209 修的是**表述**，本故事修的是**能力**。

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

**阶段 B — 第一个非微信平台**

- 实现矩阵里第一个 `decision: supported` 的非微信 host（默认候选：支付宝 `my`）
- 该平台缺 WASM / 同步 FS / 可信随机源时 fail-fast，**不**降级、**不**复用微信全局
- 文档、包 README、`compatibility.md` 只把**这一个**平台从「不支持」改成「实验性支持」，并列出与微信相同的单连接 / 无崩溃恢复边界
- 提供可复述的手工验证入口（扩展 taro 对应 `build:*`，或独立 fixture + 开发者工具步骤）

**阶段 C — 其余第一档平台**

- 抖音 `tt`、百度 `swan`、QQ `qq`：矩阵为 `supported` 的才实现；`unsupported` 的在矩阵里写原因，代码路径必须拒绝该平台 id
- 每个新平台同步一行兼容性文档，禁止「小程序 = 全端」这种集合表述
- 未点名的候选（京东 / 快手 / 小红书 / 企业微信）只允许作为矩阵行存在，本故事不实现

### 平台档位

| 档位 | 平台                            | 全局对象（现状，阶段 A 复核） | 本故事承诺                     |
| ---- | ------------------------------- | ----------------------------- | ------------------------------ |
| 已交 | 微信                            | `wx` + `WXWebAssembly`        | US-209，实验性，本故事不得回退 |
| 第一 | 支付宝 / 抖音 / 百度 / QQ       | `my` / `tt` / `swan` / `qq`   | 阶段 B / C，受可行性门禁       |
| 观察 | 京东 / 快手 / 小红书 / 企业微信 | 阶段 A 矩阵可列 `unknown`     | **不实现**；要做另立故事       |

### Out of Scope

- 把 US-209 的微信路径升格成「与 wa-sqlite 同级的受支持适配器」
- WAL、Worker / SharedWorker、多页面并发、崩溃恢复保证——除非某平台可行性**证明**具备
  可靠 `fsync`、文件锁与原子 rename，且另开故事，不在本文件顺手承诺
- 小程序侧 FTS5 / `@aiao/rxdb-plugin-search`（缺口仍由能力矩阵记录，不归本故事）
- 把 `examples/taro-react-todo` 做成 CI 产品示例或 Nx 项目
- uni-app / 快应用 / React Native / Harmony 作为一等运行时
- 改 `ADAPTER_NAME`（保持 `wa-sqlite-miniprogram`）
- 删除或重命名已发布的微信符号：`RxDBAdapterWaSqliteMiniProgram`、`MiniProgramWechatApi`、
  `createWechatFileVFS`、`prepareMiniProgramRuntime`

## 验收标准

### 阶段 A — 宿主契约与可行性矩阵

| #   | 前置条件                                            | 操作                                                                                                | 预期结果                                                                                                                                                              | 状态 |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 现有微信接入代码只传 `wechat` + `wasmRuntime`       | 跑 `pnpm nx test rxdb-adapter-miniprogram`                                                          | 全绿；公开微信 API、能力名、错误文案与 US-209 一致                                                                                                                    | ⬜   |
| 2   | 包主入口                                            | 阅读 `WaSqliteMiniProgramOptions`                                                                   | 新增平台无关的 `host`（或等价）注入点；`wechat` 仍可用，并在类型上标明它是微信 host 的便利形状                                                                        | ⬜   |
| 3   | 微信 host 已连接                                    | 对同一数据库文件开第二个连接                                                                        | 仍抛「不支持同一数据库的并发连接」，语义与 `wechat-file-vfs.ts` 的 `ACTIVE_DATABASES` 一致                                                                            | ⬜   |
| 4   | 仓库 `requirements/`                                | 查阅本故事旁的可行性文件                                                                            | 微信 / 支付宝 / 抖音 / 百度 / QQ 五行齐全，每行含 WASM 实例化、同步 FS、随机源、用户目录、`fsync`/锁/原子 rename 的证据链接，以及 `supported`/`unsupported`/`unknown` | ⬜   |
| 5   | 阶段 A 合并前                                       | 阅读 `website/docs/compatibility.md` 小程序专节与根 README                                          | 仍写「仅微信、实验性」；不出现「支持支付宝 / 抖音 / 百度 / QQ」                                                                                                       | ⬜   |
| 6   | 调用方传入未知 `platform` id                        | 创建 adapter / 准备 runtime                                                                         | 抛稳定错误，列出已知平台 id，不回退到微信全局                                                                                                                         | ⬜   |
| 7   | `createWechatFileVFS` / `prepareMiniProgramRuntime` | 对照 [api-baseline/rxdb-adapter-miniprogram.json](../../api-baseline/rxdb-adapter-miniprogram.json) | 旧符号仍在；若新增通用符号，走 API baseline 更新，不静默改名                                                                                                          | ⬜   |
| 8   | 阶段 A 的可行性结论                                 | 复核「第一个非微信平台」                                                                            | 正文或可行性文件写明阶段 B 锁定的平台 id；若第一档全部 `unsupported`，阶段 B/C 在本表标注跳过原因，不进入实现                                                         | ⬜   |

### 阶段 B — 第一个非微信 host

| #   | 前置条件                               | 操作                                                                   | 预期结果                                                                                                                              | 状态 |
| --- | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 9   | 阶段 A 指定平台为 `supported`          | 注入该平台 host（不传 `wx`）并完成一次写入 / `disconnect` / 重连       | 数据仍在；使用该平台的用户目录与同步 FS，不读取 `wx`                                                                                  | ⬜   |
| 10  | 该平台缺少 WASM 或同步 FS 或可信随机源 | `assertMiniProgramRuntimeCapabilities()` / `prepareMiniProgramRuntime` | 抛出列出全部缺失能力名的错误，能力名带平台前缀；**不**降级到 `Math.random`，**不**去碰微信全局                                        | ⬜   |
| 11  | 该平台 host 已注册                     | 对同一数据库文件开第二个连接                                           | 与微信相同：拒绝并发，不静默共享句柄                                                                                                  | ⬜   |
| 12  | 公开文档                               | 阅读 compatibility 专节、包 README、根 README                          | 该平台从「不支持」改为「实验性支持」，并保留单连接 / rollback journal / 无崩溃恢复 / ~10MB 边界；其他未交付平台仍写不支持             | ⬜   |
| 13  | 手工验证入口                           | 按文档执行该平台的构建与开发者工具步骤                                 | 步骤可复述；若走 taro，对应 `build:*` 必须在 [examples/README.md](../../../examples/README.md) 标明「已验证」或「仍未验证」，禁止含糊 | ⬜   |
| 14  | 微信回归                               | 再跑微信单测与既有 taro `build:weapp` 类型检查                         | 微信路径无回归                                                                                                                        | ⬜   |

### 阶段 C — 抖音 / 百度 / QQ

| #   | 前置条件                                  | 操作                                            | 预期结果                                                                                          | 状态 |
| --- | ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---- |
| 15  | 某第一档平台矩阵为 `supported` 且尚未实现 | 按阶段 B 同等标准落地 host                      | AC#9～#13 对该平台同样成立                                                                        | ⬜   |
| 16  | 某第一档平台矩阵为 `unsupported`          | 传入该平台 id                                   | 连接前失败，错误指向可行性文件中的原因；不存在「当成微信跑一下」的分支                            | ⬜   |
| 17  | 三个平台都处理完毕（实现或明确拒绝）      | 阅读 compatibility 专节                         | 四个第一档平台（含阶段 B）每行都有「实验性支持」或「不支持 + 原因」，没有「各种小程序」这种集合句 | ⬜   |
| 18  | 观察档平台（京东等）                      | 传入其平台 id                                   | 一律按未知平台拒绝；矩阵里可以有 `unknown` 行，代码不得出现半成品 host                            | ⬜   |
| 19  | 覆盖率门禁                                | `node scripts/audit/coverage-check.mjs`（本包） | 不低于包类型门槛（80%）与既有 baseline 趋势                                                       | ⬜   |
| 20  | 微信 + 已支持的非微信 host                | 全量 `pnpm nx test rxdb-adapter-miniprogram`    | 全绿；平台 fixture 不得互相污染全局对象                                                           | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过 / ⏭️ 因可行性 `unsupported` 跳过

## 技术笔记

### 现状耦合点（阶段 A 必须拆开、不得删掉）

| 符号                            | 微信特化点                                                        | 阶段 A 去向                                                              |
| ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `MiniProgramWechatApi`          | `env.USER_DATA_PATH` / `getFileSystemManager` / `getRandomValues` | 保留；由 `createWechatMiniProgramHost(wx)` 适配到 `MiniProgramHost`      |
| `MiniProgramWasmRuntime`        | 已是最小 `instantiate(path, imports)`                             | 保留；各平台自己提供实现，不假设全局名叫 `WXWebAssembly`                 |
| `loadWaSqliteMiniProgramModule` | 错误文案写死 `WXWebAssembly`                                      | 微信 host 保持原文案；通用加载器用 host / runtime 名称                   |
| `createWechatFileVFS`           | 函数名与 `WechatFileVFSOptions.wechat`                            | 抽出 `createMiniProgramFileVFS({ fileSystem, root, … })`；旧函数变薄封装 |
| `prepareMiniProgramRuntime(wx)` | `requestWechatRandomPool`                                         | 保留；新增按 host 取随机源的重载或并行函数                               |
| `ACTIVE_DATABASES`              | 模块级单连接                                                      | 继续作为所有 host 的并发安全来源，不指望小程序文件锁                     |

`wechat-file-vfs.ts` 的实质已经是「整库进内存 + `writeFileSync`」。它缺的不是另一套 VFS，
是一个**不是微信名字**的注入口。不要为每个平台复制一份缓冲 VFS。

### 可行性文件（阶段 A 产物）

路径：`requirements/stories/adapter/miniprogram-platform-feasibility.md`
（本故事的附件，不是新的 US）。每行至少回答：

1. 官方 WASM 入口是什么、是否只接受代码包路径
2. 是否有**同步** `readFileSync` / `writeFileSync` / `unlinkSync` / `mkdirSync`
3. 可信随机源 API 与基础库版本
4. 用户数据目录常量
5. 有没有 `fsync`、文件锁、原子 rename——没有就写「崩溃恢复：无」，不要用「 theoretically 接近 POSIX」糊弄
6. 证据：官方文档 URL + 本地可复验实验（开发者工具版本、基础库版本）

`unknown` 不是可以开工的绿灯。阶段 B / C 只吃 `supported`。

### 阶段 B 默认候选是支付宝，但不是政治正确

Taro 与历史 README 都把支付宝放在微信旁边，所以它是**第一候选**。
若阶段 A 发现支付宝 WASM 或同步 FS 不成立，按矩阵改锁第一个 `supported` 的第一档平台，
并在 AC#8 写明。不许为了「先有个非微信」去用异步 FS 冒充同步 VFS，也不许在 Worker 里私自 polyfill。

### 不变的能力上限

本故事扩大的是**平台集合**，不是**能力集合**。下列对所有新 host 仍然成立，除非另立故事推翻：

- `journal_mode = DELETE`，不是 WAL
- JS 层单连接
- 整库缓冲，~10MB 兼容性验证
- 随机源耗尽即抛错，不降级
- 包继续标「实验性」

### 与搜索、桌面、子路径门禁的边界

- FTS5 仍不在白名单里，见 [capability-matrix](../../capability-matrix.md) 脚注。本故事不碰
  `SUPPORTED_SEARCH_ADAPTERS`。
- 子路径导出表面仍由 [US-601](../tooling/US-601-subpath-api-surface-baseline.md) 认领。
  阶段 A 若给 `/runtime` 增加符号，PR 必须按现行 versioning 政策声明破坏性。
- 不把小程序 VFS 接到 [US-207](./US-207-desktop-local-database.md) 的桌面 host 契约上。
  两者都叫 host，运行时完全不是一类东西。

## 实现文件

| 阶段 | 路径                                                                        | 职责                                      |
| ---- | --------------------------------------------------------------------------- | ----------------------------------------- |
| A    | `packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts`           | `MiniProgramHost` / 平台 id               |
| A    | `packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts`                  | 通用文件 VFS；微信封装保留                |
| A    | `packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts`             | 按 host 预检；微信文案不变                |
| A    | `packages/rxdb-adapter-miniprogram/src/runtime-polyfills.ts`                | host 随机源；`wx` 路径保留                |
| A    | `requirements/stories/adapter/miniprogram-platform-feasibility.md`          | 可行性矩阵                                |
| B/C  | `packages/rxdb-adapter-miniprogram/src/hosts/`                              | 每平台一个 host，禁止共享「像 wx 的全局」 |
| B/C  | `packages/rxdb-adapter-miniprogram/src/__tests__/`                          | 每平台 fixture，不碰真实微信全局          |
| B/C  | `website/docs/compatibility.md`、包 README、根 README、`examples/README.md` | 按已关闭阶段改口径                        |
| B    | `examples/taro-react-todo/`（可选）                                         | 仅当它仍是最便宜的手工入口时扩展；不进 CI |

## References

- [US-209 微信小程序 wa-sqlite 适配器](./US-209-miniprogram-adapter.md) — 本故事的前置与不可回退边界
- [包 README：能力边界](../../../packages/rxdb-adapter-miniprogram/README.md)
- [compatibility.md 小程序专节](../../../website/docs/compatibility.md)
- [examples/README.md](../../../examples/README.md) — Taro 多端命令与「仅 weapp 已验证」
- [US-207 / US-210](./US-207-desktop-local-database.md) — 「先抽 host、再按运行时拆阶段」的同构先例；契约本身不复用
