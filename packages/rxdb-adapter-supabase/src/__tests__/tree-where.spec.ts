/**
 * @fileoverview SUPA-003：树查询必须应用公开契约里的 `FindTreeOptions.where`
 *
 * 语义以 sqlite-core 的递归 CTE 为准（packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts）：
 *
 * - **锚点不过滤**：`WHERE id = ?` / `parentId is null` 都不带 rule group，
 *   起点节点无论是否匹配都返回；
 * - **递归成员过滤 = 断链**：条件加在 CTE 的递归分支上，某一级不匹配时
 *   它的整棵子树（祖先方向则是它上面的整条链）都不再展开，
 *   即使更远处的节点自身匹配也拿不到；
 * - **hasChildren 不受 where 影响**：CTE 里是独立的 `EXISTS` 子查询，
 *   回答的是「有没有子节点」，不是「有没有匹配 where 的子节点」。
 *
 * 两个适配器语义必须一致，否则同一段业务代码换存储后结果会变。
 */

import { type FindTreeOptions, RxDB, SyncType, type UUID } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import type { SupabaseTreeRepository } from '../SupabaseTreeRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

describe('SUPA-003 — 树查询应用 FindTreeOptions.where', () => {
  let adapter: RxDBAdapterSupabase;
  let repository: SupabaseTreeRepository<typeof MenuLarge>;

  const prefix = `tw-${Date.now()}`;
  /** 匹配 where 的标题前缀 */
  const keep = `${prefix}-keep`;
  /** 键是夹具里的节点别名，值取 MenuLarge 的 `idType`（`UUID`），可直接喂给 `entityId` */
  const ids: Record<string, UUID> = {};

  /**
   * 夹具树（括号内是标题前缀，`keep` 才匹配 where）：
   *
   * ```
   * root (anchor)          ← 锚点，不匹配 where
   * ├── a    (keep)
   * │   └── a1 (keep)
   * │       └── c  (drop)  ← a1 唯一的子节点，且不匹配 where
   * └── b    (drop)        ← 不匹配 → 断链
   *     └── b1 (keep)      ← 自身匹配，但被 b 断链
   * ```
   *
   * `c` 的存在是为了让 hasChildren 那条用例真的有判别力：a1 过滤后的子节点集合为空、
   * 未过滤的却非空，两种实现给出的答案相反。没有 `c` 时两者都答 `false`，用例是假绿。
   */
  const where: FindTreeOptions<typeof MenuLarge>['where'] = {
    combinator: 'and',
    rules: [{ field: 'title', operator: 'startsWith', value: keep }]
  };

  beforeAll(async () => {
    const rxdb = new RxDB({
      dbName: `tree-where-${Date.now()}`,
      context: { userId: 'test-user' },
      entities: [MenuLarge],
      sync: { remote: { adapter: 'supabase' }, type: SyncType.None }
    });

    rxdb.adapter(
      'supabase',
      async db => new RxDBAdapterSupabase(db, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY })
    );
    rxdb.init();

    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();
    repository = adapter.getRepository(MenuLarge) as SupabaseTreeRepository<typeof MenuLarge>;

    const insert = async (key: string, title: string, parentKey?: string): Promise<void> => {
      const { data, error } = await adapter.client
        .from('menu_large')
        .insert({ title, parentId: parentKey ? ids[parentKey] : null })
        .select('id');
      if (error) throw new Error(`创建 ${key} 失败: ${error.message}`);
      ids[key] = (data as { id: UUID }[])[0].id;
    };

    await insert('root', `${prefix}-anchor-root`);
    await insert('a', `${keep}-a`, 'root');
    await insert('a1', `${keep}-a1`, 'a');
    await insert('c', `${prefix}-drop-c`, 'a1');
    await insert('b', `${prefix}-drop-b`, 'root');
    await insert('b1', `${keep}-b1`, 'b');
  }, 60_000);

  afterAll(async () => {
    await adapter.client.from('menu_large').delete().eq('id', ids['root']);
    await adapter.client.from('rxdb_change').delete().eq('entity', 'MenuLarge');
  }, 60_000);

  it('findDescendants：锚点豁免，不匹配的子节点断链', async () => {
    const all = await repository.findDescendants({ entityId: ids['root'], level: 3 });
    expect(all.map(node => node.id).sort()).toEqual(
      [ids['a'], ids['a1'], ids['b'], ids['b1'], ids['c'], ids['root']].sort()
    );

    const filtered = await repository.findDescendants({ entityId: ids['root'], level: 3, where });

    // root 是锚点，尽管标题不匹配也在结果里；b 不匹配被剔除；
    // b1 自身匹配，但父节点 b 已断链，取不到；c 不匹配，也不返回。
    expect(filtered.map(node => node.id).sort()).toEqual([ids['a'], ids['a1'], ids['root']].sort());
  });

  /**
   * 这条在修复**前**就是绿的 —— 那时 `where` 整个被忽略，「不受 where 影响」自动成立。
   * 它守的是修复过程本身：一旦把 hasChildren 建立在过滤后的子节点集合上立刻变红，
   * 判别力来自 a1 —— 它有子节点 `c`，但 `c` 不匹配 where。
   */
  it('findDescendants：hasChildren 不受 where 影响', async () => {
    const filtered = await repository.findDescendants({ entityId: ids['root'], level: 3, where });
    const byId = new Map(filtered.map(node => [node.id, node as unknown as Record<string, unknown>]));

    // root 匹配 where 的子节点只有 a，但 hasChildren 问的是「有没有子节点」
    expect(byId.get(ids['root'])?.['hasChildren']).toBe(true);
    expect(byId.get(ids['a'])?.['hasChildren']).toBe(true);

    // a1 过滤后的子节点集合为空，未过滤的是 [c] —— 必须答 true
    expect(byId.get(ids['a1'])?.['hasChildren']).toBe(true);
  });

  it('countDescendants：与 findDescendants 同一套过滤', async () => {
    const count = await repository.countDescendants({ entityId: ids['root'], level: 3, where });

    // 不含锚点自身：a + a1
    expect(count).toBe(2);
  });

  it('findAncestors：锚点豁免，不匹配的祖先断链', async () => {
    const all = await repository.findAncestors({ entityId: ids['a1'], level: 3 });
    expect(all.map(node => node.id).sort()).toEqual([ids['a'], ids['a1'], ids['root']].sort());

    const filtered = await repository.findAncestors({ entityId: ids['a1'], level: 3, where });

    // a1 是锚点；a 匹配；root 不匹配 → 断链，链到此为止
    expect(filtered.map(node => node.id).sort()).toEqual([ids['a'], ids['a1']].sort());
  });

  it('findAncestors：起点自身不匹配 where 时仍然返回', async () => {
    const filtered = await repository.findAncestors({ entityId: ids['b'], level: 3, where });

    // b 是锚点，豁免；其父 root 不匹配 → 断链
    expect(filtered.map(node => node.id)).toEqual([ids['b']]);
  });

  it('countAncestors：与 findAncestors 同一套过滤', async () => {
    const count = await repository.countAncestors({ entityId: ids['a1'], level: 3, where });

    // 不含锚点自身：只剩 a
    expect(count).toBe(1);
  });
});
