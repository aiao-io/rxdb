import { describe, expect, it } from 'vitest';
import type { MenuEntity } from './menu-utils';
import { generateBatchMenus } from './menu-utils';

/**
 * 批量生成的标题必须满足 `MenuLarge` / `MenuSimple` 上的唯一索引
 * `parent_title = (parentId, title) unique, normalized`。
 *
 * @remarks
 * `APP-dev-rxdb-angular-e2e-p0-1`：Angular 端的「连续两次批量添加」e2e 用例 6/6 必红，
 * 根因是每一批的标题都是 `Batch 0..N-1`，而 `i = 0` 那一条**必然是根**
 * （`parentIds` 初始只有 `['root']`），于是第二批的 `(null, 'Batch 0')`
 * 与第一批逐字相同，整批 INSERT 撞唯一索引全数回滚。
 *
 * 三端的 `generateBatchMenus` 逐字相同，缺陷也逐字相同 —— 只有 Angular 端有一条
 * 「连点两次」的 e2e，所以只在那一端暴露。按三框架对称一并修，测试也一并补。
 *
 * 为什么唯一性 token 不能从 `existingRoots` 推：本端的 `addManyMenus` 传的是全部根，
 * 但 React 端**只传最后一个根**。同一个函数被两种调用契约共用，
 * 任何「扫一遍现有标题再挑个没用过的编号」的方案在那一端立刻失效。
 */
describe('generateBatchMenus 标题唯一性', () => {
  let seq = 0;

  class FakeMenu implements MenuEntity<FakeMenu> {
    readonly id: string = `fake-${seq++}`;
    parentId: string | null = null;
    sortOrder: string | null = null;
    title: string;
    // 本端的 generateBatchMenus 不直接写 parentId，只调 parent$.set —— 与产品实体一致
    readonly parent$ = {
      set: (parent: FakeMenu | null) => {
        this.parentId = parent?.id ?? null;
      }
    };

    constructor(data: { title: string; sortOrder: string }) {
      this.title = data.title;
      this.sortOrder = data.sortOrder;
    }
  }

  const uniqueKey = (menu: FakeMenu) => `${menu.parentId ?? '<root>'}::${menu.title}`;

  it('同一批内 (parentId, title) 不重复', () => {
    const keys = generateBatchMenus(100, FakeMenu, []).map(uniqueKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('连续两批之间 (parentId, title) 也不重复', () => {
    const first = generateBatchMenus(100, FakeMenu, []);
    const second = generateBatchMenus(
      100,
      FakeMenu,
      first.filter(m => m.parentId == null)
    );

    const keys = [...first, ...second].map(uniqueKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
