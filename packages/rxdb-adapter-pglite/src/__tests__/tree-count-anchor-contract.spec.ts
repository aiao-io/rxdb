/**
 * RV-079 回归：PGlite 树计数（countDescendants / countAncestors）必须满足「节点不存在 ≡ 空集 ≡ 0」，
 * 不能在锚点缺失或已删除时把裸 `count(*) - 1` 的 -1 交给调用方。
 *
 * 判据：`generate_tree_sql` 非根计数分支改成 `GREATEST(count(*) - 1, 0)`（与
 * `rxdb-adapter-sqlite-core` 的 `max(count(*)-1, 0)` 同契约）；`PGliteTreeRepository.parseCountResult`
 * 额外拒绝负数结果作为防线。覆盖：存在叶子、不存在锚点、已删除锚点、级联删除后旧活查询。
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { cleanup_db, generateDbName } from './test-utils.js';

describe('PGlite 树计数契约：锚点不存在/已删除时非负（RV-079）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'userId' },
      entities: [MenuLarge],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    // 树实体的 `TreeRepository` 由 `@aiao/rxdb-plugin-tree` 注册，不装插件 `init()` 直接抛。
    rxdb.use(rxDBPluginTree);
    rxdb.adapter('pglite', db => {
      return new RxDBAdapterPGlite(db, { store: 'memory' });
    });
    adapter = await rxdb.getAdapter('pglite');
    rxdb.init();
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('存在的叶子节点：计数与对应数组长度一致（0 后代/0 祖先）', async () => {
    const root = new MenuLarge({ title: 'leaf-root' });
    const leaf = new MenuLarge({ title: 'leaf-child' });
    root.children$.add(leaf);
    await root.save();

    const [descCount, descArray, ancCount, ancArray] = await Promise.all([
      firstValueFrom(MenuLarge.countDescendants({ entityId: leaf.id, level: 100 })),
      firstValueFrom(MenuLarge.findDescendants({ entityId: leaf.id, level: 100 })),
      firstValueFrom(MenuLarge.countAncestors({ entityId: root.id, level: 100 })),
      firstValueFrom(MenuLarge.findAncestors({ entityId: root.id, level: 100 }))
    ]);

    // findDescendants/findAncestors 包含锚点自身，count 不含锚点：count === array.length - 1
    expect(descCount).toBe(0);
    expect(descArray.length - 1).toBe(descCount);
    expect(ancCount).toBe(0);
    expect(ancArray.length - 1).toBe(ancCount);
  });

  it('不存在的锚点：两种计数均为 0，不是 -1', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000099';

    const [descCount, descArray, ancCount, ancArray] = await Promise.all([
      firstValueFrom(MenuLarge.countDescendants({ entityId: nonExistentId, level: 100 })),
      firstValueFrom(MenuLarge.findDescendants({ entityId: nonExistentId, level: 100 })),
      firstValueFrom(MenuLarge.countAncestors({ entityId: nonExistentId, level: 100 })),
      firstValueFrom(MenuLarge.findAncestors({ entityId: nonExistentId, level: 100 }))
    ]);

    expect(descCount).toBe(0);
    expect(descArray).toEqual([]);
    expect(ancCount).toBe(0);
    expect(ancArray).toEqual([]);
  });

  it('已删除的锚点：删除后一次性查询两种计数均为 0', async () => {
    const node = new MenuLarge({ title: 'deleted-anchor' });
    await node.save();
    const deletedId = node.id;
    await node.remove();

    const descCount = await firstValueFrom(MenuLarge.countDescendants({ entityId: deletedId, level: 100 }));
    const ancCount = await firstValueFrom(MenuLarge.countAncestors({ entityId: deletedId, level: 100 }));

    expect(descCount).toBe(0);
    expect(ancCount).toBe(0);
  });

  it('级联删除后，锚定在被删节点自身的旧活查询应收敛到 0，而不是停在 -1', async () => {
    const root = new MenuLarge({ title: 'cascade-root' });
    const child = new MenuLarge({ title: 'cascade-child' });
    const grand = new MenuLarge({ title: 'cascade-grand' });
    root.children$.add(child);
    child.children$.add(grand);
    await root.save();

    const emissions: number[] = [];
    const sub = MenuLarge.countDescendants({ entityId: child.id, level: 100 }).subscribe(count => {
      emissions.push(count);
    });

    try {
      // 等待首发：child 自身尚存在，后代只有 grand → 1
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(emissions[0]).toBe(1);

      // 级联删除 child：child 与 grand 一并移除，锚点自己也被删除
      await child.remove();
      await new Promise(resolve => setTimeout(resolve, 150));

      const last = emissions.at(-1);
      expect(last).toBe(0);
      // 中途不能出现负数（RV-079 的核心断言：锚点消失的瞬间不能把 -1 发布出去）
      expect(emissions.every(count => count >= 0)).toBe(true);
    } finally {
      sub.unsubscribe();
    }
  });
});
