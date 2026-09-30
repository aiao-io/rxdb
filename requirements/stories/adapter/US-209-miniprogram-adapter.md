---
id: US-209
title: 微信小程序 wa-sqlite 适配器
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-08-13
updated: 2026-09-20
tags: [adapter, miniprogram, wechat, wa-sqlite, experimental]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只依赖已 Done 的 wa-sqlite 适配器契约，不阻塞其他 story
- [x] Negotiable (可协商): /runtime 子路径是否纳入 api-baseline、taro demo 是否进 CI 都可讨论
- [x] Valuable (有价值): 把已发布但无需求覆盖的实验性包纳入门禁与文档，消除"能力承诺与实际支持不符"
- [x] Estimable (可估算): 剩余工作是门禁登记与文档修正，边界清晰
- [x] Small (小): 适配器实现已合并（92 个单测通过），本故事只承接收尾项
- [x] Testable (可测试): 每条 AC 都对应一条可执行的门禁命令或可 diff 的文档位置

本 story 是为已发布的包补写的：`@aiao/rxdb-adapter-miniprogram` 自 0.0.24 起已发布，
而 requirements/ 下曾没有对应需求文件。已实现能力按事实标 ✅ 并附证据，剩余缺口标 ⬜。
-->

# 用户故事：微信小程序 wa-sqlite 适配器

## 作为/我想要/以便

**作为** 在微信小程序里做 Local-first 原型验证的开发者
**我想要** 用与 Web 端一致的 `RxDBAdapterWaSqliteMiniProgram` 在小程序逻辑层跑通 wa-sqlite 持久化
**以便** 不必为小程序另写一套数据层，同时**明确知道**这条路径的能力边界（实验性、单连接、无崩溃恢复保证）

## 范围边界

### In Scope

- 微信小程序逻辑层的 wa-sqlite 加载（`WXWebAssembly.instantiate`）与运行时能力预检
- 基于 `wx.getFileSystemManager()` 的同步文件 VFS，rollback journal 模式
- 安全随机源引导：`wx.getRandomValues` 预取随机池，**不降级**到非密码学随机
- 微信 Babel 把同步回调误判为 `AsyncFunction` 的规避
- 把本包纳入覆盖率门禁、API baseline 决策与公开文档能力矩阵
- 修正仓库中「微信/Alipay」这类超出实际支持范围的表述

### Out of Scope

- 支付宝 / 抖音 / 百度 / QQ 等其他小程序平台（本适配器仅支持微信逻辑层；多端扩展见 [US-211](./US-211-multi-miniprogram-platforms.md)）
- WAL 模式、Worker / SharedWorker、多页面并发连接
- 崩溃恢复保证（微信文件 API 无可靠 `fsync`、文件锁与原子 rename）
- 大数据量场景（整库缓冲在内存，仅适用于 ~10MB 级兼容性验证）
- 把 taro demo 变成受支持的产品级示例——它只作为手工验证入口

## 验收标准

| #   | 前置条件                                                                                               | 操作                                                                    | 预期结果                                                                                                                                                                                                             | 状态 |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 小程序运行时缺少 `BigInt` / `WXWebAssembly` 等                                                         | 调用 `assertMiniProgramRuntimeCapabilities()`                           | 抛出列出全部缺失能力名的错误，不进入连接流程                                                                                                                                                                         | ✅   |
| 2   | 运行时无原生 `crypto.getRandomValues`                                                                  | 调用 `prepareMiniProgramRuntime(wx)` 后消耗随机数                       | 由 `wx.getRandomValues` 预取的池供给，见底前后台补给；补给失败且余量耗尽时抛错，**任何情况下都不降级**到 `Math.random`                                                                                               | ✅   |
| 3   | 已注册微信文件 VFS                                                                                     | 对同一数据库文件发起第二个连接                                          | 抛出「微信文件 VFS 不支持同一数据库的并发连接」，而不是静默共享句柄                                                                                                                                                  | ✅   |
| 4   | 微信 Babel 环境                                                                                        | 注册 `update_hook` / `create_function` 等同步回调                       | 回调经 `getPrototypeOf → null` 的 Proxy 包装，不被误判为 `AsyncFunction`                                                                                                                                             | ✅   |
| 5   | 打包产物依赖 `@subframe7536/sqlite-wasm`（glue + wasm）                                                | 运行 `node scripts/audit/wa-sqlite-integrity.mjs`                       | 依赖钉**精确版本**，`pnpm-lock.yaml` 里的 SHA-512 integrity 与 glue 内容哈希文件名配对被守护（glue 只在 `./dist/*` 暴露且文件名带内容哈希）；`pnpm install` 前硬失败——性质不变：打包产物里的 SQLite 二进制来源被钉死 | ✅   |
| 6   | CI 测试分道配置                                                                                        | 运行 `pnpm nx test rxdb-adapter-miniprogram`                            | 12 个 spec / 92 个用例全绿，且该项目在 `scripts/ci/plan-test-lanes.mjs` 中有明确分道                                                                                                                                 | ✅   |
| 7   | `scripts/audit/coverage-baseline.json`                                                                 | 运行 `node scripts/audit/coverage-check.mjs`                            | 本包在 baseline 中留有趋势基准（硬门槛 80% 本就生效，与登记无关）                                                                                                                                                    | ✅   |
| 8   | `exports` 中的 `./runtime` 子路径                                                                      | 运行 `node scripts/audit/api-surface.mjs`                               | `./runtime` 的 11 个导出（5 值 + 6 类型）在脚本清单与策略文档中记录为**导出表面已知不覆盖**，清单本身受门禁核对                                                                                                      | ✅   |
| 9   | `website/docs/compatibility.md`                                                                        | 查阅包表格与运行时/存储表格                                             | 出现 `@aiao/rxdb-adapter-miniprogram` 行，并标注实验性、仅微信、单连接、无崩溃恢复保证                                                                                                                               | ✅   |
| 10  | 根 `README.md`「存储适配器」段（「微信小程序**实验性**」表述）与目录树 `rxdb-adapter-miniprogram` 注释 | 阅读小程序相关表述                                                      | 不再声称支持 Alipay；与包 README「仅支持微信小程序逻辑层」一致                                                                                                                                                       | ✅   |
| 11  | `packages/rxdb-adapter-miniprogram/src/index.ts`                                                       | 阅读文件头                                                              | 只有一个 `@packageDocumentation` 块                                                                                                                                                                                  | ✅   |
| 12  | `apps/dev-rxdb-miniprogram/`                                                                           | 运行 `pnpm nx run-many -t lint typecheck build -p dev-rxdb-miniprogram` | 要么纳入某条可执行校验（至少 `typecheck`），要么在 examples README 中显式声明「不在 CI 覆盖范围、需手工验证」——2026-09-12 起走前者，三个 target 全进 CI                                                              | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### 已实现的关键约束

- **运行时预检**：`runtime-capabilities.ts` 检查 11 项能力（`moduleFactory` / `WXWebAssembly.instantiate` /
  `wx.getFileSystemManager` / `wx.env.USER_DATA_PATH` / `BigInt` / `crypto.getRandomValues` / `structuredClone` /
  `TextEncoder` / `TextDecoder` / `performance.now` / `queueMicrotask`），缺失即 fail-fast。
- **随机源**：`runtime-polyfills.ts` 用 `RUNTIME_SOURCE_MARKER` 标记每个 polyfill 的来源
  （`missing` / `native` / `polyfill` / `wechat`）。原生可用时短路，否则预取
  `DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE = 65_536` 字节的池（上限仍是 `wx.getRandomValues`
  的单次限额 `MAX_MINI_PROGRAM_RANDOM_POOL_SIZE = 1_048_576`），剩余量跌到 25% 时单飞补给下一池，
  已发出的字节立即擦除。这条「宁可抛错也不降级」的设计是本适配器与普通 polyfill 的核心差异，
  改动前需重新评审。
- **文件 VFS**：`wechat-file-vfs.ts` 把整库缓冲在内存，经 `writeFileSync` 落盘。
  `xLock` / `xUnlock` 是 no-op，`xShmMap` / `xShmLock` 返回 `SQLITE_IOERR`——
  并发安全**由模块级 `ACTIVE_DATABASES` 集合在 JS 层强制单连接**来保证，不是由 SQLite 锁保证。
- **PRAGMA**：`journal_mode = DELETE`（不是 WAL）、`temp_store = memory`、`foreign_keys = ON`、
  `cache_size = -${cacheSizeKb}`。
- **同步回调**：`synchronous-callbacks.ts` 按 `CALLBACK_ARGUMENTS` 定位每个 API 的回调参数位并加 Proxy 包装。

### 收尾项的落地方式

- **AC#7 覆盖率登记**：`node scripts/audit/coverage-check.mjs --update --projects=rxdb-adapter-miniprogram`
  把本包写入 [coverage-baseline.json](../../../scripts/audit/coverage-baseline.json)
  （`statements 99 / branches 97 / functions 100 / lines 100`，baseline 存向下取整值）。
  **修正原 AC 的措辞**：本包此前并非「不受门禁保护」——`coverage-check.mjs` 的硬门槛是固定阈值
  （核心包 90%、其余 80%），作用于 `packages/` 下所有非 private 包，与是否在 baseline 中无关；
  本包是公开包、`reportsDirectory` 落点正确、在 `plan-test-lanes.mjs` 有分道，因此一直被卡着。
  baseline **不是硬门槛**（见脚本头注释），登记的实际收益是：从此有了「比上次低」的趋势回归警告参照值。
- **AC#8 子路径决策 = 表面记录为已知不覆盖、清单纳入门禁**：
  `scripts/audit/api-surface.mjs` 新增 `KNOWN_UNCOVERED_SUBPATHS`（含本包 `./runtime` 的
  11 个符号 = 5 值 + 6 类型，以及当时两个 `./assets/*` 资产入口——后者无导出表面；
  `rxdb-test` 的 5 个不计，整包已由 `EXCLUDED` 排除；入口计数以 `api-surface.mjs --check`
  输出为准）。两个 `./assets/*` 入口已随 glue + wasm 改用 `@subframe7536/sqlite-wasm`
  一并删除（见 AC#5），资产白名单现含 `rxdb-model-angular` 的 `./tailwind.css`。
  [versioning-policy.md](../../versioning-policy.md) 与
  [website/docs/versioning.md](../../../website/docs/versioning.md) 同步写明这些子路径
  **属于公开 API 但导出表面不受本门禁保护**，改动必须在 PR 描述里人工声明破坏性。
  配套的 `subpath-inventory.mjs` 让**清单本身**受门禁保护：新增或删除子路径而不同步清单即 CI 红，
  避免这份手工清单随包演进静默过期。
  **未选择**扩展扫描器扫子路径导出表面：那会新增约 12 个 baseline 文件并改变 8 个包的门禁行为，
  属于仓库级改动，超出本故事「门禁与文档收尾」的定位，应另立故事 →
  已立为 [US-601](../tooling/US-601-subpath-api-surface-baseline.md)（`Done`，2026-08-24 交付，
  子路径导出表面已实际纳入 baseline 门禁）。
- **AC#9/#10 文档口径**：[compatibility.md](../../../website/docs/compatibility.md) 新增
  「`@aiao/rxdb-adapter-miniprogram` 的能力边界」专节（平台/并发/日志模式/崩溃恢复/数据量/随机源/全文搜索
  逐项列出），并把原「浏览器能力 × 适配器」表扩为「运行时能力 × 适配器」以容纳非浏览器运行时。
  根 `README.md` 两处「微信 / Alipay」改为「仅微信、实验性」。
- **AC#12 examples 定位声明**：现走「纳入 CI」分支——demo 已迁入 `apps/dev-rxdb-miniprogram/`
  并完整纳入 Nx，`lint` / `typecheck` / `build` 三个 target 进 CI（见实现文件表）；
  原 `examples/taro-react-todo/` 已迁出（[examples/README.md](../../../examples/README.md) 记录）。

## 实现文件

- `packages/rxdb-adapter-miniprogram/` — 微信小程序 wa-sqlite 适配器
- `packages/rxdb-adapter-miniprogram/src/runtime.ts` — `/runtime` 子路径入口（随机源引导）
- `apps/dev-rxdb-miniprogram/` — Taro + React 微信小程序 demo（Nx 项目，`lint` / `typecheck` / `build` 进 CI）
- `scripts/audit/wa-sqlite-integrity.mjs` — wasm/cjs 资产 SHA-256 固定
- `scripts/audit/coverage-baseline.json` — AC#7 覆盖率趋势基准
- `scripts/audit/api-surface.mjs` — AC#8 `KNOWN_UNCOVERED_SUBPATHS` 子路径清单（真相源）
- `scripts/audit/subpath-inventory.mjs` + `.spec.mjs` — AC#8 清单核对门禁
- `requirements/versioning-policy.md` — AC#8 策略侧记录（维护者视角）
- `website/docs/versioning.md` — AC#8 对外警示块（子路径不受基线保护）
- `website/docs/compatibility.md` — AC#9 能力矩阵与边界专节
- `README.md` — AC#10 表述修正
- `apps/dev-rxdb-miniprogram/project.json` + `eslint.config.mjs` — AC#12 的 Nx 接入（`build` / `lint` 显式 target）
- `apps/dev-rxdb-miniprogram-e2e/` — 开发者工具 e2e 套件（`e2e-devtools` target，不进 CI）
- `nx.json` — `@nx/playwright/plugin` 的 `exclude`，阻止上面这个项目被推断出 `e2e` 而进 Linux 矩阵
- `package.json` — `pnpm.overrides` 三条定向提升，消掉 `miniprogram-automator` 拖进来的 CVE（`dependency-review` 按 lockfile 判）
- `examples/README.md` — 本目录「不在 CI 覆盖范围」声明，并记录 Taro demo 已迁出

## References

- [包 README：能力边界与已知限制](../../../packages/rxdb-adapter-miniprogram/README.md)
- [US-204 SQLite WASM 适配器](US-204-sqlite-wasm-adapter.md) — 本适配器复用其 wa-sqlite 客户端契约
- [兼容性矩阵](../../../website/docs/compatibility.md) — AC#9 的落点
