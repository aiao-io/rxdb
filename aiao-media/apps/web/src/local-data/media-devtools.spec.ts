import { getEntityMetadata, RxDB, RxDBBranch, SyncType } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectMediaDevTools as connectProductionDevTools } from './media-devtools';
import { connectMediaDevTools } from './media-devtools.development';

const connector = vi.hoisted(() => {
  const init = vi.fn<(db: RxDB, metadata: typeof getEntityMetadata) => void>();
  const disconnect = vi.fn<() => void>();
  return { init, disconnect, get: vi.fn(() => ({ init, disconnect })) };
});

vi.mock('@aiao/rxdb-devtools', () => ({ getDevToolsConnector: connector.get }));

function database(name: string): RxDB {
  return new RxDB({
    dbName: name,
    entities: [RxDBBranch],
    sync: { type: SyncType.None, local: { adapter: 'memory' } }
  });
}

describe('媒体工作区开发工具', () => {
  const cleanups: (() => void)[] = [];

  function connect(db: RxDB): () => void {
    const cleanup = connectMediaDevTools(db);
    cleanups.push(cleanup);
    return cleanup;
  }

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    vi.restoreAllMocks();
  });

  it('以真实实体元数据连接当前数据库', () => {
    const db = database('media-devtools-current');
    connect(db);
    expect(connector.get).toHaveBeenCalledOnce();
    expect(connector.init).toHaveBeenCalledExactlyOnceWith(db, getEntityMetadata);
  });

  it('先断开旧会话，再切换到新数据库', () => {
    const first = database('media-devtools-first');
    const second = database('media-devtools-second');
    connect(first);
    connect(second);
    expect(connector.init.mock.calls).toEqual([
      [first, getEntityMetadata],
      [second, getEntityMetadata]
    ]);
    expect(connector.disconnect).toHaveBeenCalledTimes(2);
    expect(connector.disconnect.mock.invocationCallOrder[0]).toBeLessThan(connector.init.mock.invocationCallOrder[0]);
    expect(connector.disconnect.mock.invocationCallOrder[1]).toBeGreaterThan(
      connector.init.mock.invocationCallOrder[0]
    );
    expect(connector.disconnect.mock.invocationCallOrder[1]).toBeLessThan(connector.init.mock.invocationCallOrder[1]);
  });

  it('旧工作区的延迟关闭不会断开当前会话', () => {
    const releaseFirst = connect(database('media-devtools-old'));
    const releaseSecond = connect(database('media-devtools-new'));
    connector.disconnect.mockClear();
    releaseFirst();
    releaseFirst();
    expect(connector.disconnect).not.toHaveBeenCalled();
    releaseSecond();
    releaseSecond();
    expect(connector.disconnect).toHaveBeenCalledOnce();
  });

  it('同一数据库重连后，旧清理函数仍不能释放新会话', () => {
    const db = database('media-devtools-reconnect');
    const releaseFirst = connect(db);
    releaseFirst();
    const releaseSecond = connect(db);
    connector.disconnect.mockClear();
    releaseFirst();
    expect(connector.disconnect).not.toHaveBeenCalled();
    releaseSecond();
    expect(connector.disconnect).toHaveBeenCalledOnce();
  });

  it('连接、切换与清理均不关闭业务数据库', () => {
    const first = database('media-devtools-business-first');
    const second = database('media-devtools-business-second');
    const firstDisconnect = vi.spyOn(first, 'disconnectAll');
    const secondDisconnect = vi.spyOn(second, 'disconnectAll');
    const releaseFirst = connect(first);
    const releaseSecond = connect(second);
    releaseFirst();
    releaseSecond();
    expect(firstDisconnect).not.toHaveBeenCalled();
    expect(secondDisconnect).not.toHaveBeenCalled();
  });

  it('默认生产实现不访问连接器或业务数据库', () => {
    const db = database('media-devtools-production');
    const disconnectDatabase = vi.spyOn(db, 'disconnectAll');
    const release = connectProductionDevTools(db);
    release();
    release();
    expect(connector.get).not.toHaveBeenCalled();
    expect(connector.init).not.toHaveBeenCalled();
    expect(connector.disconnect).not.toHaveBeenCalled();
    expect(disconnectDatabase).not.toHaveBeenCalled();
  });
});
