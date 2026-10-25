import type { EntityType } from '../entity/entity.interface.js';
import { assertMountedTableSet } from '../entity/worktree-table-set-guard.js';
import type { RxDBAdapterLocalBase } from '../rxdb-adapter.js';
import { getEntityStatus } from '../rxdb-utils.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';

const OPERATIONS = [
  'get',
  'findOne',
  'find',
  'findAll',
  'findByRowIds',
  'count',
  'create',
  'update',
  'remove',
  'findDescendants',
  'countDescendants',
  'findAncestors',
  'countAncestors'
] as const;
const WRITES = new Set<string>(['create', 'update', 'remove']);
const checkpoints = new WeakMap<TransactionExecutor, Map<object, (committed: boolean) => void>>();

/** 在适配器仍占着事务队列时结算公开仓库改过的实体状态。 */
export function settleRepositoryTransaction(executor: TransactionExecutor, committed: boolean): void {
  const states = checkpoints.get(executor);
  checkpoints.delete(executor);
  for (const settle of states?.values() ?? []) settle(committed);
}

const checkpointEntity = (executor: TransactionExecutor, entity: object): void => {
  const states = checkpoints.get(executor) ?? new Map<object, (committed: boolean) => void>();
  checkpoints.set(executor, states);
  if (!states.has(entity)) states.set(entity, getEntityStatus(entity).checkpoint());
};

/**
 * 让公开仓库的 SQL 生成、来源校验和实体回填共用一个事务；执行器仓库保持原样。
 *
 * @param adapter - 公开仓库所属的适配器
 * @param EntityType - 仓库的实体类型
 * @param repository - 尚未包装的公开仓库
 * @returns 包装后的原仓库
 */
export function transactionalRepository<T extends EntityType, R extends object>(
  adapter: Pick<RxDBAdapterLocalBase, 'rxdb' | 'runInTransaction'>,
  EntityType: T,
  repository: R
): R {
  for (const operation of OPERATIONS) {
    if (typeof Reflect.get(repository, operation) !== 'function') continue;
    Reflect.set(repository, operation, (...args: unknown[]) =>
      adapter.runInTransaction(async executor => {
        if (WRITES.has(operation)) {
          assertMountedTableSet(adapter.rxdb, [args[0] as object]);
          checkpointEntity(executor, args[0] as object);
        }
        const scoped = executor.getRepository(EntityType);
        const method = Reflect.get(scoped, operation) as (...params: unknown[]) => Promise<unknown>;
        return method.apply(scoped, args);
      }, false)
    );
  }
  return repository;
}
