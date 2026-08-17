---
id: RV-001
title: Desktop adapter（Electron / Tauri）发布面问题集（8 项）
status: Open
created: 2026-08-17
updated: 2026-08-17
pr:
---

# Review：Desktop adapter（Electron / Tauri）发布面问题集

本文件整合 `@aiao/rxdb-adapter-desktop` 相关的 8 项评审发现。原分散为多个编号重复的
review 文件，现合并为单一 `RV-001`，按主题分 8 节。

## 1. `runtime` 选项的「host 侧二次校验」契约只写在注释里，代码里不存在

### 问题

`DesktopOptions.runtime` / `DesktopSqliteClientOptions.runtime` 的 TSDoc 与 host 内联注释一致声称：
renderer 侧的 `runtime` 只影响「连接前那次能力矩阵校验的判据与措辞」，「真正的把关在 host 侧，
host 会用**它自己的 runtime 再校验一次**」。但两个 host 都没有实现这层把关——`runtime` 是一段
**死代码**，防御纵深的承诺是假的。

三处证据：

1. client 侧文档承诺 host 会二次校验（
   [desktop-sqlite-client.ts#L68-L74](../../packages/rxdb-adapter-desktop/src/desktop-sqlite-client.ts#L68-L74)）：

   ```ts
   * 传错不会放宽任何东西：host 侧还会用它自己的 runtime 再校验一次。
   readonly runtime?: DesktopRuntime;
   ```

2. `parseOpenRequest` 硬编码 `'electron'` 并让 `createDesktopSqliteHost` 兜底（
   [desktop-host-protocol.ts#L422-L428](../../packages/rxdb-adapter-desktop/src/desktop-host-protocol.ts#L422-L428)）：

   ```ts
   // 这里传 'electron' 只是为了复用同一份矩阵校验；host 侧真实 runtime 由 createDesktopSqliteHost 再断言一次。
   assertSupportedDesktopStorage('electron', storage as DesktopSqliteFileStorage);
   ```

   但 `createDesktopSqliteHost` 的 `open` 只取 `databaseName`，既不接收也不断言 runtime（
   [desktop-sqlite-host.ts#L189-L205](../../packages/rxdb-adapter-desktop/src/desktop-sqlite-host.ts#L189-L205)）：

   ```ts
   const open = (request: Extract<DesktopHostRequest, { kind: 'open' }>): DesktopHostResponse => {
     const { databaseName } = request.storage;
   ```

   且 `DesktopSqliteHostOptions` 根本没有 `runtime` 字段（
   [desktop-sqlite-host.ts#L70-L118](../../packages/rxdb-adapter-desktop/src/desktop-sqlite-host.ts#L70-L118)），
   只有 `resolveDatabasePath` / `postChange` / `onDeliveryError?` / `cacheSizeKb?` / `busyRetryBudgetMs?`。

3. Tauri Rust 侧 `read_storage` 只读 `engine`，从不读 `runtime`，pglite 拒绝消息是硬编码的（
   [protocol.rs#L155-L171](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/protocol.rs#L155-L171)）：

   ```rust
   fn read_storage(record: &Map<String, Value>) -> HostResult<String> {
       let engine = storage.get("engine").and_then(Value::as_str);
       if engine == Some("pglite") {
           return Err(HostError::new(ErrorCode::UnsupportedRuntimeEngine,
               "tauri cannot host a PGlite data directory: ..."));
   ```

   另 `DesktopOptions.runtime` 文档宣称「真正的把关在 host 侧，它知道自己跑在哪个运行时里」（
   [desktop-adapter.interface.ts#L53-L58](../../packages/rxdb-adapter-desktop/src/desktop-adapter.interface.ts#L53-L58)）。

**实际影响**：低，无安全漏洞。PGlite 在两端都会被拒——Electron 侧因硬编码 `'electron'` 走
`assertSupportedDesktopStorage('electron', ...)` 拒 PGlite，Tauri 侧因 `read_storage` 硬编码拒 pglite。
但契约与实现不一致本身是隐患：读者会据此信任「renderer 传错 runtime 无害」，而实际上 client 与
host 各用各的 runtime 判据，二者可能不一致（例如给 Electron host 传 `runtime: 'tauri'` 时，
client 用 `'tauri'` 校验、host 用硬编码 `'electron'` 校验，措辞与错误码来自两套矩阵）。

### 根因

设计意图是「host 侧做最终把关」，但实现时发现每个 host 天然就知道自己的 runtime（Electron host
就是 Electron，Tauri host 就是 Tauri），无需 renderer 透传 runtime 也能自证，于是「透传 + 断言一致」
这一步被省略，注释却原样留了下来。跨语言（TS/Rust）× 跨端（Electron/Tauri）的契约只靠注释口口相传，
没有类型字段或测试兜底，导致注释与实现漂移。

### 修复方案

推荐 **A（改注释，最小且更正确）**，当前「host 各自固化自己的 runtime」本身就是更简单的设计，
问题只在注释说谎：

- 把 `desktop-adapter.interface.ts#L53-L58`、`desktop-sqlite-client.ts#L68-L74`、
  `desktop-host-protocol.ts#L425` 三处改为准确描述，例如：
  「`runtime` 仅决定 renderer 侧前置校验的判据与措辞；host 不依赖它，各 host 用自己的固化 runtime
  独立校验 `engine`」。

若不满足、确需防御纵深，则 **B（真实现）**：给 open 请求与 `DesktopSqliteHostOptions` 增加
`runtime` 字段，host 断言收到的 `runtime` 与自身一致；Tauri 侧 `read_storage` 同步读取并断言
`runtime == 'tauri'`。注意这会让协议结构多一个字段，改动面更大。

## 2. Tauri rusqlite host 未随 npm 包发布，用户只拿到一根传输管子

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

复验：`packages/rxdb-adapter-desktop/package.json` 的 `exports` 与 `files` 不含任何 `.rs` / crate；`grep` `createDesktopSqliteHost` 只命中 Electron `/host`。US-210「Tauri 包化」节原文：

> 本故事的实现今天没有一行在 packages 里……装了 npm 包的用户拿到的只是一根传输管子，管子那头的 `rusqlite` 引擎要自己照着 demo 重写一遍——AC#2/#3 承诺的「与其它后端行为一致」于是只对本仓库成立。

发布文档比故事更差。包 README 能力矩阵仍写（[README.md](../../packages/rxdb-adapter-desktop/README.md#L36-L42)）：

```md
| Tauri    | ⚠️ 仅存储形状与校验，见 US-210 | ❌ 永不支持（无 Node 主进程） |
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

## 3. close/rollback 用 SQLite 错误消息字符串匹配判断「无活动事务」，两端重复且脆弱

### 问题

close 时回滚未提交事务是正常路径，但 Electron 与 Tauri 两端都用
`'cannot rollback - no transaction is active'` 这条 **SQLite 错误消息原文**做字符串匹配来吞掉
「无活动事务」这个「错误」，而非结构化判断。两端各抄一份，脆弱点成对出现：

- TS 侧 `NO_ACTIVE_TRANSACTION = 'cannot rollback - no transaction is active'`
  （[node-sqlite-engine.ts#L80](../../packages/rxdb-adapter-desktop/src/node-sqlite-engine.ts#L80)），
  在 `#rollbackOpenTransaction()` 里 `messageOf(error).includes(NO_ACTIVE_TRANSACTION)` 判断
  （[node-sqlite-engine.ts#L528-L534](../../packages/rxdb-adapter-desktop/src/node-sqlite-engine.ts#L528-L534)）。
- Rust 侧 `NO_ACTIVE_TRANSACTION: &str = "cannot rollback - no transaction is active"`
  （[engine.rs#L77](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/engine.rs#L77)），
  在 `rollback_open_transaction()` 里 `error.to_string().contains(NO_ACTIVE_TRANSACTION)` 判断
  （[engine.rs#L654-L659](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/engine.rs#L654-L659)）。

这依赖 SQLite 错误消息的精确英文文本，文本不保证稳定（SQLite 版本升级、构建时本地化都可能改），
一旦变化，「无事务」会被误判成真错误上报，close 路径开始抛错。

### 根因

两端都选了「最快能跑」的字符串匹配，未查结构化 API。node:sqlite 与 rusqlite 都暴露了
「是否在事务中」的权威判断，无需匹配错误文本。

### 修复方案

用结构化 API 取代字符串匹配，并删除 `NO_ACTIVE_TRANSACTION` 常量：

- **TS 侧**：`DatabaseSync` 有 `readonly isTransaction: boolean`，是
  [`sqlite3_get_autocommit()`](https://sqlite.org/c3ref/get_autocommit.html) 的包装（@since v24.0.0；
  见 `node_modules/@types/node/sqlite.d.ts#L436`）。回滚前判断即可：

  ```ts
  if (this.#db.isTransaction) {
    this.#db.exec('ROLLBACK');
  }
  ```

- **Rust 侧**：rusqlite 0.32.1 的 `Connection::is_autocommit()`（同源
  `sqlite3_get_autocommit`）等价可用，回滚前判断：

  ```rust
  if !self.db().is_autocommit() {
      self.db().execute_batch("ROLLBACK")?;
  }
  ```

**复验方式**：`DatabaseSync.isTransaction` 见 `node_modules/@types/node/sqlite.d.ts#L436`；
`Connection::is_autocommit` 见本地 cargo registry
`rusqlite-0.32.1/src/lib.rs#L1043`（`pub fn is_autocommit(&self) -> bool`）。两端均为源码实证。

## 4. renderer 双入口隔离没有真 tarball 门禁，串味只能靠源码图猜测

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

## 5. 桌面 host 协议版本号在 TS / Rust 两侧手抄，漂移要到真 IPC 才暴露

### 问题

renderer 在 `open` 应答里核对协议版本，不匹配就拒连、不建库（US-210 AC#10 / US-207 AC#9）。拒绝动作本身在共享层，是稳的（[parseDesktopHostOpenResult](../../packages/rxdb-adapter-desktop/src/desktop-host-protocol.ts#L753-L757)）：

```ts
if (protocolVersion !== DESKTOP_HOST_PROTOCOL_VERSION) {
  throw violation(
    `host speaks protocol ${String(protocolVersion)} but this client speaks ${DESKTOP_HOST_PROTOCOL_VERSION}`
  );
}
```

不稳的是 **Tauri host 报上来的数字是手抄的第二份**：

| 侧         | 常量                                                          | 位置                                                                                         |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| TypeScript | `DESKTOP_HOST_PROTOCOL_VERSION = 1`                           | [desktop-host-protocol.ts](../../packages/rxdb-adapter-desktop/src/desktop-host-protocol.ts#L34) |
| Rust       | `pub const PROTOCOL_VERSION: i64 = 1;`                        | [protocol.rs](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/protocol.rs#L17)                  |

两个常量之间没有任何机械联系。改了 TS 那个，`cargo test` 一条不红；改了 Rust 那个，`pnpm nx test` 一条不红。

Rust 侧现有断言只证明「应答里出现了**自己的**常量」（[session.rs](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/session.rs#L315) `open_reports_a_logical_location_not_a_filesystem_path`）：

```rust
assert_eq!(result["protocolVersion"], PROTOCOL_VERSION);
```

它断言的是字段等于 `protocol.rs` 的 `PROTOCOL_VERSION`，不是对面那个 TS 值。一致性套件两侧都用当时的代码构建，协议真变更时漏改一侧，套件照常全绿。US-210 AC#10 因此标 ⚠️，关闭判据写明了缺的就是「握手时 Rust 宿主报的版本号等于 TS 常量」。

Electron 路径没有这个问题：`createDesktopSqliteHost` 回的是同一个 `DESKTOP_HOST_PROTOCOL_VERSION`（[desktop-sqlite-host.ts](../../packages/rxdb-adapter-desktop/src/desktop-sqlite-host.ts#L205)）。

复验：`grep PROTOCOL_VERSION apps/dev-rxdb-tauri` 只有 Rust 常量与对它的自指断言；没有任何测试读 `DESKTOP_HOST_PROTOCOL_VERSION` 再和 Rust 应答比对。客户端单测有「host 报 99 则拒连」（`desktop-sqlite-client.spec.ts`），那是共享层拒绝动作，绑不住 Rust 手抄值。

### 根因

Tauri host 活在另一门语言里，版本号只能复制。阶段 1 先把拒绝动作落到共享层，AC#10 补进来认领这件事，但「把两个常量绑起来」的用例还没写（US-210 阶段 2 ⚠️）。

### 修复方案

最小闭环（US-210 已写）：一致性套件 / stdio 测试宿主握手时断言

```ts
opened.protocolVersion === DESKTOP_HOST_PROTOCOL_VERSION
```

`session.rs:315` 今天只断言「有这个字段且等于 Rust 自己」，差的是「等于对面那个值」。这条绿了，AC#10 才能从 ⚠️ 改 ✅。

不要另起 codegen / 共享 JSON 除非协议字段开始膨胀——现在只有一个 `1`，一条跨语言握手断言就够。

## 6. 桌面 SQLite 跨重启持久化没有打包产物门禁，静默空库抓不到

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

| 承担            | 断言形态                                              |
| --------------- | ----------------------------------------------------- |
| US-207 AC#8     | Electron 打包产物跨进程启动计数 1 → 2                 |
| US-210 AC#1/#9  | Tauri 打包产物同样 1 → 2；三平台统一进程级驱动，不上 WebDriver |
| 第 4 项（renderer tarball 门禁） | 恢复的 `desktop-adapter-consumer.mjs` 打在真 tarball 上 |

不进 PR 门禁。断言形态不能退化成单次启动内的读写——那正好是静默空库的盲区。Tauri 侧先建 `apps/dev-rxdb-tauri-e2e`（与 US-905 阶段 1 共享 project，先开工者 generator 一次）。

## 7. 已发布的 `ADAPTER_NAME` 仍是 `desktop`，`runtime` 选项是第二份真相源

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

| 处                         | 改动                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `ADAPTER_NAME`             | `'desktop'` → `'sqlite-electron'` / `'sqlite-tauri'`                 |
| `DesktopOptions.runtime`   | 删除                                                                 |
| `DesktopRuntime` / 能力矩阵校验 | 删除；「Tauri 永不支持 PGlite」不再需要 runtime 分支              |
| capability-matrix desktop 行 | 拆成三行（含 US-208 的 `pglite-electron`）                         |
| `npm deprecate`            | `@aiao/rxdb-adapter-desktop` 指向新包，映射写进 `website/docs/migration/` |

完成判据已写在 US-207 E3：`grep -rn "runtime: 'electron'\|runtime: 'tauri'"` 零命中。必须赶在阶段 2 门禁立起来之后、有真实用户之前做——这是破坏性改动，不是整理。

## 8. Tauri 两会话争写锁没有直接用例，`database_busy` 路径只被映射表覆盖

### 问题

US-210 AC#6 承诺：同一 SQLite 文件已被另一个窗口打开并持有写锁时，第二个窗口的写事务由 `PRAGMA busy_timeout` 原地等待；超时报可判别的 `database_busy`，**不静默切到另一份数据库**。

实现零件都在：

- `engine.rs` 的 `BUSY_TIMEOUT_MS: u32 = 5_000`（[engine.rs](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/engine.rs#L69)）
- `protocol.rs` 的 `database_busy` 错误码映射
- `session.rs` 的 `keeps_transactions_isolated_between_sessions`（未提交写入对另一会话不可见）

缺的是**真的让两个会话撞写锁**的用例。AC#6 因此标 ⚠️。故事原文：

> `busy_timeout` 与 `database_busy` 的映射都在，但没有一条用例真的让两个会话撞写锁。……缺的是一条两会话争锁的直接用例。

关闭判据是行为与 US-207 AC#5 一致：第二个 writer 要么等到持锁方提交后成功，要么超时报 `database_busy`，任何情况下不改道到另一份文件。**不是把 Electron 的实现抄过来**——两侧忙等机制有意不同：

| 路径     | 忙等                                                                 | 理由                                                                 |
| -------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Electron | host 层异步退避（`DEFAULT_BUSY_RETRY_BUDGET_MS`），**不**设 `PRAGMA busy_timeout` | `node:sqlite` 同步接口 + 主进程单线程，同步自旋会冻住对方的 `COMMIT` |
| Tauri    | `PRAGMA busy_timeout` 原地等待                                       | 每条连接活在 `spawn_blocking` 线程上，持锁方能真正推进               |

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

已在 `local-db` 分支落地 §1 / §2（文档部分）/ §3，等开 PR：

- **§1（方案 A，改注释）**：三处不实描述改为「host 从不读 `runtime`；每个 host 实现本身绑死一个
  运行时，各自按自己那一行矩阵独立断言」——`desktop-adapter.interface.ts` 的 `DesktopOptions.runtime`、
  `desktop-sqlite-client.ts` 的 `DesktopSqliteClientOptions.runtime`、`desktop-host-protocol.ts`
  `parseOpenRequest` 里的内联注释（写明硬编码 `'electron'` 是**事实**而非占位：这份协议解析只服务
  TS 宿主，而 TS 宿主只跑在 Electron 主进程；Tauri 侧走 Rust 的 `parse_request`）。
  未选方案 B：透传 runtime 会多一个协议字段，而每个 host 本就能自证运行时。
- **§2（仅第 1 项，措辞）**：包 README 能力矩阵改为「Tauri = 包内只有 transport」，并新增一段
  写明 `rusqlite` host 只存在于 `apps/dev-rxdb-tauri/src-tauri`、装包的 Tauri 应用需自备 Rust 宿主、
  迁入可发布包是 US-210 阶段 4 且尚未开始。第 2、3 项属于 US-210 阶段 4 本身，未动。
- **§3**：删掉两端的 `NO_ACTIVE_TRANSACTION` 常量，改用结构化判断——
  `NodeSqliteEngine.#rollbackOpenTransaction()` 用 `DatabaseSync.isTransaction`，
  `Engine::rollback_open_transaction()` 用 `Connection::is_autocommit()`（同为
  `sqlite3_get_autocommit()` 的包装）。既有的 close/rollback 用例继续通过。
- 验证：`rxdb-adapter-desktop` 927/927 通过，lint + build 绿；`cargo test --lib` 125/125，clippy 无告警

- [x] 1. `runtime` 二次校验契约：已改注释（方案 A），待 PR
- [ ] 2. Tauri host 随包发布：README 措辞已改；迁包（US-210 阶段 4）未动
- [x] 3. `NO_ACTIVE_TRANSACTION` 换结构化 API：已改，待 PR
- [ ] 4. renderer 双入口 tarball 门禁：开 PR 修复
- [ ] 5. 协议版本常量两侧绑定：开 PR 修复
- [ ] 6. 跨重启持久化打包门禁：开 PR 修复
- [ ] 7. `ADAPTER_NAME` / `runtime` 双真相源改名：开 PR 修复
- [ ] 8. Tauri 两会话争写锁直接用例：开 PR 修复
- [ ] 全部 PR 合并，`status: Resolved`
