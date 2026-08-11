import { getEntityMetadata, type EntityType, type RxDB } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { StorageFileMeta } from '../file-meta.entity.js';
import { RxDBPluginStorage, rxDBPluginStorage } from '../plugin.js';
import type { RxdbFileStorage } from '../storage.service.js';

interface StoragePluginRxDBStub {
  config: {
    dbName: string;
    entities: EntityType[];
    sync: { local?: { adapter: string } };
  };
  connect: ReturnType<typeof vi.fn>;
  storage?: RxdbFileStorage;
}

const createRxDBStub = (localAdapter: string | null = 'sqlite'): StoragePluginRxDBStub => ({
  config: {
    dbName: 'storage-plugin-test',
    entities: [],
    sync: localAdapter ? { local: { adapter: localAdapter } } : {}
  },
  connect: vi.fn().mockResolvedValue(undefined)
});

const asRxDB = (rxdb: StoragePluginRxDBStub): RxDB => rxdb as unknown as RxDB;

describe('RxDBPluginStorage', () => {
  it('should attach storage service to rxdb instance', () => {
    const rxdb = createRxDBStub();
    const plugin = new RxDBPluginStorage(asRxDB(rxdb));

    expect(plugin.name).toBe('storage');
    expect(rxdb.storage).toBeDefined();
  });

  it('should register StorageFileMeta entity only once', () => {
    const rxdb = createRxDBStub();
    const plugin = new RxDBPluginStorage(asRxDB(rxdb));
    plugin.install();
    plugin.install();

    expect(rxdb.config.entities.filter(entity => entity === StorageFileMeta)).toHaveLength(1);
  });

  it('should not attach storage twice on the same rxdb instance', () => {
    const rxdb = createRxDBStub();
    const plugin1 = new RxDBPluginStorage(asRxDB(rxdb));
    const storage1 = rxdb.storage;
    const plugin2 = new RxDBPluginStorage(asRxDB(rxdb));

    expect(rxdb.storage).toBe(storage1);
    expect(plugin1.storage).toBe(plugin2.storage);
  });

  it('should not destroy shared storage from a duplicate plugin instance', () => {
    const rxdb = createRxDBStub();
    const owner = new RxDBPluginStorage(asRxDB(rxdb));
    const duplicate = new RxDBPluginStorage(asRxDB(rxdb));
    const destroySpy = vi.spyOn(owner.storage, 'destroy');

    duplicate.destroy();
    expect(destroySpy).not.toHaveBeenCalled();

    owner.destroy();
    expect(destroySpy).toHaveBeenCalledOnce();
  });

  it('should be no-op install when no local adapter', () => {
    const rxdb = createRxDBStub(null);
    const plugin = new RxDBPluginStorage(asRxDB(rxdb));
    plugin.install();

    expect(rxdb.config.entities).toContain(StorageFileMeta);
  });

  it('should clean up storage service on destroy', () => {
    const rxdb = createRxDBStub();
    const plugin = new RxDBPluginStorage(asRxDB(rxdb));
    const destroySpy = vi.spyOn(plugin.storage, 'destroy');

    plugin.destroy();

    expect(destroySpy).toHaveBeenCalled();
  });

  it('should not mutate shared entity metadata across rxdb instances', () => {
    const metadata = getEntityMetadata(StorageFileMeta);
    const syncBeforeInstall = metadata.sync;
    const sqlitePlugin = new RxDBPluginStorage(asRxDB(createRxDBStub('sqlite')));
    const pglitePlugin = new RxDBPluginStorage(asRxDB(createRxDBStub('pglite')));

    sqlitePlugin.install();
    pglitePlugin.install();

    expect(getEntityMetadata(StorageFileMeta).sync).toBe(syncBeforeInstall);
  });

  it('should detach owned storage so the rxdb instance can install a fresh service', async () => {
    const rxdb = createRxDBStub();
    const owner = new RxDBPluginStorage(asRxDB(rxdb));
    const firstStorage = owner.storage;

    await owner.destroy();
    const replacement = new RxDBPluginStorage(asRxDB(rxdb));

    expect(replacement.storage).not.toBe(firstStorage);
    expect(rxdb.storage).toBe(replacement.storage);
  });

  it('should work as a plugin factory function', () => {
    const rxdb = createRxDBStub();
    const plugin = rxDBPluginStorage(asRxDB(rxdb));

    expect(plugin).toBeInstanceOf(RxDBPluginStorage);
    expect(plugin.name).toBe('storage');
  });
});
