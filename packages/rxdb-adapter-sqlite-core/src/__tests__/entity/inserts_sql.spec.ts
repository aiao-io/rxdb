import { PropertyType, transitionMetadata, type EntityMetadata, type EntityPropertyMetadataOptions } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { generate_entity_inserts_sql } from '../../entity/inserts_sql.js';

class TestEntity {
  status?: string | null;
  seq?: number;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;

  constructor(public id: string) {}
}

const createMetadata = (properties: EntityPropertyMetadataOptions[]): EntityMetadata =>
  transitionMetadata({
    name: 'TestEntity',
    namespace: 'test',
    properties
  });

describe('generate_entity_inserts_sql - 默认值语义', () => {
  it('空实体列表应返回空语句和参数', async () => {
    const metadata = createMetadata([{ name: 'id', type: PropertyType.uuid }]);

    await expect(generate_entity_inserts_sql(metadata, [])).resolves.toEqual({ sql: '', params: [] });
  });

  it('缺省字段应使用 metadata default，而不是显式写 NULL', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'status', type: PropertyType.string, default: 'active' }
    ]);

    const { params } = await generate_entity_inserts_sql(metadata, [new TestEntity('e-1')]);

    expect(params).toEqual(['e-1', 'active']);
  });

  it('函数形式的 default 应逐行求值', async () => {
    let counter = 0;
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'seq', type: PropertyType.integer, default: () => ++counter }
    ]);

    const { params } = await generate_entity_inserts_sql(metadata, [new TestEntity('e-1'), new TestEntity('e-2')]);

    expect(params).toEqual(['e-1', 1, 'e-2', 2]);
  });

  it('显式提供的值优先于 default', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'status', type: PropertyType.string, default: 'active' }
    ]);
    const entity = Object.assign(new TestEntity('e-1'), { status: 'archived' });

    const { params } = await generate_entity_inserts_sql(metadata, [entity]);

    expect(params).toEqual(['e-1', 'archived']);
  });

  it('显式 null 不应被 default 覆盖', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'status', type: PropertyType.string, default: 'active' }
    ]);
    const entity = Object.assign(new TestEntity('e-1'), { status: null });

    const { params } = await generate_entity_inserts_sql(metadata, [entity]);

    expect(params).toEqual(['e-1', null]);
  });

  it('无 default 的缺省字段仍写 NULL', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'note', type: PropertyType.string }
    ]);

    const { params } = await generate_entity_inserts_sql(metadata, [new TestEntity('e-1')]);

    expect(params).toEqual(['e-1', null]);
  });

  it('应为每行补齐 context 用户和审计时间', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'createdBy', type: PropertyType.uuid },
      { name: 'updatedBy', type: PropertyType.uuid },
      { name: 'createdAt', type: PropertyType.date },
      { name: 'updatedAt', type: PropertyType.date }
    ]);

    const { params } = await generate_entity_inserts_sql(metadata, [new TestEntity('e-1')], { userId: 'user-1' });

    expect(params.slice(0, 3)).toEqual(['e-1', 'user-1', 'user-1']);
    expect(params[3]).toEqual(params[4]);
    expect(new Date(params[3] as string).toString()).not.toBe('Invalid Date');
  });

  it("date 类型 default 为 'CURRENT_TIMESTAMP' 哨兵时应写入真实时间戳，而非字面量字符串", async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'createdAt', type: PropertyType.date, default: 'CURRENT_TIMESTAMP' }
    ]);

    const { params } = await generate_entity_inserts_sql(metadata, [new TestEntity('e-1')]);

    expect(params[1]).not.toBe('CURRENT_TIMESTAMP');
    expect(new Date(params[1] as string).toString()).not.toBe('Invalid Date');
  });

  it('应保留实体显式提供的审计时间', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'createdAt', type: PropertyType.date },
      { name: 'updatedAt', type: PropertyType.date }
    ]);
    const entity = Object.assign(new TestEntity('e-1'), {
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z')
    });

    const { params } = await generate_entity_inserts_sql(metadata, [entity]);

    expect(params).toEqual(['e-1', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z']);
  });

  // 审计字段一律按**物理列名**读写。按 JS 属性名写会多出第二个键，两个键在
  // transformEntityValueToSql 里落到同一物理列、后写的赢：实体自带的时间戳被本机时钟盖掉。
  it('列名被重命名时仍保留实体显式提供的审计时间', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'createdAt', columnName: 'created_at', type: PropertyType.date },
      { name: 'updatedAt', columnName: 'updated_at', type: PropertyType.date }
    ]);
    const entity = Object.assign(new TestEntity('e-1'), {
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z')
    });

    const { sql, params } = await generate_entity_inserts_sql(metadata, [entity]);

    expect(sql).toContain('"created_at"');
    expect(params).toEqual(['e-1', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z']);
  });

  // 同一个 bug 在这里最刺眼：defaultProperties 循环已经用对了 property.columnName，
  // 而按 JS 属性名写的时间戳赋值会把它刚解析出来的 default 再盖掉一次。
  it("列名被重命名时不覆盖 'CURRENT_TIMESTAMP' 哨兵解析出的默认值", async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'createdAt', columnName: 'created_at', type: PropertyType.date, default: 'CURRENT_TIMESTAMP' }
    ]);

    const { sql, params } = await generate_entity_inserts_sql(metadata, [new TestEntity('e-1')]);

    expect(sql).toContain('"created_at"');
    expect(params).toHaveLength(2);
    expect(params[1]).not.toBe('CURRENT_TIMESTAMP');
    expect(new Date(params[1] as string).toString()).not.toBe('Invalid Date');
  });

  it('列名被重命名时 createdBy / updatedBy 只落到物理列上', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'createdBy', columnName: 'created_by', type: PropertyType.uuid },
      { name: 'updatedBy', columnName: 'updated_by', type: PropertyType.uuid }
    ]);

    const { sql, params } = await generate_entity_inserts_sql(metadata, [new TestEntity('e-1')], { userId: 'user-1' });

    expect(sql).toContain('"created_by"');
    expect(params).toEqual(['e-1', 'user-1', 'user-1']);
  });
});
