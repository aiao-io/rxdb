# @aiao/rxdb-adapter-sqlite-core

`@aiao/rxdb` 的 SQLite 适配器共享内核。它把「实体 → SQL」的映射、表名解析、规则组构建、基础 Repository 与变更事件等能力抽象为后端无关的基类，供各具体 SQLite 适配器复用。

> 本包一般不直接安装，而是作为 `@aiao/rxdb-adapter-sqlite`、`@aiao/rxdb-adapter-sqlite-wasm`、`@aiao/rxdb-adapter-sqliteai` 等适配器的依赖被间接引入。

## 提供的能力

- `RxDBAdapterSqliteBase`：SQLite 适配器基类，封装事务、建表与变更钩子
- `SqliteTransactionExecutor`：`TransactionExecutor` 在 SQLite 侧的实现；`transaction()` 回调收到的就是它
- `SqliteRepository`：基于 SQLite 的类型安全 Repository 实现
- `buildRuleGroup`：将查询规则编译为 SQL 条件
- `sqliteGetTableName` / `sqliteGetTableNameByMetadata`：实体 → 表名解析
- 后端契约类型：`SqliteBackend`、`SqliteChangeEvent`、`SQLiteChangeType` 等

具体后端只需实现 `SqliteBackend` 契约即可接入。

## 事务 API（C2 已落地第一步）

`RxDBAdapterSqliteBase.transaction()` / `runInTransaction()` 的回调签名已收紧为接收 `SqliteTransactionExecutor`：

```typescript
import type { TransactionFun } from '@aiao/rxdb-adapter-sqlite-core';

const fun: TransactionFun = async executor => {
  // 持有 executor 才算「在本事务内」
  const repo = executor.getRepository(Todo);
  await repo.create({ title: 'inside tx' });

  // executor.execute(sql, bindings) 透传底层 client.execute，
  // 既有的 `transaction(async tx => tx.execute(sql))` 写法不受影响
  await executor.execute('SELECT 1');

  // 嵌套内层工作
  await executor.run(async inner => inner.getRepository(Todo).count());

  // 合并远端变更
  await executor.mergeChanges(actions, localChanges, /* disableTriggers */ false);
};
```

> 零参回调仍然兼容（TS 允许形参更少）。`SqliteTransactionExecutor` 不直接导出 —— 它是 `RxDBAdapterSqliteBase` 的内部产物，外部代码只通过 `@aiao/rxdb` 的 `TransactionExecutor` 接口与之交互。

## 文档

- 仓库主页：[https://github.com/aiao-io/aiao](https://github.com/aiao-io/aiao)
- 适配器指南见项目文档站

## License

[MIT](https://github.com/aiao-io/aiao/blob/main/LICENSE)
