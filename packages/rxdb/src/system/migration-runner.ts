import { EntityManager } from '../entity/entity-manager.js';
import { RxDBAdapterLocalBase } from '../rxdb-adapter.js';
import { MigrationType } from '../rxdb.interface.js';
import { isUniqueConstraintViolation, RxDBMigration, RxDBMigrationClaimConflictError } from './migration.js';

/**
 * 迁移执行权竞争的重试次数
 *
 * 每次重试都会重读一遍已提交的迁移名，正常竞争下一次就能收敛（对手的记录已可见）。
 * 给到 3 次是为了容忍多实例同时启动；再认领失败就是异常，宁可抛错也不静默跳过迁移。
 */
const MIGRATION_CLAIM_RETRIES = 3;

/**
 * 执行待处理的迁移
 *
 * @remarks
 * 「读出已执行集合」只是一次快照，两个实例可以读到同一份空快照并各跑一遍同一条
 * 非幂等迁移。仲裁只能交给 `rxdb_migration.name` 上的唯一索引：先认领执行权（INSERT）
 * 再执行 `up()`，输掉竞争的一方在认领处就被数据库挡下。
 *
 * 冲突不能在事务内 `continue` —— Postgres 里一条失败语句会让整个事务进入 aborted
 * 状态，后续语句一律报错。所以整批回滚、重读、重跑；已经提交的那些名字会在重读时
 * 出现在快照里被跳过，不会重复执行。
 *
 * @param migrations - 待执行的迁移列表，空或未配置时为空操作
 * @param adapter - 本地适配器（引导期事务在它上面跑）
 * @param entityManager - 用于实例化 {@link RxDBMigration} 记录
 */
export async function runMigrations(
  migrations: MigrationType[] | undefined,
  adapter: RxDBAdapterLocalBase,
  entityManager: EntityManager
): Promise<void> {
  if (!migrations || migrations.length === 0) return;
  // 按名称排序：迁移之间可能有先后依赖，重试时的顺序必须和首轮一致
  const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));

  for (let attempt = 0; ; attempt++) {
    try {
      await runMigrationsOnce(adapter, sorted, entityManager);
      return;
    } catch (error) {
      // 只有执行权竞争可以重试。重试次数用尽仍认领失败说明不是正常竞争（例如唯一索引
      // 挡下的是别的东西），静默跳过会让这条迁移永远不执行，必须抛出来。
      if (!(error instanceof RxDBMigrationClaimConflictError) || attempt >= MIGRATION_CLAIM_RETRIES) throw error;
    }
  }
}

/**
 * 单次迁移事务：认领执行权成功才执行，任一处失败整批回滚
 *
 * @param adapter - 本地适配器
 * @param sorted - 已按名称排序的迁移列表
 * @param entityManager - 用于实例化 {@link RxDBMigration} 记录
 * @throws RxDBMigrationClaimConflictError 认领执行权撞唯一约束（可重试）
 */
async function runMigrationsOnce(
  adapter: RxDBAdapterLocalBase,
  sorted: MigrationType[],
  entityManager: EntityManager
): Promise<void> {
  // 引导期事务：此刻 `connect()` 的 promise 还没 settle，走普通 transaction() 会撞上
  // 适配器的就绪门（它等的就是这个 promise）而永久挂起。
  await adapter.bootstrapTransaction(async executor => {
    // 读写都走 executor 的仓库：事务体内经普通 adapter.query() 的调用会排在自己这个事务
    // 后面（队列并发度 1），而且这里原先用的是 entityManager 的**活查询** findAll ——
    // 在事务体内注册活查询任务本身就会泄漏订阅（该查询会在事务外重跑）。
    const repository = executor.getRepository(RxDBMigration);
    const records = await repository.find({ where: { combinator: 'and', rules: [] } });
    const executedNames = new Set(records.map(record => record.name));

    for (const migration of sorted) {
      if (executedNames.has(migration.name)) continue;
      const record = entityManager.instantiate(RxDBMigration);
      record.name = migration.name;
      record.executedAt = new Date();
      try {
        await repository.create(record);
      } catch (error) {
        // 唯一约束判定只夹在这一条 INSERT 上。放宽到整段就会把用户迁移自己撞到的
        // 唯一约束当成执行权竞争重试，非幂等的 up() 被跑第二遍。
        if (isUniqueConstraintViolation(error)) {
          throw new RxDBMigrationClaimConflictError(migration.name, error);
        }
        throw error;
      }
      try {
        // 用户代码是唯一能在事务体内运行的外部代码，必须把 executor 交给它 ——
        // 否则用户在 up() 里的写会落回队列并排在本事务之后（裁决④）
        await migration.up(executor);
      } catch (error) {
        console.error(`Migration failed: ${migration.name}`, error);
        throw error;
      }
    }
  });
}

/**
 * 按已配置的迁移名生成初始水位线记录（建表时写入 `rxdb_migration` 表）。
 *
 * @param migrations - 已配置的迁移列表
 * @param entityManager - 用于实例化 {@link RxDBMigration} 记录
 */
export function createMigrationWatermarks(
  migrations: MigrationType[] | undefined,
  entityManager: EntityManager
): RxDBMigration[] {
  const names = (migrations ?? []).map(migration => migration.name);
  const executedAt = new Date();
  return names.map(name => {
    const record = entityManager.instantiate(RxDBMigration);
    record.name = name;
    record.executedAt = executedAt;
    return record;
  });
}
