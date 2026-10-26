import { RxDB, RxDBBranch, RxDBChange, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

/**
 * @fileoverview US-312：不切换分支的对比与合并预览，在真后端上与「切过去读到的数据」「真合并的结果」逐条比对。
 *
 * @remarks
 * 历史插件的单测拿内存夹具验证算法；这里验的是同一套算法读到真实变更日志（触发器写的补丁、簿记字段、
 * 编码后的值）时仍然成立。判定基准都是真实动作：对比对的是切到两边各读一次的数据，预览对的是随后的
 * `mergeBranch()` 返回值与合并后的数据。
 */
describe('分支对比与合并预览（US-312）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  const allTodos = () => adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });

  /** 主键 → 标题；键放宽成 `string`，好拿条目上的 `entityId` 来查。 */
  const titlesById = async () => new Map<string, string>((await allTodos()).map(todo => [todo.id, todo.title]));

  const countChanges = async () =>
    (
      await adapter.getRepository(RxDBChange).find({
        where: { combinator: 'and', rules: [] },
        limit: Number.MAX_SAFE_INTEGER
      })
    ).length;

  const activeBranch = async () =>
    (
      await adapter.getRepository(RxDBBranch).find({
        where: { combinator: 'and', rules: [{ field: 'activated', operator: '=', value: true }] },
        limit: 1
      })
    )[0]?.id;

  const saveTodo = async (title: string) => {
    const todo = new Todo();
    todo.title = title;
    await todo.save();
    return todo;
  };

  beforeAll(async () => {
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

  afterEach(async () => await cleanup_db(adapter));

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('compareBranches 不切换就给出两侧差异，与切到两边各读一次的数据一致；不写任何东西', async () => {
    const kept = await saveTodo('kept');
    const removed = await saveTodo('removed');
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');
    kept.title = 'kept-on-feature';
    await kept.save();
    await removed.remove();
    const added = await saveTodo('added-on-feature');
    await rxdb.versionManager.switchBranch('main');
    kept.completed = true;
    await kept.save();

    const changesBefore = await countChanges();
    const comparison = await rxdb.versionManager.compareBranches('main', 'feature');
    expect(await countChanges()).toBe(changesBefore);
    expect(await activeBranch()).toBe('main');

    expect(comparison.fromBranchId).toBe('main');
    expect(comparison.toBranchId).toBe('feature');
    const byId = new Map(comparison.entries.map(entry => [entry.entityId, entry]));
    expect(byId.size).toBe(3);
    expect(byId.get(added.id)?.operation).toBe('INSERT');
    expect(byId.get(added.id)?.patch?.['title']).toBe('added-on-feature');
    expect(byId.get(removed.id)?.operation).toBe('DELETE');
    expect(byId.get(removed.id)?.inversePatch?.['title']).toBe('removed');
    // 两边各改了 kept 的一个业务字段：两侧各取自己的值；updatedAt 是簿记字段，不算差异
    expect(byId.get(kept.id)?.operation).toBe('UPDATE');
    expect(Object.keys(byId.get(kept.id)?.patch ?? {}).sort()).toEqual(['completed', 'title']);
    expect(byId.get(kept.id)?.patch?.['title']).toBe('kept-on-feature');
    expect(byId.get(kept.id)?.inversePatch?.['title']).toBe('kept');

    // 判定基准：切到 feature 读到的数据
    const mainTitles = await titlesById();
    await rxdb.versionManager.switchBranch('feature');
    const featureTitles = await titlesById();
    await rxdb.versionManager.switchBranch('main');
    expect([...featureTitles.keys()].filter(id => !mainTitles.has(id))).toEqual([added.id]);
    expect([...mainTitles.keys()].filter(id => !featureTitles.has(id))).toEqual([removed.id]);
    expect(featureTitles.get(kept.id)).toBe('kept-on-feature');
  });

  for (const strategy of ['squash', 'normal'] as const) {
    it(`previewMerge（${strategy}）的 merged 与条目和随后真合并的结果一致；预览本身不写任何东西`, async () => {
      const edited = await saveTodo('edited');
      const untouched = await saveTodo('untouched');
      await rxdb.versionManager.createBranch('feature');
      await rxdb.versionManager.switchBranch('feature');
      edited.title = 'edited-on-feature';
      await edited.save();
      const fresh = await saveTodo('fresh');
      fresh.title = 'fresh-v2';
      await fresh.save();
      const ghost = await saveTodo('ghost');
      await ghost.remove();
      await rxdb.versionManager.switchBranch('main');
      untouched.title = 'main-only';
      await untouched.save();

      const changesBefore = await countChanges();
      const preview = await rxdb.versionManager.previewMerge('feature', { strategy });
      expect(await countChanges()).toBe(changesBefore);
      expect(await activeBranch()).toBe('main');

      expect(preview.targetBranchId).toBe('main');
      expect(preview.entries.every(entry => entry.conflict === null)).toBe(true);
      const ops = new Map(preview.entries.map(entry => [entry.entityId, entry.operation]));
      expect(ops).toEqual(
        new Map([
          [edited.id, 'UPDATE'],
          [fresh.id, 'INSERT']
        ])
      );

      const result = await rxdb.versionManager.mergeBranch('feature', { strategy });
      expect(preview.merged).toBe(result.merged);
      const titles = await titlesById();
      for (const entry of preview.entries) {
        expect(titles.get(String(entry.entityId))).toBe(entry.patch?.['title']);
      }
      expect(titles.get(untouched.id)).toBe('main-only');
    });
  }

  it('previewMerge 在真库上标出覆盖，随后的合并确实盖掉了目标的改动', async () => {
    const both = await saveTodo('both');
    const deletedOnFeature = await saveTodo('deleted-on-feature');
    const deletedOnMain = await saveTodo('deleted-on-main');
    const statusOnly = await saveTodo('status-only');
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');
    both.title = 'from-feature';
    await both.save();
    await deletedOnFeature.remove();
    deletedOnMain.title = 'edited-on-feature';
    await deletedOnMain.save();
    statusOnly.title = 'title-from-feature';
    await statusOnly.save();
    await rxdb.versionManager.switchBranch('main');
    both.title = 'from-main';
    await both.save();
    deletedOnFeature.title = 'edited-on-main';
    await deletedOnFeature.save();
    await deletedOnMain.remove();
    statusOnly.completed = true;
    await statusOnly.save();

    const preview = await rxdb.versionManager.previewMerge('feature');
    const conflicts = new Map(preview.entries.map(entry => [entry.entityId, entry.conflict]));
    expect(conflicts.get(both.id)).toEqual({ kind: 'overwrite', fields: ['title'] });
    expect(conflicts.get(deletedOnFeature.id)).toEqual({ kind: 'delete_edited', fields: ['title'] });
    expect(conflicts.get(deletedOnMain.id)).toEqual({ kind: 'update_deleted' });
    // 两边改的是不同的业务字段，只撞上 updatedAt 这样的簿记字段：不算覆盖
    expect(conflicts.get(statusOnly.id)).toBeNull();
    expect(preview.entries.find(entry => entry.entityId === both.id)?.inversePatch?.['title']).toBe('from-main');

    await rxdb.versionManager.mergeBranch('feature');
    const titles = await titlesById();
    expect(titles.get(both.id)).toBe('from-feature');
    expect(titles.has(deletedOnFeature.id)).toBe(false);
    expect(titles.has(deletedOnMain.id)).toBe(false);
    expect(titles.get(statusOnly.id)).toBe('title-from-feature');
  });
});
