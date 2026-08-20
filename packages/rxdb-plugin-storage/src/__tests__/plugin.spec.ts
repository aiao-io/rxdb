import { getEntityMetadata, type EntityType, type RxDB } from '@aiao/rxdb';
import { LifecycleScope } from '@aiao/utils';
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

/** 建插件并把它装进一个独立作用域，返回作用域以便用例自己决定何时释放。 */
const install = (rxdb: StoragePluginRxDBStub): { plugin: RxDBPluginStorage; scope: LifecycleScope } => {
  const plugin = new RxDBPluginStorage(asRxDB(rxdb));
  const scope = new LifecycleScope('storage-plugin-test');
  plugin.install(scope);
  return { plugin, scope };
};

describe('RxDBPluginStorage', () => {
  it('should attach storage service to rxdb instance', () => {
    const rxdb = createRxDBStub();
    const { plugin } = install(rxdb);

    expect(plugin.name).toBe('storage');
    expect(plugin.storage).toBeDefined();
    expect(rxdb.storage).toBe(plugin.storage);
  });

  it('should register StorageFileMeta entity once per rxdb instance', () => {
    const rxdb = createRxDBStub();
    install(rxdb);
    install(rxdb);

    expect(rxdb.config.entities.filter(entity => entity === StorageFileMeta)).toHaveLength(1);
  });

  it('should not attach storage twice on the same rxdb instance', () => {
    const rxdb = createRxDBStub();
    const { plugin: owner } = install(rxdb);
    const { plugin: duplicate } = install(rxdb);

    expect(rxdb.storage).toBe(owner.storage);
    // 重复实例什么都没装，因此也没有自己的服务可暴露
    expect(duplicate.storage).toBeUndefined();
  });

  it('should not destroy shared storage from a duplicate plugin instance', async () => {
    const rxdb = createRxDBStub();
    const { plugin: owner, scope: ownerScope } = install(rxdb);
    const { scope: duplicateScope } = install(rxdb);
    if (!owner.storage) throw new Error('owner storage missing');
    const destroySpy = vi.spyOn(owner.storage, 'destroy');

    await duplicateScope.dispose();
    expect(destroySpy).not.toHaveBeenCalled();
    expect(rxdb.storage).toBeDefined();

    await ownerScope.dispose();
    expect(destroySpy).toHaveBeenCalledOnce();
  });

  it('should be no-op install when no local adapter', () => {
    const rxdb = createRxDBStub(null);
    install(rxdb);

    expect(rxdb.config.entities).toContain(StorageFileMeta);
  });

  it('should release service, property and entity on scope dispose', async () => {
    const rxdb = createRxDBStub();
    const { plugin, scope } = install(rxdb);
    if (!plugin.storage) throw new Error('storage missing');
    const destroySpy = vi.spyOn(plugin.storage, 'destroy');

    await scope.dispose();

    expect(destroySpy).toHaveBeenCalledOnce();
    expect(plugin.storage).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(rxdb, 'storage')).toBe(false);
    expect(rxdb.config.entities).not.toContain(StorageFileMeta);
  });

  it('should leave a pre-registered StorageFileMeta in place on dispose', async () => {
    const rxdb = createRxDBStub();
    rxdb.config.entities.push(StorageFileMeta);
    const { scope } = install(rxdb);

    await scope.dispose();

    // 不是我们放进去的，就不该由我们摘走
    expect(rxdb.config.entities).toContain(StorageFileMeta);
  });

  it('should not mutate shared entity metadata across rxdb instances', () => {
    const metadata = getEntityMetadata(StorageFileMeta);
    const syncBeforeInstall = metadata.sync;

    install(createRxDBStub('sqlite'));
    install(createRxDBStub('pglite'));

    expect(getEntityMetadata(StorageFileMeta).sync).toBe(syncBeforeInstall);
  });

  it('should detach owned storage so the rxdb instance can install a fresh service', async () => {
    const rxdb = createRxDBStub();
    const { plugin: owner, scope } = install(rxdb);
    const firstStorage = owner.storage;

    await scope.dispose();
    const { plugin: replacement } = install(rxdb);

    expect(replacement.storage).toBeDefined();
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
