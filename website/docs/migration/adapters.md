# 适配器切换与数据迁移

Aiao 的模型与查询语义与存储后端解耦：同一套实体定义可运行在不同适配器上。切换适配器主要是**替换 adapter 注册与 connect 目标**；如需保留旧数据，则在两个数据库实例间做一次数据搬运。

## 仅切换后端（无需搬运数据）

若旧数据可丢弃或由远端重新同步，只需替换 adapter 注册：

```typescript
// 之前：wa-sqlite
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

// 之后：PGlite
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { PGlite } from '@electric-sql/pglite';

const rxdb = new RxDB({ dbName: 'myapp', entities: [Todo] });

rxdb.adapter('pglite', async db => {
  const pg = await PGlite.create({ dataDir: `idb://rxdb-${db.dbName}` });
  return new RxDBAdapterPGlite(db, pg);
});

await rxdb.connect('pglite');
```

## 保留数据的迁移

在新旧两个数据库实例间，用公开的查询/写入 API 搬运数据：

```typescript
import { firstValueFrom } from 'rxjs';

// 1. 连接旧库（源）
const source = new RxDB({ dbName: 'myapp', entities: [Todo] });
source.adapter('wa-sqlite' /* ... */);
await source.connect('wa-sqlite');

// 2. 从源库读取全部数据
const todos = await firstValueFrom(Todo.find({}));

// 3. 连接新库（目标）到另一个 dbName，避免与源库冲突
const target = new RxDB({ dbName: 'myapp-pglite', entities: [Todo] });
target.adapter('pglite' /* ... */);
await target.connect('pglite');

// 4. 写入目标库
for (const todo of todos) {
  const copy = new Todo();
  Object.assign(copy, todo);
  await copy.save();
}

// 5. 校验数量一致后，断开源库
await source.disconnect('wa-sqlite');
```

## 注意事项

1. 搬运期间源库与目标库使用**不同的 `dbName`**，避免底层存储互相覆盖。
2. 大数据量建议分批读取（配合 `limit` / `offset` 或游标查询）并在批次间让出事件循环。
3. 切换到需要特定浏览器能力的适配器前，先对照[兼容矩阵](../compatibility.md)确认目标环境支持。
4. 迁移完成并校验无误后，再清理旧库数据。

## 参考

- 各适配器的详细配置见「适配器」章节
- [Schema 迁移](./schema.md)
