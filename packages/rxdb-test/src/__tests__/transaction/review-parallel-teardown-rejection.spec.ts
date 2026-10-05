import { RxDB, SyncType } from '@aiao/rxdb';
import { vi } from 'vitest';
import { runBootstrapAtomicitySuite } from '../../transaction/bootstrap.suite.js';
import { runTransactionIsolationSuite } from '../../transaction/isolation.suite.js';
import { runReadinessSuite } from '../../transaction/readiness.suite.js';
import type { TransactionSuiteDatabase, TransactionSuiteOptions } from '../../transaction/types.js';

const registered = vi.hoisted(() => ({
  cases: [] as Array<() => void | Promise<void>>,
  cleanup: [] as Array<() => void | Promise<void>>
}));

vi.mock('vitest', async importOriginal => {
  const original = await importOriginal<typeof import('vitest')>();
  return {
    ...original,
    describe: (_name: string, register: () => void) => register(),
    it: (_name: string, run: () => void | Promise<void>) => registered.cases.push(run),
    afterEach: (cleanup: () => void | Promise<void>) => registered.cleanup.push(cleanup)
  };
});

const { beforeEach, describe, expect, it } = await vi.importActual<typeof import('vitest')>('vitest');
const suites: Array<[string, (options: TransactionSuiteOptions) => void]> = [
  ['bootstrap', runBootstrapAtomicitySuite],
  ['isolation', runTransactionIsolationSuite],
  ['readiness', runReadinessSuite]
];

const registerFailingConnection = (
  runSuite: (options: TransactionSuiteOptions) => void,
  dispose: () => Promise<void>
) => {
  const rxdb = new RxDB({ dbName: 'review-parallel-teardown', entities: [], sync: { type: SyncType.None } });
  vi.spyOn(rxdb, 'connect').mockRejectedValue(new Error('intentional connect failure'));
  const database: TransactionSuiteDatabase = {
    rxdb,
    adapterName: 'not-connected',
    adapter: () => {
      throw new Error('adapter must not be used');
    },
    dispose
  };
  runSuite({
    factory: {
      name: 'deliberately-broken-teardown',
      createDatabase: async () => database,
      createBootstrapProbe: async () => {
        throw new Error('bootstrap probe must not be used');
      },
      noopSql: 'SELECT 1'
    }
  });
};

describe('事务共享套件 teardown 必须有失败判别力', () => {
  beforeEach(() => {
    registered.cases.length = 0;
    registered.cleanup.length = 0;
  });

  it.each(suites)('%s 不吞 dispose 的拒绝', async (_name, runSuite) => {
    const failure = new Error('intentional dispose failure');
    const dispose = vi.fn(async () => {
      throw failure;
    });
    registerFailingConnection(runSuite, dispose);
    await expect(Promise.resolve().then(registered.cases[0]!)).rejects.toThrow();
    await expect(Promise.resolve().then(registered.cleanup[0]!)).rejects.toThrow('intentional dispose failure');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each(suites)('%s 在连接失败后仍正常清理', async (_name, runSuite) => {
    const dispose = vi.fn(async () => undefined);
    registerFailingConnection(runSuite, dispose);
    await expect(Promise.resolve().then(registered.cases[0]!)).rejects.toThrow();
    await expect(Promise.resolve().then(registered.cleanup[0]!)).resolves.toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
