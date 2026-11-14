import { getEntityMetadata, RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopDatabase, DESKTOP_ADAPTER, schemaGuardOf, tabSyncOf } from './desktop-database';
import { DesktopSchemaStaleError, SchemaGuard } from './schema-guard';
import { DESKTOP_SCHEMA_VERSION } from './schema-version';
import { TabSync } from './tab-sync';

const { init, getDevToolsConnector, opfsAvailable } = vi.hoisted(() => {
  const init = vi.fn();
  return { init, getDevToolsConnector: vi.fn(() => ({ init })), opfsAvailable: vi.fn(async () => false) };
});

vi.mock('@aiao/rxdb-devtools', () => ({ getDevToolsConnector }));
vi.mock('@aiao/utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/utils')>()),
  checkOPFSAvailable: opfsAvailable
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  opfsAvailable.mockResolvedValue(false);
});

describe('桌面数据库的开发工具', () => {
  it('生产环境不加载连接器，数据库仍保持尚未连接', async () => {
    vi.stubEnv('DEV', false);
    const database = createDesktopDatabase('/');
    try {
      await vi.dynamicImportSettled();
      expect(getDevToolsConnector).not.toHaveBeenCalled();
      expect(init).not.toHaveBeenCalled();
      expect(await firstValueFrom(database.adapterConnected$(DESKTOP_ADAPTER))).toBe(false);
    } finally {
      await database.destroy();
    }
  });

  it('开发环境把已初始化的桌面库与实体元数据接到连接器，不提前连接数据库', async () => {
    vi.stubEnv('DEV', true);
    const database = createDesktopDatabase('/');
    try {
      await vi.dynamicImportSettled();
      expect(getDevToolsConnector).toHaveBeenCalledExactlyOnceWith();
      expect(init).toHaveBeenCalledExactlyOnceWith(database, getEntityMetadata);
      expect(database.entityManager).toBeDefined();
      expect(await firstValueFrom(database.adapterConnected$(DESKTOP_ADAPTER))).toBe(false);
    } finally {
      await database.destroy();
    }
  });
});

describe('桌面数据库的写前守卫', () => {
  it('createDesktopDatabase 给每个库配一个守卫，schemaGuardOf 取到的始终是同一个', async () => {
    vi.stubEnv('DEV', false);
    const first = createDesktopDatabase('/');
    const second = createDesktopDatabase('/');
    try {
      expect(schemaGuardOf(first)).toBeInstanceOf(SchemaGuard);
      expect(schemaGuardOf(first)).toBe(schemaGuardOf(first));
      expect(schemaGuardOf(first)).not.toBe(schemaGuardOf(second));
    } finally {
      await first.destroy();
      await second.destroy();
    }
  });

  it('不是 createDesktopDatabase 建出来的库没有守卫：报错，而不是悄悄放行', () => {
    expect(() => schemaGuardOf({} as RxDB)).toThrow('不是 createDesktopDatabase 建的');
  });

  it('适配器的每次事务都先过守卫：另一个标签页已升级时拒绝写入，不进入真正的事务', async () => {
    vi.stubEnv('DEV', false);
    const database = createDesktopDatabase('/');
    const base = vi.spyOn(RxDBAdapterSqlite.prototype, 'transaction').mockResolvedValue('written' as never);
    try {
      const adapter = await database.getAdapter(DESKTOP_ADAPTER);
      schemaGuardOf(database).enable({
        readRecord: async () => ({ version: DESKTOP_SCHEMA_VERSION + 1, build: '', upgradedAt: 1 })
      } as never);

      await expect(adapter.transaction(async () => 'x')).rejects.toBeInstanceOf(DesktopSchemaStaleError);
      expect(base).not.toHaveBeenCalled();
    } finally {
      await database.destroy();
    }
  });

  it('守卫放行时原样交给基类的事务，事务日志开关也一并传下去', async () => {
    vi.stubEnv('DEV', false);
    const database = createDesktopDatabase('/');
    const base = vi.spyOn(RxDBAdapterSqlite.prototype, 'transaction').mockResolvedValue('written' as never);
    try {
      const adapter = await database.getAdapter(DESKTOP_ADAPTER);
      const task = async () => 'x';

      await expect(adapter.transaction(task)).resolves.toBe('written');
      expect(base).toHaveBeenLastCalledWith(task, true);
      await adapter.transaction(task, false);
      expect(base).toHaveBeenLastCalledWith(task, false);
    } finally {
      await database.destroy();
    }
  });
});

describe('桌面数据库的本地存储选择', () => {
  async function optionsFor(baseHref: string) {
    vi.stubEnv('DEV', false);
    const database = createDesktopDatabase(baseHref);
    try {
      return (await database.getAdapter(DESKTOP_ADAPTER)).options;
    } finally {
      await database.destroy();
    }
  }

  it('OPFS 不可用时回退到 IndexedDB，不起 Worker', async () => {
    const worker = vi.fn();
    vi.stubGlobal('Worker', worker);
    expect(await optionsFor('/desktop/')).toEqual({
      vfs: 'idb',
      wasmUrl: '/desktop/sqlite-wasm/wa-sqlite-async.wasm'
    });
    expect(worker).not.toHaveBeenCalled();
  });

  it('OPFS 可用时库文件落在 OPFS，由专用 Worker 打开并归调用方所有', async () => {
    opfsAvailable.mockResolvedValue(true);
    class FakeWorker {
      constructor(
        readonly url: URL,
        readonly options: WorkerOptions
      ) {}
    }
    vi.stubGlobal('Worker', FakeWorker);

    const options = await optionsFor('/desktop/');
    expect(options).toMatchObject({
      vfs: 'opfs',
      wasmUrl: '/desktop/sqlite-wasm/wa-sqlite.wasm',
      worker: true,
      workerOwnership: 'client'
    });
    const worker = options.workerInstance as unknown as FakeWorker;
    expect(worker).toBeInstanceOf(FakeWorker);
    expect(worker.url.pathname).toMatch(/\/sqlite-wasm\.worker$/);
    expect(worker.options).toEqual({ type: 'module', name: 'aiao-desktop-sqlite' });
  });
});

describe('桌面数据库的跨标签页协调', () => {
  it('createDesktopDatabase 给每个库配一个 TabSync，tabSyncOf 取到的始终是同一个', async () => {
    vi.stubEnv('DEV', false);
    const first = createDesktopDatabase('/');
    const second = createDesktopDatabase('/');
    try {
      expect(tabSyncOf(first)).toBeInstanceOf(TabSync);
      expect(tabSyncOf(first)).toBe(tabSyncOf(first));
      expect(tabSyncOf(first)).not.toBe(tabSyncOf(second));
    } finally {
      await first.destroy();
      await second.destroy();
    }
  });

  it('不是 createDesktopDatabase 建出来的库没有跨标签页协调：报错，而不是悄悄放行', () => {
    expect(() => tabSyncOf({} as RxDB)).toThrow('不是 createDesktopDatabase 建的');
  });
});
