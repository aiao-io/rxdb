import {
  rxDBPluginTree,
  type FindTreeOptions,
  type ITreeRepository,
  type TreeRepository
} from '@aiao/rxdb-plugin-tree';
import { MenuSimple } from '@aiao/rxdb-test/entities';
import { describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqlite } from '../RxDBAdapterSqliteOfficial.js';
import { sqliteOfficialFactory } from './sqlite-official-factory.js';

describe('评审：树筛选增量必须与实际递归 SQL 重查一致', () => {
  it.each(['hidden-parent', 'visible-parent'])('父节点 %s 时，叶子变为匹配不能改变遍历筛选语义', async parentTitle => {
    const adapter = await sqliteOfficialFactory.createAdapter<RxDBAdapterSqlite>({
      entities: [MenuSimple],
      plugins: [rxDBPluginTree]
    });
    const db = adapter.rxdb;
    let unsubscribe = (): void => undefined;
    try {
      const root = db.entityManager.instantiate(MenuSimple);
      root.title = 'visible-root';
      await root.save();
      const parent = db.entityManager.instantiate(MenuSimple);
      parent.title = parentTitle;
      parent.parentId = root.id;
      await parent.save();
      const child = db.entityManager.instantiate(MenuSimple);
      child.title = 'hidden-child';
      child.parentId = parent.id;
      await child.save();
      const options: FindTreeOptions<typeof MenuSimple> = {
        entityId: null,
        where: { combinator: 'and', rules: [{ field: 'title', operator: 'contains', value: 'visible' }] }
      };
      const repository = db.entityManager.getRepository<typeof MenuSimple, TreeRepository<typeof MenuSimple>>(
        MenuSimple
      );
      let snapshots = 0;
      let live: MenuSimple[] = [];
      const sub = repository.findDescendants(options).subscribe(data => {
        snapshots += 1;
        live = data;
      });
      unsubscribe = () => sub.unsubscribe();
      await vi.waitFor(() => expect(snapshots).toBeGreaterThan(0));
      child.title = 'visible-child';
      await child.save();
      const sql = await adapter
        .getRepository<typeof MenuSimple, ITreeRepository<typeof MenuSimple>>(MenuSimple)
        .findDescendants(options);
      const ids = (rows: MenuSimple[]): string[] => rows.map(x => x.id).sort();
      // 正确结果可能与更新前相同（hidden-parent 截断了 child），QueryTask 按指纹去重不会再发射，
      // 所以不能等「新快照」，而是等 live 收敛到 SQL 结果，再静置一段确认没有被错误的增量覆盖。
      await vi.waitFor(() => expect(ids(live)).toEqual(ids(sql)));
      await new Promise(resolve => setTimeout(resolve, 50));
      console.log(
        'REVIEW_TREE_FILTER ' +
          JSON.stringify({ parentTitle, live: live.map(x => x.title).sort(), sql: sql.map(x => x.title).sort() })
      );
      expect(ids(live)).toEqual(ids(sql));
    } finally {
      unsubscribe();
      await db.destroy();
      await sqliteOfficialFactory.cleanupAdapter?.(adapter);
    }
  });
});
