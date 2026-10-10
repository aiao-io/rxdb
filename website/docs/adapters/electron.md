# Electron 适配器

`@aiao/rxdb-adapter-electron` 把数据落到 **Electron 应用私有目录里的真实文件**：数据由特权侧（Electron 主进程或它拥有的 worker）直接读写，渲染进程只通过一条窄传输层发协议请求，因此它既拿不到文件系统句柄，也拿不到物理路径。`contextIsolation: true` + `sandbox: true` 下照常工作，不依赖浏览器存储配额，也不会回退到 memory/OPFS/IndexedDB。

## 两族适配器与选择

本包提供两个并列的适配器，可以在同一个 `RxDB` 实例上**同时注册**（名字不同，协议也不同）：

| 适配器名          | 落盘形态                   | 特权侧引擎                     | 入口                                            |
| ----------------- | -------------------------- | ------------------------------ | ----------------------------------------------- |
| `sqlite-electron` | 单个 `.sqlite3` 文件       | `node:sqlite`（Node 内建）     | `.`（renderer）+ `/host`（特权侧）              |
| `pglite-electron` | 一棵 PGlite data directory | `@electric-sql/pglite`（WASM） | `/pglite`（renderer）+ `/pglite-host`（特权侧） |

两族走的是**两套协议**（SQLite 侧 `sqlite.*`，PGlite 侧 `pg.*`），不是同一个协议的两种后端。

**怎么选**：默认选 `sqlite-electron`——单文件、外部工具好接（`sqlite3` CLI、DB Browser）、依赖只有 Node 内建。需要 PostgreSQL 的类型与 SQL 方言（JSONB、关系约束），或需要**变更事件跨窗口**（`LISTEN`/`NOTIFY`，见[多窗口与事务](#多窗口与事务)）时才选 `pglite-electron`，代价是几十兆 WASM 和一条 worker 线程。

查询、事务、分支切换复用 `@aiao/rxdb-adapter-sqlite-core` / `@aiao/rxdb-adapter-pglite`，与各自的浏览器档位同语义、同一批测试套件。

## 安装

```bash npm2yarn
npm install @aiao/rxdb-adapter-electron
```

只用 SQLite 的话装到这里就够了。**要用 PGlite 才需要**再装两个可选 peer：

```bash npm2yarn
npm install @aiao/rxdb-adapter-pglite @electric-sql/pglite
```

两者都声明为 `optional: true` 的 peer，正是为了让只用 SQLite 的应用不必装 PGlite——这也是下面四个入口必须分开的原因。

## 四个入口

包**刻意**分成四个入口，不要混用。分法是两条正交的线：**renderer / 特权侧**（谁能碰文件系统）× **SQLite / PGlite**（引入哪个可选 peer）。

| 入口                                      | 加载位置                          | 引入的重依赖                                   |
| ----------------------------------------- | --------------------------------- | ---------------------------------------------- |
| `@aiao/rxdb-adapter-electron`             | renderer（浏览器上下文）          | 无，可安全打进 bundle                          |
| `@aiao/rxdb-adapter-electron/host`        | Electron 主进程 / 它拥有的 worker | `node:sqlite`                                  |
| `@aiao/rxdb-adapter-electron/pglite`      | renderer（浏览器上下文）          | 仅 `@aiao/rxdb-adapter-pglite` + 类型          |
| `@aiao/rxdb-adapter-electron/pglite-host` | Electron 主进程 / 它拥有的 worker | `@electric-sql/pglite`（完整 PostgreSQL WASM） |

:::warning host 入口绝不能进 renderer bundle

把任一 host 入口打进 renderer bundle，等于把文件系统能力还给了渲染进程，整个隔离随之作废。`node:sqlite` 只被挡在 `/host` 子路径入口后面；renderer 入口（`.`）不引用任何 Node 内建，产物里出现 `node:sqlite` 就是安全退化而非构建报错，因此本包在 release 流程里对真 tarball 产物做依赖图断言。

:::

:::tip `/pglite` 不会让 renderer bundle 多出几十兆

`/pglite` 这个 renderer 入口**不引用 PostgreSQL 运行时**：WASM 实例活在特权侧，renderer 这边只有一层协议代理，从 `@electric-sql/pglite` 取的只有类型和 `/template` 那个约 2 KB 的模板编译子路径。

:::

## 接线

接线分三处：主进程起 host、preload 暴露传输层、renderer 正常使用。

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

特权侧则换成 `createElectronPgliteHost`（来自 `/pglite-host`），并按下方「PGlite host 不要放在主线程」放进 worker。

> 不必为 PGlite 新开 IPC 通道：一条 `request` / `subscribe` 就够，主进程按请求的 `kind` 分派给 SQLite / 文件 / PGlite 三族 host。分派判据用协议包导出的 `isDesktopPgliteRequestKind`（`/pglite-host`）与 `isDesktopHostFileRequestKind`（`/host`），不要在接线处自己列 `kind` 名单；`kind` 的闭集守卫则是应用侧自己的几行——SQLite 那支是兜底分支，漏判一族的后果不是报错，而是一条 PGlite 请求被顺着 SQL 路径跑一遍。完整实现见 [dev-rxdb-electron](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-electron) 的 `desktop-host-bridge.ts` 与 `desktop-host-request-guard.ts`。

## PGlite 半边：数据目录与 IPC 事务协议

`pglite-electron` 落盘的是一棵 **PGlite data directory**（initdb 生成的目录树，不是单个文件）。它的协议形状由 US-208 冻结为「IPC 事务 ID 协议」：

- **主进程持连接**：data directory 不支持两个实例并发打开，host 按数据目录名做单实例复用——第二个窗口打开同一目录时拿到的是同一个实例，而不是第二份。
- **renderer 用事务 ID 串联多次往返**：PGlite 只提供 callback 形态的事务（`transaction(cb)`，返回即 COMMIT、抛出即 ROLLBACK），而回调跨不过 IPC。协议因此是显式的 `begin` / `query` / `commit` / `rollback`——同一事务 ID 绑定同一条物理连接，每条语句都真的走同一个事务，没有一条被拆进隐式事务。
- **事务 ID 随机且绑定会话**：归属对不上报 `transaction_not_found`；`begin` 等不到连接时 fail-fast 报 `transaction_unavailable`（超时预算由 `DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS` 给出），不会无限等待。窗口崩溃或关闭时，该会话名下所有在途事务被回滚并释放（`releaseOwner` 挂在 `render-process-gone` 与窗口 `destroyed` 上），不留悬挂事务。
- **单实例带来跨窗口通知**：`LISTEN` 在实例建立时一次性订阅，收到 `NOTIFY` 后扇出给该实例名下的全部会话，于是 A 窗口的写入会触发 B 窗口的响应式查询（SQLite 侧没有这个能力，见下节）。

:::warning PGlite host 不要放在主线程

PGlite 的 WASM 在**调用线程上同步**跑完整条查询：实测一条 2 秒的查询把主进程堵了 2007 毫秒——窗口不重绘、菜单不响应、IPC 全排队。「主进程持有单实例」和「主进程不能被堵住」因此无法同时成立，单实例得挪到自己的 worker 线程上。而且要搬就得**整个 host 一起搬**，不能只把 PGlite 放过去：`ElectronPgliteRuntime.transaction` 收的是一个回调，回调过不了线程边界。host 搬过去之后，线程边界上流动的就只剩 `DesktopPgliteRequest` / `DesktopPgliteResponse` 这类纯数据。

:::

## 多窗口与事务

**两族在这一节上的行为不同**，这是选型时最容易踩的一处差异：

| 维度       | `sqlite-electron`                          | `pglite-electron`                                       |
| ---------- | ------------------------------------------ | ------------------------------------------------------- |
| 连接模型   | 每个 `open` 一条独立连接                   | 同一数据目录**共用一个实例**，跨会话复用                |
| 并发写     | SQLite 文件锁 + 退避重试 → `database_busy` | 事务在唯一连接上排队 → 超时报 `transaction_unavailable` |
| 变更跨窗口 | ❌ 不跨                                    | ✅ 跨，`NOTIFY` 扇出到该实例的全部会话                  |

SQLite 侧的事务用 `BEGIN IMMEDIATE` 而非裸 `BEGIN`：写锁在事务起点就取，撞锁时事务还没开，按指数退避重试（默认总预算 5 秒，可用 host 的 `busyRetryBudgetMs` 调整），超时报 `database_busy`。代价是**变更事件不跨窗口**——每个 `open` 得到一条独立连接，通知靠连接私有的 TEMP 触发器实现，所以 A 窗口的写入不会触发 B 窗口的响应式查询。数据本身是一致的（同一个文件，SQLite 的锁保证了这点），不一致的只是「B 什么时候知道」。需要跨窗口实时同步时，由宿主应用自己广播（例如主进程把 `postChange` 收到的事件转发给其余 `webContents`，各 renderer 收到后主动重查）。

## 能力矩阵

| 存储                  | 状态                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| SQLite 单文件         | ✅ host 在包内（`/host`），适配器名 `sqlite-electron`                       |
| PGlite data directory | ✅ host 在包内（`/pglite-host`），适配器名 `pglite-electron`；需要可选 peer |

不在矩阵内的组合会被 `assertDesktopSqliteStorage` 以 `unsupported_runtime_engine` 拒绝——不静默退化。host 侧需要一个 Node 运行时（SQLite 侧要内置 `node:sqlite`，PGlite 侧要能加载 `@electric-sql/pglite`）；本包在 Node 26 与 Electron 43 上验证，更早的版本未验证。

**全文搜索两族都还用不了**：`@aiao/rxdb-plugin-search` 的放行名单里只有浏览器内的引擎（`sqlite-wasm` / `sqlite` / `sqliteai` / `pglite`），两个桌面适配器名都不在表内，`createRxDatabase` 阶段会抛 `SearchUnsupportedAdapterError`——不降级、不挂 `.search`。

## 配合 rxdb-plugin-storage 的 `./desktop` 入口

桌面文件存储与桌面库同属一个备份域，走的是**同一条 host 通道**：文件宿主是 `/host` 入口导出的 `createElectronFileHost`，不新增 preload 方法。使用方式见 [rxdb-plugin-storage 文档](../plugins/rxdb-plugin-storage/README.md)：

```typescript
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';

rxdb.use(rxDBPluginStorage, {
  rootDir: 'files',
  filesystem: createDesktopStorageFilesystem()
});
```

要点：文件内容落在应用数据目录下（示例应用为 `userData/rxdb-files`），不经过 OPFS；启用前校验 `sync.local.adapter` 必须是桌面 SQLite 适配器，不匹配即抛 `adapter_mismatch`，不降级、不静默接受——否则 metadata 与文件又回到两个备份域。

## 何时使用

- Electron 应用需要「用户看得见、备份得了、卸载才会没」的本地数据；
- 数据量超出浏览器存储配额的舒适区，或不接受 OPFS 被浏览器回收的风险；
- 需要外部工具直接打开同一份数据（SQLite：`sqlite3` CLI、DB Browser）。

在**浏览器**里运行（包括 Electron 渲染进程里不想起 host 的场景）请改用 [wa-sqlite 适配器](./sqlite.md)（或 [sqlite-wasm](./sqlite-wasm.md)）。一句话区分：浏览器适配器活在浏览器存储配额与回收策略之内，桌面适配器把数据放回应用自己掌控的目录。完整选型对比见[适配器总览](./README.md)。

## 参考

- [包 README](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-electron)
- [dev-rxdb-electron 完整示例](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-electron)：`src-electron/desktop-sqlite-bridge.ts`（SQLite 主进程接线）、`src-electron/desktop-pglite-bridge.ts` + `src-electron/desktop-pglite-worker.ts`（PGlite host 与 worker）、`src-electron/preload.ts`（桥接暴露）、`src/app/services/local-database.service.ts`（renderer 侧使用）
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
