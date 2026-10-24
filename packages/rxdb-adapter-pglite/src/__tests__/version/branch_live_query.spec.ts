import { Entity, EntityBase, PropertyType, RxDB, RxDBBranch, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * @fileoverview US-222：订阅分支表的活查询跟得上建分支、删分支。
 *
 * @remarks
 * 分支表不写变更日志，本地事件靠 `NOTIFY` 给的行号回查行再派发；删除时行已经没了，回查为空。
 * 判定基准是库里的行：每一步之后活查询发出的行要与之一致。SQLite 系的同一条用例在共享分支套件里。
 */
/** 关掉变更日志的业务实体：删行之后活查询要立刻反映，与分支表走同一条事件路径 */
@Entity({
  name: 'UnloggedNote',
  tableName: 'unlogged_note',
  log: false,
  properties: [{ name: 'title', type: PropertyType.string, nullable: true }]
})
class UnloggedNote extends EntityBase {
  title?: string | null;
}

describe('分支表的活查询跟得上建分支、删分支（US-222）', () => {
  let rxdb: RxDB;

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [Todo, UnloggedNote],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb.use(rxDBPluginHistory);
    await rxdb.connect('pglite');
  });

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('建分支、删分支、合并时删源分支之后，订阅分支表的活查询发出的行与库里一致', async () => {
    const all = { where: { combinator: 'and' as const, rules: [] } };
    let latest: string[] = [];
    const subscription = rxdb.entityManager
      .getRepository(RxDBBranch)
      .findAll(all)
      .subscribe(rows => (latest = rows.map(row => row.id).sort()));
    try {
      await expect.poll(() => latest).toEqual(['main']);
      await rxdb.versionManager.createBranch('feature');
      await expect.poll(() => latest).toEqual(['feature', 'main']);
      await rxdb.versionManager.removeBranch('feature');
      await expect.poll(() => latest).toEqual(['main']);

      await rxdb.versionManager.createBranch('merged');
      await rxdb.versionManager.switchBranch('merged');
      const todo = new Todo();
      todo.title = 'from-merged';
      await todo.save();
      await rxdb.versionManager.switchBranch('main');
      await rxdb.versionManager.mergeBranch('merged', { deleteSource: true });
      await expect.poll(() => latest).toEqual(['main']);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('其余关掉变更日志的实体同理：删行之后活查询立刻不再有它', async () => {
    const note = new UnloggedNote();
    note.title = 'unlogged';
    await note.save();
    let latest: string[] = [];
    const subscription = rxdb.entityManager
      .getRepository(UnloggedNote)
      .findAll({ where: { combinator: 'and', rules: [] } })
      .subscribe(rows => (latest = rows.map(row => String(row.title))));
    try {
      await expect.poll(() => latest).toEqual(['unlogged']);
      await note.remove();
      await expect.poll(() => latest).toEqual([]);
    } finally {
      subscription.unsubscribe();
    }
  });
});
