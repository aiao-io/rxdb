# Tauri 适配器

`@aiao/rxdb-adapter-tauri` 把数据落到 **Tauri 应用私有目录里的真实 SQLite 文件**：数据由 Rust 侧用 `rusqlite` 直接读写，WebView 只通过 `invoke` / `listen` 发协议请求，因此它既拿不到文件系统句柄，也拿不到物理路径，**不需要**给应用授予 `sql` / `fs` / `shell` 任何插件权限。

## 定位

本 npm 包**只有 WebView 这一侧**：`createTauriHostTransport` 是一根把 `invoke` / `listen` 接上协议的管子，加上 `RxDBAdapterTauri` 这个适配器本体（含 JSON 标签编解码）。管子那头真正开库的 `rusqlite` 宿主是一个 Rust crate，随应用二进制走，npm 装不来。

协议、renderer client、存储联合与错误类型与 Electron 侧**共用同一份实现**（在 `@aiao/rxdb-adapter-sqlite-core/desktop-host`），差别只在特权侧是 Rust 还是 `node:sqlite`。查询、事务、分支切换全部来自 `@aiao/rxdb-adapter-sqlite-core`，与 wa-sqlite / sqlite-wasm 同语义。

:::warning Rust 宿主：同一个项目，但不经 npm 分发

宿主 crate 就在本包目录下的 [`rust/`](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-tauri/rust)（crate 名 `aiao-rxdb-tauri`）——线协议的两端住在同一个项目里，改一端必然看见另一端。

**该 crate 尚未发布到 crates.io**，因此今天只能按 git 依赖引用：

```toml
# src-tauri/Cargo.toml
[dependencies]
aiao-rxdb-tauri = { git = "https://github.com/aiao-io/rxdb", tag = "v0.0.26" }
```

限制说明与后续计划见 [`rust/README.md`](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-adapter-tauri/rust/README.md)。

:::

## 安装

```bash npm2yarn
npm install @aiao/rxdb-adapter-tauri
```

## Rust 侧：注册命令、托管宿主、接上两处回收

`aiao-rxdb-tauri` 是**普通 crate，不是 Tauri 插件**，命令因此由应用自己 `generate_handler!` 注册：

```rust
use aiao_rxdb_tauri::commands::{rxdb_desktop_request, DesktopHost};
use tauri::Manager;

tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![rxdb_desktop_request])
    .setup(|app| {
        let dir = app.path().app_data_dir()?;
        // 第三个参数是窗口白名单：只有这些 label 的窗口调得动 rxdb_desktop_request。
        app.manage(DesktopHost::new(app.handle(), dir, &["main"]));
        Ok(())
    })
    // 窗口没了就回收它的会话，不等整个应用退出：挂 Destroyed 而不是 CloseRequested，
    // 后者可被阻止，也不会在窗口崩溃时触发。带着独占文件锁消失的窗口会让另一个窗口的
    // lockAcquire 无限期等下去。
    .on_window_event(|window, event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            window.state::<DesktopHost>().close_window(window.label());
        }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    // 退出前显式关掉全部会话，否则 -wal / -shm 与文件句柄会活到进程被杀为止，
    // 库文件在应用关闭后仍被占用。
    .run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<DesktopHost>().close_all();
        }
    });
```

要点：

- **白名单没有默认值、也不可省略**。应用自有命令对每一个 webview 开放，会话归属只挡得住「用别人的 sessionId」，挡不住「自己开一个新会话」——不点名 owner，任何一扇窗口（调试窗口、将来某个忘了排除的窗口）都能自行打开应用作用域的库。未列入白名单的窗口发来的请求会得到一条普通应答 `{ kind: "error", code: "permission_denied" }`。
- **做成普通 crate 而不是插件是刻意的**：`generate_handler!` 注册的应用自定义命令**不受 capability 门禁约束**（只有 `core:` / `plugin:` 前缀的命令才是），于是接上桌面数据库**不需要**给应用授予任何插件权限，`capabilities/default.json` 全程零改动。做成插件的话命令会带上 `plugin:` 前缀，恰好落进门禁。
- **变更事件那一半仍然要过门禁**：`listen` 是 `core:event:listen`，用它的窗口需要 `core:event:default`（`core:default` 已经含了它，脚手架生成的 `default.json` 因此开箱可用）。真正会踩到的是自己裁过权限的窗口——那时 `invoke` 通、库开得起来、查询也读得到数据，只是再也收不到变更事件，界面停在第一次查询的结果上，不报任何错。
- 命令名与事件名由本包的两个常量钉住（`TAURI_DESKTOP_REQUEST_COMMAND` / `TAURI_DESKTOP_CHANGE_EVENT`），改名两边就对不上。变更事件按 `sessionId` 回送，事件名为 `rxdb-desktop-change`。

## WebView 侧：像用别的适配器一样用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { createTauriHostTransport, RxDBAdapterTauri, TAURI_ADAPTER_NAME } from '@aiao/rxdb-adapter-tauri';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

const transport = createTauriHostTransport({ invoke, listen, target: getCurrentWebviewWindow().label });

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: { type: SyncType.None, local: { adapter: TAURI_ADAPTER_NAME } }
});

rxdb.adapter(TAURI_ADAPTER_NAME, async database => new RxDBAdapterTauri(database, { transport }));
rxdb.init();
await rxdb.connect(TAURI_ADAPTER_NAME);

// 组件/窗口销毁时把连接交还给宿主，否则会话要等到进程退出才回收。
await rxdb.disconnectAll();
```

要点：

- `invoke` / `listen` 由调用方注入而不是本包直接 import `@tauri-apps/api`：那样会把一个只在 Tauri 里存在的运行时依赖钉进包的依赖图，本包在浏览器测试环境里就再也加载不起来。相应地 `RxDBAdapterTauri` 的 `transport` 是**必填**的——Tauri 没有 preload 注入全局桥接那一层，不存在「省略后自己去全局键上找」的形态。
- `target` 是**必填**的，它是定向投递的另一半：宿主用 `emit_to(owner)` 只把变更事件发给开出该会话的窗口，但 tauri 在监听者的 target 为 `Any` 时无条件匹配，而 `listen()` 的默认恰恰是 `Any`——收件侧不带 target 注册，任何能调 `listen` 的 webview 都会收到所有窗口的 sessionId、库名与表名。注入 `getCurrentWebviewWindow().listen` 也可以，那份 `listen` 自带窗口 target，会忽略本字段。

:::tip 逻辑库名不是路径

`databaseName` 是**应用作用域内的逻辑名**，WebView 无从得知、也不需要得知物理根目录。省略时按 `<dbName>.sqlite3` 推导；允许集是白名单 `/^[A-Za-z0-9][A-Za-z0-9._@-]*$/`（≤ 128 字符），违反时抛 `invalid_database_name`。名字来自 WebView，**不可信**，Rust 宿主侧会再校验一次。

:::

## 能力矩阵

| 存储                  | 状态                                                 |
| --------------------- | ---------------------------------------------------- |
| SQLite 单文件         | ✅ 适配器名 `sqlite-tauri`，Rust 宿主自备            |
| PGlite data directory | ❌ 永不支持：PGlite 的同步文件系统契约要 Node 主进程 |

不在矩阵内的组合会被 `assertDesktopSqliteStorage` 以 `unsupported_runtime_engine` 拒绝——不静默退化。全文搜索同样不可用：`@aiao/rxdb-plugin-search` 的放行名单里没有 `sqlite-tauri`，`createRxDatabase` 阶段会抛 `SearchUnsupportedAdapterError`。错误码与 Electron 侧**完全共用同一套**（`RxDBAdapterDesktopErrorCode`，定义在 `@aiao/rxdb-adapter-sqlite-core/desktop-host`），程序分支请读 `error.code`，不要匹配消息文本。

## DevTools 调试窗口

Tauri WebView 不支持安装 Chrome 扩展，`@aiao/rxdb-devtools` 在 Tauri 上的形态是**开发态调试窗口**（US-905）：显式开发配置下创建标签固定的 `rxdb-devtools` 窗口，与主 WebView 的 connector 之间走版本化、双向、严格校验的定向 transport。调试窗口**不是第二个 RxDB writer**——它不直接打开 SQLite，只通过主 WebView connector 经 US-210 宿主与文件宿主的窄接缝使用受限调试能力；release 产物静态不含调试窗口 bootstrap、专用 command 与只服务该 label 的 capability。DevTools 的 VFS 强制档里，idb 档与 opfs 档同形态地跑在 dedicated Worker（生产路径仍保留 SharedWorker 让多标签页共享同一条连接）。接入方式见[开发者工具](../devtools/README.md)。

## 与 Electron 的选择

两包共用同一份协议与 renderer client，差别只在特权侧：

| 维度             | Electron（[./electron.md](./electron.md)）          | Tauri（本页）                                       |
| ---------------- | --------------------------------------------------- | --------------------------------------------------- |
| 特权侧引擎       | `node:sqlite` / PGlite WASM（Node 主进程，包内自带） | `rusqlite`（Rust crate，git 依赖，未发 crates.io）  |
| 适配器名         | `sqlite-electron` / `pglite-electron`               | `sqlite-tauri`                                      |
| 变更跨窗口       | SQLite 侧不跨；PGlite 侧跨（`NOTIFY`）              | 不跨（事件只回送开出会话的窗口）                  |
| 备份恢复 FTS5    | host 以 defensive 模式运行，含 FTS5 虚表的库不可备份 | FTS5 可用，含 FTS5 虚表的库可以备份并恢复           |

需要 PostgreSQL 方言或跨窗口变更事件时只有 Electron + PGlite 一条路；只做 SQLite 单文件时按宿主栈选。

## 参考

- [包 README](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-tauri)
- [rust/README.md](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-adapter-tauri/rust/README.md)（crate 引用方式与限制）
- [dev-rxdb-tauri 完整示例](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-tauri)：`src-tauri/src/lib.rs`（Rust 侧接线）、`src/app/setup_rxdb_desktop.ts`（WebView 侧接线）
