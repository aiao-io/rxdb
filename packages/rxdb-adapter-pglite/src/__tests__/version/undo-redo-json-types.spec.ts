import { RxDB, SyncType } from '@aiao/rxdb';
import { TypeDemo } from '@aiao/rxdb-test/entities';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

/**
 * 验证 stringArray / numberArray / json / keyValue 类型的 undo/redo
 *
 * PGlite 使用原生 text[] / numeric[] 列类型存储数组字段。
 */
describe('undo/redo - JSON 类型字段 (stringArray, numberArray, json, keyValue)', () => {
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
    db.adapter(
      'pglite',
      db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterEach(async () => {
    const historyManager = (rxdb.versionManager as unknown as { historyManager: { clearRedoStack(): void } })
      .historyManager;
    historyManager.clearRedoStack();
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('stringArray: 创建 → 更新 → undo → 值恢复为数组', async () => {
    const demo = new TypeDemo();
    demo.string = 'sa-test';
    demo.number = 1;
    demo.integer = 1;
    demo.boolean = true;
    demo.date = new Date();
    demo.stringArray = ['apple', 'banana'];
    demo.numberArray = [1];
    demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
    demo.json = { x: 1 };
    await demo.save();

    const repo = adapter.getRepository(TypeDemo);

    // 验证初始值
    let rows = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
    });
    expect(rows[0].stringArray).toEqual(['apple', 'banana']);

    // 更新 stringArray
    demo.stringArray = ['cherry'];
    await demo.save();

    rows = await repo.find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] } });
    expect(rows[0].stringArray).toEqual(['cherry']);

    // undo → 恢复为 ['apple', 'banana']
    await rxdb.versionManager.history().undo();

    rows = await repo.find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] } });
    expect(Array.isArray(rows[0].stringArray)).toBe(true);
    expect(rows[0].stringArray).toEqual(['apple', 'banana']);
  });

  it('numberArray: 创建 → 更新 → undo → 值恢复为数组', async () => {
    const demo = new TypeDemo();
    demo.string = 'na-test';
    demo.number = 1;
    demo.integer = 1;
    demo.boolean = true;
    demo.date = new Date();
    demo.stringArray = ['a'];
    demo.numberArray = [10, 20, 30];
    demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
    demo.json = { x: 1 };
    await demo.save();

    const repo = adapter.getRepository(TypeDemo);

    // 更新 numberArray
    demo.numberArray = [99];
    await demo.save();

    // 撤销。
    await rxdb.versionManager.history().undo();

    const rows = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
    });
    expect(Array.isArray(rows[0].numberArray)).toBe(true);
    expect(rows[0].numberArray).toEqual([10, 20, 30]);
  });

  it('json: 创建 → 更新 → undo → 值恢复为对象', async () => {
    const demo = new TypeDemo();
    demo.string = 'json-test';
    demo.number = 1;
    demo.integer = 1;
    demo.boolean = true;
    demo.date = new Date();
    demo.stringArray = ['a'];
    demo.numberArray = [1];
    demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
    demo.json = { nested: { key: 'value', arr: [1, 2] } };
    await demo.save();

    const repo = adapter.getRepository(TypeDemo);

    // 更新 json
    demo.json = { updated: true };
    await demo.save();

    // 撤销。
    await rxdb.versionManager.history().undo();

    const rows = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
    });
    const json = rows[0]!.json as unknown as { nested: { key: string; arr: number[] } };
    expect(typeof json).toBe('object');
    expect(json.nested.key).toBe('value');
    expect(json.nested.arr).toEqual([1, 2]);
  });

  it('stringArray: 连续多次更新 → 多次 undo → 逐步恢复', async () => {
    const demo = new TypeDemo();
    demo.string = 'multi-undo';
    demo.number = 1;
    demo.integer = 1;
    demo.boolean = true;
    demo.date = new Date();
    demo.stringArray = ['v1'];
    demo.numberArray = [1];
    demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
    demo.json = { x: 1 };
    await demo.save();

    const repo = adapter.getRepository(TypeDemo);

    // 第一次更新
    demo.stringArray = ['v1', 'v2'];
    await demo.save();

    // 第二次更新
    demo.stringArray = ['v1', 'v2', 'v3'];
    await demo.save();

    // undo 1 → ['v1', 'v2']
    await rxdb.versionManager.history().undo();
    let rows = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
    });
    expect(rows[0].stringArray).toEqual(['v1', 'v2']);

    // undo 2 → ['v1']
    await rxdb.versionManager.history().undo();
    rows = await repo.find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] } });
    expect(rows[0].stringArray).toEqual(['v1']);
  });

  it('stringArray: 更新 → undo → redo → 值正确', async () => {
    const demo = new TypeDemo();
    demo.string = 'redo-test';
    demo.number = 1;
    demo.integer = 1;
    demo.boolean = true;
    demo.date = new Date();
    demo.stringArray = ['a', 'b'];
    demo.numberArray = [1];
    demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
    demo.json = { x: 1 };
    await demo.save();

    const repo = adapter.getRepository(TypeDemo);

    demo.stringArray = ['c', 'd', 'e'];
    await demo.save();

    // 撤销。
    await rxdb.versionManager.history().undo();
    let rows = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
    });
    expect(rows[0].stringArray).toEqual(['a', 'b']);

    // 重做。
    await rxdb.versionManager.history().redo();
    rows = await repo.find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] } });
    expect(rows[0].stringArray).toEqual(['c', 'd', 'e']);
  });

  it('DELETE 含 stringArray 的实体 → undo → 值恢复为数组', async () => {
    const demo = new TypeDemo();
    demo.string = 'delete-undo';
    demo.number = 1;
    demo.integer = 1;
    demo.boolean = true;
    demo.date = new Date();
    demo.stringArray = ['x', 'y', 'z'];
    demo.numberArray = [1];
    demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
    demo.json = { x: 1 };
    await demo.save();

    const repo = adapter.getRepository(TypeDemo);
    const demoId = demo.id;

    // 删除
    await demo.remove();
    let rows = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demoId }] }
    });
    expect(rows.length).toBe(0);

    // undo → 恢复
    await rxdb.versionManager.history().undo();
    rows = await repo.find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demoId }] } });
    expect(rows.length).toBe(1);
    expect(Array.isArray(rows[0].stringArray)).toBe(true);
    expect(rows[0].stringArray).toEqual(['x', 'y', 'z']);
  });
});
