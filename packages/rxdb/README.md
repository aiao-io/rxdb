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

## 可选能力：本地工作树与提交历史

`@aiao/rxdb-plugin-working-tree` 给库加上「未提交的改动」与「提交历史」两个一等概念：用户的编辑先落进工作树而不是直接改主数据，`commit()` 一次性提交成快照，`restore()` 把历史版本的内容搬回工作树。

**未装这个插件的库零成本**——十张系统表、写捕获、提交图编解码全部随包走，核心侧只留装卸口与两道转交门。

```typescript
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

rxdb.use(rxDBPluginWorkingTree); // ← 必须在 connect() 之前
await rxdb.connect('sqlite');
await rxdb.workingTree.enable();
```

启用之后核心会在 `rxdb_migration` 里留下一行能力水位，**没装对应插件的客户端再打开这个库时，核心拒绝连接**，并把该装的包名原样报出来。这道守卫对第三方插件同样有效：包名是插件自己写进水位行的，核心不需要认识它。

启用前要知道的六件事（完整版见文档站的[插件页](https://docs.aiao.io/docs/plugins/rxdb-plugin-working-tree)）：

1. **提交能力是数据库级的显式开关**——一次 `enable()` 之后整个库的所有实体、所有分支都按工作树语义运行；从此所有访问这个库的客户端都必须装上插件，包括旧版本的、你控制不到的那些。v1 没有 `disable()`。
2. **工作树不是草稿缓存。** 工作树装的是「已经写进数据库、还没提交成快照」的变更，参与事务、被查询读到；`@aiao/rxdb-plugin-workspace` 的草稿缓存装的是「还没保存」的编辑器 buffer，根本没进主库。两层各管一件事，不能合并。
3. **恢复不是 checkout。** `restore()` 把历史提交的内容作为**新的未提交变更**写回工作树：HEAD 不动、历史不删、工作树变脏，下一步是 `commit()` 或 `discard()`。没有 detached HEAD，也没有 `checkout()`。
4. **历史会原样保留敏感旧值。** 写进过某次提交的字段永久留在那次提交里，之后改掉、清空、删行都不会动到它；v1 没有任何公开 API 能把它从历史里抠掉。**不要把不该留痕的东西写进启用了提交能力的库**——需要 right-to-erasure 的字段不适合直接存在这里。
5. **加密边界。** 支持字段加密的后端上，提交、工作树与恢复会话里的加密字段仍以 versioned envelope 落盘，持久化路径不会先解密再写明文，错误与摘要也不带明文。但加密保护的是**落盘的字节**——解锁后的合法读取照常拿到旧值，所以它不消解第 4 条，第 4 条也不能替代它。
6. **不改写历史。** 没有 amend / rebase / squash，没有「修改提交信息」，也没有 auto-baseline。提交图损坏时守卫只把分支置为 `corrupted_read_only` 并留下诊断，**不动 HEAD、不删记录**。

还有一条容易漏掉的：**远端同步拉下来的变更和用户的编辑一样进工作树**，在 `status().byOrigin` 里计为 `origin = 'remote_sync'` 且**不豁免**——它会让 `clean` 变成 `false`，并被下一次 `commit()` 一并提交（提交者是这次 `commit()` 的 `authorId`，v1 不伪造远端作者身份）。「同步之后工作树突然脏了」是正常行为，不是缺陷。

### 写捕获拦得住什么，拦不住什么

写捕获只覆盖**经 adapter 的写路径与 adapter 公开的批量写方法**。绕过 adapter 的外部数据库句柄——另一个进程直接打开同一个 SQLite 文件、另起一个 PGlite 实例、DevTools 里手写 SQL——**拦不住，v1 也不承诺拦得住**；这类写入不进工作树、不进历史、`status()` 看不见。

因此启用了提交能力的数据库有一条硬约束：**业务表只能经 RxDB 写入**。这句话不是免责声明的注脚：不假装拦得住比拦不住更重要——一道号称拦得住却拦不住的门禁，会让人把「没报错」当成「没被绕过」。

## 文档

- 仓库主页与路线图：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- API 参考、快速上手与框架集成指南见项目文档站
- 工作树与提交历史：[`@aiao/rxdb-plugin-working-tree` 插件页](https://docs.aiao.io/docs/plugins/rxdb-plugin-working-tree)

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
