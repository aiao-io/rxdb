import { beforeAll, describe, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, RelationKind, SyncType } from '../../entity/metadata-options.interface.js';
import { IRepository } from '../../repository/repository.interface.js';
import { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';

const createRepository = <T extends EntityType>(): IRepository<T> => ({
  find: async () => [],
  count: async () => 0,
  create: async entity => entity,
  update: async entity => entity,
  remove: async entity => entity
});

describe('@Entity', () => {
  let rxdb: RxDB;
  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'Todo',
      entities: [Attribute, AttributeValue, Category, IdCard, Order, OrderItem, Product, SKU, SKUAttributes, User],
      sync: {
        local: {
          adapter: 'sqlite'
        },
        type: SyncType.None
      }
    });
    const adapter: IRxDBAdapter = {
      name: 'sqlite',
      connect: async () => adapter,
      disconnect: async () => undefined,
      version: async () => '1.0.0',
      getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>() {
        return createRepository<T>() as RT;
      },
      saveMany: async entities => entities,
      removeMany: async entities => entities,
      mutations: async () => [],
      isTableExisted: async () => true
    };
    rxdb.adapter('sqlite', () => adapter);
    rxdb.init();
  });

  describe('findMappedRelation', () => {
    it('MANY_TO_ONE', async () => {
      const orderMeta = getEntityMetadata(Order);
      const userMeta = getEntityMetadata(User);
      const mappedRelation = rxdb.schemaManager.findMappedRelation(orderMeta, orderMeta.relationMap.get('owner')!);
      expect(mappedRelation).toBeTruthy();
      expect(mappedRelation?.metadata).toEqual(userMeta);
      expect(mappedRelation?.relation).toEqual(userMeta.relationMap.get('orders'));
    });

    it('ONE_TO_MANY', async () => {
      const orderMeta = getEntityMetadata(Order);
      const orderItemMeta = getEntityMetadata(OrderItem);
      const mappedRelation = rxdb.schemaManager.findMappedRelation(orderMeta, orderMeta.relationMap.get('items')!);
      expect(mappedRelation).toBeTruthy();
      expect(mappedRelation?.metadata).toEqual(orderItemMeta);
      expect(mappedRelation?.relation).toEqual(orderItemMeta.relationMap.get('order'));
    });

    it('ONE_TO_ONE', async () => {
      const user_meta = getEntityMetadata(User);
      const id_card_meta = getEntityMetadata(IdCard);
      const mappedRelation = rxdb.schemaManager.findMappedRelation(user_meta, user_meta.relationMap.get('idCard')!);
      expect(mappedRelation).toBeTruthy();
      expect(mappedRelation?.metadata).toEqual(id_card_meta);
      expect(mappedRelation?.relation).toEqual(id_card_meta.relationMap.get('owner'));
    });
  });

  describe('getFieldRelations', () => {
    it('should find order number property', () => {
      const user_meta = getEntityMetadata(User);
      const order_meta = getEntityMetadata(Order);
      const result = rxdb.schemaManager.getFieldRelations(user_meta, 'orders.number');
      expect(result.property).toEqual(order_meta.propertyMap.get('number'));
      expect(result.isForeignKey).toBe(false);
      expect(result.relations.length).toBe(1);
    });

    it('should throw error when field has no dot', () => {
      const user_meta = getEntityMetadata(User);
      expect(() => rxdb.schemaManager.getFieldRelations(user_meta, 'name')).toThrow("field 'name' 必须是关联属性查询");
    });

    it('should throw error when property not found', () => {
      const user_meta = getEntityMetadata(User);
      expect(() => rxdb.schemaManager.getFieldRelations(user_meta, 'orders.nonexistent')).toThrow(
        "property 'nonexistent' not found"
      );
    });

    it('should throw error when relation not found', () => {
      const user_meta = getEntityMetadata(User);
      expect(() => rxdb.schemaManager.getFieldRelations(user_meta, 'nonexistent.id')).toThrow(
        "relation 'nonexistent' not found"
      );
    });

    it('should detect foreign key when querying relation.id', () => {
      const order_meta = getEntityMetadata(Order);
      const result = rxdb.schemaManager.getFieldRelations(order_meta, 'owner.id');
      expect(result.isForeignKey).toBe(true);
      expect(result.propertyName).toBe('ownerId');
    });

    it('should handle multi-level nested relations', () => {
      const user_meta = getEntityMetadata(User);
      const order_item_meta = getEntityMetadata(OrderItem);
      const result = rxdb.schemaManager.getFieldRelations(user_meta, 'orders.items.quantity');
      expect(result.property).toEqual(order_item_meta.propertyMap.get('quantity'));
      expect(result.relations.length).toBe(2);
      expect(result.isForeignKey).toBe(false);
    });
  });

  describe('getEntityMetadata', () => {
    it('should return entity metadata by name and namespace', () => {
      const meta = rxdb.schemaManager.getEntityMetadata('User', 'public');
      expect(meta).toBeTruthy();
      expect(meta?.name).toBe('User');
    });

    it('should return undefined for non-existent entity', () => {
      const meta = rxdb.schemaManager.getEntityMetadata('NonExistent', 'public');
      expect(meta).toBeUndefined();
    });
  });

  describe('getEntityType', () => {
    it('should return entity type by name and namespace', () => {
      const entityType = rxdb.schemaManager.getEntityType('User', 'public');
      expect(entityType).toBe(User);
    });

    it('should return undefined for non-existent entity', () => {
      const entityType = rxdb.schemaManager.getEntityType('NonExistent', 'public');
      expect(entityType).toBeUndefined();
    });
  });
});

@Entity({
  name: 'Order',
  displayName: '订单',
  properties: [
    { name: 'number', type: PropertyType.string, unique: true, displayName: '订单号' },
    { name: 'amount', type: PropertyType.number, displayName: '订单总金额' },
    { name: 'status', type: PropertyType.string, displayName: '订单状态', default: 'pending', nullable: true }
  ],
  relations: [
    {
      name: 'owner', // 关系属性名
      kind: RelationKind.MANY_TO_ONE, // 关系类型：多对一
      mappedEntity: 'User', // 关联的实体
      mappedProperty: 'orders'
    },
    {
      name: 'items', // 关系属性名
      kind: RelationKind.ONE_TO_MANY, // 关系类型：一对多
      mappedEntity: 'OrderItem', // 关联的实体
      mappedProperty: 'order' // 对方实体中的关系属性名
    }
  ]
})
export class Order extends EntityBase {}

@Entity({
  name: 'OrderItem',
  displayName: '订单项目',
  properties: [
    { name: 'productName', type: PropertyType.string, displayName: '商品名称' },
    { name: 'quantity', type: PropertyType.number, displayName: '数量' },
    { name: 'price', type: PropertyType.number, displayName: '单价' }
  ],
  relations: [
    {
      name: 'order',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Order',
      mappedProperty: 'items'
    },
    {
      name: 'sku',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'SKU',
      mappedProperty: 'orderItems',
      nullable: true
    },
    {
      name: 'categories',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'Category',
      mappedProperty: 'orderItems'
    }
  ]
})
export class OrderItem extends EntityBase {}

@Entity({
  name: 'Product',
  properties: [
    {
      name: 'name',
      type: PropertyType.string
    },
    {
      name: 'description',
      type: PropertyType.string,
      nullable: true
    }
  ],
  relations: [
    {
      name: 'skus',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'SKU',
      mappedProperty: 'product'
    }
  ]
})
export class Product extends EntityBase {
  name!: string;
  description?: string;
}

@Entity({
  name: 'SKU',
  properties: [
    {
      name: 'code',
      type: PropertyType.string,
      unique: true
    },
    {
      name: 'price',
      type: PropertyType.number
    },
    {
      name: 'stock',
      type: PropertyType.integer
    }
  ],
  relations: [
    {
      name: 'attributes',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'SKUAttributes',
      mappedProperty: 'sku'
    },
    {
      name: 'orderItems',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'OrderItem',
      mappedProperty: 'sku'
    },
    {
      name: 'product',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Product',
      mappedProperty: 'skus'
    }
  ]
})
export class SKU extends EntityBase {}

@Entity({
  name: 'SKUAttributes',
  relations: [
    {
      name: 'sku',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'SKU',
      mappedProperty: 'attributes'
    },
    {
      name: 'attribute',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Attribute',
      mappedProperty: 'skuAttributes'
    },
    {
      name: 'value',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'AttributeValue',
      mappedProperty: 'skuAttributeValues'
    }
  ]
})
export class SKUAttributes extends EntityBase {}

@Entity({
  name: 'User',
  displayName: '用户表',
  properties: [
    {
      type: PropertyType.string,
      name: 'name',
      displayName: '姓名'
    },
    {
      type: PropertyType.boolean,
      name: 'married',
      displayName: '已婚',
      default: false
    },
    {
      type: PropertyType.number,
      name: 'age',
      displayName: '年龄',
      default: 25
    },
    {
      type: PropertyType.string,
      name: 'gender',
      displayName: '性别',
      default: '男',
      nullable: true
    }
  ],
  relations: [
    {
      name: 'idCard', // 关系属性名
      kind: RelationKind.ONE_TO_ONE, // 关系类型：一对一
      mappedEntity: 'IdCard', // 关联的实体
      mappedProperty: 'owner',
      nullable: true // 是否允许 null（默认为 false）
    },
    {
      name: 'orders',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'Order',
      mappedProperty: 'owner'
    }
  ]
})
export class User extends EntityBase {}

@Entity({
  name: 'IdCard',
  displayName: '身份证',
  properties: [
    {
      name: 'code',
      type: PropertyType.string,
      displayName: '身份证号码',
      unique: true
    }
  ],
  relations: [
    {
      name: 'owner', // 关系属性名
      kind: RelationKind.ONE_TO_ONE, // 关系类型：一对一
      mappedEntity: 'User', // 关联的实体
      mappedProperty: 'idCard',
      nullable: false // 是否允许 null（默认为 false）
    }
  ]
})
export class IdCard extends EntityBase {}

@Entity({
  name: 'Category',
  displayName: '产品分类',
  properties: [{ name: 'name', type: PropertyType.string, displayName: '分类名称' }],
  relations: [
    {
      name: 'orderItems',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'OrderItem',
      mappedProperty: 'categories'
    }
  ]
})
export class Category extends EntityBase {}

@Entity({
  name: 'AttributeValue',
  properties: [
    {
      name: 'name',
      type: PropertyType.string
    }
  ],
  relations: [
    {
      name: 'attribute',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Attribute',
      mappedProperty: 'values'
    },
    {
      name: 'skuAttributeValues',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'SKUAttributes',
      mappedProperty: 'value'
    }
  ]
})
export class AttributeValue extends EntityBase {}

@Entity({
  name: 'Attribute',
  properties: [
    {
      name: 'name',
      type: PropertyType.string
    }
  ],
  relations: [
    {
      name: 'values',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'AttributeValue',
      mappedProperty: 'attribute'
    },
    {
      name: 'skuAttributes',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'SKUAttributes',
      mappedProperty: 'attribute'
    }
  ]
})
export class Attribute extends EntityBase {}

/**
 * RXD-056：同两个实体之间存在多条并行关系时，反向关系必须唯一确定。
 *
 * `DualParty` 上的 `auditedDoc` 声明在 `ownedDoc` 之前，而原实现的 ONE_TO_ONE 匹配
 * 只看「kind 相同 + mappedEntity 指回来」，于是 `DualDoc.owner` 命中的是第一条 `auditedDoc`。
 * ONE_TO_MANY / MANY_TO_ONE 同理只校验半边字段。
 */
@Entity({
  name: 'DualDoc',
  relations: [
    { name: 'owner', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'DualParty', mappedProperty: 'ownedDoc' },
    { name: 'auditor', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'DualParty', mappedProperty: 'auditedDoc' }
  ]
})
export class DualDoc extends EntityBase {}

@Entity({
  name: 'DualParty',
  relations: [
    { name: 'auditedDoc', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'DualDoc', mappedProperty: 'auditor' },
    { name: 'ownedDoc', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'DualDoc', mappedProperty: 'owner' }
  ]
})
export class DualParty extends EntityBase {}

/** 两端 mappedProperty 对不上（`team` 指回 `legacyMembers` 而非 `members`）—— 不是一对合法反向关系 */
@Entity({
  name: 'DualTeam',
  relations: [{ name: 'members', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'DualMember', mappedProperty: 'team' }]
})
export class DualTeam extends EntityBase {}

@Entity({
  name: 'DualMember',
  relations: [
    { name: 'team', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'DualTeam', mappedProperty: 'legacyMembers' }
  ]
})
export class DualMember extends EntityBase {}

describe('RXD-056 反向关系必须两端一致', () => {
  let rxdb: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'DualRelations',
      entities: [DualDoc, DualParty, DualTeam, DualMember],
      sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
    });
    const adapter: IRxDBAdapter = {
      name: 'sqlite',
      connect: async () => adapter,
      disconnect: async () => undefined,
      version: async () => '1.0.0',
      getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>() {
        return createRepository<T>() as RT;
      },
      saveMany: async entities => entities,
      removeMany: async entities => entities,
      mutations: async () => [],
      isTableExisted: async () => true
    };
    rxdb.adapter('sqlite', () => adapter);
    rxdb.init();
  });

  it('并行 ONE_TO_ONE 命中对应的那一条，而不是声明顺序上的第一条', () => {
    const docMeta = getEntityMetadata(DualDoc);
    const partyMeta = getEntityMetadata(DualParty);

    const owner = rxdb.schemaManager.findMappedRelation(docMeta, docMeta.relationMap.get('owner')!);
    const auditor = rxdb.schemaManager.findMappedRelation(docMeta, docMeta.relationMap.get('auditor')!);

    expect(owner?.relation).toEqual(partyMeta.relationMap.get('ownedDoc'));
    expect(auditor?.relation).toEqual(partyMeta.relationMap.get('auditedDoc'));
  });

  it('两端 mappedProperty 对不上时不认作反向关系', () => {
    const teamMeta = getEntityMetadata(DualTeam);
    const memberMeta = getEntityMetadata(DualMember);

    expect(rxdb.schemaManager.findMappedRelation(teamMeta, teamMeta.relationMap.get('members')!)).toBeUndefined();
    expect(rxdb.schemaManager.findMappedRelation(memberMeta, memberMeta.relationMap.get('team')!)).toBeUndefined();
  });
});
