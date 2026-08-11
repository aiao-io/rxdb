import { vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import type { TransactionExecutor } from '../../transaction/transaction-executor.interface.js';

/**
 * 能提供仓库的东西 —— 通常就是被测用例里的 mock 适配器。
 */
interface RepositoryHost {
  getRepository(EntityType: EntityType): unknown;
  /** 宽松签名：被测用例里的 `vi.fn()` 替身类型各异，收紧只会逼出一堆无意义的强转。 */
  mergeChanges?: (...args: never[]) => unknown;
  /**
   * 宿主自己的批量删除。给了就转发过去 ——
   * 被测代码从 `adapter.removeMany()` 改成 `executor.removeMany()` 之后，
   * 那些断言 `mockAdapter.removeMany` 收到什么的用例仍然测的是同一件事。
   */
  removeMany?: (entities: never[]) => unknown;
  /** 同 {@link RepositoryHost.removeMany}。 */
  saveMany?: (entities: never[]) => unknown;
}

/**
 * 为测试替身构造一个 {@link TransactionExecutor} 替身。
 *
 * @param host - 提供仓库与 `mergeChanges` 的宿主（一般是 mock 适配器）
 *
 * @remarks
 * C2 起事务回调收到的是 executor 而非零参/裸 client。测试里常见的
 * `transaction: vi.fn(async fn => fn())` 会让被测代码拿到 `undefined`，
 * 于是在 `executor.getRepository(...)` 处炸成 `Cannot read properties of undefined`。
 *
 * 这个替身把 `getRepository` / `mergeChanges` 转发回宿主，因此既有那些
 * 「打桩 adapter.getRepository / adapter.mergeChanges 再断言事务内读写」的用例语义保持不变 ——
 * 它只补上事务身份这一层，不改变可观测行为。
 *
 * @example
 * ```ts
 * const adapter = { getRepository: vi.fn(), mergeChanges: vi.fn() };
 * const transaction = vi.fn(async (fn: (executor: TransactionExecutor) => Promise<unknown>) =>
 *   fn(createTransactionExecutorStub(adapter))
 * );
 * ```
 */
export const createTransactionExecutorStub = (host: RepositoryHost): TransactionExecutor => {
  const executor = {
    id: 'test-executor',
    state: 'active',
    query: vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] })),
    mutations: vi.fn(async () => []),
    saveMany: vi.fn(async (entities: unknown[]) => {
      await host.saveMany?.(entities as never[]);
      return entities;
    }),
    removeMany: vi.fn(async (entities: unknown[]) => {
      await host.removeMany?.(entities as never[]);
      return entities;
    }),
    getRepository: (EntityType: EntityType) => host.getRepository(EntityType),
    mergeChanges: vi.fn(async (...args: never[]) => {
      await host.mergeChanges?.(...args);
    }),
    run: (fun: (inner: TransactionExecutor) => Promise<unknown>) => fun(executor as TransactionExecutor)
  };
  return executor as unknown as TransactionExecutor;
};

/**
 * 直接构造一个「执行回调并把 executor 替身传进去」的 `transaction` 替身。
 *
 * @param host - 提供仓库与 `mergeChanges` 的宿主
 */
export const createTransactionStub = (host: RepositoryHost) =>
  vi.fn(async (fun: (executor: TransactionExecutor) => Promise<unknown>) => fun(createTransactionExecutorStub(host)));
