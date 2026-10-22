import type { RxDB } from '@aiao/rxdb';
import { PropertyType } from '@aiao/rxdb';
import { sqliteWasmFactory } from '@aiao/rxdb-adapter-sqlite-wasm/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { Entity, EntityBase } from '@aiao/rxdb';
import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';
import { RELEASE_BOARD_ID, seedReleaseBoardDataset } from '../testing/index.js';

/**
 * 既有库升级重开（US-534 AC#8 / US-540 AC#7 的组合验收）：
 * 同一个持久库先用「非看板实体」建库并写入，断开后再装看板实体与插件重开——
 * 新实体表在既有库上正常创建，既有实体数据不受影响，种子可装载且重开后原样。
 *
 * 用 sqlite-wasm 的真实持久化（idb vfs）跑跨断开重开；迁移路径与触发器重建
 * 必须在真实后端上验收（既有库补建新实体表的先例见记忆）。
 */

/** 既有库里的旧实体（非看板命名空间）。 */
@Entity({
  name: 'Note',
  tableName: 'note',
  namespace: 'legacy',
  displayName: '笔记',
  properties: [
    { name: 'title', type: PropertyType.string, displayName: '标题' },
    { name: 'sortOrder', type: PropertyType.string, displayName: '排序键' }
  ]
})
class Note extends EntityBase {
  title!: string;
  sortOrder!: string;
}

describe('既有库升级重开（US-534 AC#8 / US-540 AC#7）', () => {
  it.skip('对照组：同一组实体重开，旧数据保留（被适配器关闭路径数据丢失缺陷阻塞，见下方 TODO）', async () => {
    const name = `board-same-${Math.random().toString(36).slice(2)}`;
    const first = await sqliteWasmFactory.createAdapter<{ rxdb: RxDB; disconnect(): Promise<void> }>({
      entities: [Note],
      plugins: [rxDBPluginHistory],
      persistent: true,
      dbName: name
    });
    adapters.push(first);
    await first.rxdb.entityManager.getRepository(Note).create(
      first.rxdb.entityManager.instantiate(Note, {
        id: 'd0000000-0000-4000-8000-000000000002',
        title: '对照组笔记',
        sortOrder: 'a0'
      })
    );
    await first.disconnect();

    const second = await sqliteWasmFactory.createAdapter<{ rxdb: RxDB; disconnect(): Promise<void> }>({
      entities: [Note],
      plugins: [rxDBPluginHistory],
      persistent: true,
      dbName: name
    });
    adapters.push(second);
    const notes = await firstValueFrom(
      second.rxdb.entityManager.getRepository(Note).find({ where: { combinator: 'and', rules: [] } })
    );

    // 阶段 2 再写一条，断开后阶段 3 读——定位「只有首段写入丢失」还是「跨断开一律丢失」
    await second.rxdb.entityManager.getRepository(Note).create(
      second.rxdb.entityManager.instantiate(Note, {
        id: 'd0000000-0000-4000-8000-000000000003',
        title: '第二阶段笔记',
        sortOrder: 'a1'
      })
    );
    await second.disconnect();

    const third = await sqliteWasmFactory.createAdapter<{ rxdb: RxDB; disconnect(): Promise<void> }>({
      entities: [Note],
      plugins: [rxDBPluginHistory],
      persistent: true,
      dbName: name
    });
    adapters.push(third);
    const notes3 = await firstValueFrom(
      third.rxdb.entityManager.getRepository(Note).find({ where: { combinator: 'and', rules: [] } })
    );
    expect(notes.map(note => note.title)).toEqual(['对照组笔记']);
    expect(notes3.map(note => note.title)).toEqual(['对照组笔记', '第二阶段笔记']);
  });

  const DB_NAME = `board-upgrade-${Math.random().toString(36).slice(2)}`;
  const adapters: { disconnect(): Promise<void>; rxdb: RxDB }[] = [];

  afterEach(async () => {
    for (const adapter of adapters.splice(0)) {
      await adapter.disconnect().catch(() => undefined);
    }
  });

  // TODO(SQLC-待开)：sqlite-wasm 的 idb vfs 在「干净关闭（disconnect）后重连」场景丢已提交行——
  // 实测表结构保留、INSERT 的行丢失；页面崩溃/重载路径（demo 的常规重开）不受影响。
  // 缺陷在适配器关闭路径（worker + comlink + idb 导出），修好后本用例与上方对照组一起去掉 skip。
  it.skip('旧实体先建库写入，断开后装看板实体重开：旧数据原样、种子可装载、再重开不丢', async () => {
    // 第一段：只有旧实体的库
    const legacy = await sqliteWasmFactory.createAdapter<{ rxdb: RxDB; disconnect(): Promise<void> }>({
      entities: [Note],
      plugins: [rxDBPluginHistory],
      persistent: true,
      dbName: DB_NAME
    });
    adapters.push(legacy);
    const legacyRepo = legacy.rxdb.entityManager.getRepository(Note);
    await legacyRepo.create(
      legacy.rxdb.entityManager.instantiate(Note, {
        id: 'd0000000-0000-4000-8000-000000000001',
        title: '升级前的旧笔记',
        sortOrder: 'a0'
      })
    );
    await legacy.disconnect();

    // 第二段：装上看板实体与插件重开同一库
    const upgraded = await sqliteWasmFactory.createAdapter<{ rxdb: RxDB; disconnect(): Promise<void> }>({
      entities: [Note, Board, Column, Task, BoardLabel, TaskLabel],
      plugins: [rxDBPluginHistory, rxDBPluginSearch],
      persistent: true,
      dbName: DB_NAME
    });
    adapters.push(upgraded);
    const rxdb = upgraded.rxdb;

    // 旧数据不受影响
    const notes = await firstValueFrom(
      rxdb.entityManager.getRepository(Note).find({ where: { combinator: 'and', rules: [] } })
    );
    expect(notes.map(note => note.title)).toEqual(['升级前的旧笔记']);

    // 新实体可用：装载种子
    await seedReleaseBoardDataset(rxdb);
    const columns = await firstValueFrom(
      rxdb.entityManager
        .getRepository(Column)
        .find({ where: { combinator: 'and', rules: [{ field: 'boardId', operator: '=', value: RELEASE_BOARD_ID }] } })
    );
    expect(columns).toHaveLength(4);

    // 重开后实体、顺序与旧数据原样
    await upgraded.disconnect();
    const reopened = await sqliteWasmFactory.createAdapter<{ rxdb: RxDB; disconnect(): Promise<void> }>({
      entities: [Note, Board, Column, Task, BoardLabel, TaskLabel],
      plugins: [rxDBPluginHistory, rxDBPluginSearch],
      persistent: true,
      dbName: DB_NAME
    });
    adapters.push(reopened);
    const columnsAfter = await firstValueFrom(
      reopened.rxdb.entityManager
        .getRepository(Column)
        .find({ where: { combinator: 'and', rules: [{ field: 'boardId', operator: '=', value: RELEASE_BOARD_ID }] } })
    );
    expect(columnsAfter.map(column => column.title)).toEqual(['To do', 'Doing', 'Done', 'Ideas']);
    const notesAfter = await firstValueFrom(
      reopened.rxdb.entityManager.getRepository(Note).find({ where: { combinator: 'and', rules: [] } })
    );
    expect(notesAfter.map(note => note.title)).toEqual(['升级前的旧笔记']);
  });
});
