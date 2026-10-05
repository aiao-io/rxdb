import { RxDB, RxDBMigration, SyncType, type EntityType, type IRxDBAdapter } from '@aiao/rxdb';
import { of } from 'rxjs';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { runBootstrapAtomicitySuite } from '../transaction/bootstrap.suite.js';
import { TransactionContractNote } from '../transaction/fixtures.js';
import { runTransactionIsolationSuite } from '../transaction/isolation.suite.js';
import { runReadinessSuite } from '../transaction/readiness.suite.js';
import type {
  TransactionAdapterLike,
  TransactionExecutorLike,
  TransactionSuiteDatabase,
  TransactionSuiteFactory
} from '../transaction/types.js';

type Mode = 'direct' | 'shared' | 'probe';
type Outcome = 'resolved' | 'rejected';
interface Trace {
  readonly factory: string;
  readonly kind: 'database' | 'probe';
  readonly expected: Outcome;
  readonly events: string[];
  disconnectCalls: number;
  disposeCalls: number;
  outcome: Outcome | 'not-called';
}

const readMode = (): Mode => {
  const value = process.env['RXDB_REVIEW_R3_CLEANUP_MODE'] ?? 'shared';
  if (value === 'direct' || value === 'shared' || value === 'probe') return value;
  throw new Error(`unknown cleanup review mode: ${value}`);
};
const mode = readMode();
const traces: Trace[] = [];
const outcomes: Outcome[] = ['resolved', 'rejected'];

const createSerialQueue = () => {
  let tail = Promise.resolve();
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
  return { run };
};

const runTransaction = async <T>(id: string, work: (executor: TransactionExecutorLike) => Promise<T>): Promise<T> => {
  let state: TransactionExecutorLike['state'] = 'active';
  const executor: TransactionExecutorLike = {
    id,
    get state() {
      return state;
    },
    query: async () => {
      if (state !== 'active') throw new Error('executor already terminated');
      return [];
    },
    run: async nested => nested(executor)
  };
  try {
    const result = await work(executor);
    state = 'committed';
    return result;
  } catch (cause) {
    state = 'rolled-back';
    throw cause;
  }
};

const createClose = (factory: string, kind: Trace['kind'], expected: Outcome) => {
  const trace: Trace = {
    factory,
    kind,
    expected,
    events: [],
    disconnectCalls: 0,
    disposeCalls: 0,
    outcome: 'not-called'
  };
  traces.push(trace);
  const failure = new Error(`R3_CLOSE_REJECT:${factory}:${kind}`);
  const disconnect = async (): Promise<void> => {
    trace.disconnectCalls++;
    trace.events.push(`adapter.disconnect:${expected}`);
    if (expected === 'rejected') throw failure;
  };
  const dispose = async (): Promise<void> => {
    trace.disposeCalls++;
    try {
      await disconnect();
      trace.outcome = 'resolved';
      trace.events.push('factory.dispose:resolved');
    } catch (cause) {
      expect(cause).toBe(failure);
      trace.outcome = 'rejected';
      trace.events.push('factory.dispose:rejected');
      throw cause;
    }
  };
  return { trace, disconnect, dispose };
};

const createFactory = (
  name: string,
  databaseOutcome: Outcome,
  probeOutcome: Outcome = 'resolved'
): TransactionSuiteFactory => ({
  name,
  noopSql: 'SELECT 1',
  createDatabase: async ({ dbName, entities, migrations }) => {
    const close = createClose(name, 'database', databaseOutcome);
    const queue = createSerialQueue();
    const notes: TransactionContractNote[] = [];
    let transactionId = 0;
    const adapter: IRxDBAdapter & TransactionAdapterLike = {
      name,
      connect: async () => adapter,
      disconnect: close.disconnect,
      version: async () => 'review-double',
      getRepository: () => {
        throw new Error('unused adapter repository');
      },
      saveMany: async values => values,
      removeMany: async values => values,
      mutations: async () => [],
      isTableExisted: async () => true,
      query: async () => {
        close.trace.events.push('query:fulfilled');
        return [{ value: 1 }];
      },
      transaction: work => queue.run(() => runTransaction(`${name}:tx-${++transactionId}`, work))
    };
    const rxdb = new RxDB({ dbName, entities: [...entities], sync: { type: SyncType.None } });
    rxdb.init();
    vi.spyOn(rxdb, 'connect').mockImplementation(async () => {
      close.trace.events.push('connect:fulfilled');
      return adapter;
    });
    vi.spyOn(rxdb.entityManager, 'save').mockImplementation(async <T extends EntityType>(entity: InstanceType<T>) =>
      queue.run(async () => {
        const candidate: unknown = entity;
        if (!(candidate instanceof TransactionContractNote)) throw new Error('unexpected saved entity');
        notes.push(candidate);
        close.trace.events.push('save:fulfilled');
        return entity;
      })
    );
    const noteRepository = rxdb.entityManager.getRepository(TransactionContractNote);
    vi.spyOn(noteRepository, 'find').mockImplementation(() => of(notes));
    const migrationRepository = rxdb.entityManager.getRepository(RxDBMigration);
    const records = (migrations ?? []).map(({ name: migrationName }) =>
      rxdb.entityManager.instantiate(RxDBMigration, { name: migrationName })
    );
    vi.spyOn(migrationRepository, 'find').mockImplementation(() => of(records));
    return {
      rxdb,
      adapterName: name,
      adapter: () => adapter,
      dispose: async () => {
        try {
          await close.dispose();
        } finally {
          await rxdb.destroy();
          close.trace.events.push('model.destroy:fulfilled');
        }
      }
    };
  },
  createBootstrapProbe: async () => {
    const close = createClose(name, 'probe', probeOutcome);
    return {
      createTables: async () => {
        close.trace.events.push('createTables:expected-rejection');
        throw new Error('expected missing bootstrap entity');
      },
      tableExists: async () => {
        close.trace.events.push('tableExists:false');
        return false;
      },
      dispose: close.dispose
    };
  }
});

const registerDirect = (outcome: Outcome): void => {
  describe(`R3 direct/${outcome}`, () => {
    const factory = createFactory(`direct/${outcome}`, outcome);
    let database: TransactionSuiteDatabase;
    afterEach(async () => {
      await database.dispose();
    });
    it('成功业务 body 后直接 await 同一 dispose', async () => {
      database = await factory.createDatabase({ dbName: `r3-direct-${outcome}`, entities: [TransactionContractNote] });
      await expect(database.rxdb.connect(database.adapterName)).resolves.toBeDefined();
      await expect(database.adapter().query(factory.noopSql)).resolves.toBeDefined();
    });
  });
};

const registerShared = (outcome: Outcome): void => {
  const readiness = createFactory(`shared-readiness/${outcome}`, outcome);
  const bootstrap = createFactory(`shared-bootstrap/${outcome}`, outcome);
  const isolation = createFactory(`shared-isolation/${outcome}`, outcome);
  runReadinessSuite({ factory: readiness });
  runBootstrapAtomicitySuite({ factory: bootstrap });
  runTransactionIsolationSuite({ factory: isolation });
};

const registrations: Record<Mode, () => void> = {
  direct: () => outcomes.forEach(registerDirect),
  shared: () => outcomes.forEach(registerShared),
  probe: () => runBootstrapAtomicitySuite({ factory: createFactory('probe-finally/rejected', 'resolved', 'rejected') })
};
registrations[mode]();

afterAll(() => {
  console.log(`R3_CLEANUP_VERDICT ${JSON.stringify({ mode, traces })}`);
  expect(traces).toHaveLength({ direct: 2, shared: 22, probe: 3 }[mode]);
  for (const trace of traces) {
    expect(trace.disconnectCalls).toBe(1);
    expect(trace.disposeCalls).toBe(1);
    expect(trace.outcome).toBe(trace.expected);
    expect(trace.events).toContain(`factory.dispose:${trace.expected}`);
    if (trace.kind === 'database') expect(trace.events).toContain('model.destroy:fulfilled');
  }
});
