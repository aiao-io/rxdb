import { describe, expect, it } from 'vitest';
import { sampleShop } from './fixtures';
import { outlineModel } from './outline';

describe('outlineModel', () => {
  it('空模型给出明确提示', () => {
    expect(outlineModel({ entities: [] })).toBe('（空模型，还没有实体）');
  });

  it('按实体列出属性、关系与索引，只用名称、不含 ID', () => {
    expect(outlineModel(sampleShop())).toBe(
      [
        'Customer「客户」 namespace=crm',
        '  name: string required 「姓名」',
        '  orders → Order ONE_TO_MANY inverse=customer',
        'Order「订单」',
        '  total: number unique',
        '  status: enum(open|paid) default=open',
        '  customer → Customer MANY_TO_ONE inverse=orders onDelete=CASCADE',
        '  index(total)'
      ].join('\n')
    );
  });

  it('只输出指定的实体，关系目标缺失或缺少逆关系时照实标出', () => {
    const snapshot = sampleShop();
    snapshot.entities[1].relations[0].mappedEntityId = 'e-ghost';
    snapshot.entities[0].relations[0].mappedPropertyId = null;
    snapshot.entities[1].properties[0].isNullable = true;
    snapshot.entities[1].indexes[0].isUnique = true;
    expect(outlineModel(snapshot, ['Order'])).toBe(
      [
        'Order「订单」',
        '  total: number nullable unique',
        '  status: enum(open|paid) default=open',
        '  customer → <缺失:e-ghost> MANY_TO_ONE inverse=<无> onDelete=CASCADE',
        '  unique index(total)'
      ].join('\n')
    );
    expect(outlineModel(snapshot, ['Customer']).split('\n')[2]).toBe('  orders → Order ONE_TO_MANY inverse=<无>');
  });
});
