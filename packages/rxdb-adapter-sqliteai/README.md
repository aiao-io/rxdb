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

## 文档

- 仓库主页：[https://github.com/aiao-io/aiao](https://github.com/aiao-io/aiao)
- 适配器与存储后端指南见项目文档站

## License

[MIT](https://github.com/aiao-io/aiao/blob/main/LICENSE)
