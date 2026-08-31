import { afterEach, describe, expect, it, vi } from 'vitest';
import { Oo1ClientBase, type Oo1ClientLoadOptions } from '../Oo1ClientBase.js';
import type { Oo1Database, Oo1Static } from '../oo1-types.js';
import { SQLiteChangeType } from '../sqlite-backend.interface.js';
import type { SqliteChangeEvent } from '../sqlite-core.interface.js';
import { RxDBAdapterSqliteError } from '../sqlite-core.utils.js';

type UpdateHook = (userCtx: number, op: number, dbName: string, tableName: string, rowId: number | bigint) => void;

interface FakeRuntimeOptions {
  opfsError?: Error;
  opfsUnavailable?: boolean;
  execError?: Error;
}

class FakeOo1Db implements Oo1Database {
  readonly filename?: string;
  readonly execSqls: string[] = [];
  readonly functions = new Map<string, (...args: unknown[]) => unknown>();
  readonly functionArities = new Map<string, number | undefined>();
  closed = false;
  execError?: Error;

  constructor(filename?: string, execError?: Error) {
    this.filename = filename;
    this.execError = execError;
  }

  exec(opts: {
    sql: string;
    bind?: unknown[];
    resultRows?: unknown[][];
    columnNames?: string[];
    rowMode?: string;
  }): this {
    if (this.execError) throw this.execError;
    this.execSqls.push(opts.sql);
    if (opts.sql.includes('sqlite_version')) {
      opts.columnNames?.push('sqlite_version()');
      opts.resultRows?.push(['3.50.0-test']);
    }
    return this;
  }

  close(): void {
    this.closed = true;
  }

  changes(): number {
    return 0;
  }

  createFunction(
    name: string,
    func: (...args: unknown[]) => unknown,
    options?: { arity?: number }
  ): this {
    this.functions.set(name, func);
    this.functionArities.set(name, options?.arity);
    return this;
  }
}

const createFakeRuntime = (options: FakeRuntimeOptions = {}) => {
  const dbs: FakeOo1Db[] = [];
  const opfsDbs: FakeOo1Db[] = [];
  let hook: UpdateHook | undefined;
  let hookSetCount = 0;

  class FakeMemoryDb extends FakeOo1Db {
    constructor(filename?: string) {
      super(filename, options.execError);
      dbs.push(this);
    }
  }

  class FakeOpfsDb extends FakeOo1Db {
    constructor(filename?: string) {
      if (options.opfsError) throw options.opfsError;
      super(filename);
      opfsDbs.push(this);
    }
  }

  const sqlite3: Oo1Static = {
    capi: {
      sqlite3_update_hook: (_db, xUpdate) => {
        hook = xUpdate as unknown as UpdateHook;
        hookSetCount += 1;
        return 0;
      }
    },
    oo1: { DB: FakeMemoryDb, ...(options.opfsUnavailable ? {} : { OpfsDb: FakeOpfsDb }) },
    version: { libVersion: '3.50.0', libVersionNumber: 3500000, sourceId: 'fake', downloadVersion: 0 }
  };

  const emitChange = (op: SQLiteChangeType, dbName: string, tableName: string, rowId: number | bigint): void => {
    if (!hook) throw new Error('update hook 尚未注册');
    hook(0, op, dbName, tableName, rowId);
  };

  return { sqlite3, options, dbs, opfsDbs, emitChange, getHookSetCount: () => hookSetCount };
};

type FakeRuntime = ReturnType<typeof createFakeRuntime>;

class TestOo1Client extends Oo1ClientBase<Oo1ClientLoadOptions> {
  protected get clientName(): string {
    return 'test-oo1';
  }

  loadCalls = 0;
  loadError?: Error;

  constructor(private readonly runtimeSqlite3: Oo1Static) {
    super();
  }

  protected loadModule(): Promise<Oo1Static> {
    this.loadCalls += 1;
    if (this.loadError) return Promise.reject(this.loadError);
    return Promise.resolve(this.runtimeSqlite3);
  }
}

const createClient = (options: FakeRuntimeOptions = {}): { runtime: FakeRuntime; client: TestOo1Client } => {
  const runtime = createFakeRuntime(options);
  return { runtime, client: new TestOo1Client(runtime.sqlite3) };
};

describe('Oo1ClientBase', () => {
  it('公开 Worker 可调用的默认事务 SQL', () => {
    const { client } = createClient();

    expect(client.beginTransactionSql()).toBe('BEGIN;');
    expect(client.beginSystemMigrationTransactionSql()).toBe('BEGIN EXCLUSIVE;');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('init 生命周期', () => {
    it('应该完成初始化并执行初始化 PRAGMA SQL', async () => {
      const { runtime, client } = createClient();

      await client.init('mydb');

      expect(runtime.dbs).toHaveLength(1);
      expect(runtime.dbs[0].filename).toBe(':memory:');
      expect(runtime.dbs[0].execSqls[0]).toContain('PRAGMA foreign_keys = ON');
      expect(runtime.dbs[0].execSqls[0]).toContain('PRAGMA journal_mode = MEMORY');
      expect(runtime.getHookSetCount()).toBe(1);
    });

    it('重复 init 应该直接返回且只加载一次模块', async () => {
      const { runtime, client } = createClient();

      await client.init('mydb');
      await client.init('mydb');

      expect(client.loadCalls).toBe(1);
      expect(runtime.dbs).toHaveLength(1);
    });

    it('并发 init 应该共享同一次初始化', async () => {
      const { runtime, client } = createClient();

      await Promise.all([client.init('mydb'), client.init('mydb')]);

      expect(client.loadCalls).toBe(1);
      expect(runtime.dbs).toHaveLength(1);
    });

    it('loadModule 失败时应该抛出原始错误', async () => {
      const { client } = createClient();
      const loadError = new Error('load failed');
      client.loadError = loadError;

      await expect(client.init('mydb')).rejects.toBe(loadError);
    });

    it('初始化 SQL 执行失败时应该清理连接并允许重新初始化', async () => {
      const { runtime, client } = createClient({ execError: new Error('pragma failed') });

      await expect(client.init('mydb')).rejects.toBeInstanceOf(RxDBAdapterSqliteError);
      expect(runtime.dbs[0].closed).toBe(true);
      // 失败清理阶段会注册一次 noop update hook；触发它应该不产生任何事件
      expect(runtime.getHookSetCount()).toBe(1);
      expect(() => runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', 'rxdb$rxdb_change', 1n)).not.toThrow();

      runtime.options.execError = undefined;
      await client.init('mydb');

      expect(client.loadCalls).toBe(2);
      expect(runtime.dbs).toHaveLength(2);
      expect(runtime.dbs[1].closed).toBe(false);
    });
  });

  describe('参数校验', () => {
    it('batchTimeout 为负数时应该抛出 RxDBAdapterSqliteError', async () => {
      const { client } = createClient();

      await expect(client.init('mydb', { batchTimeout: -1 })).rejects.toThrow(/options\.batchTimeout/);
    });

    it('cacheSizeKb 为 0 时应该抛出 RxDBAdapterSqliteError', async () => {
      const { client } = createClient();

      await expect(client.init('mydb', { cacheSizeKb: 0 })).rejects.toThrow(/options\.cacheSizeKb/);
    });

    it('参数校验失败后应该可以用合法参数重新初始化', async () => {
      const { runtime, client } = createClient();

      await expect(client.init('mydb', { batchTimeout: 1.5 })).rejects.toBeInstanceOf(RxDBAdapterSqliteError);
      await client.init('mydb', { batchTimeout: 0, cacheSizeKb: 1024 });

      expect(runtime.dbs[0].execSqls[0]).toContain('PRAGMA cache_size = -1024');
    });
  });

  describe('OPFS', () => {
    it('启用 opfs 时应该使用 OpfsDb 并补全文件名', async () => {
      const { runtime, client } = createClient();

      await client.init('my_db', { opfs: true });

      expect(runtime.opfsDbs).toHaveLength(1);
      expect(runtime.opfsDbs[0].filename).toBe('/my_db.sqlite3');
      expect(runtime.opfsDbs[0].execSqls[0]).toContain('PRAGMA journal_mode = WAL');
    });

    // SQLC-017：`my/db` 与 `my_db` 会归一化到同一个 OPFS 文件，必须在 init 就拒绝
    it('opfs 模式下 dbName 含分隔符时应该拒绝而不是归一化', async () => {
      const { runtime, client } = createClient();

      await expect(client.init('my/db', { opfs: true })).rejects.toThrow(RxDBAdapterSqliteError);
      expect(runtime.opfsDbs).toHaveLength(0);
    });

    it('OPFS 创建失败且未配置回退时应该抛出原始错误', async () => {
      const opfsError = new Error('no atomics');
      const { client } = createClient({ opfsError });

      await expect(client.init('mydb', { opfs: true })).rejects.toBe(opfsError);
    });

    it('OPFS 创建失败且 opfsFallback 为 throw 时应该抛出原始错误', async () => {
      const opfsError = new Error('no atomics');
      const { client } = createClient({ opfsError });

      await expect(client.init('mydb', { opfs: true, opfsFallback: 'throw' })).rejects.toBe(opfsError);
    });

    it('运行时缺少 OPFS 构造器时应该抛出具名错误', async () => {
      const { client } = createClient({ opfsUnavailable: true });

      await expect(client.init('mydb', { opfs: true })).rejects.toThrow(
        /does not provide an OPFS database constructor/
      );
    });

    it('运行时缺少 OPFS 构造器且允许回退时应该使用内存数据库', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { runtime, client } = createClient({ opfsUnavailable: true });

      await client.init('mydb', { opfs: true, opfsFallback: 'memory' });

      expect(runtime.dbs).toHaveLength(1);
      expect(runtime.dbs[0].filename).toBe(':memory:');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[test-oo1] OPFS'), expect.any(Error));
    });

    it('OPFS 创建失败且 opfsFallback 为 memory 时应该回退到内存数据库并告警', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { runtime, client } = createClient({ opfsError: new Error('no atomics') });

      await client.init('mydb', { opfs: true, opfsFallback: 'memory' });

      expect(runtime.opfsDbs).toHaveLength(0);
      expect(runtime.dbs).toHaveLength(1);
      expect(runtime.dbs[0].filename).toBe(':memory:');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[test-oo1] OPFS'), expect.any(Error));
    });
  });

  describe('execute 与 disconnect', () => {
    // SQLC-034：`#queue` 是 definite assignment，init 之前 execute 会抛
    // `TypeError: Cannot read properties of undefined (reading 'addTask')`，
    // 调用方无从判断是「没 init」还是「运行时坏了」。
    it('init 之前 execute 应该抛出具名的未初始化错误', async () => {
      const { client } = createClient();

      await expect(client.execute('SELECT 1')).rejects.toBeInstanceOf(RxDBAdapterSqliteError);
      await expect(client.execute('SELECT 1')).rejects.toThrow(/has not been initialized/);
    });

    it('init 之前 version() 也应该抛出未初始化错误而不是 TypeError', async () => {
      const { client } = createClient();

      await expect(client.version()).rejects.toBeInstanceOf(RxDBAdapterSqliteError);
    });

    it('init 失败后 execute 应该仍报未初始化而不是已断开', async () => {
      const { client } = createClient({ execError: new Error('pragma failed') });

      await expect(client.init('mydb')).rejects.toBeInstanceOf(RxDBAdapterSqliteError);
      await expect(client.execute('SELECT 1')).rejects.toThrow(/has not been initialized/);
    });

    it('version() 应该返回 SQLite 版本号', async () => {
      const { client } = createClient();
      await client.init('mydb');

      await expect(client.version()).resolves.toBe('3.50.0-test');
    });

    it('disconnect 后 execute 应该抛出', async () => {
      const { client } = createClient();
      await client.init('mydb');
      await client.disconnect();

      await expect(client.execute('SELECT 1')).rejects.toThrow('test-oo1 client has been disconnected');
    });

    it('未初始化的客户端 disconnect 应该安全返回', async () => {
      const { client } = createClient();

      await expect(client.disconnect()).resolves.toBeUndefined();
    });

    it('disconnect 应该注销 update hook 并关闭连接', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      const events: SqliteChangeEvent[] = [];
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => events.push(event));

      await client.disconnect();

      expect(runtime.getHookSetCount()).toBe(2);
      expect(runtime.dbs[0].closed).toBe(true);
      // disconnect 后 hook 已替换为 noop，触发它不应再收集事件
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', 'rxdb$rxdb_change', 1n);
      expect(events).toHaveLength(0);
    });

    it('disconnect 后重新 init 应该恢复可用', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      await client.disconnect();

      await client.init('mydb');

      await expect(client.version()).resolves.toBe('3.50.0-test');
      expect(runtime.dbs).toHaveLength(2);
    });
  });

  describe('变更事件批量派发', () => {
    const WATCHED_TABLE = 'rxdb$rxdb_change';

    it('应该在 batchTimeout 后按 rowIds 批量派发一次', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      vi.useFakeTimers();

      const events: SqliteChangeEvent[] = [];
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => events.push(event));

      // number 与 bigint rowId 都应被 normalizeRowId 归一化为 bigint
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 1);
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 2n);
      expect(events).toHaveLength(0);

      vi.advanceTimersByTime(16);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: SQLiteChangeType.SQLITE_INSERT,
        dbName: 'main',
        tableName: WATCHED_TABLE,
        rowIds: [1n, 2n]
      });
      expect(events[0].recordAt).toBeInstanceOf(Date);
    });

    it('不同类型与不同表应该分组派发', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      vi.useFakeTimers();

      const events: SqliteChangeEvent[] = [];
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => events.push(event));
      client.addEventListener(SQLiteChangeType.SQLITE_UPDATE, event => events.push(event));
      client.addEventListener(SQLiteChangeType.SQLITE_DELETE, event => events.push(event));

      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 1n);
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 2n);
      runtime.emitChange(SQLiteChangeType.SQLITE_UPDATE, 'main', WATCHED_TABLE, 3n);
      runtime.emitChange(SQLiteChangeType.SQLITE_DELETE, 'main', 'rxdb$rxdb_branch', 4n);

      vi.advanceTimersByTime(16);

      expect(events).toHaveLength(3);
      expect(events[0].rowIds).toEqual([1n, 2n]);
      expect(events[1]).toMatchObject({ type: SQLiteChangeType.SQLITE_UPDATE, rowIds: [3n] });
      expect(events[2]).toMatchObject({ tableName: 'rxdb$rxdb_branch', rowIds: [4n] });
    });

    it('非监听表与空表名应该被忽略', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      vi.useFakeTimers();

      const events: SqliteChangeEvent[] = [];
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => events.push(event));

      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', 'public$todos', 1n);
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, '', WATCHED_TABLE, 2n);
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', '', 3n);

      vi.advanceTimersByTime(100);

      expect(events).toHaveLength(0);
    });

    it('超时前追加事件应该重置定时器并合并派发', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      vi.useFakeTimers();

      const events: SqliteChangeEvent[] = [];
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => events.push(event));

      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 1n);
      vi.advanceTimersByTime(8);
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 2n);
      vi.advanceTimersByTime(8);
      // 第二个事件重置了定时器，此时距第二个事件仅 8ms，尚未派发
      expect(events).toHaveLength(0);

      vi.advanceTimersByTime(8);
      expect(events).toHaveLength(1);
      expect(events[0].rowIds).toEqual([1n, 2n]);
    });

    it('batchTimeout 为 0 时应该在下一个宏任务派发', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb', { batchTimeout: 0 });
      vi.useFakeTimers();

      const events: SqliteChangeEvent[] = [];
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => events.push(event));

      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 1n);
      vi.advanceTimersByTime(0);

      expect(events).toHaveLength(1);
    });

    it('disconnect 应该同步 flush 未派发的事件', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      vi.useFakeTimers();

      const events: SqliteChangeEvent[] = [];
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => events.push(event));
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 1n);

      await client.disconnect();

      expect(events).toHaveLength(1);
      expect(events[0].rowIds).toEqual([1n]);
    });

    it('flush 监听器抛错时 disconnect 仍应关闭连接', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { runtime, client } = createClient();
      await client.init('mydb');
      vi.useFakeTimers();

      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, () => {
        throw new Error('listener boom');
      });
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 1n);

      await client.disconnect();

      expect(runtime.dbs[0].closed).toBe(true);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('change event listener failed'), expect.any(Error));
    });

    // SQLC-032：`#pending_events` 不是原子换出，`pending.length = 0` 排在全部派发之后。
    // 任一监听器抛错就跳过清空，旧批次留在队列里，下一次 flush 连同新事件重复派发。
    it('一个分组的监听器抛错不应阻断同批其余分组', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { runtime, client } = createClient();
      await client.init('mydb');
      vi.useFakeTimers();

      const received: SqliteChangeEvent[] = [];
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, () => {
        throw new Error('listener boom');
      });
      client.addEventListener(SQLiteChangeType.SQLITE_DELETE, event => received.push(event));

      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 1n);
      runtime.emitChange(SQLiteChangeType.SQLITE_DELETE, 'main', WATCHED_TABLE, 2n);
      vi.advanceTimersByTime(16);

      expect(received).toHaveLength(1);
      expect(received[0].rowIds).toEqual([2n]);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('change event listener failed'), expect.any(Error));
    });

    it('监听器抛错后下一批不应重复派发旧事件', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { runtime, client } = createClient();
      await client.init('mydb');
      vi.useFakeTimers();

      const received: SqliteChangeEvent[] = [];
      let shouldThrow = true;
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => {
        received.push(event);
        if (shouldThrow) throw new Error('listener boom');
      });

      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 1n);
      vi.advanceTimersByTime(16);
      expect(received).toHaveLength(1);

      shouldThrow = false;
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 2n);
      vi.advanceTimersByTime(16);

      expect(received).toHaveLength(2);
      // 第二批只能有 2n；旧的 1n 已经派发过，重放会让上层把同一条变更处理两遍
      expect(received[1].rowIds).toEqual([2n]);
    });

    // SQLC-041：disconnect 从不调用 removeAllEventListeners，
    // 适配器重连时会再注册一组新的 Comlink 代理回调，远端按引用去重认不出旧的，导致重复派发。
    it('disconnect 应该清空全部监听器', async () => {
      const { client } = createClient();
      await client.init('mydb');
      const listener = (): void => undefined;
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, listener);
      expect(client.hasEventListener(SQLiteChangeType.SQLITE_INSERT, listener)).toBe(true);

      await client.disconnect();

      expect(client.hasEventListener(SQLiteChangeType.SQLITE_INSERT, listener)).toBe(false);
    });

    it('disconnect 后重连不应把事件派发给上一轮的监听器', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');

      const stale: SqliteChangeEvent[] = [];
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => stale.push(event));

      await client.disconnect();
      await client.init('mydb');
      vi.useFakeTimers();

      const fresh: SqliteChangeEvent[] = [];
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => fresh.push(event));
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 1n);
      vi.advanceTimersByTime(16);

      expect(fresh).toHaveLength(1);
      expect(stale).toHaveLength(0);
    });

    it('清空监听器必须排在 flush 之后，最后一批事件不能丢', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      vi.useFakeTimers();

      const events: SqliteChangeEvent[] = [];
      const listener = (event: SqliteChangeEvent): void => {
        events.push(event);
      };
      client.addEventListener(SQLiteChangeType.SQLITE_INSERT, listener);
      runtime.emitChange(SQLiteChangeType.SQLITE_INSERT, 'main', WATCHED_TABLE, 1n);

      await client.disconnect();

      expect(events).toHaveLength(1);
      expect(client.hasEventListener(SQLiteChangeType.SQLITE_INSERT, listener)).toBe(false);
    });
  });

  describe('自定义函数', () => {
    const getFunction = (db: FakeOo1Db, name: string): ((...args: unknown[]) => unknown) => {
      const fn = db.functions.get(name);
      if (!fn) throw new Error(`未注册自定义函数 ${name}`);
      return fn;
    };

    it('应该注册 regexp 函数并返回 0/1', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      const regexp = getFunction(runtime.dbs[0], 'regexp');

      expect(regexp(0, '^a', 'abc')).toBe(1);
      expect(regexp(0, '^b', 'abc')).toBe(0);
    });

    it('regexp 无效正则应该告警并返回 0', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { runtime, client } = createClient();
      await client.init('mydb');
      const regexp = getFunction(runtime.dbs[0], 'regexp');

      expect(regexp(0, '(', 'abc')).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('regexp(('), expect.anything());
    });

    it('应该注册 regexp_replace 函数并支持 flags', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      const regexpReplace = getFunction(runtime.dbs[0], 'regexp_replace');

      expect(regexpReplace(0, 'a', 'banana', 'o')).toBe('bonana');
      expect(regexpReplace(0, 'a', 'banana', 'o', 'g')).toBe('bonono');
    });

    it('regexp_replace 参数不足时应该返回空字符串', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');
      const regexpReplace = getFunction(runtime.dbs[0], 'regexp_replace');

      expect(regexpReplace(0, 'a', 'banana')).toBe('');
    });

    it('regexp_replace 无效正则应该告警并返回原文', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { runtime, client } = createClient();
      await client.init('mydb');
      const regexpReplace = getFunction(runtime.dbs[0], 'regexp_replace');

      expect(regexpReplace(0, '(', 'banana', 'o')).toBe('banana');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('regexp_replace(('), expect.anything());
    });

    // OO1 缺省按 `xFunc.length - 1` 推导 arity，rest 参数回调 length 恒为 1，
    // 被误判成零参函数，`SELECT rxdb_fts_bigram('probe')` 因参数个数不符被拒。必须显式传 arity。
    it('应该按显式 arity 注册三个自定义函数', async () => {
      const { runtime, client } = createClient();
      await client.init('mydb');

      expect(runtime.dbs[0].functionArities.get('regexp')).toBe(2);
      expect(runtime.dbs[0].functionArities.get('regexp_replace')).toBe(-1);
      expect(runtime.dbs[0].functionArities.get('rxdb_fts_bigram')).toBe(1);
    });
  });
});
