import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  opfsAvailable: true,
  connectError: undefined as Error | undefined,
  log: [] as string[]
}));

vi.mock('@aiao/utils', () => ({ checkOPFSAvailable: async () => env.opfsAvailable }));
vi.mock('@aiao/rxdb-test/entities', () => ({ Todo: class Todo {} }));
vi.mock('@aiao/rxdb', () => {
  class RxDB {
    readonly #factories = new Map<string, (db: unknown) => Promise<unknown>>();
    readonly disconnectAll = vi.fn(async () => void env.log.push('disconnect'));
    adapter(name: string, factory: (db: unknown) => Promise<unknown>): void {
      this.#factories.set(name, factory);
    }
    async connect(name: string): Promise<void> {
      await this.#factories.get(name)?.(this);
      if (env.connectError) throw env.connectError;
    }
  }
  return { RxDB, SyncType: { None: 'none' } };
});
vi.mock('@aiao/rxdb-adapter-pglite', () => ({ RxDBAdapterPGlite: class {} }));
vi.mock('@aiao/rxdb-adapter-sqlite', () => ({ RxDBAdapterSqlite: class {} }));
vi.mock('@aiao/rxdb-adapter-sqlite-wasm', () => ({ RxDBAdapterSqlite: class {} }));
vi.mock('@aiao/rxdb-adapter-sqliteai', () => ({ RxDBAdapterSqliteai: class {} }));
vi.mock('@aiao/rxdb-adapter-wa-sqlite', () => ({ RxDBAdapterWaSqlite: class {} }));

class FakeWorker {
  static readonly created: FakeWorker[] = [];
  terminated = 0;
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions
  ) {
    FakeWorker.created.push(this);
  }
  terminate(): void {
    this.terminated += 1;
    env.log.push(`terminate:${this.options.name}`);
  }
}

class FakeSharedWorker {
  static readonly created: FakeSharedWorker[] = [];
  readonly port = { close: vi.fn(() => void env.log.push(`close:${this.options.name}`)) };
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions
  ) {
    FakeSharedWorker.created.push(this);
  }
}

const loadFactory = async () => {
  vi.resetModules();
  return import('./rxdb-factory');
};

describe('createRxDB 回收工厂自己创建的 Worker', () => {
  beforeEach(() => {
    env.opfsAvailable = true;
    env.connectError = undefined;
    env.log.length = 0;
    FakeWorker.created.length = 0;
    FakeSharedWorker.created.length = 0;
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('SharedWorker', FakeSharedWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['wa-sqlite', 'sqlite-wasm', 'sqliteai', 'sqlite'] as const)(
    '%s（OPFS 可用）：dispose 先断开连接，再终止它的 dedicated Worker',
    async adapter => {
      const { createRxDB } = await loadFactory();
      const database = await createRxDB('bench', adapter);
      expect(FakeWorker.created).toHaveLength(1);
      expect(FakeWorker.created[0].terminated).toBe(0);

      await database.dispose();

      expect(database.rxdb.disconnectAll).toHaveBeenCalledOnce();
      expect(FakeWorker.created[0].terminated).toBe(1);
      expect(env.log).toEqual(['disconnect', `terminate:${FakeWorker.created[0].options.name}`]);
    }
  );

  it.each(['wa-sqlite', 'sqlite-wasm'] as const)(
    '%s（OPFS 不可用）：dispose 断开后关闭 SharedWorker 的根端口',
    async adapter => {
      env.opfsAvailable = false;
      const { createRxDB } = await loadFactory();
      const database = await createRxDB('bench', adapter);
      expect(FakeWorker.created).toHaveLength(0);
      expect(FakeSharedWorker.created).toHaveLength(1);

      await database.dispose();

      expect(FakeSharedWorker.created[0].port.close).toHaveBeenCalledOnce();
      expect(env.log).toEqual(['disconnect', `close:${FakeSharedWorker.created[0].options.name}`]);
    }
  );

  it('两轮四个场景各建各 dispose：活着的 Worker 不随轮次增长', async () => {
    const { createRxDB } = await loadFactory();
    for (let round = 0; round < 2; round += 1) {
      for (const suite of ['throughput', 'latency', 'scalability', 'concurrency']) {
        const database = await createRxDB(`run-${round}-${suite}`, 'wa-sqlite');
        await database.dispose();
      }
    }
    expect(FakeWorker.created).toHaveLength(8);
    expect(FakeWorker.created.filter(worker => worker.terminated === 0)).toEqual([]);
  });

  it('连接失败：已创建的 Worker 被终止，原错误照抛', async () => {
    env.connectError = new Error('adapter init failed');
    const { createRxDB } = await loadFactory();

    await expect(createRxDB('bench', 'sqliteai')).rejects.toBe(env.connectError);

    expect(FakeWorker.created).toHaveLength(1);
    expect(FakeWorker.created[0].terminated).toBe(1);
  });

  it('pglite 不创建 Worker，dispose 只断开连接', async () => {
    const { createRxDB } = await loadFactory();
    const database = await createRxDB('bench', 'pglite');

    await database.dispose();

    expect(FakeWorker.created).toHaveLength(0);
    expect(FakeSharedWorker.created).toHaveLength(0);
    expect(env.log).toEqual(['disconnect']);
  });
});
