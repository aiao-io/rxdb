import { describe, expect, it } from 'vitest';
import { describeChanges, diffSnapshots } from './diff';
import { sampleEntity, sampleProperty, sampleRelation, sampleShop } from './fixtures';

describe('diffSnapshots', () => {
  it('相同快照没有变更', () => {
    expect(diffSnapshots(sampleShop(), sampleShop())).toEqual([]);
  });

  it('按 ID 识别实体与字段的新增、删除、改名和字段修改', () => {
    const before = sampleShop();
    const after = sampleShop();
    const [customer, order] = after.entities;
    customer.name = 'Client';
    customer.entityNamespace = null;
    customer.properties[0].isUnique = true;
    customer.properties.push(sampleProperty('p-email', 'email'));
    order.properties[1].name = 'stage';
    order.properties[1].enumValues = ['open', 'paid', 'void'];
    order.properties.splice(0, 1);
    order.indexes = [];
    order.relations[0].onDeleteAction = 'RESTRICT';
    after.entities.push(
      sampleEntity('e-tag', 'Tag', {
        properties: [sampleProperty('p-label', 'label')],
        relations: [sampleRelation('r-x', 'owner', { mappedEntityId: 'e-customer' })]
      })
    );

    expect(diffSnapshots(before, after)).toEqual([
      { kind: 'entityRenamed', from: 'Customer', to: 'Client' },
      { kind: 'entityUpdated', entity: 'Client', changes: [{ field: 'entityNamespace', from: 'crm', to: null }] },
      {
        kind: 'propertyUpdated',
        entity: 'Client',
        property: 'name',
        changes: [{ field: 'isUnique', from: false, to: true }]
      },
      { kind: 'propertyAdded', entity: 'Client', property: 'email', propertyType: 'string' },
      { kind: 'propertyRemoved', entity: 'Order', property: 'total' },
      { kind: 'propertyRenamed', entity: 'Order', from: 'status', to: 'stage' },
      {
        kind: 'propertyUpdated',
        entity: 'Order',
        property: 'stage',
        changes: [{ field: 'enumValues', from: ['open', 'paid'], to: ['open', 'paid', 'void'] }]
      },
      {
        kind: 'relationUpdated',
        entity: 'Order',
        relation: 'customer',
        changes: [{ field: 'onDeleteAction', from: 'CASCADE', to: 'RESTRICT' }]
      },
      { kind: 'indexRemoved', entity: 'Order', properties: ['total'] },
      { kind: 'entityAdded', entity: 'Tag' }
    ]);
  });

  it('记录删除的实体、关系与索引，以及新增的关系与索引', () => {
    const before = sampleShop();
    const after = sampleShop();
    after.entities = [after.entities[0]];
    after.entities[0].relations = [];
    after.entities[0].indexes = [{ id: 'i-name', propertyIds: ['p-name'], isUnique: true }];
    after.entities[0].relations.push(sampleRelation('r-self', 'parent', { mappedEntityId: 'e-customer' }));
    expect(diffSnapshots(before, after)).toEqual([
      { kind: 'relationRemoved', entity: 'Customer', relation: 'orders', target: 'Order' },
      {
        kind: 'relationAdded',
        entity: 'Customer',
        relation: 'parent',
        relationKind: 'ONE_TO_MANY',
        target: 'Customer'
      },
      { kind: 'indexAdded', entity: 'Customer', properties: ['name'], isUnique: true },
      { kind: 'entityRemoved', entity: 'Order' }
    ]);
  });
});

describe('describeChanges', () => {
  it('把每条变更写成一行可读说明', () => {
    expect(
      describeChanges([
        { kind: 'entityAdded', entity: 'Tag' },
        { kind: 'entityRemoved', entity: 'Order' },
        { kind: 'entityRenamed', from: 'Customer', to: 'Client' },
        { kind: 'entityUpdated', entity: 'Client', changes: [{ field: 'displayName', from: '客户', to: null }] },
        { kind: 'propertyAdded', entity: 'Client', property: 'email', propertyType: 'string' },
        { kind: 'propertyRemoved', entity: 'Order', property: 'total' },
        { kind: 'propertyRenamed', entity: 'Order', from: 'status', to: 'stage' },
        {
          kind: 'propertyUpdated',
          entity: 'Order',
          property: 'stage',
          changes: [{ field: 'enumValues', from: ['open'], to: ['open', 'void'] }]
        },
        { kind: 'relationAdded', entity: 'Client', relation: 'tags', relationKind: 'ONE_TO_MANY', target: 'Tag' },
        { kind: 'relationRemoved', entity: 'Client', relation: 'orders', target: 'Order' },
        {
          kind: 'relationUpdated',
          entity: 'Order',
          relation: 'customer',
          changes: [{ field: 'onDeleteAction', from: 'CASCADE', to: null }]
        },
        { kind: 'indexAdded', entity: 'Client', properties: ['email', 'name'], isUnique: true },
        { kind: 'indexRemoved', entity: 'Order', properties: ['total'] }
      ])
    ).toEqual([
      '新增实体 Tag',
      '删除实体 Order',
      '实体 Customer 改名为 Client',
      '修改实体 Client：displayName "客户" → null',
      '新增属性 Client.email（string）',
      '删除属性 Order.total',
      '属性 Order.status 改名为 stage',
      '修改属性 Order.stage：enumValues ["open"] → ["open","void"]',
      '新增关系 Client.tags（ONE_TO_MANY → Tag）',
      '删除关系 Client.orders（→ Order）',
      '修改关系 Order.customer：onDeleteAction "CASCADE" → null',
      '新增唯一索引 Client(email, name)',
      '删除索引 Order(total)'
    ]);
  });
});
