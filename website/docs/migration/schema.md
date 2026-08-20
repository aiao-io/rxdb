# Schema 迁移

当实体结构发生变化（新增字段、重命名、数据回填）时，通过 RxDB 的 **迁移脚本** 机制在数据库连接前执行一次性数据变更。

## 迁移机制

迁移脚本在 `RxDB` 配置的 `migrations` 数组中声明，每条迁移实现 `MigrationType`：

```typescript
import type { MigrationType, TransactionExecutor } from '@aiao/rxdb';

interface MigrationType {
  name: string; // 唯一名称，按名称字典序排序执行
  up(executor: TransactionExecutor): Promise<void>; // 正向迁移
  down(): Promise<void>; // 回滚（预留）
}
```

执行规则：

1. 迁移在数据库连接阶段自动运行（建表之后）。
2. 按 `name` 字典序排序执行 —— 建议用 `0001-`、`0002-` 前缀保证顺序。
3. 已执行的迁移记录在内建的 `rxdb_migration` 表中，**不会重复执行**。
4. 某条迁移 `up()` 抛错会记录错误并中断，修复后重连继续。

> **为什么 `up()` 收 `executor`**：`up()` 是唯一能在迁移事务体内运行的用户代码。迁移里的所有数据写入必须经 `executor.getRepository(X)` 或 `executor.query()` 发出 —— 直接 `entity.save()` 会落回适配器队列并永久挂起（队列的唯一槽位正被本次迁移所在的事务占用）。形参可省略（TS 允许形参更少），不写数据的迁移无需关心它。

## 内建系统迁移

SQLite 系列适配器与 PGlite 会在应用迁移、业务 Repository 和新版 change trigger 启用前，自动升级 RxDB 自己维护的系统表。应用不需要为 `rxdb_change` 编写迁移脚本。

- 系统迁移先获取后端排他升级锁，以排除正在执行的旧写事务；锁获取失败时 `connect()` 会中止。
- DDL、旧数据兼容处理、trigger 重建和系统版本水位在同一事务提交。任一步失败都会整体回滚，修复问题后可直接重连重试。
- `__rxdb_system_schema__:` 与 `__rxdb_change_codec__:` 是保留的 migration 名称前缀，应用 migration 不得使用。
- 当前客户端发现数据库系统 schema 或 change codec 高于自身支持版本时会直接拒绝连接，不会猜测格式或继续读写。

## 迁移的排他性与失败恢复

系统迁移整体跑在**一个后端排他事务**里（SQLite 是 `BEGIN EXCLUSIVE`，PGlite 是表锁 + `tx`）：

- 拿不到锁就抛 `RxDBSystemMigrationLockError` 并中止 `connect()`，业务 trigger 不启动 —— 这排除的是**同一后端上正在执行的写事务**。
- DDL、旧数据兼容处理、trigger 重建和系统版本水位在同一事务提交；任何一步失败都整体回滚，崩溃后数据库仍停在事务开始前的状态，不会留下半迁移 schema。
- 因此迁移**没有需要人工清理的中间状态**：修好问题后直接重连即可重试，不需要手工改任何系统表。

> RxDB **不提供**跨 Tab / Worker / 进程的 writer lease 或 epoch fencing。排他性只到 SQLite / PGlite
> 自身的锁为止：它能挡住同时在写的事务，但挡不住一个「先连上、又长时间挂起、之后才恢复」的旧客户端。
> 这类跨 realm 排他必须由发布系统承担（见下节）。

## 发布顺序

发布必须分为三个门：

1. **桥接版本**：先发布一个不改系统 schema / change codec 的版本，让所有运行实例都升到它 —— 它是迁移版本的锚点，用来确保「迁移发生时，在线的客户端都已经是新代码」。
2. **迁移版本**：桥接版本覆盖全部运行实例后，才允许发布会提升系统 schema 或 change codec 的版本；发布前运行 SQLite 多进程与 PGlite Worker/Tab 迁移套件。
3. **旧 bundle 门禁**：阻止低于最低桥接版本的离线 bundle 重新写入，可使用强制更新、缓存失效、服务端版本门禁或新的数据库命名空间。不能让旧 bundle 连接已迁移数据库。

仓库发布通过 `requirements/migration-release.json` 声明本次发布类型（`normal` / `bridge` / `migration`）、桥接 tag、最低桥接版本和旧 bundle 策略，并由 `pnpm nx run @aiao/source:migration-release-gate` 校验。迁移版本缺少任一项时发布会 fail-closed；桥接 tag 还必须真实存在、是发布提交的祖先，并包含系统迁移实现。

部署回滚不能把旧 bundle 直接指向已升级数据库；必须恢复升级前备份，或切换到新的数据库命名空间。运行时**没有**任何机制能识别并拒绝一个离线的旧 bundle —— 第 3 道门是唯一的防线。

系统迁移是单向升级。升级后的数据库不承诺能被旧版客户端重新打开；发布新客户端前应先阻止旧版本继续写入，并确保所有运行实例一起升级。需要回退应用版本时，请恢复升级前的数据库备份，不要让旧客户端直接连接已升级库。

## 声明迁移

```typescript
import { RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';

const db = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  migrations: [
    {
      name: '0001-backfill-todo-completed',
      async up(executor) {
        // 持有 executor 才算「在迁移事务内」
        const todoRepo = executor.getRepository(Todo);

        // 1. 查询历史数据
        const todos = await todoRepo.find({});

        // 2. 回填：把缺失的 completed 字段补为 false
        for (const todo of todos) {
          if (todo.completed === undefined) {
            todo.completed = false;
            await todoRepo.update(todo);
          }
        }
      },
      async down() {
        // 预留：如需回滚在此实现
      }
    }
  ]
});

await db.connect('sqlite');
```

## 命名与顺序建议

- 用零填充的数字前缀（`0001-`、`0002-`）保证字典序即执行序。
- `name` 一旦发布不要修改 —— 改名会被视为新迁移而重复执行。
- 每条迁移保持幂等友好：即使部分执行过也能安全重跑。

## 注意事项

1. 迁移在**建表之后、应用查询之前**运行，此时可安全读写实体仓库。
2. 迁移记录持久化在本地库中，卸载/清空数据库会重置迁移历史。
3. 复杂结构变更（重命名字段、拆表）建议：新增字段 → 回填 → 逐步淘汰旧字段，分多条迁移完成。

## 参考

- [适配器切换与数据迁移](./adapters.md)
- [v0 → 1.0 升级](./v1.md)
