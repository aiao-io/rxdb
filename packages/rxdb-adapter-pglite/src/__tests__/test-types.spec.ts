import { RxDB, SyncType, getEntityStatus } from '@aiao/rxdb';
import { TypeDemo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { cleanup_db, generateDbName } from './test-utils.js';

/**
 * enum 枚举类型
 */
enum TypeDemoEnum {
  Active = 'active',
  Inactive = 'inactive',
  Pending = 'pending'
}

describe('类型测试', () => {
  let testTypeDemo: TypeDemo;
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      entities: [TypeDemo],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    db.adapter('pglite', db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');

    // 创建测试数据
    testTypeDemo = new TypeDemo();
    testTypeDemo.string = 'test string';
    testTypeDemo.number = 3.14;
    testTypeDemo.integer = 42;
    testTypeDemo.boolean = true;
    testTypeDemo.date = new Date('2024-01-01T00:00:00Z');
    testTypeDemo.enum = TypeDemoEnum.Active;
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

    const status = getEntityStatus(testTypeDemo);
    expect(status.local).toEqual(false);
    expect(status.remote).toEqual(false);
    await testTypeDemo.save();
  });

  afterAll(async () => {
    await cleanup_db(adapter);
    if (rxdb) await rxdb.disconnectAll();
  });

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

    const status = getEntityStatus(typeDemo);
    expect(status.local).toEqual(false);

    const saved = await typeDemo.save();
    expect(saved.id).toBeDefined();
    expect(saved.string).toEqual('new test');
  });

  it('get() 能查询到指定 TypeDemo', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    const status = getEntityStatus(typeDemo);
    expect(status.local).toEqual(true);
    expect(typeDemo.id).toEqual(testTypeDemo.id);
  });

  it('string 属性能正确保存和查询', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(typeDemo.string).toEqual('test string');

    const found = await firstValueFrom(
      TypeDemo.findOne({
        where: {
          combinator: 'and',
          rules: [{ field: 'string', operator: '=', value: 'test string' }]
        }
      })
    );
    expect(found?.id).toEqual(testTypeDemo.id);
  });

  it('number 属性能正确保存和查询', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(typeDemo.number).toEqual(3.14);

    const found = await firstValueFrom(
      TypeDemo.findOne({
        where: {
          combinator: 'and',
          rules: [{ field: 'number', operator: '=', value: 3.14 }]
        }
      })
    );
    expect(found?.id).toEqual(testTypeDemo.id);
  });

  it('integer 属性能正确保存和查询', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(typeDemo.integer).toEqual(42);

    const found = await firstValueFrom(
      TypeDemo.findOne({
        where: {
          combinator: 'and',
          rules: [{ field: 'integer', operator: '=', value: 42 }]
        }
      })
    );
    expect(found?.id).toEqual(testTypeDemo.id);
  });

  it('boolean 属性能正确保存和查询', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(typeDemo.boolean).toEqual(true);

    const found = await firstValueFrom(
      TypeDemo.findOne({
        where: {
          combinator: 'and',
          rules: [{ field: 'boolean', operator: '=', value: true }]
        }
      })
    );
    expect(found?.id).toEqual(testTypeDemo.id);
  });

  it('date 属性能正确保存和查询', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(typeDemo.date).toBeInstanceOf(Date);
    expect(typeDemo.date?.toISOString()).toEqual('2024-01-01T00:00:00.000Z');

    const found = await firstValueFrom(
      TypeDemo.findOne({
        where: {
          combinator: 'and',
          rules: [
            { field: 'date', operator: '>=', value: new Date('2023-12-31') },
            { field: 'date', operator: '<=', value: new Date('2024-01-02') }
          ]
        }
      })
    );
    expect(found?.id).toEqual(testTypeDemo.id);
  });

  it('stringArray 属性能正确保存和查询', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(typeDemo.stringArray).toEqual(['apple', 'banana', 'cherry']);
    expect(Array.isArray(typeDemo.stringArray)).toBe(true);
    expect(typeDemo.stringArray?.length).toEqual(3);
  });

  it('numberArray 属性能正确保存和查询', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(typeDemo.numberArray).toEqual([1, 2, 3, 4.5]);
    expect(Array.isArray(typeDemo.numberArray)).toBe(true);
    expect(typeDemo.numberArray?.length).toEqual(4);
  });

  it('keyValue 属性能正确保存和查询', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    const keyValue = typeDemo.keyValue!;
    expect(keyValue).toBeDefined();
    expect(keyValue.string).toEqual('nested string');
    expect(keyValue.number).toEqual(2.71);
    expect(keyValue.integer).toEqual(100);
    expect(keyValue.boolean).toEqual(false);
    expect(keyValue.date).toBeInstanceOf(Date);
    expect(keyValue.date?.toISOString()).toEqual('2024-12-31T23:59:59.000Z');
  });

  it('json 属性能正确保存和查询', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    const json = typeDemo.json as unknown as {
      nested: { key: string; array: number[]; object: { a: string } };
    };
    expect(json).toBeDefined();
    expect(json.nested).toBeDefined();
    expect(json.nested.key).toEqual('value');
    expect(json.nested.array).toEqual([1, 2, 3]);
    expect(json.nested.object).toEqual({ a: 'b' });
  });

  it('enum 属性能正确保存和查询', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(typeDemo.enum).toEqual('active');

    typeDemo.enum = TypeDemoEnum.Inactive;
    await typeDemo.save();

    const updated = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(updated.enum).toEqual('inactive');

    updated.enum = null as unknown as TypeDemo['enum'];
    await updated.save();

    const nulled = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(nulled.enum).toBeNull();
  });

  describe('enum 类型查询', () => {
    let activeDemo: TypeDemo;
    let inactiveDemo: TypeDemo;
    let pendingDemo: TypeDemo;
    let nullEnumDemo: TypeDemo;

    const makeDemo = (enumVal: string | null) => {
      const d = new TypeDemo();
      d.string = `enum-test-${enumVal ?? 'null'}`;
      d.number = 0;
      d.integer = 0;
      d.boolean = false;
      d.date = new Date();
      d.stringArray = [];
      d.numberArray = [];
      d.keyValue = { string: '', number: 0, integer: 0, boolean: false, date: new Date() };
      d.json = {};
      d.enum = enumVal as TypeDemo['enum'];
      return d;
    };

    beforeAll(async () => {
      activeDemo = makeDemo('active');
      inactiveDemo = makeDemo('inactive');
      pendingDemo = makeDemo('pending');
      nullEnumDemo = makeDemo(null);
      await Promise.all([activeDemo.save(), inactiveDemo.save(), pendingDemo.save(), nullEnumDemo.save()]);
    });

    it('= 等于查询', async () => {
      const found = await firstValueFrom(
        TypeDemo.findAll({
          where: {
            combinator: 'and',
            rules: [{ field: 'enum', operator: '=', value: TypeDemoEnum.Active }]
          }
        })
      );
      expect(found.some(d => d.id === activeDemo.id)).toBe(true);
      expect(found.every(d => d.enum === TypeDemoEnum.Active)).toBe(true);
    });

    it('!= 不等于查询', async () => {
      const found = await firstValueFrom(
        TypeDemo.findAll({
          where: {
            combinator: 'and',
            rules: [
              { field: 'id', operator: 'in', value: [activeDemo.id, inactiveDemo.id, pendingDemo.id] },
              { field: 'enum', operator: '!=', value: TypeDemoEnum.Active }
            ]
          }
        })
      );
      expect(found.some(d => d.id === activeDemo.id)).toBe(false);
      expect(found.some(d => d.id === inactiveDemo.id)).toBe(true);
      expect(found.some(d => d.id === pendingDemo.id)).toBe(true);
    });

    it('null 为空查询', async () => {
      const found = await firstValueFrom(
        TypeDemo.findAll({
          where: {
            combinator: 'and',
            rules: [
              { field: 'id', operator: 'in', value: [activeDemo.id, nullEnumDemo.id] },
              { field: 'enum', operator: 'null' }
            ]
          }
        })
      );
      expect(found.some(d => d.id === nullEnumDemo.id)).toBe(true);
      expect(found.some(d => d.id === activeDemo.id)).toBe(false);
      expect(found.every(d => d.enum === null || d.enum === undefined)).toBe(true);
    });

    it('notNull 不为空查询', async () => {
      const found = await firstValueFrom(
        TypeDemo.findAll({
          where: {
            combinator: 'and',
            rules: [
              { field: 'id', operator: 'in', value: [activeDemo.id, nullEnumDemo.id] },
              { field: 'enum', operator: 'notNull' }
            ]
          }
        })
      );
      expect(found.some(d => d.id === activeDemo.id)).toBe(true);
      expect(found.some(d => d.id === nullEnumDemo.id)).toBe(false);
    });

    it('in 在列表中查询', async () => {
      const found = await firstValueFrom(
        TypeDemo.findAll({
          where: {
            combinator: 'and',
            rules: [
              { field: 'id', operator: 'in', value: [activeDemo.id, inactiveDemo.id, pendingDemo.id] },
              { field: 'enum', operator: 'in', value: [TypeDemoEnum.Active, TypeDemoEnum.Pending] }
            ]
          }
        })
      );
      expect(found.some(d => d.id === activeDemo.id)).toBe(true);
      expect(found.some(d => d.id === pendingDemo.id)).toBe(true);
      expect(found.some(d => d.id === inactiveDemo.id)).toBe(false);
    });

    it('notIn 不在列表中查询', async () => {
      const found = await firstValueFrom(
        TypeDemo.findAll({
          where: {
            combinator: 'and',
            rules: [
              { field: 'id', operator: 'in', value: [activeDemo.id, inactiveDemo.id, pendingDemo.id] },
              { field: 'enum', operator: 'notIn', value: [TypeDemoEnum.Active, TypeDemoEnum.Pending] }
            ]
          }
        })
      );
      expect(found.some(d => d.id === inactiveDemo.id)).toBe(true);
      expect(found.some(d => d.id === activeDemo.id)).toBe(false);
      expect(found.some(d => d.id === pendingDemo.id)).toBe(false);
    });
  });

  it('更新各种类型属性', async () => {
    const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));

    typeDemo.string = 'updated string';
    typeDemo.number = 9.99;
    typeDemo.integer = 999;
    typeDemo.boolean = false;
    typeDemo.date = new Date('2025-01-01T00:00:00Z');
    typeDemo.stringArray = ['updated', 'array'];
    typeDemo.numberArray = [10, 20, 30];
    typeDemo.keyValue = {
      string: 'updated nested',
      number: 3.33,
      integer: 200,
      boolean: true,
      date: new Date('2025-12-31T23:59:59Z')
    };
    typeDemo.json = { updated: true };

    await typeDemo.save();

    const updated = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
    expect(updated.string).toEqual('updated string');
    expect(updated.number).toEqual(9.99);
    expect(updated.integer).toEqual(999);
    expect(updated.boolean).toEqual(false);
    expect(updated.date?.toISOString()).toEqual('2025-01-01T00:00:00.000Z');
    expect(updated.stringArray).toEqual(['updated', 'array']);
    expect(updated.numberArray).toEqual([10, 20, 30]);
    expect(updated.keyValue?.string).toEqual('updated nested');
    expect((updated.json as unknown as { updated: boolean }).updated).toEqual(true);
  });

  it('findAll() 返回所有 TypeDemo', async () => {
    const list = await firstValueFrom(TypeDemo.findAll({ where: { combinator: 'and', rules: [] } }));
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some(item => item.id === testTypeDemo.id)).toBe(true);
  });

  it('count() 返回正确数量', async () => {
    const count = await firstValueFrom(
      TypeDemo.count({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: testTypeDemo.id }]
        }
      })
    );
    expect(count).toEqual(1);
  });

  it('remove() 标记 TypeDemo 为已删除', async () => {
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
    const saved = await typeDemo.save();
    expect(saved.id).toBeDefined();

    await typeDemo.remove();

    const all = await firstValueFrom(TypeDemo.findAll({ where: { combinator: 'and', rules: [] } }));
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

    await rxdb.entityManager.saveMany(batch);

    const savedIds = batch.map(t => t.id);
    const found = await firstValueFrom(
      TypeDemo.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'in', value: savedIds }]
        }
      })
    );

    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found[0].string).toBeDefined();
    expect(found[0].keyValue).toBeDefined();
    expect(found[0].json).toBeDefined();
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
    await newDemo.save();

    const found = await firstValueFrom(
      TypeDemo.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'string', operator: 'startsWith', value: 'test' }]
        }
      })
    );
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some(item => item.id === newDemo.id)).toBe(true);
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
    await demoForNumber.save();

    const foundGreater = await firstValueFrom(
      TypeDemo.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'number', operator: '>', value: 7 }]
        }
      })
    );
    expect(foundGreater.some(item => item.id === demoForNumber.id)).toBe(true);

    const foundLess = await firstValueFrom(
      TypeDemo.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'number', operator: '<', value: 8 }]
        }
      })
    );
    expect(foundLess.some(item => item.id === demoForNumber.id)).toBe(true);
  });

  it('orderBy 按不同字段排序', async () => {
    const byString = await firstValueFrom(
      TypeDemo.findAll({
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'string', sort: 'asc' }]
      })
    );
    expect(byString.length).toBeGreaterThanOrEqual(1);

    const byNumber = await firstValueFrom(
      TypeDemo.findAll({
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'number', sort: 'desc' }]
      })
    );
    expect(byNumber.length).toBeGreaterThanOrEqual(1);

    const byDate = await firstValueFrom(
      TypeDemo.findAll({
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'date', sort: 'asc' }]
      })
    );
    expect(byDate.length).toBeGreaterThanOrEqual(1);
  });
});
