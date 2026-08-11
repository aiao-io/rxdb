import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../entity/entity-base.js';
import { Entity } from '../entity/entity.decorator.js';
import { EntityType } from '../entity/entity.interface.js';
import { PropertyType, SyncType } from '../entity/metadata-options.interface.js';
import { IRxDBAdapter } from '../rxdb-adapter.js';
import { RxDBOptions } from '../rxdb.interface.js';
import { RxDB } from '../RxDB.js';
import { RxDBBranch } from '../system/branch.js';
import { RxDBChange } from '../system/change.js';
import { RxDBMigration } from '../system/migration.js';
import { RxDBSync } from '../system/sync.js';

const createMockAdapter = (): IRxDBAdapter =>
  ({
    name: 'mock-adapter',
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    version: vi.fn().mockResolvedValue('1.0.0'),
    isTableExisted: vi.fn().mockResolvedValue(false),
    createTables: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue({}),
    saveMany: vi.fn().mockResolvedValue([]),
    removeMany: vi.fn().mockResolvedValue([]),
    mutations: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    transaction: vi.fn(),
    getRepository: vi.fn().mockReturnValue({
      find: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn()
    })
  }) as unknown as IRxDBAdapter;

@Entity({
  name: 'FreezeProbeUser',
  properties: [{ name: 'name', type: PropertyType.string }]
})
class FreezeProbeUser extends EntityBase {
  name!: string;
}

/**
 * 构造函数冻结 `config` 时，有三处**不能**波及的目标：
 *
 * 1. `config.entities` 是注册表而非静态配置 —— `SchemaManager.init()` 还要往里登记
 *    内建实体（RxDBBranch / RxDBChange / RxDBMigration / RxDBSync）、`entityGenerator`
 *    产出的 Repository 实体与多对多中间表；
 * 2. `entities` 里装的是实体**构造器** —— `EntityManager.init()` 还要往它们的
 *    prototype 上挂 `ENTITY_MANAGER`，冻住 prototype 会让每次 `new Entity()` 都抛
 *    `need init rxdb`；
 * 3. `config.migrations` 里的 `up` / `down` 是调用方的**回调** —— 深冻结会把函数自身的
 *    属性一起冻住（闭包状态、测试替身的调用记录），首次调用即抛 `object is not extensible`。
 *
 * 这三条是 deepFreeze 从「只冻纯对象子树」放宽到「冻整棵可达树」之后暴露出来的，
 * 因此在 rxdb 侧用契约测试锁死。
 */
describe('RxDB 配置冻结边界', () => {
  let options: RxDBOptions;
  let rxdb: RxDB;

  beforeAll(() => {
    options = {
      dbName: 'config-freeze',
      entities: [FreezeProbeUser] as EntityType[],
      sync: {
        local: { adapter: 'mock' },
        type: SyncType.None
      }
    };
    rxdb = new RxDB(options);
    rxdb.adapter('mock', createMockAdapter);
    rxdb.init();
  });

  it('entities 注册表保持可写，内建实体能被登记进去', () => {
    expect(Object.isFrozen(rxdb.config.entities)).toBe(false);
    expect(rxdb.config.entities).toContain(RxDBBranch);
    expect(rxdb.config.entities).toContain(RxDBChange);
    expect(rxdb.config.entities).toContain(RxDBMigration);
    expect(rxdb.config.entities).toContain(RxDBSync);
  });

  it('实体构造器与其 prototype 不被冻结', () => {
    expect(Object.isFrozen(FreezeProbeUser)).toBe(false);
    expect(Object.isFrozen(FreezeProbeUser.prototype)).toBe(false);
    expect(() => new FreezeProbeUser()).not.toThrow();
  });

  it('migrations 回调不被深冻结，函数自身的属性仍可写', () => {
    const up = Object.assign(async () => undefined, { invoked: [] as string[] });
    const probe = new RxDB({
      dbName: 'config-freeze-migrations',
      entities: [] as EntityType[],
      migrations: [{ name: 'probe', up, down: async () => undefined }],
      sync: {
        local: { adapter: 'mock' },
        type: SyncType.None
      }
    });

    expect(Object.isFrozen(probe.config.migrations)).toBe(false);
    expect(() => up.invoked.push('called')).not.toThrow();
  });

  it('声明式配置仍然深冻结', () => {
    expect(Object.isFrozen(rxdb.config)).toBe(true);
    expect(Object.isFrozen(rxdb.config.sync)).toBe(true);
    expect(Object.isFrozen(rxdb.config.sync.local)).toBe(true);
  });

  // 构造函数原地改名并冻结调用方对象：模块级常量 RXDB_OPTIONS 被多次 new 是很自然的写法
  // （测试工具、多工作区应用、SSR），第二次构造会在给已冻结的 dbName 赋值时抛 TypeError。
  it('同一个 options 对象可以构造多个实例', () => {
    const shared: RxDBOptions = {
      dbName: 'config-reuse',
      entities: [] as EntityType[],
      sync: { local: { adapter: 'mock' }, type: SyncType.None }
    };

    const first = new RxDB(shared);
    expect(() => new RxDB(shared)).not.toThrow();
    expect(first.config.dbName).toBe(new RxDB(shared).config.dbName);
  });

  it('不就地修改也不冻结调用方持有的 options 对象', () => {
    const caller: RxDBOptions = {
      dbName: 'config-no-side-effect',
      entities: [] as EntityType[],
      sync: { local: { adapter: 'mock' }, type: SyncType.None }
    };

    const probe = new RxDB(caller);

    expect(caller.dbName).toBe('config-no-side-effect');
    expect(Object.isFrozen(caller)).toBe(false);
    expect(probe.config.dbName).not.toBe(caller.dbName);
    expect(probe.config).not.toBe(caller);
  });
});
