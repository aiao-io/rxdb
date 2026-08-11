import type { RxDBEntityId } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { MenuEntity, MenuNode } from './tree-utils';
import { collectDescendants, countDescendants, generateBatchMenus } from './tree-utils';

describe('tree-utils entity IDs', () => {
  const menus: MenuNode[] = [
    { id: 0, parentId: null },
    { id: 0n, parentId: 0 },
    { id: 'leaf', parentId: 0n }
  ];

  it('counts descendants through 0 and 0n parent IDs', () => {
    expect(countDescendants(0, menus)).toBe(2);
  });

  it('collects descendants without coercing ID types', () => {
    expect(collectDescendants(0, menus)).toEqual(new Set([0n, 'leaf']));
  });
});

/**
 * 批量生成的标题必须满足 `MenuLarge` / `MenuSimple` 上的唯一索引
 * `parent_title = (parentId, title) unique, normalized`。
 *
 * @remarks
 * `APP-dev-rxdb-angular-e2e-p0-1`：`tree-menu-lazy.spec.ts` 的「连续两次批量添加」
 * 用例 6/6 必红，根因就在这里 —— 每一批的标题都是 `Batch 0..N-1`，而 `i = 0`
 * 那一条**必然是根**（`parentIds` 初始只有 `[null]`），所以第二批的
 * `(null, 'Batch 0')` 与第一批逐字相同，整批 INSERT 撞唯一索引全数回滚。
 *
 * 这不是测试的问题：demo 页上连点两次「添加 100 条」，第二次真的不生效。
 *
 * 为什么唯一性 token 不能从 `existingRoots` 推：React 端的调用方
 * （`useTreeMenuLazyStore.addManyMenus`）**只传最后一个根**，
 * 任何「扫一遍现有标题再挑个没用过的编号」的方案在那一端立刻失效。
 */
describe('generateBatchMenus 标题唯一性', () => {
  let seq = 0;

  class FakeMenu implements MenuEntity {
    readonly id: RxDBEntityId = `fake-${seq++}`;
    parentId: RxDBEntityId | null = null;
    sortOrder: string | null = null;
    title = '';
  }

  const uniqueKey = (menu: MenuEntity) => `${String(menu.parentId ?? '<root>')}::${menu.title}`;

  it('同一批内 (parentId, title) 不重复', () => {
    const keys = generateBatchMenus(100, () => new FakeMenu(), []).map(uniqueKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('连续两批之间 (parentId, title) 也不重复', () => {
    const first = generateBatchMenus(100, () => new FakeMenu(), []);
    const second = generateBatchMenus(
      100,
      () => new FakeMenu(),
      first.filter(m => m.parentId == null)
    );

    const keys = [...first, ...second].map(uniqueKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
