import { Entity, EntityBase, PropertyType, RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';
import { matchAll, readFirst, whereEq } from '../query.js';
import { RELEASE_BOARD_ID, seedReleaseBoardDataset } from '../testing/index.js';

/**
 * 既有库升级重开（US-534 AC#8 / US-540 AC#7）的 PGlite 磁盘库半边：
 * 同一个持久库先用「非看板实体」建库并写入，断开后再装看板实体与插件重开——
 * 新实体表在既有库上补建，既有数据不受影响，种子可装载且重开后原样。
 *
 * sqlite-wasm 半边在 `board-upgrade.browser.spec.ts`，被该适配器干净关闭丢行的缺陷挡住；
 * 这里跑绿说明看板实体的补建路径本身没问题，问题收敛在适配器。
 */

/** 既有库里的旧实体（非看板命名空间）。 */
@Entity({
  name: 'Note',
  tableName: 'note',
  namespace: 'legacy',
  displayName: '笔记',
  properties: [{ name: 'title', type: PropertyType.string, displayName: '标题' }]
})
class Note extends EntityBase {
  title!: string;
}

const BOARD_ENTITIES: EntityType[] = [Board, Column, Task, BoardLabel, TaskLabel];

describe('既有库升级重开（PGlite 磁盘库，US-534 AC#8 / US-540 AC#7）', () => {
  const opened: RxDB[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    for (const rxdb of opened.splice(0)) await rxdb.disconnectAll().catch(() => undefined);
    for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
  });

  const open = async (dataDir: string, entities: EntityType[], withBoardPlugins: boolean): Promise<RxDB> => {
    const rxdb = new RxDB({
      dbName: 'board-upgrade',
      entities,
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.use(rxDBPluginHistory);
    if (withBoardPlugins) rxdb.use(rxDBPluginSearch);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { dataDir }));
    await rxdb.connect('pglite');
    opened.push(rxdb);
    return rxdb;
  };

  const close = async (rxdb: RxDB): Promise<void> => {
    await rxdb.disconnectAll();
    opened.splice(opened.indexOf(rxdb), 1);
  };

  it('旧实体先建库写入，断开后装看板实体重开：旧数据原样、种子可装载、再重开不丢', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'aiao-board-upgrade-'));
    directories.push(dataDir);

    const legacy = await open(dataDir, [Note], false);
    await legacy.entityManager
      .getRepository(Note)
      .create(legacy.entityManager.instantiate(Note, { title: '升级前的旧笔记' }));
    await close(legacy);

    const upgraded = await open(dataDir, [Note, ...BOARD_ENTITIES], true);
    const notes = await readFirst(upgraded.entityManager.getRepository(Note).find({ where: matchAll() }));
    expect(notes.map(note => note.title)).toEqual(['升级前的旧笔记']);
    await seedReleaseBoardDataset(upgraded);
    const columns = await readFirst(
      upgraded.entityManager.getRepository(Column).find({ where: whereEq('boardId', RELEASE_BOARD_ID) })
    );
    expect(columns).toHaveLength(4);
    await close(upgraded);

    const reopened = await open(dataDir, [Note, ...BOARD_ENTITIES], true);
    const columnsAfter = await readFirst(
      reopened.entityManager.getRepository(Column).find({ where: whereEq('boardId', RELEASE_BOARD_ID) })
    );
    expect(columnsAfter.map(column => column.title)).toEqual(['To do', 'Doing', 'Done', 'Ideas']);
    const notesAfter = await readFirst(reopened.entityManager.getRepository(Note).find({ where: matchAll() }));
    expect(notesAfter.map(note => note.title)).toEqual(['升级前的旧笔记']);
    // 重开后仍可写：记日志的事务在补建的表上重建触发器、排序域按组追加
    const created = await reopened.entityManager
      .getRepository(Task)
      .create(reopened.entityManager.instantiate(Task, { columnId: columnsAfter[3].id, title: '升级后新建' }));
    expect(created.sortOrder).toBeTruthy();
    const ideas = await readFirst(
      reopened.entityManager.getRepository(Task).find({ where: whereEq('columnId', columnsAfter[3].id) })
    );
    expect(ideas.map(task => task.title)).toEqual(['升级后新建']);
  });
});
