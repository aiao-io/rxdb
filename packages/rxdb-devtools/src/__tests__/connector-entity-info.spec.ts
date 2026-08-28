/**
 * @fileoverview 实体注册表的失效判定与缓存契约。
 *
 * @remarks
 * `config.entities` 是**活数组**：`SchemaManager.init()` 补系统实体、插件 `install()`
 * push 自己的实体、`disconnectAll()` 的作用域回收又把它 splice 掉。连接器过去在
 * `init()` 拍一张快照就再也不更新，于是「先 devtools 后 RxDB.init」的应用连
 * `RxDBBranch` 都看不见。本 spec 锁住注册表跟随该数组的行为。
 */
import type { EntityType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { createEntityRegistry } from '../connector-entity-info.js';
import type { GetEntityMetadataFn } from '../connector-types.js';
import { createMockRxDB } from './fixtures/mock-rxdb.js';

class Alpha {}
class Beta {}
class Gamma {}

/** 三个实体各自的元数据；未登记的类返回 `undefined`（探测语义）。 */
const metadataOf: GetEntityMetadataFn = entity => {
  if (entity === Alpha) return { name: 'Alpha', namespace: 'a', encryptedPropertyMap: new Map([['ssn', true]]) };
  if (entity === Beta) return { name: 'Beta', namespace: 'b' };
  if (entity === Gamma) return { name: 'Gamma', namespace: 'c', encryptedPropertyMap: new Map([['token', true]]) };
  return undefined;
};

/** 造一个只关心 `config.entities` 的夹具，并把该数组原样交回给用例操作。 */
function createRegistryFixture(initial: EntityType[]) {
  const rxdb = createMockRxDB({ config: { entities: initial } });
  const getMetadata = vi.fn(metadataOf);
  return { rxdb, getMetadata, entities: rxdb.config.entities };
}

describe('createEntityRegistry', () => {
  it('首次 sync 反映当前 config.entities', () => {
    const { rxdb, getMetadata } = createRegistryFixture([Alpha]);
    const registry = createEntityRegistry(rxdb, getMetadata);

    const index = registry.sync();

    expect(index.entityInfo).toEqual([{ name: 'Alpha', namespace: 'a', encryptedFields: ['ssn'], entityType: Alpha }]);
    expect(index.entityTypeMap.get('a:Alpha')).toBe(Alpha);
    expect(index.encryptedFieldsMap.get('a:Alpha')).toEqual(['ssn']);
  });

  it('init 之后 push 进来的实体必须可见（插件实体 / 系统实体的真实时序）', () => {
    const { rxdb, getMetadata, entities } = createRegistryFixture([Alpha]);
    const registry = createEntityRegistry(rxdb, getMetadata);
    registry.sync();

    entities.push(Beta);

    const index = registry.sync();
    expect(index.entityTypeMap.get('b:Beta')).toBe(Beta);
    expect(index.entityInfo.map(info => info.name)).toEqual(['Alpha', 'Beta']);
  });

  it('被 splice 掉的实体必须消失（disconnectAll 的作用域回收）', () => {
    const { rxdb, getMetadata, entities } = createRegistryFixture([Alpha, Beta]);
    const registry = createEntityRegistry(rxdb, getMetadata);
    registry.sync();

    entities.splice(entities.indexOf(Beta), 1);

    const index = registry.sync();
    expect(index.entityTypeMap.has('b:Beta')).toBe(false);
    expect(index.encryptedFieldsMap.has('b:Beta')).toBe(false);
  });

  it('数组未变时不重算：返回同一对象，且不再调用 getEntityMetadata', () => {
    const { rxdb, getMetadata } = createRegistryFixture([Alpha, Beta]);
    const registry = createEntityRegistry(rxdb, getMetadata);

    const first = registry.sync();
    const callsAfterFirst = getMetadata.mock.calls.length;
    const second = registry.sync();

    expect(second).toBe(first);
    expect(getMetadata.mock.calls.length).toBe(callsAfterFirst);
  });

  it('长度不变但内容已换时必须重算（先 push 后 splice 的同步段）', () => {
    const { rxdb, getMetadata, entities } = createRegistryFixture([Alpha, Beta]);
    const registry = createEntityRegistry(rxdb, getMetadata);
    registry.sync();

    // 一次同步段内两件事都发生：插件 push 了 Gamma，另一处把 Beta 摘走。
    // 长度回到 2 —— 只比长度的实现会在这里静默返回过期索引。
    entities.push(Gamma);
    entities.splice(entities.indexOf(Beta), 1);

    const index = registry.sync();
    expect(index.entityTypeMap.has('c:Gamma')).toBe(true);
    expect(index.entityTypeMap.has('b:Beta')).toBe(false);
  });

  it('没有元数据的类被跳过，不进索引', () => {
    class Undecorated {}
    const { rxdb, getMetadata } = createRegistryFixture([Alpha, Undecorated]);
    const registry = createEntityRegistry(rxdb, getMetadata);

    const index = registry.sync();

    expect(index.entityInfo).toHaveLength(1);
    expect(index.entityInfo[0]?.name).toBe('Alpha');
  });
});
