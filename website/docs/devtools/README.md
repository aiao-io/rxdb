# 开发者工具

`@aiao/rxdb-devtools` 是 RxDB 与浏览器 DevTools 扩展之间的开发期连接器：它在被检查页面与扩展面板之间转发事件、数据库摘要、实体查询结果与分支操作结果，帮助开发者实时查看实体数据、事件流与存储状态。

> 本包暴露了数据库检查、查询与分支变更能力，**只在开发环境启用**，禁止在生产构建中初始化。

## 安装

```bash npm2yarn
npm install @aiao/rxdb-devtools
```

## 接入

公开入口是 `getDevToolsConnector()`——它返回**页面级 connector 单例**（`DevToolsConnector`）。拿到后调用 `init(rxdb, getEntityMetadata)` 注册要观测的 RxDB 实例：

```typescript
import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';

const rxdb = new RxDB({
  dbName: 'my-app',
  entities: [Todo],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

await rxdb.connect('wa-sqlite');

// 仅在开发环境启用
if (import.meta.env.DEV && typeof window !== 'undefined') {
  getDevToolsConnector().init(rxdb, getEntityMetadata);
}
```

`init(rxdb, getEntityMetadata)` 会读取实体元数据、订阅 RxDB 事件并立刻发出一次握手；扩展面板返回 `HANDSHAKE_ACK` 后，connector 开始转发实时事件，并刷新握手前缓存在内存里的事件。要点：

- 对同一个 RxDB 对象重复 `init()` 是幂等操作；当前协议只支持**一个** RxDB 实例，换一个不同实例会抛错。
- `getEntityMetadata` 来自 `@aiao/rxdb`，是加密字段遮罩的唯一依据——不传它，connector 就不知道哪些字段是密文，`QUERY_ENTITY` 的结果与事件载荷也不会遮罩。
- `disconnect()` 只断开 connector 通信并清理监听，不会调用 `rxdb.disconnectAll()`；调用后可以再次 `init()`。
- 没有 `window` 的环境（SSR）里 `init()` / `disconnect()` 是 no-op。
- 调用方负责保证生产 bundle 不执行 `init()`。`getDevToolsConnector({ enabled: false })` 可以用于测试或显式关闭，但不能替代构建期的开发环境门禁；生产环境还可以把 `capabilities` 降到 `'readonly'` 或 `'none'`，收紧面板能下达的命令档位。

## 功能

连接后，扩展面板提供以下面板：

- **Events**：实时 RxDB 事件流与详情
- **Database**：数据库信息、实体列表与数据查询
- **分支管理**：查看、创建、切换与删除分支
- **OPFS**：浏览 / 上传 / 下载 / 删除文件与目录（浏览器端是 OPFS，桌面端是原生文件后端）
- **Storage**：`StorageFileMeta` 存储元数据
- **Settings**：主题、清理本地数据

## 浏览器扩展

安装浏览器扩展后，DevTools 面板会出现在浏览器开发者工具中（F12 → RxDB 标签页）。

扩展源码位于 [apps/rxdb-devtools-extension](https://github.com/aiao-io/rxdb/tree/main/apps/rxdb-devtools-extension)（Manifest V3）。面板本体在共享 library `modules/rxdb-devtools-panel`，Chrome / Electron / Tauri 三个宿主共用同一份 UI 与状态机；`apps/rxdb-devtools-extension` 只提供 Chrome 侧的宿主适配。

## 桌面端调试

### Tauri：调试窗口与定向 transport（US-905）

Tauri WebView 不支持安装 Chrome 扩展，所以 Tauri 侧不承诺「把 CRX 装进 Tauri」，而是**调试窗口**模型：`dev-rxdb-tauri` 在显式开发配置下创建一个标签固定的 `rxdb-devtools` WebView 窗口，加载与 Chrome 扩展同源的面板；release 产物里这段窗口 bootstrap、专用 command 与只服务该 label 的 capability 都不存在（`#[cfg(dev)]` 编译隔离）。

主 WebView 与调试窗口之间是一条**版本化、双向、严格校验的定向 transport**：消息绑定 session、sender 身份、主窗口 label、调试窗口 label 与 provider owner，承载握手、实体查询、全部 `RXDB_EVENT_TYPES`、分支操作、Storage 元数据与版本化 provider 消息。调试窗口不是第二个 RxDB writer——它不直接打开 SQLite，也没有 Tauri SQL / filesystem 原始权限；能力全部经主 WebView 里的 connector 转发，由 capability / descriptor / mutation policy 三层约束。

- **原生存储集成**：SQLite provider（`createDevToolsRxdbDatabaseProvider`）直连应用 RxDB 实例；native files provider（`createDevToolsNativeFilesProvider`）只暴露 storage 插件的逻辑根，支持浏览、刷新、上传、下载、新建目录与删除；两个桌面宿主共用同一个 settings provider（`createDevToolsDesktopSettingsProvider(runtime)`），数据库下载恒回 `export_unsupported`。
- **VFS 三态映射**：wa-sqlite demo 按运行时**真实选中**的后端声明 `files: opfs` / `settings: idb` 或结构化 unavailable，`runtime: tauri` 只用于显示，不据 adapter 名或平台猜行为。
- **idb 档走 dedicated Worker**：idb 强制档（`DEV_RXDB_DEVTOOLS_FORCE_VFS=idb`）走与 opfs 档同形态的 dedicated Worker（`resolveWaSqliteIdbTransport`）；生产路径（未强制、浏览器回落 IDB）保留 SharedWorker 让多标签页共享同一条连接。win32 上模块 SharedWorker 的 worker 脚本不开始，实测挂到 60s 看门狗只报 `timedOut`，所以强制档不经过它。
- **快照与错误**：1001+ 条目走有界 immutable snapshot，遵守从请求进入起算的 deadline（`snapshot_busy` / `snapshot_too_large` / `snapshot_expired`）；错误响应保留稳定类别，不泄漏绝对路径、SQL 绑定值、加密字段或文件内容。

### Electron：dev 变体扩展与桌面调试流程（US-906）

Electron 桌面应用的调试走「http renderer + dev 变体扩展」。两条「看起来能走」的路实测都不通：

| 做法                               | 实测结果                                                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 跑打包产物（`app://-/index.html`） | 自定义 scheme `app:` 不在 Chromium 扩展 match pattern 的合法 scheme 集里，`permissionPatternForUrl` 恒返回 `null`，面板停在「当前页面不支持扩展注入」    |
| `nx serve` 的 http renderer        | Electron 没有 `chrome.permissions` 命名空间，生产 manifest 的 `optional_host_permissions` 授权集恒为空——必须有一条**静态** `host_permissions` 才注得进去 |

**dev 变体扩展**就是第二条路的补丁：一个 dev-only 构建变体（`build-desktop-dev` 产出 `dist-desktop-dev/`），manifest 比发布产物**只多** `host_permissions: ["http://localhost/*"]`（match pattern 不含端口，任意端口都匹配）；发布 manifest 不带 `host_permissions`、不带 `web_accessible_resources`。

开发者流程（两个终端）：

```bash npm2yarn
# 终端 1：http renderer（默认端口 4120）
nx serve dev-rxdb-electron

# 终端 2：以 --serve 模式启动 Electron
electron dist/apps/dev-rxdb-electron --serve
```

然后打开 DevTools 的 RxDB 面板：状态进入 `granted`、四段 relay 握手完成，Database 页读到真实实体行。

:::warning `nx dev dev-rxdb-electron` 单跑跑不起来
`dev` 依赖非 continuous 的 `prepare-electron-package`，`wait-on tcp:4120` 一满足 dev server 就被 Nx 收掉，表征是 `ERR_CONNECTION_REFUSED`。成立的形态是上面两个终端：`serve` 持住 4120，另一个终端直接跑 `electron` 命令。
:::

:::tip 排查：`registerSchemesAsPrivileged` 报 undefined
VS Code 集成终端会以纯 Node 启动 electron（任何 Electron 宿主都会给子进程设 `ELECTRON_RUN_AS_NODE=1`）。用 `env -u ELECTRON_RUN_AS_NODE electron dist/apps/dev-rxdb-electron --serve` 解决。
:::

打包产物（不带 `--serve`）即使加载了 dev 变体扩展，面板也会**说明原因**（当前页面协议不在扩展可注入的 scheme 集内），状态仍为 `unsupported`——原因文案对所有宿主成立，不写死 Electron。

dev 配置的四个 env 开关：`DEV_RXDB_DEVTOOLS`、`DEV_RXDB_DEVTOOLS_EXTENSION`、`DEV_RXDB_DEVTOOLS_CAPABILITY`、`DEV_RXDB_DEVTOOLS_MUTATION`；production 模式不设任何 `DEV_RXDB_DEVTOOLS*` 时一个扩展都不加载。

### bigint / binary 的展示（US-903）

QUERY_ENTITY、事件、历史/分支与冲突载荷统一走版本化 DevTools serializer（`DEVTOOLS_WIRE_VERSION = 1`）：

| 类型     | wire 表示                                                                | 说明                                     |
| -------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| `bigint` | `{ $rxdb: 1, type: 'bigint', value }`                                    | 十进制精确字符串，无精度下降             |
| `binary` | `{ $rxdb: 1, type: 'binary', encoding: 'base64url', value, byteLength }` | 只编码当前 `Uint8Array` 视图，不改源数组 |

- 加密字段**先遮罩再序列化**（`[encrypted]`），任何错误路径都不回退发送原值。
- 面板区分 bigint、number、binary 与普通 object；未知 envelope 版本显示 unsupported，不猜测解码。
- 该表示只用于 DevTools wire 与展示，不是实体的写回或 change 存储格式。

## 参考

- [快速开始](../getting-started/README.md)
- [模型定义](../model-definition/README.md)
- [会话录制回放](../plugins/rxdb-plugin-replay/README.md)
