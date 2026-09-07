# @aiao/rxdb-adapter-tauri

RxDB 适配器，把数据落到 **Tauri 应用私有目录里的真实 SQLite 文件**。

数据由 Rust 侧用 `rusqlite` 直接读写；WebView 只通过 `invoke` / `listen` 发协议请求，因此它既拿不到文件系统句柄，也拿不到物理路径。

Electron 请改用 [`@aiao/rxdb-adapter-electron`](https://www.npmjs.com/package/@aiao/rxdb-adapter-electron)：协议与 renderer 客户端两包共用同一份实现（在 `@aiao/rxdb-adapter-sqlite-core/desktop-host`），差别只在特权侧是 Rust 还是 `node:sqlite`。

## 功能特性

- **真文件持久化**：数据在应用数据目录里的 `.sqlite3` 文件中，重启后仍在，不依赖 WebView 存储配额
- **WebView 零文件系统权限**：不需要开 `fs` 权限，也不需要把路径交给前端
- **不回退**：存储配置不受支持时直接抛错，绝不静默切到 memory/OPFS/IndexedDB
- **复用 SQL 核心**：查询、事务、分支切换全部来自 `@aiao/rxdb-adapter-sqlite-core`，与 wa-sqlite / sqlite-wasm 同语义

## ⚠️ Rust 宿主：同一个项目，但不经 npm 分发

本 npm 包**只有 WebView 这一侧**：`createTauriHostTransport` 是一根把 `invoke` / `listen` 接上协议的管子。管子那头真正开库的 `rusqlite` 宿主（`rxdb_desktop_request` 命令、引擎、会话表）是一个 Rust crate，随应用二进制走，npm 装不来。

它就在本包目录下的 [`rust/`](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-tauri/rust)（crate 名 `aiao-rxdb-tauri`）——线协议的两端住在同一个项目里，改一端必然看见另一端。

**该 crate 尚未发布到 crates.io**，因此今天只能按 git 依赖引用：

```toml
# src-tauri/Cargo.toml
[dependencies]
aiao-rxdb-tauri = { git = "https://github.com/aiao-io/rxdb", tag = "v0.0.25" }
```

限制说明与后续计划见 [`rust/README.md`](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-adapter-tauri/rust/README.md)。

## 能力矩阵

| 存储                  | 状态                                                 |
| --------------------- | ---------------------------------------------------- |
| SQLite 单文件         | ✅ 适配器名 `sqlite-tauri`，Rust 宿主自备            |
| PGlite data directory | ❌ 永不支持：PGlite 的同步文件系统契约要 Node 主进程 |

不在矩阵内的组合会被 `assertDesktopSqliteStorage` 以 `unsupported_runtime_engine` 拒绝——不静默退化。

## 安装

```bash
npm install @aiao/rxdb-adapter-tauri
# 或
pnpm add @aiao/rxdb-adapter-tauri
```

## 使用

### 1. Rust 侧：注册命令、托管宿主、接上两处回收

`aiao-rxdb-tauri` 是**普通 crate，不是 Tauri 插件**，命令因此由应用自己 `generate_handler!` 注册：

```rust
use aiao_rxdb_tauri::commands::{rxdb_desktop_request, DesktopHost};
use tauri::Manager;

tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![rxdb_desktop_request])
    .setup(|app| {
        let dir = app.path().app_data_dir()?;
        // 第三个参数是**窗口白名单**：只有这些 label 的窗口调得动 `rxdb_desktop_request`。
        app.manage(DesktopHost::new(app.handle(), dir, &["main"]));
        Ok(())
    })
    // 窗口没了就回收它的会话，不等整个应用退出：挂 `Destroyed` 而不是 `CloseRequested`，
    // 后者可被阻止，也不会在窗口崩溃时触发。带着独占文件锁消失的窗口会让另一个窗口的
    // `lockAcquire` 无限期等下去。
    .on_window_event(|window, event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            window.state::<DesktopHost>().close_window(window.label());
        }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    // 退出前显式关掉全部会话，否则 `-wal` / `-shm` 与文件句柄会活到进程被杀为止，
    // 库文件在应用关闭后仍被占用。
    .run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<DesktopHost>().close_all();
        }
    });
```

白名单没有默认值、也不可省略。应用自有命令对**每一个** webview 开放（下一段说明为什么），
会话归属只挡得住「用别人的 sessionId」，挡不住「自己开一个新会话」——不点名 owner，
任何一扇窗口（调试窗口、将来某个忘了排除的窗口）都能自行打开应用作用域的库。
未列入白名单的窗口发来的请求会得到一条普通应答 `{ kind: "error", code: "permission_denied" }`。

做成普通 crate 而不是插件是刻意的：`generate_handler!` 注册的应用自定义命令**不受 capability 门禁约束**（只有 `core:` / `plugin:` 前缀的命令才是），于是接上桌面数据库**不需要**给应用授予 `sql` / `fs` / `shell` 任何插件权限，`capabilities/` 一个字都不用改。做成插件的话命令会带上 `plugin:` 前缀，恰好落进门禁——省下的只是上面这段样板，换掉的却是一条结构性的安全性质。

命令名与事件名由本包的两个常量钉住（`TAURI_DESKTOP_REQUEST_COMMAND` / `TAURI_DESKTOP_CHANGE_EVENT`），改名两边就对不上。变更事件按 `sessionId` 回送，事件名为 `rxdb-desktop-change`。

### 2. WebView 侧：像用别的适配器一样用

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

`invoke` / `listen` 由调用方注入而不是本包直接 import `@tauri-apps/api`：那样会把一个只在 Tauri 里存在的运行时依赖钉进包的依赖图，本包在浏览器测试环境里就再也加载不起来。

`target` 是**必填**的，它是定向投递的另一半。宿主用 `emit_to(owner)` 只把变更事件发给开出该会话的窗口，但 tauri 在监听者的 target 为 `Any` 时无条件匹配，而 `listen()` 的默认恰恰是 `Any`——收件侧不带 target 注册，任何能调 `listen` 的 webview 都会收到所有窗口的 sessionId、库名与表名。注入 `getCurrentWebviewWindow().listen` 也可以，那份 `listen` 自带窗口 target，会忽略本字段。

## 逻辑库名不是路径

`databaseName` 是**应用作用域内的逻辑名**。WebView 无从得知、也不需要得知物理根目录。

省略时按 `${rxdb.config.dbName}.sqlite3` 推导；只有接管一个已存在的库、或多个 RxDB 实例共用同一个文件时才需要显式指定。

允许集是白名单 `/^[A-Za-z0-9][A-Za-z0-9._@-]*$/`（≤ 128 字符）而非黑名单：字符集里没有 `/`、`\`、`:`，也不允许以 `.` 开头，于是 `..`、绝对路径、盘符、`~` 展开、URL scheme 全部落在集合外，不需要逐一枚举攻击形态。违反时抛 `invalid_database_name`。

> 名字来自 WebView，**不可信**。Rust 宿主侧会再校验一次（`paths.rs`），非法入参不该在磁盘上留下任何痕迹。

## 值编码

SQLite 的值经 JSON 往返，`encodeDesktopJsonPayload` / `decodeDesktopJsonPayload` 负责两件 JSON 本身做不到的事：

- **`Uint8Array` ↔ base64**：JSON 没有二进制类型，BLOB 直接 `JSON.stringify` 会变成 `{"0":1,"1":2}` 这种按下标展开的对象；
- **大整数**：超出 `Number.MAX_SAFE_INTEGER` 的 `INTEGER` 以字符串承载，避免静默丢精度。

两端的编码由本包 `conformance/` 下的一致性套件按真进程往返验证，`rust/src/value.rs` 是它的 Rust 对侧。

### 非有限数：与 Electron 的一处已知差异

JSON 写不出 `Infinity` / `-Infinity` / `NaN`，`JSON.stringify` 把它们变成 `null`。悄悄照做的话，
一条绑了 `Infinity` 的 `INSERT` 会在库里落成 NULL —— 写进去的不是你给的值，而且全程没有报错。
因此本适配器在**两个方向上都拒绝**这三个值，抛 `protocol_violation`：

- **写入**：绑定参数里出现非有限数，请求在 WebView 侧就被拒，不会发给宿主（`encodeDesktopJsonPayload`）；
- **读取**：某列的值是非有限 REAL（例如 `SELECT 1e400` 溢出成 `Infinity`），宿主拒绝编码这条应答（`rust/src/value.rs` 的 `encode_real`）。

Electron 那侧的 IPC 是结构化克隆，搬得动非有限数，因此同样两件事在那里分别是写入成功、读回
`Infinity`。这是两端目前已知的一处取值差异：**跨后端可移植的代码不要往 SQLite 里存非有限数**
（存 `NULL` 或哨兵值，或改存字符串）。

## 错误码

程序分支请读 `error.code`，不要匹配消息文本（消息以 `[code]` 加一个空格作前缀，仅便于日志检索）。错误码与 Electron 侧**完全共用同一套**，定义在 `@aiao/rxdb-adapter-sqlite-core/desktop-host` 的 `RxDBAdapterDesktopErrorCode`：

| code                         | 含义                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| `unsupported_runtime_engine` | 存储 `engine` 不在能力矩阵内（例如 PGlite data directory）      |
| `invalid_database_name`      | 逻辑库名非法，或试图越出应用作用域                              |
| `host_unavailable`           | 请求没递到宿主（命令未注册 / capability 不许 / 参数序列化失败） |
| `session_closed`             | 会话已断开后继续使用                                            |
| `protocol_violation`         | 请求或响应不符合协议形状                                        |
| `open_failed`                | 打开数据库失败，`cause` 保留原始原因                            |
| `permission_denied`          | 路径无权限，或语句被授权器拒绝                                  |
| `database_corrupted`         | 目标文件不是可用的 SQLite 数据库                                |
| `statement_failed`           | SQL 本身执行失败（语法、约束等）                                |
| `host_internal_error`        | 宿主自身出错，属于缺陷而非调用方问题                            |
| `database_busy`              | 另一个连接正持有冲突的锁，重试即可，数据无损                    |
| `file_not_found`             | 目标文件或目录不存在                                            |
| `invalid_file_path`          | 路径逃出存储根，或指向的类型与操作不符                          |
| `disk_full`                  | 磁盘空间或配额耗尽                                              |
| `write_aborted`              | 写入令牌已失效，目标保持写入前的内容                            |
| `transaction_not_found`      | 事务 ID 不存在、已结束，或不属于本会话；一条语句都没执行        |
| `transaction_unavailable`    | 等待开启事务超时，另一个事务正占着连接；库无损，重试即可        |

后六个只出现在文件存储（`@aiao/rxdb-plugin-storage` 的桌面后端）与事务这两条路径上。

错误码是**契约的一部分**：新增只能追加，不得复用或改写既有含义。

`RxDBAdapterDesktopError` 这个类跨不过 `invoke` 的序列化，宿主侧的错误以 `{ kind: 'error', code, message }` 回到 WebView，由适配器按契约重新抛成 `RxDBAdapterDesktopError`——调用方写的仍是普通 `try/catch`。不在契约内的 `code` 一律按 `protocol_violation` 处理，不会被当成错误码原样上抛。

## 协议版本

线协议版本号在 TS 与 Rust 两侧各存一份（`DESKTOP_HOST_PROTOCOL_VERSION` 与 `rust/src/protocol.rs` 的 `PROTOCOL_VERSION`）。两个常量之间唯一的机械联系是一致性套件的 `conformance/protocol-handshake.spec.ts`：它拿真进程报上来的数字与常量比对，改一侧忘了改另一侧时那条用例会红。

renderer 在 `open` 之前先发一次无副作用的 `handshake` 协商版本，握手不过就不建库——版本不匹配时磁盘上不该多出一个空文件。

## 完整示例

参考 [dev-rxdb-tauri](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-tauri)：`src-tauri/src/lib.rs`（Rust 侧接线，就是上面那段）、`src/app/setup_rxdb_desktop.ts`（WebView 侧接线）。宿主实现与跨进程一致性套件在本包的 `rust/` 与 `conformance/`。
