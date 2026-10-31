import { RxDB, RxDBChange, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree, type WorkingTreeStatus } from '@aiao/rxdb-plugin-working-tree';
import { ConformanceNote } from '@aiao/rxdb-plugin-working-tree/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { buildLocaleChain, I18n, i18nEntities, I18nSettings, resolveMessage } from './index.js';

const ALL = { combinator: 'and' as const, rules: [] };

const credentials = (status: WorkingTreeStatus) => ({
  expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
  expectedHeadRevision: status.headRevision,
  expectedWorkingTreeRevision: status.workingTreeRevision
});

async function createScene() {
  const db = new RxDB({
    dbName: `i18n-history-${crypto.randomUUID()}`,
    entities: [ConformanceNote, ...i18nEntities()],
    context: { userId: 'i18n-history-proof' },
    multiInstance: false,
    sync: { type: SyncType.None, local: { adapter: 'pglite' } }
  });
  db.adapter('pglite', rxdb => new RxDBAdapterPGlite(rxdb, { store: 'memory' }));
  db.use(rxDBPluginHistory);
  db.use(rxDBPluginWorkingTree);
  await db.connect('pglite');
  await db.workingTree.enable();
  const i18n = new I18n({ rxdb: db, deviceLocale: 'zh-Hans' });
  await i18n.init();
  const preference = async () =>
    (await db.localAdapterSync.getRepository(I18nSettings).find({ where: ALL }))[0].devicePreferredLocale;
  const createNote = async (title: string) => {
    const note = db.entityManager.instantiate(ConformanceNote);
    note.title = title;
    note.body = null;
    await note.save();
    return note;
  };
  const commit = async (message: string) => {
    const status = await db.workingTree.status();
    const result = await db.workingTree.commit(message, {
      ...credentials(status),
      authorId: 'i18n-history-proof',
      operationId: crypto.randomUUID()
    });
    if (!result.ok) throw new Error(`偏好隔离夹具提交失败：${JSON.stringify(result)}`);
    return result.commitId;
  };
  const readNote = async (id: string) => {
    const [note] = await db.localAdapterSync.getRepository(ConformanceNote).find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] }
    });
    if (!note) throw new Error(`偏好隔离夹具 note 缺失：${id}`);
    return note;
  };
  return {
    db,
    i18n,
    preference,
    createNote,
    commit,
    readNote,
    async close() {
      i18n.destroy();
      await db.destroy();
    }
  };
}

describe('US-911 设备偏好历史隔离', () => {
  it('切换语言不进入撤销栈、工作树 diff 或 commit，业务撤销仍生效', async () => {
    const scene = await createScene();
    try {
      const note = await scene.createNote('基线');
      await scene.commit('基线');
      note.title = '业务编辑';
      await note.save();
      const history = scene.db.versionManager.history();
      const beforeUndo = await firstValueFrom(history.undoCount$);
      const beforeStatus = await scene.db.workingTree.status();
      const beforeDiff = await scene.db.workingTree.diff();
      expect(beforeUndo).toBeGreaterThan(0);
      expect(beforeStatus).toMatchObject({ clean: false, entryCount: 1 });
      expect(beforeDiff.entries).toHaveLength(1);
      await scene.i18n.setLocale('en');
      expect(await firstValueFrom(history.undoCount$)).toBe(beforeUndo);
      expect(await firstValueFrom(scene.db.versionManager.history(I18nSettings).undoCount$)).toBe(0);
      expect(await scene.db.workingTree.status()).toEqual(beforeStatus);
      expect(await scene.db.workingTree.diff()).toEqual(beforeDiff);
      expect(
        await scene.db.localAdapterSync.getRepository(RxDBChange).find({
          where: { combinator: 'and', rules: [{ field: 'namespace', operator: '=', value: 'i18n' }] }
        })
      ).toHaveLength(0);

      await history.undo();
      expect((await scene.readNote(note.id)).title).toBe('基线');
      expect(await scene.preference()).toBe('en');
      expect(scene.i18n.locale).toBe('en');
      await history.redo();
      expect((await scene.readNote(note.id)).title).toBe('业务编辑');
      expect(await scene.preference()).toBe('en');

      const committed = await scene.commit('仅提交业务编辑');
      const changes = await scene.db.workingTree.commitChanges(committed);
      expect(changes.entries).toHaveLength(1);
      expect(changes.entries[0]).toMatchObject({ namespace: 'public', entity: 'ConformanceNote', entityId: note.id });
      expect(await scene.preference()).toBe('en');
    } finally {
      await scene.close();
    }
  });

  it('切分支、restore 与 discard 均不回退当前设备语言', async () => {
    const scene = await createScene();
    try {
      const note = await scene.createNote('初始版本');
      const firstCommit = await scene.commit('初始版本');
      await scene.i18n.setLocale('en');
      await scene.db.versionManager.createBranch('alternate');
      await scene.db.versionManager.switchBranch('alternate');
      expect(await scene.preference()).toBe('en');
      const alternate = await scene.readNote(note.id);
      alternate.title = '另一个分支';
      await alternate.save();
      await scene.commit('另一个分支');
      await scene.i18n.setLocale('fr');
      await scene.db.versionManager.switchBranch('main');
      expect((await scene.readNote(note.id)).title).toBe('初始版本');
      expect(await scene.preference()).toBe('fr');
      expect(scene.i18n.locale).toBe('fr');

      const current = await scene.readNote(note.id);
      current.title = '主分支新版本';
      await current.save();
      await scene.commit('主分支新版本');
      await scene.i18n.setLocale('de');
      const beforeRestore = await scene.db.workingTree.status();
      const restored = await scene.db.workingTree.restore({ commitId: firstCommit }, credentials(beforeRestore));
      expect(restored).toMatchObject({ ok: true, restoredCount: 1 });
      expect(await scene.preference()).toBe('de');
      const restoredDiff = await scene.db.workingTree.diff();
      expect(restoredDiff.entries).toHaveLength(1);
      expect(
        restoredDiff.entries.every(entry => entry.namespace === 'public' && entry.entity === 'ConformanceNote')
      ).toBe(true);
      const restoring = await scene.db.workingTree.status();
      await expect(scene.db.workingTree.discard(credentials(restoring))).resolves.toMatchObject({
        ok: true,
        discardedCount: 1
      });
      expect(await scene.preference()).toBe('de');
      expect(scene.i18n.locale).toBe('de');
      expect(await scene.db.workingTree.status()).toMatchObject({ clean: true, entryCount: 0, restoring: false });
    } finally {
      await scene.close();
    }
  });

  it('数据调用方复用纯函数时可提供独立于 UI 的默认内容语言', () => {
    const preferences = { devicePreferredLocale: 'fr', deviceLocale: 'en-GB' };
    const uiChain = buildLocaleChain({ ...preferences, defaultLocale: 'zh-Hans' });
    const contentChain = buildLocaleChain({ ...preferences, defaultLocale: 'de' });
    expect(uiChain).toEqual(['fr', 'en-GB', 'en', 'zh-Hans', 'zh']);
    expect(contentChain).toEqual(['fr', 'en-GB', 'en', 'de']);
    const rows = [{ locale: 'de', namespace: 'content', key: 'title', value: 'Titel' }];
    expect(resolveMessage(rows, contentChain, 'content', 'title')).toEqual({ locale: 'de', value: 'Titel' });
    expect(resolveMessage(rows, uiChain, 'content', 'title')).toEqual({ value: undefined });
  });
});
