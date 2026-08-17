# dev-rxdb-tauri

Angular 22 renderer + Tauri 2（Rust）宿主的开发应用，位于 Nx monorepo 中。

这个 demo 演示的是**纯本地**桌面存储：数据不落在 WebView 的 OPFS/IndexedDB 里，而是由 Rust 宿主
（`rusqlite`，`bundled` 特性固定 SQLite 版本）写进应用作用域下一个真实的 `.sqlite3` 文件——可备份、可迁移、可用
`sqlite3` 直接打开。远端同步不在本 demo 范围内（见 `dev-rxdb-supabase`）。

## 环境

仓库固定使用 pnpm 10，请通过 Corepack 执行：

```bash
corepack pnpm --version
```

Tauri 侧还需要 Rust stable 工具链与各平台系统依赖，自检：

```bash
corepack pnpm exec tauri info
```

以下命令均从仓库根目录运行。

## 开发

只启动 Angular renderer（浏览器预览，走 wa-sqlite，见[本地数据库位置](#本地数据库位置)）：

```bash
corepack pnpm nx serve dev-rxdb-tauri
```

启动 Tauri 窗口（`tauri dev`，`beforeDevCommand` 会自己拉起上面的 renderer）：

```bash
corepack pnpm nx run dev-rxdb-tauri:dev
```

开发端口固定为 `1420`，与 `src-tauri/tauri.conf.json` 的 `devUrl` 对应。

两条路径跑的是**同一份 Angular 代码**，只有本地后端不同：[setup_rxdb.ts](src/app/setup_rxdb.ts) 的 `selectLocalBackend`
按 `window.__TAURI_INTERNALS__` 是否存在判定——Tauri 窗口里用桌面适配器，浏览器预览里用 wa-sqlite。
适配器名与建库工厂是打包返回的，避免 `provideRxDB` 注册的适配器和 initializer 要连的适配器漂移。

## 验证

```bash
corepack pnpm nx test dev-rxdb-tauri          # Angular renderer 单元测试（Vitest + happy-dom）
corepack pnpm nx lint dev-rxdb-tauri
corepack pnpm nx build dev-rxdb-tauri
```

Rust 侧独立门禁（`cwd` 为 `src-tauri/`）：

```bash
corepack pnpm nx run dev-rxdb-tauri:cargo-check     # cargo check --locked --all-targets
corepack pnpm nx run dev-rxdb-tauri:cargo-clippy    # clippy -D warnings，零警告
corepack pnpm nx run dev-rxdb-tauri:cargo-test      # cargo test --locked
```

一致性套件——Rust 引擎跑 `@aiao/rxdb-adapter-sqlite-core/testing` 的 21 个共享套件 + 5 个加密套件，
断言与 Electron / wasm 后端逐字相同：

```bash
corepack pnpm nx run dev-rxdb-tauri:test-conformance
```

它 `dependsOn` `build-test-host`，会先编出 [rxdb_host_stdio.rs](src-tauri/src/bin/rxdb_host_stdio.rs)——
一个在 stdin/stdout 上跑同一套宿主、不启动 `tauri::App` 的测试专用二进制（**不进产品包**）。
需要 Rust 工具链，因此没有并进 `dev-rxdb-tauri:test`。

打包：

```bash
corepack pnpm nx run dev-rxdb-tauri:tauri-build     # dependsOn: cargo-check / cargo-clippy / cargo-test
```

renderer production build 输出到 `dist/apps/dev-rxdb-tauri/browser/`（`frontendDist` 指向此处）。

## 本地数据库位置

### Tauri 窗口

物理根目录由 **Rust 宿主自己决定，且不回传给 renderer**：renderer 递交的永远是应用作用域内的
_逻辑名_，拿到物理路径等于拿到额外的文件系统情报，而它并不需要这份情报就能工作。

落点由两处代码共同决定：

- [commands.rs](src-tauri/src/rxdb/commands.rs) 的 `DesktopHost::new` 取 `app.path().app_data_dir()`，
  即 `<平台 data 目录>/<identifier>`，`identifier` 是 `tauri.conf.json` 里的 `io.aiao.dev-rxdb-tauri`；
- [paths.rs](src-tauri/src/rxdb/paths.rs) 的 `resolve_database_path` 在其下再开一层 `rxdb-data/`（常量 `DATABASE_DIRECTORY`）。

demo 的完整路径：

```text
<AppData>/io.aiao.dev-rxdb-tauri/rxdb-data/desktop_demo@0_1.sqlite3
```

| 平台    | 目录                                                                          |
| ------- | ----------------------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/io.aiao.dev-rxdb-tauri/rxdb-data/`             |
| Windows | `%APPDATA%\io.aiao.dev-rxdb-tauri\rxdb-data\`                                 |
| Linux   | `$XDG_DATA_HOME/io.aiao.dev-rxdb-tauri/rxdb-data/`（默认 `~/.local/share/…`） |

`identifier` 不随构建模式变化，**`tauri dev` 与打包产物共用同一个目录**——开发期写进去的数据，装出来的应用照样能读到。

文件名三段各有出处，改任意一段都会挪动落点：

- `desktop_demo` —— [setup_rxdb_desktop.ts](src/app/setup_rxdb_desktop.ts) 传给 `RxDB` 的 `dbName`
  （常量 `DESKTOP_DEMO_DB_NAME`）。浏览器预览那份叫 `test_6`，**两个后端刻意不同名**：
  它们写的是两份永不互通的数据，同名会让「现在连的是哪个库」无从回答（US-207 E9），
  这条已由 `selectLocalBackend` 的候选表校验强制
- `@0_1` —— RxDB 给物理库名追加的 `RXDB_DB_NAME_SUFFIX`（`packages/rxdb/src/version.ts`，**已永久冻结**，
  它是用户数据的物理地址，改一个字符等于让既有数据凭空消失）
- `.sqlite3` —— 桌面适配器的 `DEFAULT_DATABASE_SUFFIX`（`packages/rxdb-adapter-sqlite-core`）

### WAL 侧车文件

引擎按 WAL 打开（[engine.rs](src-tauri/src/rxdb/engine.rs)：`journal_mode=WAL`、`synchronous=NORMAL`、
`wal_autocheckpoint=1000`、`busy_timeout=5000ms`、`foreign_keys=ON`），因此运行期同目录下还有两个侧车文件：

```text
desktop_demo@0_1.sqlite3
desktop_demo@0_1.sqlite3-wal
desktop_demo@0_1.sqlite3-shm
```

拷贝或备份必须**连它们一起**，或先正常关闭应用：`RunEvent::Exit` 会调用 `DesktopHost::close_all()`，
逐个会话做 `PRAGMA wal_checkpoint(TRUNCATE)` 并关连接。不走这条退出路径的话（例如 `kill -9`），
文件句柄和 `-wal` / `-shm` 会活到进程被杀为止，库文件在应用关闭后仍被占用。

### 子目录名不能改成 `databases`

Chromium 把 `databases` 当作 WebSQL 的地盘，启动时会静默删掉其中没有登记在案的文件——数据丢失且不报错。
US-207 踩过这个坑，实测记录见 `paths.rs` 中 `DATABASE_DIRECTORY` 的注释，守门用例在同文件的 `#[cfg(test)]` 块。

### renderer 侧能看到什么

`open` 应答里的 `resolvedLocation` 是一个**逻辑 URI**，不是路径：

```text
desktop-sqlite://app-scope/desktop_demo@0_1.sqlite3
```

逻辑名过白名单校验（`^[A-Za-z0-9][A-Za-z0-9._@-]*$`、≤128 字符、拒绝 Windows 保留设备名），
路径穿越、绝对路径、盘符、`~` 展开、URL scheme 因此全部落在集合之外。

### 重置本地数据

先关闭应用（否则删的是被占用的文件），再删目录：

```bash
rm -rf ~/Library/Application\ Support/io.aiao.dev-rxdb-tauri/rxdb-data
```

直接查看内容（需要 `sqlite3`）：

```bash
sqlite3 ~/Library/Application\ Support/io.aiao.dev-rxdb-tauri/rxdb-data/desktop_demo@0_1.sqlite3 '.tables'
```

### 浏览器预览（`nx serve`）

不经过 Rust 宿主，走 wa-sqlite 的 OPFS VFS（`OPFSCoopSyncVFS`；OPFS 不可用时降级到 SharedWorker + `IDBBatchAtomicVFS`，
两者都没有则显式抛错，不静默伪造可用存储）。数据落在浏览器 profile 里，**与上面的 `rxdb-data/` 无关，两条路径不共享数据**。

### 一致性测试用的库

全部落在临时工作区：工厂 `mkdtempSync(tmpdir(), 'rxdb-tauri-suite-')` 建目录，宿主在其下同样开
`rxdb-data/`，`afterAll` 里整个删掉。stdio 宿主的根目录由 `argv[1]` 强制给出，**缺参数直接 `exit(2)`**——
默认到某个「合理」位置只会让测试悄悄写进真实的用户数据目录。

## IPC 契约

renderer 与宿主之间只有两个名字，跨语言且编译器帮不上忙，改名必须两侧同时改：

| 方向            | 名字                   | 定义处                                                                                         |
| --------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| renderer → host | `rxdb_desktop_request` | `#[tauri::command] rxdb_desktop_request` 的**函数名** / `createTauriHostTransport` 的 `invoke` |
| host → renderer | `rxdb-desktop-change`  | `commands.rs` 的 `CHANGE_EVENT` / 适配器的 `TAURI_DESKTOP_CHANGE_EVENT`                        |

几个刻意的设计：

- **业务错误是普通返回值**（`{ kind: "error", code, message }`）而不是 `Err`：Tauri 会把 `Err` 压平成字符串，
  可判别的 `code` 会在路上丢掉。`Err` 只保留给「宿主 panic」这一种真正的缺陷。
- **命令是 `async` + `spawn_blocking`**：Tauri 只把 async 命令派到独立任务上，同步命令跑主线程，
  两个会话争写锁时会死锁；而 `rusqlite` 是纯阻塞 API，直接 `async fn` 只会耗光异步运行时的 worker。
- **transport 由应用注入**：Tauri 没有 preload 层，`invoke` / `listen` 是 renderer 直接 import 的模块，
  所以在 [setup_rxdb_desktop.ts](src/app/setup_rxdb_desktop.ts) 里显式注入，`@aiao/rxdb-adapter-tauri` 本身保持运行时无关。
- **不需要任何 `fs` 插件权限**：库文件在应用作用域内，`capabilities/default.json` 只声明了 `core:default` 与四个窗口权限。
- **连接失败不中止 bootstrap**：`connectRxDB` 把失败降级成应用内状态（[rxdb-initializer.ts](src/app/rxdb-initializer.ts)），
  否则窗口全白，而首页那块 `@case ('error')` 诊断面板恰恰会被失败本身挡在门外。

## 项目结构

```text
apps/dev-rxdb-tauri/
├── conformance/               # Rust 宿主一致性套件（Vitest，node 环境，驱动 stdio 二进制）
│   ├── rust-host-transport.ts # 子进程 + 行协议
│   ├── rust-adapter-factory.ts# 共享套件要的适配器工厂
│   └── *.spec.ts              # setup / storage-* / encrypted-*
├── public/                    # renderer 静态资源
├── src/                       # Angular renderer
│   └── app/
│       ├── setup_rxdb.ts             # 按运行时选本地后端
│       ├── setup_rxdb_desktop.ts     # Tauri 窗口：桌面适配器 + Tauri transport
│       ├── setup_rxdb_wa-sqlite.ts   # 浏览器预览：wa-sqlite
│       └── rxdb-initializer.ts       # 连接失败 → 应用内状态
├── src-tauri/                 # Tauri 宿主
│   ├── src/lib.rs             # 命令注册、setup、退出钩子
│   ├── src/rxdb/              # 宿主实现（engine / session / protocol / paths / value / script）
│   ├── src/bin/rxdb_host_stdio.rs  # 一致性测试专用二进制
│   ├── capabilities/          # 窗口权限
│   └── tauri.conf.json        # identifier / CSP / dev 与 build 命令
├── project.json               # Nx targets
├── vite.config.mts            # renderer 单元测试配置
└── vitest.conformance.mts     # 一致性套件配置（独立，需 Rust 工具链）
```

依赖统一由 workspace 管理；`src-tauri/` 下不维护第二份 JS package manifest。
