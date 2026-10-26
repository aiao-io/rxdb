import {
  Entity,
  EntityBase,
  getEntityMetadata,
  getRxDBChangeKey,
  WorktreeTableSet,
  type IRxDBChange,
  type RxDB,
  type SwitchVersionActions
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { keep_table_set_actions, table_set_scope } from '../table-set-scope.js';

@Entity({ name: 'ScopeMember' })
class ScopeMember extends EntityBase {}

@Entity({ name: 'ScopeShared' })
class ScopeShared extends EntityBase {}

const rxdb = {
  schemaManager: {
    getEntityMetadata: (entity: string, namespace: string) =>
      [ScopeMember, ScopeShared]
        .map(EntityClass => getEntityMetadata(EntityClass))
        .find(metadata => metadata.name === entity && metadata.namespace === namespace)
  }
} as unknown as RxDB;

const shadow = WorktreeTableSet.of('wt_scope1', [ScopeMember]);
const keyOf = (EntityClass: typeof ScopeMember, id: string) => {
  const { namespace, name } = getEntityMetadata(EntityClass);
  return getRxDBChangeKey({ namespace, entity: name, entityId: id } as IRxDBChange);
};

// 记日志却不进影子表集的实体落回主表：挂在可写检出位上照写就改了主检出位的表（US-314 B2.1）
describe('table_set_scope', () => {
  it('主表集什么都管；影子表集只管成员，查不到元数据的不管', () => {
    const { namespace } = getEntityMetadata(ScopeMember);

    expect(table_set_scope(rxdb, WorktreeTableSet.MAIN)(namespace, 'Unknown')).toBe(true);
    expect(table_set_scope(rxdb, shadow)(namespace, 'ScopeMember')).toBe(true);
    expect(table_set_scope(rxdb, shadow)(namespace, 'ScopeShared')).toBe(false);
    expect(table_set_scope(rxdb, shadow)(namespace, 'Unknown')).toBe(false);
  });
});

describe('keep_table_set_actions', () => {
  const actions = (): SwitchVersionActions => ({
    inserts: new Map([
      [keyOf(ScopeMember, 'm1'), { patch: { id: 'm1' }, inversePatch: null }],
      [keyOf(ScopeShared, 's1'), { patch: { id: 's1' }, inversePatch: null }]
    ]),
    updates: new Map([[keyOf(ScopeShared, 's2'), { patch: { id: 's2' }, inversePatch: { id: 's2' } }]]),
    deletes: new Map([[keyOf(ScopeMember, 'm2'), { patch: null, inversePatch: { id: 'm2' } }]])
  });

  it('主表集原样返回', () => {
    const all = actions();
    expect(keep_table_set_actions(rxdb, all, WorktreeTableSet.MAIN)).toBe(all);
  });

  it('影子表集三类操作都只留成员', () => {
    const kept = keep_table_set_actions(rxdb, actions(), shadow);

    expect([...kept.inserts.keys()]).toEqual([keyOf(ScopeMember, 'm1')]);
    expect([...kept.updates.keys()]).toEqual([]);
    expect([...kept.deletes.keys()]).toEqual([keyOf(ScopeMember, 'm2')]);
  });
});
