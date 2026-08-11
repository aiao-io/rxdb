import { RxDB, SyncType } from '@aiao/rxdb';
import { TypeDemo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { SupabaseRepository } from '../SupabaseRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

/**
 * TypeDemo 类型测试
 *
 * ⚠️ 前置条件：需要在 Supabase 中手动创建 TypeDemo 表
 *
 * TypeDemo 表必须包含以下字段：
 * - 基础字段：id (uuid), createdAt, updatedAt, deletedAt, userId
 * - 简单类型：string (varchar), number (numeric), integer, boolean, date (timestamptz)
 * - 数组类型：stringArray (varchar[]), numberArray (numeric[])
 * - 对象类型：keyValue (jsonb), json (jsonb)
 *
 * 如何创建表：
 * 1. 查看 SQL 脚本：packages/rxdb-adapter-supabase/sql/create-type-demo-table.sql
 * 2. 在 Supabase SQL Editor 中执行该脚本
 * 3. 详细说明请参考：packages/rxdb-adapter-supabase/sql/README.md
 *
 * 测试行为：
 * - 如果表不存在或结构不完整：前置检查立即失败
 * - 如果表结构完整：运行完整的类型测试
 */
describe('TypeDemo 实体 Supabase 适配器 - 类型测试', () => {
  let testTypeDemo: TypeDemo;
  let rxdb: RxDB;
  let adapter: RxDBAdapterSupabase;
  let repository: SupabaseRepository<typeof TypeDemo>;
  let tableExists = false;

  // 收集所有创建的实体 ID 用于清理
  const createdIds: string[] = [];

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `test-types-${Date.now()}`,
      context: { userId: 'userId' },
      entities: [TypeDemo],
      sync: {
        remote: {
          adapter: 'supabase'
        },
        type: SyncType.None
      }
    });

    rxdb.adapter(
      'supabase',
      async db =>
        new RxDBAdapterSupabase(db, {
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SUPABASE_KEY
        })
    );

    rxdb.init();
    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();
    repository = adapter.getRepository(TypeDemo) as unknown as SupabaseRepository<typeof TypeDemo>;

    // 检查表是否存在或结构是否完整
    try {
      tableExists = await adapter.isTableExisted(TypeDemo);

      if (!tableExists) {
        throw new Error('TypeDemo 表不存在于 Supabase');
      }

      // 尝试创建测试数据验证表结构完整性
      const testEntity = new TypeDemo();
      testEntity.string = 'test';
      testEntity.number = 1;
      testEntity.integer = 1;
      testEntity.boolean = true;
      testEntity.date = new Date();
      testEntity.stringArray = ['test'];
      testEntity.numberArray = [1];
      testEntity.keyValue = { string: 'test', number: 1, integer: 1, boolean: true, date: new Date() };
      testEntity.json = { test: true };

      await repository.create(testEntity);
      await repository.remove(testEntity);
    } catch (error) {
      tableExists = false;
      throw new Error(`TypeDemo 表不存在或结构不完整于 Supabase: ${(error as Error).message}`, {
        cause: error
      });
    }

    // 创建测试数据
    testTypeDemo = new TypeDemo();
    testTypeDemo.string = 'test string';
    testTypeDemo.number = 3.14;
    testTypeDemo.integer = 42;
    testTypeDemo.boolean = true;
    testTypeDemo.date = new Date('2024-01-01T00:00:00Z');
    testTypeDemo.stringArray = ['apple', 'banana', 'cherry'];
    testTypeDemo.numberArray = [1, 2, 3, 4.5];
    testTypeDemo.keyValue = {
      string: 'nested string',
      number: 2.71,
      integer: 100,
      boolean: false,
      date: new Date('2024-12-31T23:59:59Z')
    };
    testTypeDemo.json = {
      nested: {
        key: 'value',
        array: [1, 2, 3],
        object: { a: 'b' }
      }
    };

    await repository.create(testTypeDemo);
    createdIds.push(testTypeDemo.id);
  });

  afterAll(async () => {
    if (!tableExists) return;

    // 清理所有测试数据
    for (const id of createdIds) {
      try {
        const entities = await repository.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'id', operator: '=', value: id as `${string}-${string}-${string}-${string}-${string}` }]
          }
        });
        if (entities.length > 0) {
          await repository.remove(entities[0]);
        }
      } catch {
        // 忽略清理错误
      }
    }
  });

  const findTestTypeDemo = async () => {
    const typeDemos = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: testTypeDemo.id }]
      }
    });

    expect(typeDemos.length).toBe(1);
    return typeDemos[0]!;
  };

  it('创建并保存 TypeDemo 实体', async () => {
    const typeDemo = new TypeDemo();
    typeDemo.string = 'new test';
    typeDemo.number = 1.23;
    typeDemo.integer = 10;
    typeDemo.boolean = false;
    typeDemo.date = new Date();
    typeDemo.stringArray = ['test'];
    typeDemo.numberArray = [1];
    typeDemo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
    typeDemo.json = { test: true };

    await repository.create(typeDemo);
    createdIds.push(typeDemo.id);

    expect(typeDemo.id).toBeDefined();
    expect(typeDemo.string).toEqual('new test');

    // 清理
    await repository.remove(typeDemo);
    createdIds.splice(createdIds.indexOf(typeDemo.id), 1);
  });

  it('find 能查询到指定 TypeDemo', async () => {
    const typeDemos = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: testTypeDemo.id }]
      }
    });

    expect(typeDemos.length).toBe(1);
    expect(typeDemos[0]!.id).toEqual(testTypeDemo.id);
  });

  it('string 属性能正确保存和查询', async () => {
    const typeDemo = await findTestTypeDemo();

    expect(typeDemo.string).toEqual('test string');

    // 测试字符串查询
    const found = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'string', operator: '=', value: 'test string' }]
      }
    });

    expect(found.some(t => t.id === testTypeDemo.id)).toBe(true);
  });

  it('number 属性能正确保存和查询', async () => {
    const typeDemo = await findTestTypeDemo();

    expect(typeDemo.number).toEqual(3.14);

    // 测试数字查询
    const found = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'number', operator: '=', value: 3.14 }]
      }
    });

    expect(found.some(t => t.id === testTypeDemo.id)).toBe(true);
  });

  it('integer 属性能正确保存和查询', async () => {
    const typeDemo = await findTestTypeDemo();

    expect(typeDemo.integer).toEqual(42);

    // 测试整数查询
    const found = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'integer', operator: '=', value: 42 }]
      }
    });

    expect(found.some(t => t.id === testTypeDemo.id)).toBe(true);
  });

  it('boolean 属性能正确保存和查询', async () => {
    const typeDemo = await findTestTypeDemo();

    expect(typeDemo.boolean).toEqual(true);

    // 测试布尔值查询
    const found = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'boolean', operator: '=', value: true }]
      }
    });

    expect(found.some(t => t.id === testTypeDemo.id)).toBe(true);
  });

  it('date 属性能正确保存和查询', async () => {
    const typeDemo = await findTestTypeDemo();

    expect(typeDemo.date).toBeInstanceOf(Date);
    expect(typeDemo.date!.toISOString()).toEqual('2024-01-01T00:00:00.000Z');

    // 测试日期范围查询
    const found = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'date', operator: '>=', value: new Date('2023-12-31') },
          { field: 'date', operator: '<=', value: new Date('2024-01-02') }
        ]
      }
    });

    expect(found.some(t => t.id === testTypeDemo.id)).toBe(true);
  });

  it('stringArray 属性能正确保存和查询', async () => {
    const typeDemo = await findTestTypeDemo();

    expect(typeDemo.stringArray).toEqual(['apple', 'banana', 'cherry']);
    expect(Array.isArray(typeDemo.stringArray)).toBe(true);
    expect(typeDemo.stringArray!.length).toEqual(3);
  });

  it('numberArray 属性能正确保存和查询', async () => {
    const typeDemo = await findTestTypeDemo();

    expect(typeDemo.numberArray).toEqual([1, 2, 3, 4.5]);
    expect(Array.isArray(typeDemo.numberArray)).toBe(true);
    expect(typeDemo.numberArray!.length).toEqual(4);
  });

  it('keyValue 属性能正确保存和查询', async () => {
    const typeDemo = await findTestTypeDemo();

    expect(typeDemo.keyValue).toBeDefined();
    expect(typeDemo.keyValue!.string).toEqual('nested string');
    expect(typeDemo.keyValue!.number).toEqual(2.71);
    expect(typeDemo.keyValue!.integer).toEqual(100);
    expect(typeDemo.keyValue!.boolean).toEqual(false);
    expect(typeDemo.keyValue!.date).toBeInstanceOf(Date);
    expect(typeDemo.keyValue!.date!.toISOString()).toEqual('2024-12-31T23:59:59.000Z');
  });

  it('json 属性能正确保存和查询', async () => {
    const typeDemo = await findTestTypeDemo();

    expect(typeDemo.json).toBeDefined();
    expect(typeDemo.json!.nested).toBeDefined();
    const nested = typeDemo.json!.nested as { key: string; array: number[]; object: { a: string } };
    expect(nested.key).toEqual('value');
    expect(nested.array).toEqual([1, 2, 3]);
    expect(nested.object).toEqual({ a: 'b' });
  });

  it('更新各种类型属性', async () => {
    const typeDemo = await findTestTypeDemo();

    // 更新所有属性
    await repository.update(typeDemo, {
      string: 'updated string',
      number: 9.99,
      integer: 999,
      boolean: false,
      date: new Date('2025-01-01T00:00:00Z'),
      stringArray: ['updated', 'array'],
      numberArray: [10, 20, 30],
      keyValue: {
        string: 'updated nested',
        number: 3.33,
        integer: 200,
        boolean: true,
        date: new Date('2025-12-31T23:59:59Z')
      },
      json: { updated: true }
    });

    // 重新查询验证更新
    const updated = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: testTypeDemo.id }]
      }
    });

    const updatedTypeDemo = updated[0]!;
    expect(updatedTypeDemo.string).toEqual('updated string');
    expect(updatedTypeDemo.number).toEqual(9.99);
    expect(updatedTypeDemo.integer).toEqual(999);
    expect(updatedTypeDemo.boolean).toEqual(false);
    expect(updatedTypeDemo.date!.toISOString()).toEqual('2025-01-01T00:00:00.000Z');
    expect(updatedTypeDemo.stringArray).toEqual(['updated', 'array']);
    expect(updatedTypeDemo.numberArray).toEqual([10, 20, 30]);
    expect(updatedTypeDemo.keyValue!.string).toEqual('updated nested');
    expect(updatedTypeDemo.json!.updated).toEqual(true);

    // 恢复原始数据
    await repository.update(typeDemo, {
      string: 'test string',
      number: 3.14,
      integer: 42,
      boolean: true,
      date: new Date('2024-01-01T00:00:00Z'),
      stringArray: ['apple', 'banana', 'cherry'],
      numberArray: [1, 2, 3, 4.5],
      keyValue: {
        string: 'nested string',
        number: 2.71,
        integer: 100,
        boolean: false,
        date: new Date('2024-12-31T23:59:59Z')
      },
      json: {
        nested: {
          key: 'value',
          array: [1, 2, 3],
          object: { a: 'b' }
        }
      }
    });
  });

  it('findAll() 返回所有 TypeDemo', async () => {
    const list = await repository.find({
      where: { combinator: 'and', rules: [] }
    });

    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some(item => item.id === testTypeDemo.id)).toBe(true);
  });

  it('count() 返回正确数量', async () => {
    const count = await repository.count({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: testTypeDemo.id }]
      }
    });

    expect(count).toEqual(1);
  });

  it('remove() 删除 TypeDemo', async () => {
    const typeDemo = new TypeDemo();
    typeDemo.string = 'to be deleted';
    typeDemo.number = 1;
    typeDemo.integer = 1;
    typeDemo.boolean = true;
    typeDemo.date = new Date();
    typeDemo.stringArray = ['del'];
    typeDemo.numberArray = [1];
    typeDemo.keyValue = { string: 'del', number: 1, integer: 1, boolean: true, date: new Date() };
    typeDemo.json = { deleted: true };

    await repository.create(typeDemo);
    createdIds.push(typeDemo.id);

    // 删除实体
    await repository.remove(typeDemo);
    createdIds.splice(createdIds.indexOf(typeDemo.id), 1);

    // 验证已删除
    const all = await repository.find({
      where: { combinator: 'and', rules: [] }
    });
    expect(all.some(t => t.id === typeDemo.id)).toBe(false);
  });

  it('批量保存不同类型的数据', async () => {
    const batch = [
      Object.assign(new TypeDemo(), {
        string: 'batch1',
        number: 1.1,
        integer: 1,
        boolean: true,
        date: new Date('2024-01-01'),
        stringArray: ['a'],
        numberArray: [1],
        keyValue: { string: 'kv1', number: 1, integer: 1, boolean: true, date: new Date() },
        json: { data: 1 }
      }),
      Object.assign(new TypeDemo(), {
        string: 'batch2',
        number: 2.2,
        integer: 2,
        boolean: false,
        date: new Date('2024-02-02'),
        stringArray: ['b'],
        numberArray: [2],
        keyValue: { string: 'kv2', number: 2, integer: 2, boolean: false, date: new Date() },
        json: { data: 2 }
      }),
      Object.assign(new TypeDemo(), {
        string: 'batch3',
        number: 3.3,
        integer: 3,
        boolean: true,
        date: new Date('2024-03-03'),
        stringArray: ['c'],
        numberArray: [3],
        keyValue: { string: 'kv3', number: 3, integer: 3, boolean: true, date: new Date() },
        json: { data: 3 }
      })
    ];

    // 顺序创建
    for (const item of batch) {
      await repository.create(item);
      createdIds.push(item.id);
    }

    // 验证批量保存
    const savedIds = batch.map(t => t.id);
    const found = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: 'in', value: savedIds }]
      }
    });

    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found[0].string).toBeDefined();
    expect(found[0].keyValue).toBeDefined();
    expect(found[0].json).toBeDefined();

    // 清理
    for (const item of batch) {
      await repository.remove(item);
      createdIds.splice(createdIds.indexOf(item.id), 1);
    }
  });

  it('字符串操作符 startsWith 查询', async () => {
    const newDemo = new TypeDemo();
    newDemo.string = 'test startsWith';
    newDemo.number = 5.5;
    newDemo.integer = 55;
    newDemo.boolean = true;
    newDemo.date = new Date();
    newDemo.stringArray = ['test'];
    newDemo.numberArray = [5];
    newDemo.keyValue = { string: 'test', number: 5, integer: 5, boolean: true, date: new Date() };
    newDemo.json = { test: true };

    await repository.create(newDemo);
    createdIds.push(newDemo.id);

    const found = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'string', operator: 'startsWith', value: 'test' }]
      }
    });

    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some(item => item.id === newDemo.id)).toBe(true);

    // 清理
    await repository.remove(newDemo);
    createdIds.splice(createdIds.indexOf(newDemo.id), 1);
  });

  it('数字操作符 > 和 < 查询', async () => {
    const demoForNumber = new TypeDemo();
    demoForNumber.string = 'number test';
    demoForNumber.number = 7.5;
    demoForNumber.integer = 75;
    demoForNumber.boolean = true;
    demoForNumber.date = new Date();
    demoForNumber.stringArray = ['num'];
    demoForNumber.numberArray = [7];
    demoForNumber.keyValue = { string: 'num', number: 7, integer: 7, boolean: true, date: new Date() };
    demoForNumber.json = { num: 7 };

    await repository.create(demoForNumber);
    createdIds.push(demoForNumber.id);

    const foundGreater = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'number', operator: '>', value: 7 }]
      }
    });
    expect(foundGreater.some(item => item.id === demoForNumber.id)).toBe(true);

    const foundLess = await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'number', operator: '<', value: 8 }]
      }
    });
    expect(foundLess.some(item => item.id === demoForNumber.id)).toBe(true);

    // 清理
    await repository.remove(demoForNumber);
    createdIds.splice(createdIds.indexOf(demoForNumber.id), 1);
  });

  it('orderBy 按不同字段排序', async () => {
    // 创建测试数据
    const sortTests = [
      Object.assign(new TypeDemo(), {
        string: 'aaa',
        number: 1.0,
        integer: 1,
        boolean: true,
        date: new Date('2024-01-01'),
        stringArray: ['a'],
        numberArray: [1],
        keyValue: { string: 'a', number: 1, integer: 1, boolean: true, date: new Date() },
        json: { order: 1 }
      }),
      Object.assign(new TypeDemo(), {
        string: 'zzz',
        number: 9.0,
        integer: 9,
        boolean: true,
        date: new Date('2024-12-31'),
        stringArray: ['z'],
        numberArray: [9],
        keyValue: { string: 'z', number: 9, integer: 9, boolean: true, date: new Date() },
        json: { order: 9 }
      })
    ];

    for (const item of sortTests) {
      await repository.create(item);
      createdIds.push(item.id);
    }

    // 按字符串排序
    const byString = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: 'in',
            value: sortTests.map(t => t.id)
          }
        ]
      },
      orderBy: [{ field: 'string', sort: 'asc' }]
    });
    expect(byString.length).toEqual(2);
    expect(byString[0].string).toEqual('aaa');

    // 按数字排序
    const byNumber = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: 'in',
            value: sortTests.map(t => t.id)
          }
        ]
      },
      orderBy: [{ field: 'number', sort: 'desc' }]
    });
    expect(byNumber.length).toEqual(2);
    expect(byNumber[0].number).toEqual(9.0);

    // 按日期排序
    const byDate = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: 'in',
            value: sortTests.map(t => t.id)
          }
        ]
      },
      orderBy: [{ field: 'date', sort: 'asc' }]
    });
    expect(byDate.length).toEqual(2);
    expect(byDate[0]!.date!.toISOString()).toContain('2024-01-01');

    // 清理
    for (const item of sortTests) {
      await repository.remove(item);
      createdIds.splice(createdIds.indexOf(item.id), 1);
    }
  });
});
