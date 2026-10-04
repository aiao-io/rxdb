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
      const before = snapshots;
      child.title = 'visible-child';
      await child.save();
      await vi.waitFor(() => expect(snapshots).toBeGreaterThan(before));
      const sql = await adapter
        .getRepository<typeof MenuSimple, ITreeRepository<typeof MenuSimple>>(MenuSimple)
        .findDescendants(options);
      console.log(
        'REVIEW_TREE_FILTER ' +
          JSON.stringify({ parentTitle, live: live.map(x => x.title).sort(), sql: sql.map(x => x.title).sort() })
      );
      expect(live.map(x => x.id).sort()).toEqual(sql.map(x => x.id).sort());
    } finally {
      unsubscribe();
      await db.destroy();
      await sqliteOfficialFactory.cleanupAdapter?.(adapter);
    }
  });
});
