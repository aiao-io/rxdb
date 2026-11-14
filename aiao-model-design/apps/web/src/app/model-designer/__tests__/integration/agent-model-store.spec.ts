import type { ModelOp } from '@aiao-model-design/model-ops';
import { type RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AgentConversation,
  ChatMessage,
  ChatSession,
  DesignEntity,
  DesignIndex,
  DesignProperty,
  DesignRelation,
  ModelDesign
} from '../../models/index.js';
import { writeModelOps } from '../../services/model-ops-writer';
import { loadModelSnapshot } from '../../services/model-snapshot';
import { createTestDatabase } from './sqlite-database';

/** 设计实体的 ID 是 UUID 类型，测试用固定的 UUID 形状常量。 */
const CUSTOMER = '00000000-0000-4000-8000-000000000001' as const;
const ORDER = '00000000-0000-4000-8000-000000000002' as const;
const TAG = '00000000-0000-4000-8000-000000000003' as const;
const GHOST = '00000000-0000-4000-8000-000000000004' as const;
const P_NAME = '00000000-0000-4000-8000-000000000005' as const;
const P_CODE = '00000000-0000-4000-8000-000000000006' as const;
const P_TOTAL = '00000000-0000-4000-8000-000000000007' as const;
const R_ORDERS = '00000000-0000-4000-8000-000000000008' as const;
const R_CUSTOMER = '00000000-0000-4000-8000-000000000009' as const;
const I_CODE = '00000000-0000-4000-8000-000000000010' as const;

const property = (id: string, name: string) => ({
  id,
  name,
  propertyType: 'string' as const,
  displayName: null,
  isRequired: false,
  isNullable: false,
  isUnique: false,
  defaultValue: null,
  enumValues: null
});

const createShop: ModelOp[] = [
  { op: 'addEntity', entity: { id: CUSTOMER, name: 'Customer', displayName: '客户', entityNamespace: 'crm' } },
  { op: 'addProperty', entityId: CUSTOMER, property: { ...property(P_NAME, 'name'), isRequired: true } },
  { op: 'addEntity', entity: { id: ORDER, name: 'Order', displayName: null, entityNamespace: null } },
  { op: 'addProperty', entityId: ORDER, property: property(P_CODE, 'code') },
  { op: 'addProperty', entityId: ORDER, property: { ...property(P_TOTAL, 'total'), propertyType: 'number' } }
];

const ordersRelation = {
  id: R_ORDERS,
  name: 'orders',
  relationKind: 'ONE_TO_MANY' as const,
  mappedEntityId: ORDER,
  mappedPropertyId: R_CUSTOMER,
  onDeleteAction: null
};

const linkShop: ModelOp[] = [
  { op: 'addRelation', entityId: CUSTOMER, relation: ordersRelation },
  {
    op: 'addRelation',
    entityId: ORDER,
    relation: {
      id: R_CUSTOMER,
      name: 'customer',
      relationKind: 'MANY_TO_ONE',
      mappedEntityId: CUSTOMER,
      mappedPropertyId: R_ORDERS,
      onDeleteAction: 'CASCADE'
    }
  },
  { op: 'addIndex', entityId: ORDER, index: { id: I_CODE, propertyIds: [P_CODE], isUnique: true } }
];

describe('智能体操作写入与模型快照（真实 RxDB）', () => {
  let rxdb: RxDB;
  let dispose: () => Promise<void>;
  let designId: string;

  beforeEach(async () => {
    const testDatabase = await createTestDatabase([
      ModelDesign,
      DesignEntity,
      DesignProperty,
      DesignRelation,
      DesignIndex,
      ChatSession,
      ChatMessage,
      AgentConversation
    ]);
    rxdb = testDatabase.database;
    dispose = testDatabase.dispose;
    const design = new ModelDesign({ name: 'design', namespace: 'public' });
    await design.save();
    designId = design.id;
  });

  afterEach(async () => {
    await dispose();
  });

  it('按操作里的 ID 建实体、属性、成对关系与索引，快照原样读回', async () => {
    await writeModelOps(rxdb, designId, createShop);
    await writeModelOps(rxdb, designId, linkShop);

    const snapshot = await loadModelSnapshot(designId);
    expect(snapshot.entities.map(entity => entity.id)).toEqual([CUSTOMER, ORDER]);
    expect(snapshot.entities[0]).toEqual({
      id: CUSTOMER,
      name: 'Customer',
      displayName: '客户',
      entityNamespace: 'crm',
      properties: [{ ...property(P_NAME, 'name'), isRequired: true }],
      relations: [ordersRelation],
      indexes: []
    });
    expect(snapshot.entities[1].properties.map(item => item.name)).toEqual(['code', 'total']);
    expect(snapshot.entities[1].indexes).toEqual([{ id: I_CODE, propertyIds: [P_CODE], isUnique: true }]);

    const [customer, order] = await Promise.all([
      firstValueFrom(DesignEntity.get(CUSTOMER)),
      firstValueFrom(DesignEntity.get(ORDER))
    ]);
    expect(customer.modelDesignId).toBe(designId);
    expect([order.nodeX, order.nodeY]).not.toEqual([customer.nodeX, customer.nodeY]);
  });

  it('修改实体与属性', async () => {
    await writeModelOps(rxdb, designId, createShop);
    await writeModelOps(rxdb, designId, [
      { op: 'updateEntity', entityId: ORDER, changes: { name: 'PurchaseOrder', entityNamespace: 'shop' } },
      {
        op: 'updateProperty',
        entityId: ORDER,
        propertyId: P_TOTAL,
        changes: { name: 'amount', isRequired: true, defaultValue: '0' }
      }
    ]);
    const order = (await loadModelSnapshot(designId)).entities[1];
    expect(order).toMatchObject({ name: 'PurchaseOrder', entityNamespace: 'shop' });
    expect(order.properties[1]).toMatchObject({ id: P_TOTAL, name: 'amount', isRequired: true, defaultValue: '0' });
  });

  it('删除实体时子对象级联删除，指向它的关系按操作删除', async () => {
    await writeModelOps(rxdb, designId, createShop);
    await writeModelOps(rxdb, designId, linkShop);
    await writeModelOps(rxdb, designId, [
      { op: 'removeRelation', entityId: CUSTOMER, relationId: R_ORDERS },
      { op: 'removeRelation', entityId: ORDER, relationId: R_CUSTOMER },
      { op: 'removeEntity', entityId: ORDER }
    ]);
    const snapshot = await loadModelSnapshot(designId);
    expect(snapshot.entities.map(entity => [entity.name, entity.relations.length])).toEqual([['Customer', 0]]);
    const byEntity = {
      combinator: 'and' as const,
      rules: [{ field: 'designEntityId', operator: '=' as const, value: ORDER }]
    };
    expect(await firstValueFrom(DesignProperty.find({ where: byEntity }))).toEqual([]);
    expect(await firstValueFrom(DesignIndex.find({ where: byEntity }))).toEqual([]);
  });

  it('先删索引再删属性', async () => {
    await writeModelOps(rxdb, designId, createShop);
    await writeModelOps(rxdb, designId, linkShop);
    await writeModelOps(rxdb, designId, [
      { op: 'removeIndex', entityId: ORDER, indexId: I_CODE },
      { op: 'removeProperty', entityId: ORDER, propertyId: P_CODE }
    ]);
    const order = (await loadModelSnapshot(designId)).entities[1];
    expect(order.properties.map(item => item.name)).toEqual(['total']);
    expect(order.indexes).toEqual([]);
  });

  it('批次里有一条找不到目标时整批都不写入', async () => {
    await writeModelOps(rxdb, designId, createShop);
    await expect(
      writeModelOps(rxdb, designId, [
        { op: 'addEntity', entity: { id: TAG, name: 'Tag', displayName: null, entityNamespace: null } },
        { op: 'updateEntity', entityId: GHOST, changes: { name: 'Ghost' } }
      ])
    ).rejects.toThrow(/00000000-0000-4000-8000-000000000004/);
    expect((await loadModelSnapshot(designId)).entities.map(entity => entity.name)).toEqual(['Customer', 'Order']);
  });

  it('快照只取本设计的实体与顶层属性', async () => {
    await writeModelOps(rxdb, designId, createShop);
    const other = new ModelDesign({ name: 'other', namespace: 'public' });
    await other.save();
    await new DesignEntity({ name: 'Elsewhere', modelDesignId: other.id }).save();
    const child = new DesignProperty({ name: 'street', propertyType: 'string', designEntityId: CUSTOMER });
    child.parentId = P_NAME as never;
    await child.save();
    const snapshot = await loadModelSnapshot(designId);
    expect(snapshot.entities.map(entity => entity.name)).toEqual(['Customer', 'Order']);
    expect(snapshot.entities[0].properties.map(item => item.name)).toEqual(['name']);
  });

  it('关系类型不合规时说明是哪条关系', async () => {
    await writeModelOps(rxdb, designId, createShop);
    await new DesignRelation({ name: 'legacy', relationKind: 'HAS_MANY', designEntityId: ORDER }).save();
    await expect(loadModelSnapshot(designId)).rejects.toThrow(/Order\.legacy.*HAS_MANY/);
  });

  it('空设计的快照没有实体', async () => {
    expect(await loadModelSnapshot(designId)).toEqual({ entities: [] });
  });
});
