# @aiao/rxdb-adapter-desktop

RxDB 适配器，把数据落到**桌面应用私有目录里的真实 SQLite 文件**。

数据由特权侧（Electron 主进程或它拥有的 worker）用 `node:sqlite` 直接读写；渲染进程只通过一条窄传输层发协议请求，因此它既拿不到文件系统句柄，也拿不到物理路径。

## 功能特性

- **真文件持久化**：数据在应用数据目录里的 `.sqlite3` 文件中，重启后仍在，不依赖浏览器存储配额
- **渲染进程零文件系统权限**：`contextIsolation: true` + `sandbox: true` 下照常工作
- **多窗口安全**：同一文件上的多个窗口连接共享 writer lease 与 `BEGIN IMMEDIATE` 事务，撞锁自动重试
- **不回退**：runtime 与 engine 的组合不受支持时直接抛错，绝不静默切到 memory/OPFS/IndexedDB
- **复用 SQL 核心**：查询、事务、分支切换、writer lease 全部来自 `@aiao/rxdb-adapter-sqlite-core`，与 wa-sqlite / sqlite-wasm 同语义

## 何时使用

- Electron 应用需要「用户看得见、备份得了、卸载才会没」的本地数据
- 数据量超出浏览器存储配额的舒适区，或不接受 OPFS 被浏览器回收的风险
- 需要外部工具（`sqlite3` CLI、DB Browser）直接打开同一份数据

浏览器内运行请改用 [`@aiao/rxdb-adapter-wa-sqlite`](https://www.npmjs.com/package/@aiao/rxdb-adapter-wa-sqlite) 或 [`@aiao/rxdb-adapter-sqlite-wasm`](https://www.npmjs.com/package/@aiao/rxdb-adapter-sqlite-wasm)。

## 能力矩阵

| 运行时   | SQLite 单文件                  | PGlite data directory         |
| -------- | ------------------------------ | ----------------------------- |
| Electron | ✅                             | ❌ 未实现，见 US-208          |
| Tauri    | ⚠️ 仅存储形状与校验，见 US-210 | ❌ 永不支持（无 Node 主进程） |

不在矩阵内的组合会被 `assertSupportedDesktopStorage` 以 `unsupported_runtime_engine` 拒绝。Tauri 侧目前只有类型与校验：host 实现基于 `node:sqlite`，Tauri 没有 Node 主进程，需要另一套 host。

host 侧需要一个内置 `node:sqlite` 的运行时。本包在 Node 26 与 Electron 43 上验证，更早的版本未验证。

## 安装

```bash
npm install @aiao/rxdb-adapter-desktop
# 或
pnpm add @aiao/rxdb-adapter-desktop
```

## 两个入口

包**刻意**分成两个入口，不要混用：

| 入口                              | 加载位置                          | 是否引用 `node:sqlite` |
| --------------------------------- | --------------------------------- | ---------------------- |
| `@aiao/rxdb-adapter-desktop`      | renderer（浏览器上下文）          | 否，可安全打进 bundle  |
| `@aiao/rxdb-adapter-desktop/host` | Electron 主进程 / 它拥有的 worker | 是                     |

把 `/host` 打进 renderer bundle 等于把文件系统能力还给渲染进程，整个隔离随之作废。

## 使用

接线分三处。

### 1. 主进程：起 host

```typescript
import { createDesktopSqliteHost } from '@aiao/rxdb-adapter-desktop/host';
import { app, ipcMain, type WebContents } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(app.getPath('userData'), 'rxdb-data');

// sessionId → 该会话归属的窗口。open 应答里带 sessionId，变更事件按它回送。
const targets = new Map<string, WebContents>();

const host = createDesktopSqliteHost({
  // 只有宿主应用知道自己的数据目录。传进来的名字已过白名单校验，不含任何路径分隔符。
  resolveDatabasePath: databaseName => {
    mkdirSync(root, { recursive: true });
    return join(root, databaseName);
  },
  postChange: message => {
    const target = targets.get(message.sessionId);
    // 窗口已经没了：写入早已落库，事件无处可送。这是常规竞态而不是失败。
    if (!target || target.isDestroyed()) return;
    target.send('desktop-sqlite:change', message);
  },
  onDeliveryError: error => console.warn('[desktop-sqlite] 变更事件送达失败', error)
});

// host.handle 永不 reject：失败以 `kind: 'error'` 的应答返回。
// ipcRenderer.invoke 在 reject 时会把错误压平成字符串，自定义错误码随之丢失。
ipcMain.handle('desktop-sqlite:request', async (event, payload: unknown) => {
  const response = await host.handle(payload);
  if (response.kind === 'open') targets.set(response.result.sessionId, event.sender);
  return response;
});

app.on('before-quit', () => host.closeAll());
```

会话回收（窗口 `destroyed` 时关掉它名下未关闭的会话）比上面这段更啰嗦一些，完整实现见文末示例里的 `desktop-sqlite-bridge.ts`。

### 2. preload：暴露传输层

传输层只有两个方法，renderer 因此拿不到原始 `ipcRenderer`，无法向任意频道发消息。

```typescript
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// 必须与适配器的 DESKTOP_HOST_TRANSPORT_KEY 逐字相同。
contextBridge.exposeInMainWorld('__aiaoRxdbDesktopHost__', {
  request: (payload: unknown) => ipcRenderer.invoke('desktop-sqlite:request', payload),
  subscribe: (listener: (message: unknown) => void) => {
    // 只转消息本体：IpcRendererEvent 带着 sender，交给 renderer 等于把通道能力一并送出。
    const forward = (_event: IpcRendererEvent, message: unknown): void => listener(message);
    ipcRenderer.on('desktop-sqlite:change', forward);
    return () => ipcRenderer.removeListener('desktop-sqlite:change', forward);
  }
});
```

### 3. renderer：像用别的适配器一样用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { DESKTOP_ADAPTER_NAME, RxDBAdapterDesktop } from '@aiao/rxdb-adapter-desktop';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: { type: SyncType.None, local: { adapter: DESKTOP_ADAPTER_NAME } }
});

// 不传 transport：适配器自己去全局键上找 preload 暴露的桥接。
rxdb.adapter(DESKTOP_ADAPTER_NAME, async database => new RxDBAdapterDesktop(database));
rxdb.init();
await rxdb.connect(DESKTOP_ADAPTER_NAME);

// 组件/窗口销毁时把连接交还给 host，否则会话要等到窗口 'destroyed' 才回收。
await rxdb.disconnectAll();
```

## 逻辑库名不是路径

`databaseName` 是**应用作用域内的逻辑名**。renderer 无从得知、也不需要得知物理根目录。

省略时按 `${rxdb.config.dbName}.sqlite3` 推导；只有接管一个已存在的库、或多个 RxDB 实例共用同一个文件时才需要显式指定。

允许集是白名单 `/^[A-Za-z0-9][A-Za-z0-9._@-]*$/`（≤ 128 字符）而非黑名单：字符集里没有 `/`、`\`、`:`，也不允许以 `.` 开头，于是 `..`、绝对路径、盘符、`~` 展开、URL scheme 全部落在集合外，不需要逐一枚举攻击形态。违反时抛 `invalid_database_name`。

> 名字来自 renderer，即便有 `contextIsolation` 也**不可信**。host 侧会再校验一次；宿主应用的 `resolveDatabasePath` 里建议在 `mkdir` 之前再调一次 `assertValidDesktopDatabaseName` —— 非法入参不该在磁盘上留下任何痕迹。

## ⚠️ 库目录不要叫 `databases`

在 Electron 的 `userData` 下选子目录名时，**避开 `databases`**：那是 Chromium 自己的 WebSQL 目录，它的存储层启动时会把目录里没有登记过的文件全部删掉——你的库文件正是「没登记过的」。

实测（打包产物，macOS，同一个 `--user-data-dir` 连开两次）：第一次启动写入的数据在第二次启动时被整体清空，全程**没有任何报错**，应用照常显示已连接、照常写入，只是上一次的数据没了。同一层级另建的 `rxdb-data/` 毫发无损。

## 错误码

程序分支请读 `error.code`，不要匹配消息文本（消息以 `[code] ` 前缀开头，仅便于日志检索）。原始原因通过 `cause` 原样透传。

| code                         | 含义                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| `unsupported_runtime_engine` | runtime 与 engine 的组合不在能力矩阵内                           |
| `invalid_database_name`      | 逻辑库名非法，或试图越出应用作用域                               |
| `host_unavailable`           | renderer 拿不到 host（未注入 transport / preload 未暴露）        |
| `session_closed`             | 会话已断开后继续使用                                             |
| `protocol_violation`         | 请求或响应不符合协议形状                                         |
| `open_failed`                | 打开数据库失败，`cause` 保留原始原因                             |
| `permission_denied`          | 路径无权限                                                       |
| `database_corrupted`         | 目标文件不是可用的 SQLite 数据库                                 |
| `statement_failed`           | SQL 本身执行失败（语法、约束等）                                 |
| `host_internal_error`        | host 自身出错，属于缺陷而非调用方问题                            |
| `database_busy`              | 另一个连接（通常是另一个窗口）正持有冲突的锁，重试即可，数据无损 |

错误码是**契约的一部分**：新增只能追加，不得复用或改写既有含义。

`RxDBAdapterDesktopError` 这个类跨不过结构化克隆，host 侧的错误以 `{ kind: 'error', code, message }` 回到 renderer，由适配器按契约重新抛成 `RxDBAdapterDesktopError`——调用方写的仍是普通 `try/catch`，感觉不到中间隔着一条 IPC。不在契约内的 `code` 一律按 `protocol_violation` 处理，不会被当成错误码原样上抛。

## 多窗口与事务

事务用 `BEGIN IMMEDIATE` 而非裸 `BEGIN`：后者延迟取锁，写锁要等到事务里第一条写语句才拿，撞锁于是发生在**事务中途**——那时已经读过一份快照，SQLite 要求整个事务回滚重来。`IMMEDIATE` 把取锁挪到起点，撞锁时事务还没开，重试就是无副作用地再发一次。

撞锁后按指数退避重试，默认总预算 5 秒（盖住「另一个窗口正在跑一次系统 schema 迁移」这段最长持锁时间），超时报 `database_busy`。可用 host 的 `busyRetryBudgetMs` 调整。

## 完整示例

参考 [dev-rxdb-electron](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-electron)：`src-electron/desktop-sqlite-bridge.ts`（主进程接线与窗口归属）、`src-electron/preload.ts`（桥接暴露）、`src/app/services/desktop-database.service.ts`（renderer 侧使用）。
