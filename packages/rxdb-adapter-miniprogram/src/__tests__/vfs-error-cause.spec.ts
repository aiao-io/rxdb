/**
 * AC#12：SQLite 的 I/O / 配额错误要顺着 `cause` 带出 VFS 的平台原文，
 * 且只带本次调用期间新产生的那个，不能把残留的旧错误挂到无关失败上。
 */
import { describe, expect, it } from 'vitest';
import { attachVfsErrorCauses, type VfsErrorSource } from '../vfs-error-cause.js';

const SQLITE_FULL = 13;
const SQLITE_CONSTRAINT = 19;
const SQLITE_IOERR_WRITE = 778;

class FakeSQLiteError extends Error {
  constructor(
    message: string,
    readonly code: number
  ) {
    super(message);
  }
}

class MutableSource implements VfsErrorSource {
  lastError: Error | null = null;
}

/** 调用时先让 VFS 记下 `vfsError`（为 null 则不动），再按 `code` 失败。 */
function failingCall(source: MutableSource, code: number, vfsError: Error | null) {
  return () => {
    if (vfsError) source.lastError = vfsError;
    throw new FakeSQLiteError('database or disk is full', code);
  };
}

/** wa-sqlite 门面里与本测试相关的几个方法。 */
interface FakeSqlite {
  step(statement: number): Promise<never>;
  close(database: number): never;
  changes(database: number): never;
  statements(database: number, sql: string): AsyncGenerator<number>;
}

function createFake(source: MutableSource, code: number, vfsError: Error | null): FakeSqlite {
  const fail = failingCall(source, code, vfsError);
  return {
    step: async () => fail(),
    close: () => fail(),
    changes: () => fail(),
    async *statements() {
      yield 1;
      fail();
    }
  };
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  return promise.then(
    () => {
      throw new Error('应当失败');
    },
    (error: unknown) => error as Error
  );
}

function thrown(call: () => unknown): Error {
  try {
    call();
  } catch (error) {
    return error as Error;
  }
  throw new Error('应当抛错');
}

describe('attachVfsErrorCauses', () => {
  it('异步方法失败时挂上本次调用新产生的 VFS 错误', async () => {
    const source = new MutableSource();
    const platform = new Error('writeFileSync:fail user dir saved file size limit exceeded');
    const sqlite3 = attachVfsErrorCauses(createFake(source, SQLITE_FULL, platform), source);

    const error = await rejection(sqlite3.step(1));
    expect(error).toBeInstanceOf(FakeSQLiteError);
    expect(error.cause).toBe(platform);
  });

  it('同步方法同样挂上，扩展结果码按主码判断', () => {
    const source = new MutableSource();
    const platform = new Error('EIO');
    const sqlite3 = attachVfsErrorCauses(createFake(source, SQLITE_IOERR_WRITE, platform), source);

    expect(thrown(() => sqlite3.close(1)).cause).toBe(platform);
  });

  it('VFS 错误是调用前残留的旧值时不挂', async () => {
    const source = new MutableSource();
    source.lastError = new Error('stale');
    const sqlite3 = attachVfsErrorCauses(createFake(source, SQLITE_FULL, null), source);

    expect((await rejection(sqlite3.step(1))).cause).toBeUndefined();
  });

  it('不是 VFS 类结果码时不挂', async () => {
    const source = new MutableSource();
    const sqlite3 = attachVfsErrorCauses(createFake(source, SQLITE_CONSTRAINT, new Error('EIO')), source);

    expect((await rejection(sqlite3.step(1))).cause).toBeUndefined();
  });

  it('错误已有 cause 时不覆盖', async () => {
    const source = new MutableSource();
    const original = new Error('original');
    const sqlite3 = attachVfsErrorCauses(
      {
        step: async () => {
          source.lastError = new Error('EIO');
          throw Object.assign(new FakeSQLiteError('io', SQLITE_FULL), { cause: original });
        }
      },
      source
    );

    expect((await rejection(sqlite3.step())).cause).toBe(original);
  });

  it('不在名单里的方法原样保留', () => {
    const source = new MutableSource();
    const fake = createFake(source, SQLITE_FULL, new Error('EIO'));
    const changes = fake.changes;
    attachVfsErrorCauses(fake, source);

    expect(fake.changes).toBe(changes);
  });

  it('statements 迭代中途失败时挂上，提前结束时转发 return', async () => {
    const source = new MutableSource();
    const platform = new Error('writeFileSync:fail user dir saved file size limit exceeded');
    const sqlite3 = attachVfsErrorCauses(createFake(source, SQLITE_FULL, platform), source);

    const iterator = sqlite3.statements(1, 'SELECT 1')[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ done: false, value: 1 });
    expect((await rejection(iterator.next())).cause).toBe(platform);

    const early = sqlite3.statements(1, 'SELECT 1');
    for await (const statement of early) {
      expect(statement).toBe(1);
      break;
    }
    expect(await early.next()).toEqual({ done: true, value: undefined });
  });

  it('statements 的 throw 转发给底层迭代器', async () => {
    const source = new MutableSource();
    const sqlite3 = attachVfsErrorCauses(createFake(source, SQLITE_FULL, null), source);
    const iterator = sqlite3.statements(1, 'SELECT 1') as AsyncIterableIterator<number> & {
      throw(error: unknown): Promise<IteratorResult<number>>;
    };
    await iterator.next();

    const injected = new Error('abort');
    expect(await rejection(iterator.throw(injected))).toBe(injected);
  });
});
