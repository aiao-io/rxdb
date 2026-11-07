import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { ENTITIES } from './asset-entities';
import { findWorkbenchEntity, visibleEntityEntries } from './entity-registry';

@Entity({
  name: 'HiddenThing',
  namespace: 'secret',
  tableName: 'hidden_thing',
  displayName: '隐藏实体',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class HiddenThing extends EntityBase {
  title!: string;
}

describe('entity-registry', () => {
  it('只给出工作台命名空间内的实体，且按命名空间与名称排序', () => {
    const entries = visibleEntityEntries([...ENTITIES, HiddenThing]);
    expect(entries).toEqual([
      { namespace: 'assets', name: 'Asset', displayName: '资产' },
      { namespace: 'assets', name: 'AssetCategory', displayName: '资产分类' },
      { namespace: 'assets', name: 'AssetEvent', displayName: '维护记录' }
    ]);
  });

  it('findWorkbenchEntity 命中可见实体，未注册实体返回 null', () => {
    expect(findWorkbenchEntity(ENTITIES, 'assets', 'Asset')).toBe(ENTITIES[1]);
    expect(findWorkbenchEntity(ENTITIES, 'assets', 'Nope')).toBeNull();
  });

  it('findWorkbenchEntity 对非工作台命名空间的实体返回 null', () => {
    expect(findWorkbenchEntity([HiddenThing], 'secret', 'HiddenThing')).toBeNull();
  });

  it('替换可见命名空间后，导航和实体路由查找使用同一份配置', () => {
    const entities = [...ENTITIES, HiddenThing];
    const namespaces = ['secret'];
    expect(visibleEntityEntries(entities, namespaces)).toEqual([
      { namespace: 'secret', name: 'HiddenThing', displayName: '隐藏实体' }
    ]);
    expect(findWorkbenchEntity(entities, 'secret', 'HiddenThing', namespaces)).toBe(HiddenThing);
    expect(findWorkbenchEntity(entities, 'assets', 'Asset', namespaces)).toBeNull();
  });
});
