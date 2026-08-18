---
id: RV-001
title: Desktop adapter（Electron / Tauri）发布面问题集（5 项）
status: Open
created: 2026-08-17
updated: 2026-08-17
pr:
---

# Review：Desktop adapter（Electron / Tauri）发布面问题集

本文件整合 `@aiao/rxdb-adapter-desktop` 相关的 5 项评审发现。原分散为多个编号重复的
review 文件，现合并为单一 `RV-001`，按主题分 5 节。

> **路径说明**：下文引用的 `packages/rxdb-adapter-desktop/...` 是**评审当时**的树。US-207 E1～E5
> 把该包拆成了三个（共享层下沉、两个运行时各立门户），行号也不再对应，按下表回读：
>
> | 评审当时                                                         | 今天                                                                                                                               |
> | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
> | `rxdb-adapter-desktop/src/desktop-storage.ts`                    | `rxdb-adapter-sqlite-core/src/desktop/desktop-storage.ts`                                                                          |
> | `rxdb-adapter-desktop/src/desktop-sqlite-client.ts`              | `rxdb-adapter-sqlite-core/src/desktop/desktop-sqlite-client.ts`                                                                    |
> | `rxdb-adapter-desktop/src/desktop-adapter.interface.ts`          | 拆成 `rxdb-adapter-sqlite-core/src/desktop/desktop-adapter-name.ts` + `desktop-options.interface.ts`（`runtime` 字段已随 E3 删除） |
> | `rxdb-adapter-desktop/src/tauri-host-transport.ts`               | `rxdb-adapter-tauri/src/tauri-host-transport.ts`                                                                                   |
> | `rxdb-adapter-desktop/src/index.ts`、`README.md`、`package.json` | 一分为二：`rxdb-adapter-electron/` 与 `rxdb-adapter-tauri/` 各自一份（`./host` 只留在 electron 侧）                                |
> | `rxdb-adapter-desktop/src/__tests__/public-api.spec.ts`          | `rxdb-adapter-electron/src/__tests__/public-api.spec.ts`                                                                           |
>
> `@aiao/rxdb-adapter-desktop@0.0.25` 这个 registry 上的旧包**没有**跟着改——它的收口动作是
> US-207 E6 的 `npm deprecate`，尚未执行。

## 1. Tauri rusqlite host 未随 npm 包发布，用户只拿到一根传输管子

### 问题

装 `@aiao/rxdb-adapter-desktop@0.0.25` 的 Tauri 用户**拿不到能开库的 host**。renderer 入口只导出 `createTauriHostTransport`（[index.ts](../../packages/rxdb-adapter-desktop/src/index.ts#L22-L28)），`package.json` 的 `exports` 只有 `.` 与 `./host` 两条 JS 入口，没有 Rust crate、没有 `rusqlite` 引擎。

`createTauriHostTransport` 自己也写明只是注入 `invoke` / `listen` 的管子（[tauri-host-transport.ts](../../packages/rxdb-adapter-desktop/src/tauri-host-transport.ts#L26)）：

```ts
export const TAURI_DESKTOP_REQUEST_COMMAND = 'rxdb_desktop_request';
```

管子那头的 `rxdb_desktop_request`、`Host`、`rusqlite` 连接全在 demo 应用里：

- `apps/dev-rxdb-tauri/src-tauri/src/rxdb/commands.rs` 的 `rxdb_desktop_request`
- `apps/dev-rxdb-tauri/src-tauri/src/rxdb/engine.rs` / `session.rs`
- demo 接线 `setup_rxdb_desktop.ts` 把 `invoke` / `listen` 注进去再 `runtime: 'tauri'`

复验：`packages/rxdb-adapter-desktop/package.json` 的 `exports` 与 `files` 不含任何 `.rs` / crate；`grep` `createElectronSqliteHost` 只命中 Electron `/host`。US-210「Tauri 包化」节原文：

> 本故事的实现今天没有一行在 packages 里……装了 npm 包的用户拿到的只是一根传输管子，管子那头的 `rusqlite` 引擎要自己照着 demo 重写一遍——AC#2/#3 承诺的「与其它后端行为一致」于是只对本仓库成立。

发布文档比故事更差。包 README 能力矩阵仍写（[README.md](../../packages/rxdb-adapter-desktop/README.md#L36-L42)）：

```md
| Tauri | ⚠️ 仅存储形状与校验，见 US-210 | ❌ 永不支持（无 Node 主进程） |
```

> Tauri 侧目前只有类型与校验：host 实现基于 `node:sqlite`，Tauri 没有 Node 主进程，需要另一套 host。

这与源码现状不符：`assertSupportedDesktopStorage` 已把 Tauri + SQLite 标为 ✅（[desktop-storage.ts](../../packages/rxdb-adapter-desktop/src/desktop-storage.ts#L156-L163)），capability-matrix 也写了「本包只提供 transport，真正的 host 是 `src-tauri`」。用户读 npm README 会以为 Tauri 路径还不存在；照着 demo 抄又要整段搬 Rust host。两条路都不是可发布产品。

### 根因

US-210 阶段 1 把可跑的 host 做在 `apps/dev-rxdb-tauri/` 里以关闭事务门禁，阶段 4（T1–T7）才把 npm 包与 Rust crate 同居到 `packages/rxdb-adapter-tauri`。阶段 4 ⬜ 未开始。与此同时 `@aiao/rxdb-adapter-desktop@0.0.25` 已经上 registry，README 仍停在「Tauri 只有类型」那一版。

### 修复方案

按 US-210 T1–T7 把 Rust 宿主迁入可发布包，demo 反向依赖它。在此之前：

1. **立刻改发布 README / 能力矩阵措辞**：写明「本包只提供 `createTauriHostTransport`；`rusqlite` host 目前只在 `apps/dev-rxdb-tauri`，装包用不了」，不要再写「仅存储形状与校验」。
2. T2 开工前先落定插件 vs 普通 crate。做成 `tauri::plugin::Builder` 会让命令带上 `plugin:` 前缀、落入 capability 门禁，US-210 AC#1「`capabilities/` 零改动 / 无可授之物」必须重写，不能 silently 反转。
3. T7 若 crate 不发 crates.io，必须在包 README 写清用户只能 path / git 依赖——否则「用户能复用」只兑现一半。

## 2. renderer 双入口隔离没有真 tarball 门禁，串味只能靠源码图猜测

### 问题

`@aiao/rxdb-adapter-desktop` 是仓库里唯一的双入口包：`.` 给 renderer，承诺**不引用 `node:sqlite`**，可打进沙箱 bundle；`./host` 才碰文件系统（[index.ts](../../packages/rxdb-adapter-desktop/src/index.ts) TSDoc、[README.md](../../packages/rxdb-adapter-desktop/README.md)「两个入口」）。

今天唯一的自动化断言走的是**源码 import 图**，不是打包产物。`public-api.spec.ts` 的 `collectSpecifiers` 从 `index.ts` 跟着相对 `from '...'` 往下爬（[public-api.spec.ts](../../packages/rxdb-adapter-desktop/src/__tests__/public-api.spec.ts#L29-L64)）：

```ts
const collectSpecifiers = (entry: string, ...): Set<string> => { /* readFileSync + IMPORT_PATTERN */ };

it('never reaches node:sqlite from the renderer entry', () => {
  expect([...collectSpecifiers(resolve(SOURCE_ROOT, 'index.ts'))]).not.toContain('node:sqlite');
});
```

这测不到：

1. `exports` / 条件导出把 `/host` 解析进 renderer；
2. bundler 把 `dist/host.js` 打进 renderer chunk；
3. 发布 tarball 里 `files` 漏进不该出现的模块。

US-207「发布前需人工确认的三条性质」自己写了缺口（[US-207](../stories/adapter/US-207-desktop-local-database.md)）：

> **今天没有自动门禁。** 曾由 `scripts/audit/desktop-adapter-consumer.mjs`（254 行）+ `consumer` target 在真 tarball 上守这三条，随发布流程改为手工执行一并删除（删除提交 `0d7f88e`）。

复验：`git show 0d7f88e^:scripts/audit/desktop-adapter-consumer.mjs` 仍在历史里；工作区 `scripts/audit/` 与 `.github/workflows/` 已无 `desktop-adapter-consumer`。`pnpm pack` 后装进临时项目的那三条性质（NodeNext / Bundler typecheck、renderer 产物不含 `node:sqlite`、host 真开库往返）现在全靠手工。

串味的后果是**安全退化而不是构建报错**：`node:sqlite` 进了 renderer 等于把文件系统能力还给渲染进程，`contextIsolation` + `sandbox` 的隔离承诺作废。

### 根因

发布流程改手工后，守双入口的脚本被删，没有另一条自动化补上。单元测试永远走 tsconfig paths 读源码，结构性地看不到 tarball。US-207 阶段 2 ⬜ 计划恢复脚本并挂到 release workflow，尚未开工。

`0.0.25` 上过一次真 registry 手工复验（US-207「发布后的真 registry 复验」），那是一次性快照，挡不住下次改 `exports` / 入口切分。

### 修复方案

1. 从 `0d7f88e^` 取回 `desktop-adapter-consumer.mjs`，按现包名改路径，挂 `consumer` target。
2. 只在发布触发的三平台 workflow 上跑（与 US-207 AC#8 / US-210 AC#9 共用一次打包），不进 PR 门禁——`pnpm pack` + 临时项目的成本与「每次 PR 都跑」不成比例。
3. 断言必须打在**解包后的 tarball** 上，至少包括：
   - `.` 与 `./host` 在 NodeNext / Bundler 下 typecheck；
   - renderer 入口产物（及 sourcemap）不含 `node:sqlite` / 任何 `node:` builtin；
   - host 入口真开库：open → CREATE → INSERT → SELECT → close，应答经 renderer 导出的 `assertDesktopHostResponse` 解包。
4. 阶段 3 拆成 `-electron` / `-tauri` 后脚本参数化包名，不复制第二份（US-207 E7）。

## 3. 桌面 SQLite 跨重启持久化没有打包产物门禁，静默空库抓不到

### 问题

「关掉应用再打开，数据还在」是桌面 Local-first 的底线。今天两条路径都没有能抓住**静默空库**的打包门禁。

#### Electron（US-207 AC#8 ⬜）

本地 e2e `apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts` 用跨进程启动计数 1 → 2 验过 macOS。三平台打包 CI 不存在：`.github/workflows/` 的 `main.yml` / `pr.yml` 全是 `ubuntu-latest`，`ci-windows.yml` 是 `workflow_dispatch`，**没有 macos runner 跑打包产物**。

这条 AC 从未被技术前提挡住，只是没人加 runner（US-207「三平台打包 CI」）。

#### Tauri（US-210 AC#1 ⚠️ + AC#9 ⬜）

自动化只到「同一个宿主进程内断开重连读回同一份数据」。AC#1 要的是**关掉应用再打开**。`apps/dev-rxdb-tauri-e2e/` 当前不存在。AC#9（三平台打包产物上写一行、退出、再启动，断言计数 1 → 2）⬜ 未开始。故事写明 AC#1 与 AC#9 是同一次实现。

#### 为什么「单次启动写一条读一条」不够

US-207 就是靠跨进程累计计数抓到库目录名与 Chromium WebSQL 目录撞车：每次启动拿到一个全新空库，应用照常显示「已连接」。单次启动内「写一条读一条」恒绿，哪怕数据只活在内存里。目录后来改成 `rxdb-data`，但**那是被跨重启 e2e 逼出来的**，不是推理出来的。

Tauri 的 `app_data_dir()` + `rxdb-data/` 没有已知同类冲突，但没有已知冲突不等于验过。一致性套件 `dev-rxdb-tauri:test-conformance`（596 passed）跑在 stdio 子进程上，不经过打包、不经过真 IPC、不跨进程重启。

复验：`ls apps/dev-rxdb-tauri-e2e` 应不存在；`grep -n desktop-persistence apps/dev-rxdb-electron-e2e` 只有 Electron 那一份；workflows 里搜 `macos-latest` + `electron` / `tauri` 打包 smoke 应为空。

### 根因

阶段划分把「能跑」和「打包后仍能跑」拆开了。US-207 阶段 1 / US-210 阶段 1 已交付 in-process / 单机 e2e；两边的阶段 2/3（release 三平台 workflow）都还没开工。设计上这两条 AC 本应共用一次触发，现在是共用一次空白。

### 修复方案

按 US-207「三平台打包 CI」加一条 **release 触发**的 workflow，`matrix: [ubuntu-latest, windows-latest, macos-latest]`，一次触发同时跑：

| 承担                             | 断言形态                                                       |
| -------------------------------- | -------------------------------------------------------------- |
| US-207 AC#8                      | Electron 打包产物跨进程启动计数 1 → 2                          |
| US-210 AC#1/#9                   | Tauri 打包产物同样 1 → 2；三平台统一进程级驱动，不上 WebDriver |
| 第 4 项（renderer tarball 门禁） | 恢复的 `desktop-adapter-consumer.mjs` 打在真 tarball 上        |

不进 PR 门禁。断言形态不能退化成单次启动内的读写——那正好是静默空库的盲区。Tauri 侧先建 `apps/dev-rxdb-tauri-e2e`（与 US-905 阶段 1 共享 project，先开工者 generator 一次）。

## 4. 已发布的 `ADAPTER_NAME` 仍是 `desktop`，`runtime` 选项是第二份真相源

### 问题

用户写进 `rxdb.config.sync.local.adapter` 的运行时字符串今天仍是 `'desktop'`（[desktop-adapter.interface.ts](../../packages/rxdb-adapter-desktop/src/desktop-adapter.interface.ts#L13)）：

```ts
export const ADAPTER_NAME = 'desktop' as const;
```

同一条路径再用构造选项区分宿主（[DesktopOptions.runtime](../../packages/rxdb-adapter-desktop/src/desktop-adapter.interface.ts#L51-L58)）：

```ts
runtime?: DesktopRuntime; // 省略时按 'electron' 解读
```

`DesktopSqliteClient.connect` 把省略当成 Electron（[desktop-sqlite-client.ts](../../packages/rxdb-adapter-desktop/src/desktop-sqlite-client.ts#L181)）：

```ts
assertSupportedDesktopStorage(options?.runtime ?? 'electron', storage);
```

Tauri demo 必须两处同时写对（[setup_rxdb_desktop.ts](../../apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts#L96)）：

```ts
.adapter(DESKTOP_ADAPTER_NAME, async db => new RxDBAdapterDesktop(db, { transport, runtime: 'tauri' }));
```

`public-api.spec.ts` 还把 `'desktop'` 冻成公开契约。capability-matrix 的适配器名列同样是 `desktop`。

US-207 已于 2026-08-17 **落定分裂**：Electron → `sqlite-electron`，Tauri → `sqlite-tauri`，并删除 `runtime` / `DesktopRuntime`——名字已经表达运行时，再留一个选项就是同一件事的两个真相来源。被否掉的是「两包继续注册同一个 `desktop` 名」：一个进程内两个包会互斥注册，冲突只能在运行时报错，等于把拆包要消掉的问题换地方留着。

决策在故事里，**发布面上零动作**。`@aiao/rxdb-adapter-desktop@0.0.25` 已在 registry。拖到有真实用户之后再改名，成本从「改仓库里约 21 个引用点」变成「改用户代码」。

复验：`grep -n "ADAPTER_NAME = 'desktop'" packages/rxdb-adapter-desktop`；`grep -n "runtime: 'tauri'" apps/dev-rxdb-tauri`；registry 包名与版本见 `packages/rxdb-adapter-desktop/package.json` 的 `"version": "0.0.25"`。E3 / T1 均为 ⬜。

### 根因

阶段 3 包边界重整（US-207 E1–E7 + US-210 T1–T7）被排在阶段 2 打包门禁之后——先立「renderer 不含 `node:sqlite`」再动入口。阶段 2 没开工，改名跟着停。0.0.25 却已经发出去了，时间窗在关。

### 修复方案

按已落定决策做一次破坏性改名，两包共用一次，不要分两次让用户改两遍：

| 处                              | 改动                                                                      |
| ------------------------------- | ------------------------------------------------------------------------- |
| `ADAPTER_NAME`                  | `'desktop'` → `'sqlite-electron'` / `'sqlite-tauri'`                      |
| `DesktopOptions.runtime`        | 删除                                                                      |
| `DesktopRuntime` / 能力矩阵校验 | 删除；「Tauri 永不支持 PGlite」不再需要 runtime 分支                      |
| capability-matrix desktop 行    | 拆成三行（含 US-208 的 `pglite-electron`）                                |
| `npm deprecate`                 | `@aiao/rxdb-adapter-desktop` 指向新包，映射写进 `website/docs/migration/` |

完成判据已写在 US-207 E3：`grep -rn "runtime: 'electron'\|runtime: 'tauri'"` 零命中。必须赶在阶段 2 门禁立起来之后、有真实用户之前做——这是破坏性改动，不是整理。

## 5. Tauri 两会话争写锁没有直接用例，`database_busy` 路径只被映射表覆盖

### 问题

US-210 AC#6 承诺：同一 SQLite 文件已被另一个窗口打开并持有写锁时，第二个窗口的写事务由 `PRAGMA busy_timeout` 原地等待；超时报可判别的 `database_busy`，**不静默切到另一份数据库**。

实现零件都在：

- `engine.rs` 的 `BUSY_TIMEOUT_MS: u32 = 5_000`（[engine.rs](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/engine.rs#L69)）
- `protocol.rs` 的 `database_busy` 错误码映射
- `session.rs` 的 `keeps_transactions_isolated_between_sessions`（未提交写入对另一会话不可见）

缺的是**真的让两个会话撞写锁**的用例。AC#6 因此标 ⚠️。故事原文：

> `busy_timeout` 与 `database_busy` 的映射都在，但没有一条用例真的让两个会话撞写锁。……缺的是一条两会话争锁的直接用例。

关闭判据是行为与 US-207 AC#5 一致：第二个 writer 要么等到持锁方提交后成功，要么超时报 `database_busy`，任何情况下不改道到另一份文件。**不是把 Electron 的实现抄过来**——两侧忙等机制有意不同：

| 路径     | 忙等                                                                              | 理由                                                                 |
| -------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Electron | host 层异步退避（`DEFAULT_BUSY_RETRY_BUDGET_MS`），**不**设 `PRAGMA busy_timeout` | `node:sqlite` 同步接口 + 主进程单线程，同步自旋会冻住对方的 `COMMIT` |
| Tauri    | `PRAGMA busy_timeout` 原地等待                                                    | 每条连接活在 `spawn_blocking` 线程上，持锁方能真正推进               |

`DesktopSqliteClient.#request` 的注释把跨会话竞争一律写成「host 侧的 `busy_timeout`」（[desktop-sqlite-client.ts](../../packages/rxdb-adapter-desktop/src/desktop-sqlite-client.ts#L292-L294)）。这句话对 Electron 不成立。注释本身不是用户缺陷，但说明两条路径已经容易被写成同一套，缺直接用例时改错一边不会红。

复验：`grep -n "busy_timeout\|database_busy\|two.session\|两会话" apps/dev-rxdb-tauri/src-tauri apps/dev-rxdb-tauri/conformance packages/rxdb-adapter-desktop/src/__tests__`。能看到 timeout 设置与错误码映射，看不到两个 session 同时 `BEGIN IMMEDIATE` 再断言等待或 `database_busy` 的测试。

共享套件帮不上：每个用例一个 adapter，`rust-adapter-factory.ts` 还故意给每次构造发唯一库名，两个窗口撞不到一起。

### 根因

原计划的跨 realm writer lease 已删除，AC#6 从「第二个 writer 连接时被拒」改成「SQLite 文件锁 + 超时」。映射和隔离用例跟着改了，争锁用例没补。US-210 阶段 2 ⚠️ 认领了这件事。

### 修复方案

单开一个文件、两个会话显式共用同一个逻辑库名（不能并进共享套件）：

1. 会话 A `BEGIN IMMEDIATE` 后不提交；
2. 会话 B 再 `BEGIN IMMEDIATE`；
3. 断言 B 要么在 A `COMMIT` 后成功，要么在超时后得到 `kind: 'error', code: 'database_busy'`；
4. 断言 B 打开的仍是同一条 `resolvedLocation`，磁盘上没有第二份 `.sqlite3`。

Electron 侧若还没有对偶用例，用 host 层异步重试做同一组断言，不要设 `PRAGMA busy_timeout`。顺手改掉 `DesktopSqliteClient.#request` 那句「一律 busy_timeout」的注释，写成「Electron = host 异步重试 / Tauri = `PRAGMA busy_timeout`」。

## 解决记录

5 项中 4 项已在 `local-db` 分支落地（2026-08-17），等开 PR；只剩 §1 的实质部分未动：

- **§1（措辞已改，实质未动）**：包 README 能力矩阵改为「Tauri = 包内只有 transport」；US-207 E5 之后
  Tauri 有了自己的 README（`packages/rxdb-adapter-tauri/README.md`），把「Rust 宿主需自备」提为独立小节。
  但**代码仍在 demo 里**：迁入可发布包是 US-210 T1／T2，未开工。
- **§2**：`scripts/audit/desktop-adapter-consumer.mjs` 对**真实 `pnpm pack` 产物**跑三条发布性质，
  由 `release-desktop.yml` 的 `consumer-smoke` job 执行。US-207 E7 把它参数化到 electron / tauri 两个包
  （一张 `TARGETS` 表，不是第二份脚本），并把「renderer 不含 Node 内建」从只读 `dist/index.js` 改成
  **跟着依赖图走**——E1 之后入口只是转出壳子，只读一个文件会漏掉壳子后面的串味。本机对真 tarball
  跑通：electron `dual entry, NodeNext + Bundler + host round-trip`，tauri `single entry, NodeNext + Bundler`。
- **§3**：`release-desktop.yml` 的三平台打包矩阵 + `apps/dev-rxdb-electron-e2e` / `apps/dev-rxdb-tauri-e2e`
  的跨进程累计断言（启动计数 1 → 2），US-207 AC#8 与 US-210 AC#9 据此关闭。
- **§4**：US-207 E3 执行了 `ADAPTER_NAME` 分裂——`desktop` → `sqlite-electron` / `sqlite-tauri`，
  `DesktopOptions.runtime` 与 `DesktopRuntime` 一并删除，第二份真相源不复存在
  （`grep -rn "runtime: 'electron'\|runtime: 'tauri'"` 零命中）。
- **§5**：`apps/dev-rxdb-tauri/conformance/write-lock-contention.spec.ts` 的三条用例真让两个会话撞同一把写锁，
  US-210 AC#6 据此关闭。

- [x] 1. Tauri host 随包发布：README 措辞已改；**迁包（US-210 T1／T2）仍未动**
- [x] 2. renderer 双入口 tarball 门禁
- [x] 3. 跨重启持久化打包门禁
- [x] 4. `ADAPTER_NAME` / `runtime` 双真相源改名
- [x] 5. Tauri 两会话争写锁直接用例
- [ ] 全部 PR 合并，`status: Resolved`（§1 的实质随 US-210 T1／T2 收口）
