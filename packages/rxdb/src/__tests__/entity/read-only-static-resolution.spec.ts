/**
 * @fileoverview 只读实例不跟可写实例抢共用类的静态解析（US-313）。
 *
 * @remarks
 * 核心系统实体（`RxDBBranch` 等）是模块级的类，每个实例都会登记。只读检出位一打开，主实例上
 * `RxDBBranch.find()` 这类静态调用——三端查询 hook 走的都是它——就撞上「多实例」报错，
 * 分支列表在检出位开着的时候刷新一下就挂。只读实例是可写实例旁边的视图：同一个类同时挂在两者上时，
 * 静态调用指的是可写的那个。两个可写实例共用一个类照旧报错，那是真的有歧义。
 */

import { describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { RxDB } from '../../RxDB.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

@Entity({
  name: 'SharedAcrossInstances',
  properties: [{ name: 'name', type: PropertyType.string }]
})
class SharedAcrossInstances extends EntityBase {
  name!: string;
}

const { trackRxDB } = registerRxDBTeardown();
let sequence = 0;

/** 造一个只登记了 {@link SharedAcrossInstances} 的实例，`init()` 之后交回它与它的替身仓库。 */
const createInstance = (readOnly: boolean) => {
  sequence += 1;
  const instance = trackRxDB(
    new RxDB({
      dbName: `read-only-static-resolution-${sequence}`,
      entities: [SharedAcrossInstances] as EntityType[],
      readOnly,
      sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
    })
  );
  const adapter = createMockAdapter(instance);
  const repository = {
    find: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn(async <T>(entity: T) => entity),
    update: vi.fn(async <T>(entity: T) => entity),
    remove: vi.fn(async <T>(entity: T) => entity)
  };
  adapter.getRepository.mockReturnValue(repository as never);
  instance.adapter('sqlite', () => adapter);
  instance.init();
  return { instance, repository };
};

const allRows = { where: { combinator: 'and' as const, rules: [] } };

describe('同一个类同时挂在只读实例与可写实例上', () => {
  it('静态调用落到可写的那个：先建的是哪个都一样', () => {
    const readOnly = createInstance(true);
    const writable = createInstance(false);
    const writableConfig = vi.spyOn(writable.instance, 'getRepositoryConfig');
    const readOnlyConfig = vi.spyOn(readOnly.instance, 'getRepositoryConfig');

    expect(() => SharedAcrossInstances.findAll(allRows)).not.toThrow();

    expect(writableConfig).toHaveBeenCalled();
    expect(readOnlyConfig).not.toHaveBeenCalled();
  });

  it('new 出来的实体归可写实例：保存落在它的仓库上', async () => {
    const writable = createInstance(false);
    const readOnly = createInstance(true);

    const entity = new SharedAcrossInstances();
    entity.name = 'main';
    await entity.save();

    expect(writable.repository.create).toHaveBeenCalledWith(entity);
    expect(readOnly.repository.create).not.toHaveBeenCalled();
  });

  it('两个都可写：照旧报多实例', () => {
    createInstance(false);
    createInstance(false);
    createInstance(true);

    expect(() => SharedAcrossInstances.findAll(allRows)).toThrow(/multiple RxDB instances/);
  });

  it('两个都只读：没有可写的那个可指，照旧报多实例', () => {
    createInstance(true);
    createInstance(true);

    expect(() => SharedAcrossInstances.findAll(allRows)).toThrow(/multiple RxDB instances/);
  });

  it('只有一个只读实例：照常解析到它', () => {
    const only = createInstance(true);
    const config = vi.spyOn(only.instance, 'getRepositoryConfig');

    expect(() => SharedAcrossInstances.findAll(allRows)).not.toThrow();
    expect(config).toHaveBeenCalled();
  });
});
