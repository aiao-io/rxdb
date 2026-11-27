import type { ModelSnapshot, ModelToolOutput } from '@aiao-model-design/model-ops';
import { sampleEntity, sampleProperty, sampleShop } from '@aiao-model-design/model-ops/testing';
import { describe, expect, it } from 'vitest';
import { createToolRegistry, type ModelToolName } from './index';
import { createDraftStore, modelText } from './support';

function harness(snapshot: ModelSnapshot = sampleShop()) {
  let count = 0;
  const draft = createDraftStore(snapshot);
  const tools = createToolRegistry({ draft, newId: () => `id-${++count}` });
  const run = async (name: Exclude<ModelToolName, 'ask_user'>, input: unknown): Promise<ModelToolOutput> => {
    const execute = tools[name].execute as (input: unknown, options: unknown) => Promise<ModelToolOutput>;
    return execute(input, { toolCallId: 'call', messages: [] });
  };
  return { draft, run };
}

function entityNames(snapshot: ModelSnapshot): string[] {
  return snapshot.entities.map(entity => entity.name);
}

describe('add_entities', () => {
  it('按名称建实体与属性，ID 由工具生成', async () => {
    const { draft, run } = harness({ entities: [] });
    const output = await run('add_entities', {
      entities: [
        {
          name: 'Product',
          displayName: '商品',
          namespace: 'shop',
          properties: [
            { name: 'title', type: 'string', required: true },
            { name: 'state', type: 'enum', enumValues: ['draft', 'online'], default: 'draft' }
          ]
        }
      ]
    });
    expect(output).toEqual({
      ok: true,
      summary: '已新增 1 个实体：Product（2 个属性）',
      ops: [
        { op: 'addEntity', entity: { id: 'id-1', name: 'Product', displayName: '商品', entityNamespace: 'shop' } },
        {
          op: 'addProperty',
          entityId: 'id-1',
          property: sampleProperty('id-2', 'title', { isRequired: true })
        },
        {
          op: 'addProperty',
          entityId: 'id-1',
          property: sampleProperty('id-3', 'state', {
            propertyType: 'enum',
            enumValues: ['draft', 'online'],
            defaultValue: 'draft'
          })
        }
      ]
    });
    expect(draft.get().entities[0].properties.map(property => property.name)).toEqual(['title', 'state']);
  });

  it('整批拒绝非法命名并保持草稿不变', async () => {
    const { draft, run } = harness();
    const before = draft.get();
    const output = await run('add_entities', {
      entities: [{ name: 'product', properties: [{ name: 'createdAt', type: 'date' }] }]
    });
    expect(output.ok).toBe(false);
    expect(!output.ok && output.errors.join('\n')).toMatch(/PascalCase[\s\S]*不存在/);
    expect(draft.get()).toBe(before);
  });
});

describe('update_entity', () => {
  it('改名、改显示名并清除命名空间', async () => {
    const { draft, run } = harness();
    const output = await run('update_entity', {
      entity: 'Customer',
      rename: 'Client',
      displayName: '顾客',
      namespace: null
    });
    expect(output).toMatchObject({
      ok: true,
      ops: [
        {
          op: 'updateEntity',
          entityId: 'e-customer',
          changes: { name: 'Client', displayName: '顾客', entityNamespace: null }
        }
      ]
    });
    expect(entityNames(draft.get())).toEqual(['Client', 'Order']);
  });

  it('没有要改的字段或实体不存在时报错', async () => {
    const { run } = harness();
    expect(await run('update_entity', { entity: 'Customer' })).toEqual({ ok: false, errors: ['没有要修改的字段'] });
    expect(await run('update_entity', { entity: 'Client', rename: 'Buyer' })).toEqual({
      ok: false,
      errors: ['实体 Client 不存在，现有实体：Customer、Order']
    });
  });
});

describe('remove_entities', () => {
  it('删除实体时一并删除指向它的两端关系', async () => {
    const { draft, run } = harness();
    const output = await run('remove_entities', { entities: ['Order'] });
    expect(output).toEqual({
      ok: true,
      summary: '已删除实体 Order，并清理关系 Customer.orders、Order.customer',
      ops: [
        { op: 'removeRelation', entityId: 'e-customer', relationId: 'r-orders' },
        { op: 'removeRelation', entityId: 'e-order', relationId: 'r-customer' },
        { op: 'removeEntity', entityId: 'e-order' }
      ]
    });
    expect(draft.get().entities).toEqual([expect.objectContaining({ name: 'Customer', relations: [] })]);
  });
});

describe('属性工具', () => {
  it('新增属性', async () => {
    const { draft, run } = harness();
    const output = await run('add_properties', {
      entity: 'Customer',
      properties: [{ name: 'email', type: 'string', unique: true }]
    });
    expect(output).toMatchObject({ ok: true, summary: '已为 Customer 新增属性 email' });
    expect(draft.get().entities[0].properties.map(property => property.name)).toEqual(['name', 'email']);
  });

  it('修改属性：改名、改类型时清掉不再适用的枚举选项、清除默认值', async () => {
    const { draft, run } = harness();
    const output = await run('update_properties', {
      entity: 'Order',
      properties: [{ name: 'status', rename: 'stage', type: 'string', default: null }]
    });
    expect(output).toMatchObject({
      ok: true,
      summary: '已修改 Order 的属性 stage',
      ops: [
        {
          op: 'updateProperty',
          entityId: 'e-order',
          propertyId: 'p-status',
          changes: { name: 'stage', propertyType: 'string', enumValues: null, defaultValue: null }
        }
      ]
    });
    expect(draft.get().entities[1].properties[1]).toMatchObject({ name: 'stage', propertyType: 'string' });
  });

  it('删除属性时先删掉引用它的索引', async () => {
    const { draft, run } = harness();
    const output = await run('remove_properties', { entity: 'Order', properties: ['total'] });
    expect(output).toMatchObject({
      ok: true,
      summary: '已删除 Order 的属性 total，并删除引用它的索引 1 个',
      ops: [
        { op: 'removeIndex', entityId: 'e-order', indexId: 'i-total' },
        { op: 'removeProperty', entityId: 'e-order', propertyId: 'p-total' }
      ]
    });
    expect(draft.get().entities[1].indexes).toEqual([]);
  });

  it('属性不存在时列出现有属性', async () => {
    const { run } = harness();
    expect(await run('remove_properties', { entity: 'Order', properties: ['amount'] })).toEqual({
      ok: false,
      errors: ['属性 Order.amount 不存在，现有属性：total、status']
    });
  });
});

describe('link_entities', () => {
  it('一次调用成对创建两端关系，删除策略落在多对一一端', async () => {
    const shop = sampleShop();
    shop.entities.push(sampleEntity('e-item', 'OrderItem', { properties: [sampleProperty('p-qty', 'quantity')] }));
    const { draft, run } = harness(shop);
    const output = await run('link_entities', {
      links: [{ from: 'OrderItem', to: 'Order', kind: 'MANY_TO_ONE', onDelete: 'CASCADE' }]
    });
    expect(output).toEqual({
      ok: true,
      summary: '已连接 OrderItem.order ⇄ Order.orderItems（MANY_TO_ONE）',
      ops: [
        {
          op: 'addRelation',
          entityId: 'e-item',
          relation: {
            id: 'id-1',
            name: 'order',
            relationKind: 'MANY_TO_ONE',
            mappedEntityId: 'e-order',
            mappedPropertyId: 'id-2',
            onDeleteAction: 'CASCADE'
          }
        },
        {
          op: 'addRelation',
          entityId: 'e-order',
          relation: {
            id: 'id-2',
            name: 'orderItems',
            relationKind: 'ONE_TO_MANY',
            mappedEntityId: 'e-item',
            mappedPropertyId: 'id-1',
            onDeleteAction: null
          }
        }
      ]
    });
    expect(draft.get().entities[1].relations.map(relation => relation.name)).toEqual(['customer', 'orderItems']);
  });

  it('多对多两端都用复数默认名，可指定名称；默认名冲突时报错', async () => {
    const { run } = harness();
    const output = await run('link_entities', {
      links: [{ from: 'Customer', to: 'Order', kind: 'MANY_TO_MANY', name: 'watchedOrders', inverseName: 'watchers' }]
    });
    expect(output).toMatchObject({
      ok: true,
      summary: '已连接 Customer.watchedOrders ⇄ Order.watchers（MANY_TO_MANY）'
    });
    const collision = await run('link_entities', { links: [{ from: 'Customer', to: 'Order', kind: 'ONE_TO_MANY' }] });
    expect(!collision.ok && collision.errors).toEqual(['字段 Customer.orders 已存在', '字段 Order.customer 已存在']);
  });

  it('按复数规则生成默认名', async () => {
    const shop = sampleShop();
    shop.entities.push(sampleEntity('e-cat', 'Category'), sampleEntity('e-box', 'Box'));
    const { run } = harness(shop);
    const output = await run('link_entities', {
      links: [
        { from: 'Customer', to: 'Category', kind: 'ONE_TO_MANY' },
        { from: 'Customer', to: 'Box', kind: 'ONE_TO_ONE' },
        { from: 'Box', to: 'Category', kind: 'MANY_TO_MANY' }
      ]
    });
    expect(output.ok && output.summary).toBe(
      [
        '已连接 Customer.categories ⇄ Category.customer（ONE_TO_MANY）',
        '已连接 Customer.box ⇄ Box.customer（ONE_TO_ONE）',
        '已连接 Box.categories ⇄ Category.boxes（MANY_TO_MANY）'
      ].join('\n')
    );
  });
});

describe('unlink_entities', () => {
  it('删除关系时两端一起删除，两端都列出时不重复', async () => {
    const { draft, run } = harness();
    const output = await run('unlink_entities', {
      links: [
        { entity: 'Customer', relation: 'orders' },
        { entity: 'Order', relation: 'customer' }
      ]
    });
    expect(output).toEqual({
      ok: true,
      summary: '已删除关系 Customer.orders ⇄ Order.customer',
      ops: [
        { op: 'removeRelation', entityId: 'e-customer', relationId: 'r-orders' },
        { op: 'removeRelation', entityId: 'e-order', relationId: 'r-customer' }
      ]
    });
    expect(draft.get().entities.map(entity => entity.relations.length)).toEqual([0, 0]);
  });
});

describe('索引工具', () => {
  it('按属性名新增与删除索引', async () => {
    const { draft, run } = harness();
    const added = await run('add_index', { entity: 'Order', properties: ['status', 'total'], unique: true });
    expect(added).toMatchObject({
      ok: true,
      summary: '已为 Order 新增唯一索引 (status, total)',
      ops: [
        {
          op: 'addIndex',
          entityId: 'e-order',
          index: { id: 'id-1', propertyIds: ['p-status', 'p-total'], isUnique: true }
        }
      ]
    });
    const removed = await run('remove_index', { entity: 'Order', properties: ['total', 'status'] });
    expect(removed).toMatchObject({ ok: true, ops: [{ op: 'removeIndex', entityId: 'e-order', indexId: 'id-1' }] });
    expect(draft.get().entities[1].indexes.map(index => index.id)).toEqual(['i-total']);
  });

  it('找不到对应索引时列出现有索引', async () => {
    const { run } = harness();
    expect(await run('remove_index', { entity: 'Order', properties: ['status'] })).toEqual({
      ok: false,
      errors: ['Order 上没有由 (status) 组成的索引，现有索引：(total)']
    });
  });
});

describe('只读工具', () => {
  it('查看模型概要，并标出不存在的实体', async () => {
    const { run } = harness();
    const output = await run('inspect_model', { entities: ['Order', 'Ghost'] });
    expect(output.ok && output.ops).toEqual([]);
    expect(output.ok && output.summary).toMatch(/^Order「订单」[\s\S]*不存在的实体：Ghost$/);
  });

  it('整体校验报告问题或通过', async () => {
    expect(await harness().run('validate_model', {})).toEqual({ ok: true, ops: [], summary: '模型校验通过，没有问题' });
    const broken = await harness({ entities: [sampleEntity('e-x', 'Empty')] }).run('validate_model', {});
    expect(broken).toEqual({
      ok: true,
      ops: [],
      summary: '模型有 1 个问题：\n- 实体 Empty 没有任何属性（基类字段除外）'
    });
  });
});

describe('modelText', () => {
  it('成功时给模型看 summary，失败时列出原因', () => {
    expect(modelText({ ok: true, ops: [], summary: '好了' })).toEqual({ type: 'text', value: '好了' });
    expect(modelText({ ok: false, errors: ['甲', '乙'] })).toEqual({
      type: 'text',
      value: '失败，草稿未改变：\n- 甲\n- 乙\n按原因修正后重试。'
    });
  });
});
