# @aiao/rxdb-adapter-sqlite

`@aiao/rxdb` 的官方 SQLite 适配器，基于 SQLite 官方 WASM 构建，为核心引擎提供 SQLite 存储后端。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-sqlite rxjs
```

## 用法

```typescript
import { createSqliteClient, RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite';
```

- `createSqliteClient`：创建 SQLite 客户端
- `RxDBAdapterSqlite`：接入 `@aiao/rxdb` 的适配器实现
- `sqliteLoad` / `resetSqliteLoadCache`：WASM 加载与缓存控制
- 类型：`SqliteOptions`、`SqliteLoadOptions`、`SqliteRepositoryConstructor` 等

适配器共享内核（表名解析、规则编译、基础 Repository）来自 [`@aiao/rxdb-adapter-sqlite-core`](../rxdb-adapter-sqlite-core)。

## 备份与恢复

`backup()` / `restore()` / `cleanupIncompleteRestore()` 由 [`@aiao/rxdb-adapter-sqlite-core`](../rxdb-adapter-sqlite-core#备份与恢复) 提供，语义与错误码见那里。

| 配置                                 | 备份 / 恢复                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| 不开 `opfs`                          | ✅ 内存库                                                                                 |
| `opfs: true`                         | ✅ OPFS，持久化 `journal_mode` 为 `delete`                                                |
| `opfs: true, opfsFallback: 'memory'` | ❌ `unsupported_combination`（`opfsFallback`）：OPFS 打不开时静默落到内存，恢复目标不确定 |

在 Worker 里跑时，每次连接租用 Worker 的一条独立子端口：恢复用一条连接写库，之后的 `connect()` 在同一个 Worker 上再开一条。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 适配器与存储后端指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
