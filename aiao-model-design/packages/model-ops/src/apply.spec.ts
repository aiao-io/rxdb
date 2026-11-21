import { describe, expect, it } from 'vitest';
import { applyOps } from './apply';
import type { ModelOp, ModelSnapshot, SnapshotProperty, SnapshotRelation } from './types';

function property(id: string, name: string, overrides: Partial<SnapshotProperty> = {}): SnapshotProperty {
  return {
    id,
    name,
    propertyType: 'string',
    displayName: null,
    isRequired: false,
    isNullable: false,
    isUnique: false,
    defaultValue: null,
    enumValues: null,
    ...overrides
  };
}

function relation(id: string, name: string, overrides: Partial<SnapshotRelation>): SnapshotRelation {
  return {
    id,
    name,
    relationKind: 'ONE_TO_MANY',
    mappedEntityId: 'missing',
    mappedPropertyId: null,
    onDeleteAction: null,
    ...overrides
  };
}

/** Customer 1:N Order，两端成对；Order.total 上有索引。 */
function shop(): ModelSnapshot {
  return {
    entities: [
      {
        id: 'e-customer',
        name: 'Customer',
        displayName: '客户',
        entityNamespace: null,
        properties: [property('p-name', 'name')],
        relations: [relation('r-orders', 'orders', { mappedEntityId: 'e-order', mappedPropertyId: 'r-customer' })],
        indexes: []
      },
      {
        id: 'e-order',
        name: 'Order',
        displayName: '订单',
        entityNamespace: null,
        properties: [property('p-total', 'total', { propertyType: 'number' })],
        relations: [
          relation('r-customer', 'customer', {
            relationKind: 'MANY_TO_ONE',
            mappedEntityId: 'e-customer',
            mappedPropertyId: 'r-orders'
          })
        ],
        indexes: [{ id: 'i-total', propertyIds: ['p-total'], isUnique: false }]
      }
    ]
  };
}

function expectErrors(snapshot: ModelSnapshot, ops: ModelOp[], ...patterns: RegExp[]) {
  const before = structuredClone(snapshot);
  const result = applyOps(snapshot, ops);
  expect(result.ok).toBe(false);
  const messages = result.ok ? '' : result.errors.map(error => `${error.op}:${error.message}`).join('\n');
  for (const pattern of patterns) expect(messages).toMatch(pattern);
  expect(snapshot).toEqual(before);
}

describe('applyOps', () => {
  it('新增实体与属性后返回新快照，输入保持不变', () => {
    const snapshot = shop();
    const before = structuredClone(snapshot);
    const result = applyOps(snapshot, [
      { op: 'addEntity', entity: { id: 'e-product', name: 'Product', displayName: '商品', entityNamespace: 'shop' } },
      { op: 'addProperty', entityId: 'e-product', property: property('p-title', 'title', { isRequired: true }) }
    ]);
    expect(result).toEqual({
      ok: true,
      snapshot: {
        entities: [
          ...before.entities,
          {
            id: 'e-product',
            name: 'Product',
            displayName: '商品',
            entityNamespace: 'shop',
            properties: [property('p-title', 'title', { isRequired: true })],
            relations: [],
            indexes: []
          }
        ]
      }
    });
    expect(snapshot).toEqual(before);
  });

  it('拒绝非法实体名、重名实体与重复 ID', () => {
    const base = { displayName: null, entityNamespace: null };
    expectErrors(
      shop(),
      [
        { op: 'addEntity', entity: { id: 'e-1', name: 'product', ...base } },
        { op: 'addEntity', entity: { id: 'e-2', name: 'Customer', ...base } },
        { op: 'addEntity', entity: { id: 'e-order', name: 'Invoice', ...base } }
      ],
      /0:.*PascalCase/,
      /1:.*Customer.*已存在/,
      /2:.*e-order.*已被使用/
    );
  });

  it('拒绝非法、保留、与关系同名的属性名，以及未知实体', () => {
    expectErrors(
      shop(),
      [
        { op: 'addProperty', entityId: 'e-customer', property: property('p-1', 'Name') },
        { op: 'addProperty', entityId: 'e-customer', property: property('p-2', 'createdAt') },
        { op: 'addProperty', entityId: 'e-customer', property: property('p-3', 'orders') },
        { op: 'addProperty', entityId: 'e-missing', property: property('p-4', 'code') }
      ],
      /0:.*camelCase/,
      /1:.*保留字段/,
      /2:.*orders.*已存在/,
      /3:.*e-missing.*不存在/
    );
  });

  it('枚举属性必须带不重复的选项，非枚举属性不能带选项', () => {
    expectErrors(
      shop(),
      [
        { op: 'addProperty', entityId: 'e-order', property: property('p-1', 'status', { propertyType: 'enum' }) },
        {
          op: 'addProperty',
          entityId: 'e-order',
          property: property('p-2', 'stage', { propertyType: 'enum', enumValues: ['a', 'a'] })
        },
        { op: 'addProperty', entityId: 'e-order', property: property('p-3', 'note', { enumValues: ['x'] }) }
      ],
      /0:.*status.*枚举选项/,
      /1:.*stage.*重复/,
      /2:.*note.*不是枚举/
    );
  });

  it('改名不能与已有实体或字段冲突，改类型为枚举时要带选项', () => {
    expectErrors(
      shop(),
      [
        { op: 'updateEntity', entityId: 'e-order', changes: { name: 'Customer' } },
        { op: 'updateProperty', entityId: 'e-order', propertyId: 'p-total', changes: { name: 'customer' } },
        { op: 'updateProperty', entityId: 'e-order', propertyId: 'p-total', changes: { propertyType: 'enum' } }
      ],
      /0:.*Customer.*已存在/,
      /1:.*customer.*已存在/,
      /2:.*total.*枚举选项/
    );
    const renamed = applyOps(shop(), [
      { op: 'updateEntity', entityId: 'e-order', changes: { name: 'PurchaseOrder', displayName: '采购单' } },
      { op: 'updateProperty', entityId: 'e-order', propertyId: 'p-total', changes: { name: 'amount' } }
    ]);
    expect(renamed.ok && renamed.snapshot.entities[1]).toMatchObject({
      name: 'PurchaseOrder',
      displayName: '采购单',
      properties: [{ id: 'p-total', name: 'amount' }]
    });
  });

  it('同一批次里成对新增关系通过，单向关系或种类不互逆时拒绝', () => {
    const snapshot = shop();
    const paired = applyOps(snapshot, [
      { op: 'addEntity', entity: { id: 'e-item', name: 'OrderItem', displayName: null, entityNamespace: null } },
      {
        op: 'addRelation',
        entityId: 'e-order',
        relation: relation('r-items', 'items', { mappedEntityId: 'e-item', mappedPropertyId: 'r-order' })
      },
      {
        op: 'addRelation',
        entityId: 'e-item',
        relation: relation('r-order', 'order', {
          relationKind: 'MANY_TO_ONE',
          mappedEntityId: 'e-order',
          mappedPropertyId: 'r-items'
        })
      }
    ]);
    expect(paired.ok).toBe(true);

    expectErrors(
      snapshot,
      [
        {
          op: 'addRelation',
          entityId: 'e-order',
          relation: relation('r-items', 'items', { mappedEntityId: 'e-customer', mappedPropertyId: 'r-ghost' })
        }
      ],
      /-1:.*items.*逆关系/
    );
    expectErrors(
      snapshot,
      [
        {
          op: 'addRelation',
          entityId: 'e-order',
          relation: relation('r-a', 'buyer', { mappedEntityId: 'e-customer', mappedPropertyId: 'r-b' })
        },
        {
          op: 'addRelation',
          entityId: 'e-customer',
          relation: relation('r-b', 'purchases', { mappedEntityId: 'e-order', mappedPropertyId: 'r-a' })
        }
      ],
      /-1:.*buyer.*ONE_TO_MANY.*MANY_TO_ONE/
    );
    expectErrors(
      snapshot,
      [{ op: 'addRelation', entityId: 'e-order', relation: relation('r-x', 'owner', { mappedEntityId: 'e-ghost' }) }],
      /0:.*e-ghost.*不存在/
    );
  });

  it('删除关系必须两端一起删', () => {
    expectErrors(
      shop(),
      [{ op: 'removeRelation', entityId: 'e-order', relationId: 'r-customer' }],
      /-1:.*Order\.customer.*逆关系 Customer\.orders/
    );
    const both = applyOps(shop(), [
      { op: 'removeRelation', entityId: 'e-order', relationId: 'r-customer' },
      { op: 'removeRelation', entityId: 'e-customer', relationId: 'r-orders' }
    ]);
    expect(both.ok && both.snapshot.entities.map(entity => entity.relations.length)).toEqual([0, 0]);
  });

  it('被其他实体关联的实体要先删掉对端关系才能删除', () => {
    expectErrors(shop(), [{ op: 'removeEntity', entityId: 'e-order' }], /0:.*Order.*Customer\.orders/);
    const removed = applyOps(shop(), [
      { op: 'removeRelation', entityId: 'e-customer', relationId: 'r-orders' },
      { op: 'removeEntity', entityId: 'e-order' }
    ]);
    expect(removed.ok && removed.snapshot.entities.map(entity => entity.name)).toEqual(['Customer']);
  });

  it('被索引引用的属性要先删索引；索引必须引用本实体的已有属性', () => {
    expectErrors(shop(), [{ op: 'removeProperty', entityId: 'e-order', propertyId: 'p-total' }], /0:.*total.*索引/);
    expectErrors(
      shop(),
      [
        { op: 'addIndex', entityId: 'e-order', index: { id: 'i-1', propertyIds: [], isUnique: false } },
        { op: 'addIndex', entityId: 'e-order', index: { id: 'i-2', propertyIds: ['p-name'], isUnique: true } }
      ],
      /0:.*至少/,
      /1:.*p-name.*不存在/
    );
    const cleaned = applyOps(shop(), [
      { op: 'removeIndex', entityId: 'e-order', indexId: 'i-total' },
      { op: 'removeProperty', entityId: 'e-order', propertyId: 'p-total' }
    ]);
    expect(cleaned.ok && cleaned.snapshot.entities[1]).toMatchObject({ properties: [], indexes: [] });
  });

  it('删除或修改不存在的对象时报出具体 ID', () => {
    expectErrors(
      shop(),
      [
        { op: 'removeEntity', entityId: 'e-ghost' },
        { op: 'updateProperty', entityId: 'e-order', propertyId: 'p-ghost', changes: { isRequired: true } },
        { op: 'removeRelation', entityId: 'e-order', relationId: 'r-ghost' },
        { op: 'removeIndex', entityId: 'e-order', indexId: 'i-ghost' }
      ],
      /0:.*e-ghost/,
      /1:.*p-ghost/,
      /2:.*r-ghost/,
      /3:.*i-ghost/
    );
  });
});
