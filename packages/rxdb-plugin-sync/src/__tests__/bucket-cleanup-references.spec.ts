/**
 * @fileoverview 分区清理的引用检查（评审 M1）：哪些外键会挡住删被引用的行，哪些本地行还被引用着
 */
import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind, type TransactionExecutor } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { blockingForeignKeysTo, findBlockingReferences } from '../bucket-cleanup-references.js';

@Entity({
  name: 'RefParent',
  properties: [{ name: 'code', type: PropertyType.string, unique: true }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RefParent',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
class RefParent extends EntityBase {
  code!: string;
}

/** 非空多对一：默认 `RESTRICT` */
@Entity({
  name: 'RefRestrict',
  properties: [],
  relations: [{ name: 'owner', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'RefParent', mappedProperty: 'refs' }]
})
class RefRestrict extends EntityBase {}

/** 可空多对一：默认 `SET NULL`，数据库自己处理 */
@Entity({
  name: 'RefNullable',
  properties: [],
  relations: [
    { name: 'owner', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'RefParent', mappedProperty: 'refs', nullable: true }
  ]
})
class RefNullable extends EntityBase {}

/** 显式 `CASCADE`：数据库自己处理 */
@Entity({
  name: 'RefCascade',
  properties: [],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RefParent',
      mappedProperty: 'refs',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
class RefCascade extends EntityBase {}

/** 实体级外键没写动作：建表不带 `ON DELETE`，就是 `NO ACTION` */
@Entity({
  name: 'RefComposite',
  properties: [{ name: 'parentCode', type: PropertyType.string }],
  foreignKeys: [
    { name: 'parentByCode', properties: ['parentCode'], mappedEntity: 'RefParent', mappedProperties: ['code'] }
  ]
})
class RefComposite extends EntityBase {
  parentCode!: string;
}

/** 别的命名空间里引用同名实体：指向的是那个命名空间的 `RefParent`，不是这一个 */
@Entity({
  name: 'RefElsewhere',
  namespace: 'tenant',
  properties: [],
  relations: [{ name: 'owner', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'RefParent', mappedProperty: 'refs' }]
})
class RefElsewhere extends EntityBase {}

const PARENT = { namespace: 'public', entity: 'RefParent' };
const ENTITIES = [RefParent, RefRestrict, RefNullable, RefCascade, RefComposite, RefElsewhere];

/** 只认 `in` 与 `=` 的事务替身：每个实体一张内存表 */
function executorWith(tables: Map<unknown, Record<string, unknown>[]>): TransactionExecutor {
  type Rule = { field?: string; operator?: string; value?: unknown; combinator?: string; rules?: Rule[] };
  const matches = (row: Record<string, unknown>, rule: Rule): boolean => {
    if (rule.rules) {
      const results = rule.rules.map(inner => matches(row, inner));
      return rule.combinator === 'or' ? results.some(Boolean) : results.every(Boolean);
    }
    const actual = row[rule.field!];
    if (rule.operator === 'in') return (rule.value as unknown[]).includes(actual);
    return actual === rule.value;
  };
  return {
    getRepository: vi.fn((EntityType: unknown) => ({
      find: vi.fn(async ({ where }: { where: Rule }) =>
        (tables.get(EntityType) ?? []).filter(row => matches(row, where))
      )
    }))
  } as unknown as TransactionExecutor;
}

describe('blockingForeignKeysTo', () => {
  it('只收删父行会失败的外键：RESTRICT、没写动作的实体级外键，以及指向自己的同类；SET NULL / CASCADE / 别的命名空间不算', () => {
    const foreignKeys = blockingForeignKeysTo(ENTITIES, PARENT);

    expect(
      foreignKeys.map(({ repository, properties, mappedProperties }) => ({ repository, properties, mappedProperties }))
    ).toEqual([
      { repository: { namespace: 'public', entity: 'RefRestrict' }, properties: ['ownerId'], mappedProperties: ['id'] },
      {
        repository: { namespace: 'public', entity: 'RefComposite' },
        properties: ['parentCode'],
        mappedProperties: ['code']
      }
    ]);
  });
});

describe('findBlockingReferences', () => {
  const candidate = (id: string, code: string) => ({ entityId: `stored:${id}`, entity: { id, code } });

  it('按关系外键与实体级外键找出还被引用的行，记下是谁在引用', async () => {
    const executor = executorWith(
      new Map<unknown, Record<string, unknown>[]>([
        [RefRestrict, [{ id: 'r1', ownerId: 'p1' }]],
        [RefComposite, [{ id: 'c1', parentCode: 'P-2' }]]
      ])
    );

    const blocked = await findBlockingReferences(executor, PARENT, blockingForeignKeysTo(ENTITIES, PARENT), [
      candidate('p1', 'P-1'),
      candidate('p2', 'P-2'),
      candidate('p3', 'P-3')
    ]);

    expect([...blocked]).toEqual([
      ['stored:p1', [{ namespace: 'public', entity: 'RefRestrict' }]],
      ['stored:p2', [{ namespace: 'public', entity: 'RefComposite' }]]
    ]);
  });

  it('一行引用自己不算被引用：删掉它，引用跟着没了', async () => {
    const selfRestrict = [{ EntityType: RefParent, repository: PARENT, properties: ['id'], mappedProperties: ['id'] }];
    const executor = executorWith(new Map([[RefParent, [{ id: 'p1' }]]]));

    const blocked = await findBlockingReferences(executor, PARENT, selfRestrict, [candidate('p1', 'P-1')]);

    expect(blocked.size).toBe(0);
  });

  it('被引用的值为空时不查：外键按 MATCH SIMPLE 不检查空值', async () => {
    const executor = executorWith(new Map());

    const blocked = await findBlockingReferences(executor, PARENT, blockingForeignKeysTo(ENTITIES, PARENT), [
      { entityId: 'stored:p1', entity: { id: 'p1', code: null } }
    ]);

    expect(blocked.size).toBe(0);
    // 关系外键照查 id；实体级外键的被引用值是空的，这一条一次查询都不发
    expect(vi.mocked(executor.getRepository)).toHaveBeenCalledTimes(1);
  });
});
