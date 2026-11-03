import { getEntityMetadata, RxDB, SyncType, type EntityType, type IRxDBPlugin } from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { P2PFileManifestEntity } from './p2p-file-manifest.entity.js';
import { RxDBPluginP2PFiles, rxDBPluginP2PFiles } from './plugin.js';

const databases: RxDB[] = [];
let sequence = 0;

const createDatabase = (entities: EntityType[] = []): RxDB => {
  sequence += 1;
  const database = new RxDB({
    dbName: `p2p-files-plugin-${sequence}`,
    entities,
    multiInstance: false,
    sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
  });
  databases.push(database);
  return database;
};

/** 作用域释放是串行 `await` 链，让出一个宏任务后排在前面的撤销条目才跑完。 */
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map(database => database.destroy()));
});

describe('P2P 文件插件', () => {
  it('use() 时把清单实体登记进本实例配置，init() 绑定到本实例', () => {
    const db = createDatabase();
    db.use(rxDBPluginP2PFiles);
    expect(db.config.entities).toContain(P2PFileManifestEntity as unknown as EntityType);
    db.init();
    const manifest = new P2PFileManifestEntity();
    expect(db.entityManager.hasEntityRef(P2PFileManifestEntity, manifest.id)).toBe(true);
  });

  it('init() 失败后在上一纪元释放未完成时重试，实体照样绑定', async () => {
    const db = createDatabase();
    let releaseSlow: (() => void) | undefined;
    let releases = 0;
    /** 只有第一纪元的撤销卡住，模拟重试时上一纪元还没释放完。 */
    const slowRelease = (): IRxDBPlugin => ({
      name: 'slowRelease',
      lifecycle: 'scoped',
      install: scope => {
        scope.acquire(
          () => () => {
            releases += 1;
            return releases === 1 ? new Promise<void>(resolve => (releaseSlow = resolve)) : undefined;
          },
          'slow-release'
        );
      }
    });
    db.use(slowRelease);
    db.use(rxDBPluginP2PFiles);
    vi.spyOn(db.schemaManager, 'init').mockImplementationOnce(() => {
      throw new Error('schema boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => db.init()).toThrow('schema boom');
    await tick();
    db.init();

    expect(releaseSlow).toBeDefined();
    expect(() => new P2PFileManifestEntity()).not.toThrow();
    releaseSlow?.();
    await tick();
  });

  it('init() 之后才 use() 时直接报错，而不是留下一个没绑定、没建表的实体', () => {
    const db = createDatabase();
    db.init();
    expect(() => db.use(rxDBPluginP2PFiles)).toThrow(/before connect\(\)/);
    expect(db.config.entities).not.toContain(P2PFileManifestEntity as unknown as EntityType);
  });

  it('上一个实例断连后，下一个实例独占清单实体', async () => {
    const first = createDatabase();
    first.use(rxDBPluginP2PFiles);
    first.init();
    await first.disconnectAll();

    const second = createDatabase();
    second.use(rxDBPluginP2PFiles);
    second.init();

    const manifest = new P2PFileManifestEntity();
    expect(second.entityManager.hasEntityRef(P2PFileManifestEntity, manifest.id)).toBe(true);
  });

  it('不重复登记宿主预先配置的实体，并提供插件工厂', () => {
    const db = createDatabase([P2PFileManifestEntity as unknown as EntityType]);
    db.use(rxDBPluginP2PFiles);
    expect(db.config.entities.filter(entity => entity === P2PFileManifestEntity)).toHaveLength(1);
    expect(db.getPlugins('p2pFiles')[0]).toBeInstanceOf(RxDBPluginP2PFiles);
  });

  it('实体元数据保留清单索引，可选列允许为空', () => {
    const metadata = getEntityMetadata(P2PFileManifestEntity);
    expect(metadata.name).toBe('P2PFileManifest');
    expect(metadata.indexes.map(index => index.name)).toEqual(
      expect.arrayContaining(['content_hash', 'content_holder', 'updated_at'])
    );
    expect(metadata.propertyMap.get('sourceUrl')?.nullable).toBe(true);
    expect(metadata.propertyMap.has('expiresAt')).toBe(false);
  });
});
