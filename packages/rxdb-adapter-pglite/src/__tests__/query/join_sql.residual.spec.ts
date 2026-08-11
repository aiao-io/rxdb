import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, RxDB, SyncType } from '@aiao/rxdb';
import { TypeDemo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build_rule_group_join_pg } from '../../query/join_sql.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

@Entity({
  name: 'JoinResidualParent',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'related',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'JoinResidualChild',
      mappedProperty: 'parents'
    }
  ]
})
class JoinResidualParent extends EntityBase {}

@Entity({
  name: 'JoinResidualChild',
  properties: [
    { name: 'title', type: PropertyType.string },
    {
      name: 'metadata',
      type: PropertyType.keyValue,
      properties: [{ name: 'value', type: PropertyType.string, columnName: 'value' } as never]
    }
  ]
})
class JoinResidualChild extends EntityBase {}

describe('join_sql residual', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `join-residual-${Date.now()}`,
      entities: [TypeDemo, JoinResidualParent, JoinResidualChild],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  it('covers invalid json path, nested json, unknown fallthrough and relation flatmap', () => {
    const meta = getEntityMetadata(TypeDemo);

    expect(() =>
      build_rule_group_join_pg(adapter, meta, {
        combinator: 'and',
        rules: [{ field: 'keyValue.bad path', operator: '=', value: 'x' }]
      })
    ).toThrow(/Invalid JSON path/);

    const nested = build_rule_group_join_pg(adapter, meta, {
      combinator: 'and',
      rules: [{ field: 'json.a.b', operator: '=', value: '1' }]
    });
    expect(nested.fieldAliasMap.get('json.a.b')?.text).toContain('#>>');
    // PGL-006：同一路径同时给出 jsonb 形态，数值比较才有非文本操作数可用
    expect(nested.fieldAliasMap.get('json.a.b')?.jsonb).toContain('#>');

    const single = build_rule_group_join_pg(adapter, meta, {
      combinator: 'and',
      rules: [{ field: 'keyValue.string', operator: '=', value: 's' }]
    });
    expect(single.fieldAliasMap.get('keyValue.string')?.text).toContain('->>');

    // 非关系点字段会落入 try_process_relation_flatmap（L403）。
    const fallthrough = build_rule_group_join_pg(adapter, meta, {
      combinator: 'and',
      rules: [{ field: 'unknown.prop', operator: '=', value: 'z' }]
    });
    expect(fallthrough.fieldAliasMap.has('unknown.prop')).toBe(false);

    // 关系字段 + 嵌套 keyValue 经过 process_dotted_field。
    const parentMeta = getEntityMetadata(JoinResidualParent);
    const flat = build_rule_group_join_pg(adapter, parentMeta, {
      combinator: 'and',
      rules: [{ field: 'related.metadata.value', operator: '=', value: 'v' }]
    });
    expect(flat.fieldAliasMap.get('related.metadata.value')?.text).toContain('->>');
  });
});
