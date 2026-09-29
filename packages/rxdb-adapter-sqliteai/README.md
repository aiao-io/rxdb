# @aiao/rxdb-adapter-sqliteai

`@aiao/rxdb` 的 [sqliteai](https://github.com/sqliteai) 存储适配器，为核心引擎提供基于 sqliteai 运行时的 SQLite 后端。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-sqliteai rxjs
```

## 用法

```typescript
import { createSqliteClient, RxDBAdapterSqliteai, sqliteaiLoad } from '@aiao/rxdb-adapter-sqliteai';
```

- `RxDBAdapterSqliteai`：接入 `@aiao/rxdb` 的适配器实现
- `createSqliteClient` / `SqliteaiClient`：sqliteai 客户端
- `sqliteaiLoad`：运行时加载
- 类型：`SqliteaiOptions`

适配器共享内核（表名解析、规则编译、基础 Repository）来自 [`@aiao/rxdb-adapter-sqlite-core`](../rxdb-adapter-sqlite-core)。

## 备份与恢复

`backup()` / `restore()` / `cleanupIncompleteRestore()` 由 [`@aiao/rxdb-adapter-sqlite-core`](../rxdb-adapter-sqlite-core#备份与恢复) 提供，语义与错误码见那里。

| 配置                                 | 备份 / 恢复                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| 不开 `opfs`                          | ✅ 内存库                                                                                 |
| `opfs: true`                         | ✅ OPFS，持久化 `journal_mode` 为 `delete`                                                |
| `opfs: true, opfsFallback: 'memory'` | ❌ `unsupported_combination`（`opfsFallback`）：OPFS 打不开时静默落到内存，恢复目标不确定 |

内置的 vector 与 memory 扩展在每条新连接上建出自己的表（`_sqliteai_vector`、`dbmem_*` 及其 FTS5 影子表，部分带初始行）。
这些表连同初始行就是「空库」本来的样子：恢复只把恰好等于新建空库的目标当作空的，写进这些表的用户数据随归档往返。

在 Worker 里跑时，每次连接租用 Worker 的一条独立子端口：恢复用一条连接写库，之后的 `connect()` 在同一个 Worker 上再开一条。
同一个 `workerInstance` 同一时间只借给一条连接：第二条并发连接会抛 `Worker transport already has an active SQLite client`。
直接调用 `createSqliteClient` 时，先 `await client.disconnect()`，再调用 `@aiao/rxdb-adapter-sqlite-core` 导出的
`releaseComlinkProxy(client)` 归还子端口，之后才能在同一个 Worker 上重连；适配器已在 `disconnect()` 内自动完成这一步。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 适配器与存储后端指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
