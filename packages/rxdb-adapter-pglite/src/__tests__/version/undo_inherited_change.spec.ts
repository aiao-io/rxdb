import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * @fileoverview US-315：父分支上已被子分支继承的变更不能撤销 / 重做。
 *
 * @remarks
 * 子分支改某个实体时记下的反向补丁是分叉那一刻继承来的值；父分支随后撤销分叉之前的那一笔，
 * 那条反向补丁就过期了，切回父分支会被它写回旧值。修法 A：撤销 / 重做的候选去掉不晚于子分支分叉点的变更，
 * 撤销栈停在分叉点并说明原因。判定基准是真实动作：切到各分支读到的数据。
 *
 * 每条用例一个新库：撤销会话与重做栈是实例内存里的状态，清表复用实例会把上一条用例的栈带进来。
 */
describe('已被子分支继承的变更不能撤销 / 重做（US-315）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  const titleOf = async (id: Todo['id']) =>
    (
      await adapter.getRepository(Todo).find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] }
      })
    )[0]?.title;

  const saveTodo = async (title: string) => {
    const todo = new Todo();
    todo.title = title;
    await todo.save();
    return todo;
  };

  const inheritedBy = (...branchIds: string[]) => ({ reason: 'inherited_by_branch', branchIds });

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = await rxdb.getAdapter('pglite');
    rxdb.use(rxDBPluginHistory);
    await rxdb.connect('pglite');
  });

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('父分支撤销不了子分支已继承的变更：撤销栈停在分叉点并说明原因，切换往返之后 main 仍是撤销前的值', async () => {
    const todo = await saveTodo('a');
    todo.title = 'b';
    await todo.save();
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');
    todo.title = 'c';
    await todo.save();
    await rxdb.versionManager.switchBranch('main');

    const history = rxdb.versionManager.history();
    await expect.poll(() => firstValueFrom(history.undoCount$)).toBe(0);
    expect(await firstValueFrom(history.undoBarrier$)).toEqual(inheritedBy('feature'));
    await history.undo();
    expect(await titleOf(todo.id)).toBe('b');

    await rxdb.versionManager.switchBranch('feature');
    expect(await titleOf(todo.id)).toBe('c');
    await rxdb.versionManager.switchBranch('main');
    expect(await titleOf(todo.id)).toBe('b');
  });

  it('分叉之后的改动照常撤销与重做，撤到分叉点为止', async () => {
    const todo = await saveTodo('a');
    await rxdb.versionManager.createBranch('feature');
    todo.title = 'b';
    await todo.save();

    const history = rxdb.versionManager.history();
    await expect.poll(() => firstValueFrom(history.undoCount$)).toBe(1);
    expect(await firstValueFrom(history.undoBarrier$)).toEqual(inheritedBy('feature'));
    await history.undo();
    expect(await titleOf(todo.id)).toBe('a');
    await expect.poll(() => firstValueFrom(history.undoCount$)).toBe(0);
    await history.undo();
    expect(await titleOf(todo.id)).toBe('a');

    await expect.poll(() => firstValueFrom(history.redoCount$)).toBe(1);
    expect(await firstValueFrom(history.redoBarrier$)).toBeNull();
    await history.redo();
    expect(await titleOf(todo.id)).toBe('b');
  });

  it('对比与合并预览读到的 main 与 main 此刻的数据一致', async () => {
    const todo = await saveTodo('a');
    todo.title = 'b';
    await todo.save();
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');
    todo.title = 'c';
    await todo.save();
    await rxdb.versionManager.switchBranch('main');
    await rxdb.versionManager.history().undo();

    const mainTitle = await titleOf(todo.id);
    const comparison = await rxdb.versionManager.compareBranches('main', 'feature');
    const entry = comparison.entries.find(item => item.entityId === todo.id);
    expect(entry?.inversePatch?.['title']).toBe(mainTitle);
    expect(entry?.patch?.['title']).toBe('c');
    const preview = await rxdb.versionManager.previewMerge('feature');
    expect(preview.entries.find(item => item.entityId === todo.id)?.conflict).toBeNull();
  });

  it('父链多级（main → a → a-child）：每一级都撤销不了下一级继承的变更，沿父链来回切换各分支读到的都对', async () => {
    const todo = await saveTodo('1');
    await rxdb.versionManager.createBranch('a');
    await rxdb.versionManager.switchBranch('a');
    todo.title = '2';
    await todo.save();
    await rxdb.versionManager.createBranch('a-child');
    await rxdb.versionManager.switchBranch('a-child');
    todo.title = '3';
    await todo.save();

    await rxdb.versionManager.switchBranch('main');
    const onMain = rxdb.versionManager.history();
    expect(await firstValueFrom(onMain.undoBarrier$)).toEqual(inheritedBy('a'));
    await onMain.undo();
    expect(await titleOf(todo.id)).toBe('1');

    await rxdb.versionManager.switchBranch('a');
    const onA = rxdb.versionManager.history();
    await expect.poll(() => firstValueFrom(onA.undoBarrier$)).toEqual(inheritedBy('a-child'));
    await onA.undo();
    expect(await titleOf(todo.id)).toBe('2');

    const expected: Array<[string, string]> = [
      ['a-child', '3'],
      ['main', '1'],
      ['a', '2'],
      ['a-child', '3'],
      ['main', '1']
    ];
    for (const [branchId, title] of expected) {
      await rxdb.versionManager.switchBranch(branchId);
      expect(await titleOf(todo.id)).toBe(title);
    }
  });

  it('删掉子分支之后限制解除', async () => {
    const todo = await saveTodo('a');
    todo.title = 'b';
    await todo.save();
    await rxdb.versionManager.createBranch('feature');

    const history = rxdb.versionManager.history();
    await expect.poll(() => firstValueFrom(history.undoCount$)).toBe(0);
    await rxdb.versionManager.removeBranch('feature');
    await expect.poll(() => firstValueFrom(history.undoCount$)).toBe(2);
    expect(await firstValueFrom(history.undoBarrier$)).toBeNull();
    await history.undo();
    expect(await titleOf(todo.id)).toBe('a');
  });

  it('重做同理：分叉时还撤销着、却落在继承范围里的变更不能重做', async () => {
    const x = await saveTodo('x1');
    const y = await saveTodo('y');
    x.title = 'x2';
    await x.save();
    const scoped = rxdb.versionManager.history(x);
    // 撤销会话被别的操作清空过的话，靠这里的本地写入异步恢复：等两步都可撤销了再撤
    await expect.poll(() => firstValueFrom(scoped.undoCount$)).toBe(2);
    await scoped.undo();
    await scoped.undo();
    expect(await titleOf(x.id)).toBeUndefined();
    // 分叉点是 main 上最后一条没撤销的变更（y 的插入），x 的插入排在它前面：feature 继承的是「x 不存在」
    await rxdb.versionManager.createBranch('feature');

    await expect.poll(() => firstValueFrom(scoped.redoCount$)).toBe(0);
    expect(await firstValueFrom(scoped.redoBarrier$)).toEqual(inheritedBy('feature'));
    await scoped.redo();
    expect(await titleOf(x.id)).toBeUndefined();

    await rxdb.versionManager.switchBranch('feature');
    expect(await titleOf(x.id)).toBeUndefined();
    expect(await titleOf(y.id)).toBe('y');
    await rxdb.versionManager.switchBranch('main');
    expect(await titleOf(x.id)).toBeUndefined();
  });
});
