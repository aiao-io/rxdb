# 桌面适配器拆包：`rxdb-adapter-desktop` → `-electron` / `-tauri`

`@aiao/rxdb-adapter-desktop` 已按运行时拆成两个包，**下一个发布版本起**生效：

| 旧                                         | 新                            |
| ------------------------------------------ | ----------------------------- |
| `@aiao/rxdb-adapter-desktop`               | `@aiao/rxdb-adapter-electron` |
| `@aiao/rxdb-adapter-desktop`（Tauri 半边） | `@aiao/rxdb-adapter-tauri`    |

以旧包名发布的最新版本是 `0.0.25`。它不会被撤回，也**不会被标记为 `deprecated`**——旧包保留在 registry 上，未来仍可能继续更新，因此不会出现「安装时报废弃警告」这回事。现有安装照常工作，迁移由本文指路而不是靠 registry 元数据推着走。按[版本与 API 稳定性策略](../versioning.md)，0.x 期间次版本即可包含破坏性变更。

**不涉及数据迁移。** 磁盘上的库文件、逻辑库名的推导规则（`${dbName}.sqlite3`）、线协议版本（`1`）、preload 注入用的全局键（`__aiaoRxdbDesktopHost__`）、全部错误码——一样都没动。要改的只有 import 路径、五个符号名，以及适配器注册名。

## 为什么拆

一个包里同时装着两个运行时的东西：Electron 侧的 host 用 `node:sqlite` 写成，Tauri 侧的宿主是 Rust。结果是装了包的 Tauri 应用要跟着下载一份自己永远用不到的 Node 宿主实现，Electron 应用要跟着下载 Tauri 的 transport；两个运行时的发布节奏也被迫互相牵制。

共享的那一层——线协议、renderer client、存储配置联合、错误类型——下沉到了 `@aiao/rxdb-adapter-sqlite-core/desktop-host`，两个新包各自原样转出它。**按名字 import 的符号因此不需要改行**，只改包名；只有当你要自己写 host 或 transport 时，才有理由直接引那个子路径。

## 1. 换包

```bash
# Electron
pnpm remove @aiao/rxdb-adapter-desktop
pnpm add @aiao/rxdb-adapter-electron

# Tauri
pnpm remove @aiao/rxdb-adapter-desktop
pnpm add @aiao/rxdb-adapter-tauri
```

入口的划分方式没变，只是包名换了：

| 用途                              | 旧                                | 新                                 |
| --------------------------------- | --------------------------------- | ---------------------------------- |
| renderer / WebView                | `@aiao/rxdb-adapter-desktop`      | `@aiao/rxdb-adapter-electron`      |
| Electron 主进程 / 它拥有的 worker | `@aiao/rxdb-adapter-desktop/host` | `@aiao/rxdb-adapter-electron/host` |
| Tauri WebView                     | `@aiao/rxdb-adapter-desktop`      | `@aiao/rxdb-adapter-tauri`         |

`@aiao/rxdb-adapter-tauri` **没有** `./host` 子路径：那一侧是 Rust，随应用二进制走，不经 npm 分发。

## 2. 适配器注册名从一个变成两个

这是唯一一处运行期可见的破坏性变更。

```ts
// 旧
import { DESKTOP_ADAPTER_NAME, RxDBAdapterDesktop } from '@aiao/rxdb-adapter-desktop';
// DESKTOP_ADAPTER_NAME === 'desktop'

// 新（Electron）
import { ELECTRON_ADAPTER_NAME, RxDBAdapterElectron } from '@aiao/rxdb-adapter-electron';
// ELECTRON_ADAPTER_NAME === 'sqlite-electron'

// 新（Tauri）
import { RxDBAdapterTauri, TAURI_ADAPTER_NAME } from '@aiao/rxdb-adapter-tauri';
// TAURI_ADAPTER_NAME === 'sqlite-tauri'
```

新名字沿用仓库里既有的 `<引擎>-<运行时>` 命名（同 `wa-sqlite-miniprogram`）。之所以不能沿用 `'desktop'`：`RxDBAdapters` 是一张以注册名为键的类型表，两个适配器类共用一个键会互相覆盖。

三处要一起改——注册、`sync.local.adapter`、`connect`：

```ts
const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: { type: SyncType.None, local: { adapter: ELECTRON_ADAPTER_NAME } }
});

rxdb.adapter(ELECTRON_ADAPTER_NAME, async database => new RxDBAdapterElectron(database));
rxdb.init();
await rxdb.connect(ELECTRON_ADAPTER_NAME);
```

用常量的地方改完 import 就好了。**硬编码成字符串 `'desktop'` 的地方需要自己搜**：写在 TypeScript 里的编译器会报错（`'desktop'` 不再是 `RxDBAdapters` 的合法键），写在 JSON 配置、环境变量或模板里的编译器看不见。

## 3. 删除与更名的符号

主入口（renderer / WebView）：

| 旧                                                | 新                                             | 说明                                                   |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `DESKTOP_ADAPTER_NAME`                            | `ELECTRON_ADAPTER_NAME` / `TAURI_ADAPTER_NAME` | 值也变了，见上一节                                     |
| `RxDBAdapterDesktop`                              | `RxDBAdapterElectron` / `RxDBAdapterTauri`     | 一个类裂成两个，各自绑死一个运行时                     |
| `assertSupportedDesktopStorage(runtime, storage)` | `assertDesktopSqliteStorage(storage)`          | 少一个参数；返回类型是 assertion signature，可收窄入参 |
| `DesktopRuntime`                                  | 删除                                           | 运行时已由「你 import 的是哪个包」决定                 |
| `SupportedDesktopStorage<TRuntime>`               | 删除                                           | 同上：泛型参数没有了可取的值                           |
| `DesktopOptions.runtime`                          | 删除                                           | 见下一节                                               |

其余 46 个导出**原名不变**，其中 6 个 Tauri 专属符号（`createTauriHostTransport`、`TAURI_DESKTOP_REQUEST_COMMAND`、`TAURI_DESKTOP_CHANGE_EVENT`、`TauriHostTransportOptions`、`encodeDesktopJsonPayload`、`decodeDesktopJsonPayload`）只在 `-tauri` 包里。`Desktop*` 前缀在共享符号上**刻意保留**——它们本来就是两个运行时共用的那一层，改成 `Electron*` 反而不准确。

`./host` 入口（仅 Electron）：

| 旧                                               | 新                                                 |
| ------------------------------------------------ | -------------------------------------------------- |
| `createDesktopSqliteHost`                        | `createElectronSqliteHost`                         |
| `DesktopSqliteHost` / `DesktopSqliteHostOptions` | `ElectronSqliteHost` / `ElectronSqliteHostOptions` |
| `createDesktopFileHost`                          | `createElectronFileHost`                           |
| `DesktopFileHost` / `DesktopFileHostOptions`     | `ElectronFileHost` / `ElectronFileHostOptions`     |
| `assertSupportedDesktopStorage`                  | `assertDesktopSqliteStorage`                       |
| `DesktopRuntime`                                 | 删除                                               |

`NodeSqliteEngine`、`RxDBAdapterDesktopError`、协议常量与协议类型在 `./host` 里都是原名。

## 4. `runtime` 选项删除

```ts
// 旧
new RxDBAdapterDesktop(database, { runtime: 'electron', databaseName: 'app.sqlite3' });

// 新
new RxDBAdapterElectron(database, { databaseName: 'app.sqlite3' });
```

这个字段本来就只影响连接前那次能力矩阵校验的措辞：host 从不读它，每个 host 实现自己就绑死了一个运行时。删掉它同时也消掉了一个双真相源——`runtime: 'tauri'` 配 Electron 的 host 是一种可以写出来但没有意义的组合。

Tauri 侧还有一处收紧：`TauriOptions.transport` 从可选变**必填**。Electron 可以省略它（preload 用 `contextBridge` 把传输层挂在全局键上，适配器自己去取），Tauri 没有 preload 这一层，那个全局键永远不会存在。旧签名下省略它的代价是运行期一句 `host_unavailable`，还要等到第一次查询才炸；现在同一个错误在编译期就现形。

## 5. Tauri 用户：Rust 宿主仍不随包发布

`@aiao/rxdb-adapter-tauri` 提供的只有 `createTauriHostTransport`——一根把 `invoke` / `listen` 接上协议的管子。管子那头真正开库的 `rusqlite` 宿主（`rxdb_desktop_request` 命令、引擎、会话表）**不在这个 npm 包里**，装了包的 Tauri 应用需要自备 Rust 宿主。这一点拆包前后一样，把 Rust 宿主迁进可发布 crate 是另一件尚未开始的工作。

**升级 JS 包时请一并更新你的 Rust 宿主。** renderer 现在会在 `open` **之前**先发一次无副作用的 `handshake` 来核对协议版本（这样版本对不上时磁盘上不会留下一个空库文件）。不认识这个请求的老宿主会回 `protocol_violation: unknown request kind handshake`，适配器把它原样抛给调用方，**不会**退回去直接 `open`——版本号存在的意义正是不许降级。Electron 用户通常不会遇到：两侧来自同一个包版本，除非你的应用打包了一份更旧的主进程产物。

## 6. 一次性替换

改动是机械的，可以先用批量替换过一遍，再让类型检查找出剩下的：

```bash
# Electron 侧。用 perl 而不是 sed：`\b` 与 `-i` 的行为在 GNU / BSD 两版 sed 上不一致。
rg -l '@aiao/rxdb-adapter-desktop|Desktop(SqliteHost|FileHost)|RxDBAdapterDesktop\b' src/ \
  | xargs perl -pi \
    -e 's#\@aiao/rxdb-adapter-desktop/host#\@aiao/rxdb-adapter-electron/host#g;' \
    -e 's#\@aiao/rxdb-adapter-desktop#\@aiao/rxdb-adapter-electron#g;' \
    -e 's#\bDESKTOP_ADAPTER_NAME\b#ELECTRON_ADAPTER_NAME#g;' \
    -e 's#\bRxDBAdapterDesktop\b#RxDBAdapterElectron#g;' \
    -e 's#\bcreateDesktopSqliteHost\b#createElectronSqliteHost#g;' \
    -e 's#\bDesktopSqliteHost(Options)?\b#ElectronSqliteHost$1#g;' \
    -e 's#\bcreateDesktopFileHost\b#createElectronFileHost#g;' \
    -e 's#\bDesktopFileHost(Options)?\b#ElectronFileHost$1#g;' \
    -e 's#\bassertSupportedDesktopStorage\b#assertDesktopSqliteStorage#g;'

# 剩下的靠编译器：runtime 选项、'desktop' 字符串、assertDesktopSqliteStorage 的参数个数
pnpm tsc --noEmit
```

`RxDBAdapterDesktopError` 不要一起换——它没有改名。上面 `\bRxDBAdapterDesktop\b` 的词边界挡住了它（后面紧跟的 `E` 也是词字符，构不成边界），但若你把模式改宽就会误伤。

## 参考

- [版本与 API 稳定性策略](../versioning.md)：废弃周期与公开 API 范围
- [兼容矩阵](../compatibility.md)：Node / Electron / 框架版本对应关系
- [适配器切换与数据迁移](./adapters.md)：换的是存储后端而不只是包名时看这篇
