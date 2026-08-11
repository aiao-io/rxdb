# @aiao/rxdb

面向 Local-first 应用的 TypeScript 数据库核心。通过装饰器驱动的实体定义，自动生成类型安全的 Repository 与响应式查询 API，让你在浏览器中直接运行 SQLite，以接近原生 App 的方式构建离线优先、数据驱动的 Web 应用。

`@aiao/rxdb` 是引擎核心，与具体存储后端解耦 —— 通过适配器接入 wa-sqlite / PGlite / Supabase / sqliteai，通过框架绑定接入 Angular / React / Vue。

## 安装

```bash
pnpm add @aiao/rxdb rxjs
```

核心包不直接提供存储实现，需配合一个适配器使用，例如浏览器内 SQLite：

```bash
pnpm add @aiao/rxdb-adapter-wa-sqlite
```

## 核心能力

- **装饰器驱动实体**：用 `@Entity` / `@TreeEntity` 声明数据模型与字段元数据
- **类型安全 Repository**：从实体自动派生 CRUD 与关系查询接口
- **响应式查询**：查询结果以 RxJS Observable 形式推送，数据变更自动刷新
- **变更追踪与事务**：内建 diff、变更事件与事务支持
- **事务执行器**：`TransactionExecutor` 把「本事务内的写入」这条判据收敛到一处 —— `adapter.transaction(tx => tx.getRepository(X).create(...))` 而不是 `adapter.transaction(async () => entity.save())`（后者会落回队列并永久挂起）
- **迁移执行器**：`MigrationType.up(executor)` 形参；用户迁移里的写入必须经 executor 发出，否则无路可走
- **适配器无关**：同一套模型可运行在不同存储后端之上

### 事务与迁移 API 速查

```typescript
import { TransactionExecutor, MigrationType } from '@aiao/rxdb';

// 1. 事务 —— 持有 executor 才算「在本事务内」
await adapter.transaction(async executor => {
  const repo = executor.getRepository(Todo);
  await repo.create({ title: 'inside tx' });
  // await todo.save()  // ❌ 落回队列并永久挂起
});

// 2. 嵌套内层工作 —— 复用当前 executor，不开新事务
await adapter.transaction(async executor => {
  await executor.run(async inner => {
    await inner.getRepository(Todo).create({ title: 'nested' });
  });
});

// 3. 合并远端变更到本事务
await adapter.transaction(async executor => {
  await executor.mergeChanges(actions, localChanges, disableTriggers);
});

// 4. 迁移 —— 必须把 executor 交给用户
const migration: MigrationType = {
  name: '001-init',
  async up(executor) {
    await executor.getRepository(Seed).create({ ... });
  },
  async down() {}
};
```

> 旧签名 `tx => tx.execute(sql)` 与 `MigrationType.up()`（无参）仍兼容 —— TS 允许形参更少。

## 快速开始

字段**必须**在 `properties` 里声明。TypeScript 的字段类型在编译后被擦除，装饰器无法从
`title!: string` 这样的声明推导出持久化属性 —— 只写类字段的实体可以正常赋值，但不会落库。

```typescript
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';

@Entity({
  name: 'Todo',
  tableName: 'todo',
  namespace: 'public',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'done', type: PropertyType.boolean }
  ]
})
export class Todo extends EntityBase {
  title!: string;
  done!: boolean;
}
```

最小闭环 —— 注册适配器、连接、写入、查询：

```typescript
import { firstValueFrom } from 'rxjs';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
});

rxdb.adapter('sqlite', db => createYourSqliteAdapter(db));
await rxdb.connect('sqlite');

const repository = rxdb.entityManager.getRepository(Todo);
await repository.create({ title: 'write docs', done: false });

// find() 返回活查询 Observable，数据变更会自动重新发射
const todos = await firstValueFrom(repository.find({ where: { combinator: 'and', rules: [] } }));
```

实体定义、查询与变更的完整用法见文档站。

## 文档

- 仓库主页与路线图：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- API 参考、快速上手与框架集成指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
