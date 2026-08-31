# @aiao/rxdb-adapter-electron

RxDB 适配器，把数据落到 **Electron 应用私有目录里的真实文件**。本包提供两个并列的适配器，可同时注册：

| 适配器名          | 落盘形态                   | 入口                                            |
| ----------------- | -------------------------- | ----------------------------------------------- |
| `sqlite-electron` | 单个 `.sqlite3` 文件       | `.`（renderer）+ `/host`（特权侧）              |
| `pglite-electron` | 一棵 PGlite data directory | `/pglite`（renderer）+ `/pglite-host`（特权侧） |

数据由特权侧（Electron 主进程或它拥有的 worker）直接读写——SQLite 走 `node:sqlite`，PGlite 走 `@electric-sql/pglite` 的 Node filesystem backend；渲染进程只通过一条窄传输层发协议请求，因此它既拿不到文件系统句柄，也拿不到物理路径。

Tauri 请改用 [`@aiao/rxdb-adapter-tauri`](https://www.npmjs.com/package/@aiao/rxdb-adapter-tauri)：协议与 renderer 客户端两包共用同一份实现（在 `@aiao/rxdb-adapter-sqlite-core/desktop-host`），差别只在特权侧是 `node:sqlite` 还是 Rust。

## 功能特性

- **真文件持久化**：数据在应用数据目录里（SQLite 是 `.sqlite3` 文件，PGlite 是一棵 data directory），重启后仍在，不依赖浏览器存储配额
- **渲染进程零文件系统权限**：`contextIsolation: true` + `sandbox: true` 下照常工作
- **多窗口安全**：两族各有各的做法，且**行为不同**——见下方[多窗口与事务](#多窗口与事务)
- **不回退**：存储配置不受支持时直接抛错，绝不静默切到 memory/OPFS/IndexedDB
- **复用引擎核心**：查询、事务、分支切换来自 `@aiao/rxdb-adapter-sqlite-core` / `@aiao/rxdb-adapter-pglite`，与各自的浏览器档位同语义、同一批测试套件

## 何时使用

- Electron 应用需要「用户看得见、备份得了、卸载才会没」的本地数据
- 数据量超出浏览器存储配额的舒适区，或不接受 OPFS 被浏览器回收的风险
- 需要外部工具直接打开同一份数据（SQLite：`sqlite3` CLI、DB Browser）

两族之间怎么选：默认选 `sqlite-electron`——单文件、外部工具好接、依赖只有 Node 内建。需要 PostgreSQL 的类型与 SQL 方言（JSONB、关系约束），或需要变更事件跨窗口（`LISTEN`/`NOTIFY`，见下方[多窗口与事务](#多窗口与事务)）时才选 `pglite-electron`，代价是几十兆 WASM 和一条 worker 线程。

> **全文搜索两族都还用不了**：`@aiao/rxdb-plugin-search` 的放行名单里只有浏览器内的引擎（`sqlite-wasm` / `sqlite` / `sqliteai` / `pglite`），两个桌面适配器名都不在表内，`createRxDatabase` 阶段会抛 `SearchUnsupportedAdapterError`——不降级、不挂 `.search`。

浏览器内运行请改用 [`@aiao/rxdb-adapter-wa-sqlite`](https://www.npmjs.com/package/@aiao/rxdb-adapter-wa-sqlite) 或 [`@aiao/rxdb-adapter-sqlite-wasm`](https://www.npmjs.com/package/@aiao/rxdb-adapter-sqlite-wasm)。

## 能力矩阵

| 存储                  | 状态                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- |
| SQLite 单文件         | ✅ host 在包内（`/host`），适配器名 `sqlite-electron`                                         |
| PGlite data directory | ✅ host 在包内（`/pglite-host`），适配器名 `pglite-electron`；需要可选 peer（见下方「安装」） |

两族走的是**两套协议**（SQLite 侧 `sqlite.*`，PGlite 侧 `pg.*`），不是同一个协议的两种后端：PGlite 的 callback transaction 跨不过 IPC，只能用显式的事务 ID 协议（`begin` / `query` / `commit` / `rollback`，同一事务 ID 绑定同一条物理连接）。所以 `pglite-electron` **刻意不在** `DesktopHostAdapterName` 登记表里——那份表是「走 SQLite host 协议」的清单，硬套上去会让共享层误以为它能接受 `DesktopSqliteFileStorage`。

不在矩阵内的组合会被 `assertDesktopSqliteStorage` 以 `unsupported_runtime_engine` 拒绝——不静默退化。

host 侧需要一个 Node 运行时：SQLite 侧要内置 `node:sqlite`，PGlite 侧要能加载 `@electric-sql/pglite`。本包在 Node 26 与 Electron 43 上验证，更早的版本未验证。

## 安装

```bash
npm install @aiao/rxdb-adapter-electron
# 或
pnpm add @aiao/rxdb-adapter-electron
```

只用 SQLite 的话装到这里就够了。**要用 PGlite 才需要**再装两个可选 peer：

```bash
pnpm add @aiao/rxdb-adapter-pglite @electric-sql/pglite
```

两者都声明为 `optional: true` 的 peer，正是为了让只用 SQLite 的应用不必装 PGlite——这也是下面四个入口必须分开的原因。

## 四个入口

包**刻意**分成四个入口，不要混用。分法是两条正交的线：**renderer / 特权侧**（谁能碰文件系统）× **SQLite / PGlite**（引入哪个可选 peer）。

| 入口                                      | 加载位置                          | 引入的重依赖                                   |
| ----------------------------------------- | --------------------------------- | ---------------------------------------------- |
| `@aiao/rxdb-adapter-electron`             | renderer（浏览器上下文）          | 无，可安全打进 bundle                          |
| `@aiao/rxdb-adapter-electron/host`        | Electron 主进程 / 它拥有的 worker | `node:sqlite`                                  |
| `@aiao/rxdb-adapter-electron/pglite`      | renderer（浏览器上下文）          | 仅 `@aiao/rxdb-adapter-pglite` + 类型，见下    |
| `@aiao/rxdb-adapter-electron/pglite-host` | Electron 主进程 / 它拥有的 worker | `@electric-sql/pglite`（完整 PostgreSQL WASM） |

把任一 host 入口打进 renderer bundle 等于把文件系统能力还给渲染进程，整个隔离随之作废。

> `/pglite` 这个 renderer 入口**不引用 PostgreSQL 运行时**：WASM 实例活在特权侧，renderer 这边只有一层协议代理，从 `@electric-sql/pglite` 取的只有类型和 `/template` 那个约 2 KB 的模板编译子路径。所以用 PGlite 不会让 renderer bundle 多出几十兆。

## 使用

接线分三处。

### 1. 主进程：起 host

```typescript
import { createElectronSqliteHost } from '@aiao/rxdb-adapter-electron/host';
import { app, ipcMain, type WebContents } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(app.getPath('userData'), 'rxdb-data');

// sessionId → 该会话归属的窗口。open 应答里带 sessionId，变更事件按它回送。
const targets = new Map<string, WebContents>();

const host = createElectronSqliteHost({
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
import { ELECTRON_ADAPTER_NAME, RxDBAdapterElectron } from '@aiao/rxdb-adapter-electron';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: { type: SyncType.None, local: { adapter: ELECTRON_ADAPTER_NAME } }
});

// 不传 transport：适配器自己去全局键上找 preload 暴露的桥接。
rxdb.adapter(ELECTRON_ADAPTER_NAME, async database => new RxDBAdapterElectron(database));
rxdb.init();
await rxdb.connect(ELECTRON_ADAPTER_NAME);

// 组件/窗口销毁时把连接交还给 host，否则会话要等到窗口 'destroyed' 才回收。
await rxdb.disconnectAll();
```

### 换成 PGlite

renderer 侧只换两个名字，其余逐字相同——传输层、preload、错误契约三者两族共用：

```typescript
import { ELECTRON_PGLITE_ADAPTER_NAME, RxDBAdapterElectronPGlite } from '@aiao/rxdb-adapter-electron/pglite';

rxdb.adapter(
  ELECTRON_PGLITE_ADAPTER_NAME,
  async database => new RxDBAdapterElectronPGlite(database, { dataDirectoryName: 'demo-pgdata' })
);
```

特权侧则换成 `createElectronPgliteHost`（来自 `/pglite-host`），并按上面「PGlite host 不要放在主线程」放进 worker。两个适配器可以在同一个 `RxDB` 实例上同时注册——名字不同，协议也不同。

#### 共用一条 IPC 通道时的分派

不必为 PGlite 新开通道：一条 `request` / `subscribe` 就够，主进程按请求的 `kind` 分派给三族 host（SQLite / 文件 / PGlite）。**顺序不能反**——

```typescript
// 1. 先做闭集守卫：未知 kind 在任何 host 被触碰之前就收口
if (!isKnownDesktopHostRequestKind(request)) {
  return Promise.resolve({ kind: 'error', code: 'protocol_violation', message: '...' });
}
// 2. 再分派；SQLite 只能垫底
const kind = readDesktopHostRequestKind(request);
if (isDesktopHostFileRequestKind(kind)) return file.handle(target, request);
if (isDesktopPgliteRequestKind(kind)) return pglite.handle(target, request);
return sqlite.handle(target, request);
```

SQLite 那支是**兜底分支**（「不是 handshake/open/version/close 的」一律当 `execute`），所以漏判一族的后果不是报错，而是一条 PGlite 请求被顺着 SQL 路径跑一遍。两层因此都要有：分派判据用协议包导出的 `isDesktopPgliteRequestKind`（`/pglite-host`）与 `isDesktopHostFileRequestKind`（`/host`），不要在接线处自己列 `kind` 名单——那份名单必然随协议版本漂移；闭集守卫则是应用侧自己的几行（协议未导出 SQLite 族谓词），负责把三族之外的 `kind` 挡在兜底分支之前。

> 把 PGlite 接进来不会让只用 SQLite 的会话变重：示例里的 PGlite 通道工厂是**惰性调用**的，没有 `pg.*` 请求就不会启动那条 worker 线程、也不会加载 PostgreSQL WASM。

完整实现见文末示例里的 `desktop-host-bridge.ts` 与 `desktop-host-request-guard.ts`。

## 逻辑库名不是路径

`databaseName` 是**应用作用域内的逻辑名**。renderer 无从得知、也不需要得知物理根目录。

省略时按 `${rxdb.config.dbName}.sqlite3` 推导；PGlite 侧的对应项是 `dataDirectoryName`，省略时按 `${rxdb.config.dbName}-pgdata` 推导（落盘的是 initdb 生成的**目录树**而不是单个文件，用 `.db` 之类的文件后缀命名只会误导运维）。只有接管一个已存在的库、或多个 RxDB 实例共用同一个文件时才需要显式指定。

允许集是白名单 `/^[A-Za-z0-9][A-Za-z0-9._@-]*$/`（≤ 128 字符）而非黑名单：字符集里没有 `/`、`\`、`:`，也不允许以 `.` 开头，于是 `..`、绝对路径、盘符、`~` 展开、URL scheme 全部落在集合外，不需要逐一枚举攻击形态。违反时抛 `invalid_database_name`。

> 名字来自 renderer，即便有 `contextIsolation` 也**不可信**。host 侧会再校验一次；宿主应用的 `resolveDatabasePath` 里建议在 `mkdir` 之前再调一次 `assertValidDesktopDatabaseName` —— 非法入参不该在磁盘上留下任何痕迹。

## ⚠️ 库目录不要叫 `databases`

在 Electron 的 `userData` 下选子目录名时，**避开 `databases`**：那是 Chromium 自己的 WebSQL 目录，它的存储层启动时会把目录里没有登记过的文件全部删掉——你的库文件正是「没登记过的」。

实测（打包产物，macOS，同一个 `--user-data-dir` 连开两次）：第一次启动写入的数据在第二次启动时被整体清空，全程**没有任何报错**，应用照常显示已连接、照常写入，只是上一次的数据没了。同一层级另建的 `rxdb-data/` 毫发无损。

## 错误码

程序分支请读 `error.code`，不要匹配消息文本（消息以 `[code] ` 前缀开头，仅便于日志检索）。原始原因通过 `cause` 原样透传。

| code                         | 含义                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `unsupported_runtime_engine` | 存储 `engine` 不在能力矩阵内（例如把 PGlite data directory 递给 SQLite 协议） |
| `invalid_database_name`      | 逻辑库名非法，或试图越出应用作用域                                            |
| `host_unavailable`           | renderer 拿不到 host（未注入 transport / preload 未暴露）                     |
| `session_closed`             | 会话已断开后继续使用                                                          |
| `protocol_violation`         | 请求或响应不符合协议形状                                                      |
| `open_failed`                | 打开数据库失败，`cause` 保留原始原因                                          |
| `permission_denied`          | 路径无权限，或语句被 SQLite 授权器拒绝（`ATTACH` / `VACUUM INTO` 等）         |
| `database_corrupted`         | 目标文件不是可用的 SQLite 数据库                                              |
| `statement_failed`           | SQL 本身执行失败（语法、约束等）                                              |
| `host_internal_error`        | host 自身出错，属于缺陷而非调用方问题                                         |
| `database_busy`              | 另一个连接（通常是另一个窗口）正持有冲突的锁，重试即可，数据无损              |
| `file_not_found`             | 目标文件或目录不存在；renderer 侧据此还原成 `NotFoundError`                   |
| `invalid_file_path`          | 路径逃出存储根，或指向的类型与操作不符                                        |
| `disk_full`                  | 磁盘空间或配额耗尽（ENOSPC / EDQUOT）                                         |
| `write_aborted`              | 写入令牌已失效（会话关闭、已提交或已丢弃），目标保持写入前的内容              |
| `transaction_not_found`      | 事务 ID 未知、已结束，或不属于本会话；该事务一条语句都没执行                  |
| `transaction_unavailable`    | 等不到 PGlite 连接（另一个事务仍持有），或开启该事务的 `begin` 已超时         |

`file_not_found` / `invalid_file_path` / `disk_full` / `write_aborted` 来自文件宿主（`createElectronFileHost`，供 `@aiao/rxdb-plugin-storage/desktop` 使用），SQLite 侧用不到。

最后两个码只出现在 PGlite 路径上：PGlite 的事务靠显式事务 ID 串联多次 IPC，SQLite 侧没有这个概念。`transaction_unavailable` 的超时预算由 `DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS` 给出，上限是 `DESKTOP_PGLITE_MAX_BEGIN_TIMEOUT_MS`。

错误码是**契约的一部分**：新增只能追加，不得复用或改写既有含义。

`RxDBAdapterDesktopError` 这个类跨不过结构化克隆，host 侧的错误以 `{ kind: 'error', code, message }` 回到 renderer，由适配器按契约重新抛成 `RxDBAdapterDesktopError`——调用方写的仍是普通 `try/catch`，感觉不到中间隔着一条 IPC。不在契约内的 `code` 一律按 `protocol_violation` 处理，不会被当成错误码原样上抛。

## 多窗口与事务

**两族在这一节上的行为不同**，这是选型时最容易踩的一处差异：

| 维度       | `sqlite-electron`                          | `pglite-electron`                                       |
| ---------- | ------------------------------------------ | ------------------------------------------------------- |
| 连接模型   | 每个 `open` 一条独立连接                   | 同一数据目录**共用一个实例**，跨会话复用                |
| 并发写     | SQLite 文件锁 + 退避重试 → `database_busy` | 事务在唯一连接上排队 → 超时报 `transaction_unavailable` |
| 变更跨窗口 | ❌ 不跨（见下）                            | ✅ 跨，`NOTIFY` 扇出到该实例的全部会话                  |

### SQLite：`BEGIN IMMEDIATE` 与撞锁重试

事务用 `BEGIN IMMEDIATE` 而非裸 `BEGIN`：后者延迟取锁，写锁要等到事务里第一条写语句才拿，撞锁于是发生在**事务中途**——那时已经读过一份快照，SQLite 要求整个事务回滚重来。`IMMEDIATE` 把取锁挪到起点，撞锁时事务还没开，重试就是无副作用地再发一次。

撞锁后按指数退避重试，默认总预算 5 秒（盖住「另一个窗口正在跑一次系统 schema 迁移」这段最长持锁时间），超时报 `database_busy`。可用 host 的 `busyRetryBudgetMs` 调整。

#### 变更事件不跨窗口

每个 `open` 得到一条**独立**的 `DatabaseSync` 连接——共享连接会让多个窗口的 `BEGIN` 块互相穿插，事务隔离直接失效。代价是变更通知只在写入所在的那条连接上开火：通知靠 TEMP 触发器实现，而 TEMP 对象是连接私有的。

所以 **A 窗口的写入不会触发 B 窗口的响应式查询**。数据本身是一致的（同一个文件，SQLite 的锁保证了这点），不一致的只是「B 什么时候知道」——B 要等到自己下一次查询才看到新数据。

需要跨窗口实时同步的话，目前得由宿主应用自己广播（例如主进程把 `postChange` 收到的事件转发给其余 `webContents`，各 renderer 收到后主动重查）。

### PGlite：单实例 + 事务 ID

PGlite 的 data directory **不支持两个实例并发打开**，所以 host 按数据目录名做单实例复用：第二个窗口打开同一目录时拿到的是同一个实例，而不是第二份。这既是必需的，也顺带解决了 SQLite 侧那个跨窗口通知问题——`LISTEN` 在实例建立时**一次性**订阅（每会话订一次会让同一条 `NOTIFY` 回调多次），收到通知后扇出给该实例名下的全部会话，于是 **A 窗口的写入会触发 B 窗口的响应式查询**。

代价在事务上：所有事务排队争用那一条连接。`begin` 等不到连接就报 `transaction_unavailable` 而不是无限等待——无限等待会让现场看起来像「数据库不响应」。事务 ID 是随机 UUID 且绑定会话，归属对不上一律 `transaction_not_found`。

窗口崩溃或关闭时，该会话名下所有在途事务被回滚并释放（`releaseOwner` 挂在 `render-process-gone` 与窗口 `destroyed` 上），不留悬挂事务。

#### PGlite host 不要放在主线程

PGlite 的 WASM 在**调用线程上同步**跑完整条查询：实测一条 2 秒的查询把主进程堵了 2007 毫秒——窗口不重绘、菜单不响应、IPC 全排队。「主进程持有单实例」和「主进程不能被堵住」因此无法同时成立，单实例得挪到自己的线程上。

而且要搬就得**整个 host 一起搬**，不能只把 PGlite 放过去：`ElectronPgliteRuntime.transaction` 收的是一个回调，回调过不了线程边界（和它过不了 IPC 边界是同一个原因）。host 搬过去之后，线程边界上流动的就只剩 `DesktopPgliteRequest` / `DesktopPgliteResponse` 这类纯数据。示例见下。

## 完整示例

参考 [dev-rxdb-electron](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-electron)：

- **SQLite**：`src-electron/desktop-sqlite-bridge.ts`（主进程接线与窗口归属）
- **PGlite**：`src-electron/desktop-pglite-bridge.ts` + `src-electron/desktop-pglite-worker.ts`——**整个 host 连同 WASM 跑在 worker 线程里**，桥接只做归属记账与转发
- 两族共用：`src-electron/preload.ts`（桥接暴露）、`src/app/services/desktop-database.service.ts`（renderer 侧使用）

> 三个目录根**必须互不相同**：PGlite 数据目录是一棵会被整体删除/重建的树，把 SQLite 库文件或用户文件混一层进去，一次重建就连带删掉它们。
