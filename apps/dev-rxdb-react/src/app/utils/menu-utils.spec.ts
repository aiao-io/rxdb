import { describe, expect, it } from 'vitest';
import type { MenuEntity } from './menu-utils';
import { generateBatchMenus } from './menu-utils';

/**
 * 批量生成的标题必须满足 `SortableMenuLarge` / `SortableMenuSimple` 上的唯一索引
 * `parent_title = (parentId, title) unique, normalized`。
 *
 * @remarks
 * `APP-dev-rxdb-angular-e2e-p0-1`：Angular 端的「连续两次批量添加」e2e 用例 6/6 必红，
 * 根因是每一批的标题都是 `Batch 0..N-1`，而 `i = 0` 那一条**必然是根**
 * （`parentIds` 初始只有 `['root']`），于是第二批的 `(null, 'Batch 0')`
 * 与第一批逐字相同，整批 INSERT 撞唯一索引全数回滚。
 *
 * 三端的 `generateBatchMenus` 逐字相同，缺陷也逐字相同 —— React/Vue 端只是
 * 没有一条 e2e 连点两次，所以从没暴露。按三框架对称一并修，测试也一并补。
 *
 * 唯一性 token 取随机：生成器不读任何已有节点（也不收 `existingRoots`），
 * 任何「扫一遍现有标题再挑个没用过的编号」的方案在这里都无从实现。
 */
describe('generateBatchMenus 标题唯一性', () => {
  let seq = 0;

  class FakeMenu implements MenuEntity<FakeMenu> {
    readonly id: string = `fake-${seq++}`;
    parentId: string | null = null;
    sortOrder: string | null = null;
    /** 构造入参的原样记录：断言生成器没有塞 `sortOrder`。 */
    readonly seed: object;
    title: string;
    // 本端的 generateBatchMenus 不直接写 parentId，只调 parent$.set —— 与产品实体一致
    readonly parent$ = {
      set: (parent: FakeMenu | null) => {
        this.parentId = parent?.id ?? null;
      }
    };

    constructor(data: { title: string }) {
      this.seed = data;
      this.title = data.title;
    }
  }

  const uniqueKey = (menu: FakeMenu) => `${menu.parentId ?? '<root>'}::${menu.title}`;

  it('同一批内 (parentId, title) 不重复', () => {
    const keys = generateBatchMenus(100, FakeMenu).map(uniqueKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('连续两批之间 (parentId, title) 也不重复', () => {
    const first = generateBatchMenus(100, FakeMenu);
    const second = generateBatchMenus(100, FakeMenu);

    const keys = [...first, ...second].map(uniqueKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/**
 * US-031：排序键由引擎在保存事务里追加到所属组末尾，生成器一概不写。
 *
 * 此前它给每个节点写 `sortOrder: ''` 占位、再按父节点算键，并以页面已加载的根节点作锚点；
 * 懒加载页的锚点只是「最后一个根」，与库里真正的尾键不同步，批量追加会撞键。
 */
describe('generateBatchMenus 不写排序键', () => {
  class SeedMenu implements MenuEntity<SeedMenu> {
    readonly id: string = crypto.randomUUID();
    parentId: string | null = null;
    sortOrder: string | null = null;
    readonly parent$ = {
      set: (parent: SeedMenu | null) => {
        this.parentId = parent?.id ?? null;
      }
    };
    readonly title: string;
    constructor(readonly seed: { title: string }) {
      this.title = seed.title;
    }
  }

  it('构造入参只有 title，生成后的节点 sortOrder 保持缺省', () => {
    const menus = generateBatchMenus(50, SeedMenu);

    expect(menus).toHaveLength(50);
    for (const menu of menus) {
      expect(Object.keys(menu.seed)).toEqual(['title']);
      expect(menu.sortOrder).toBeNull();
    }
  });

  it('生成器只收数量与实体类，不再收已有根节点', () => {
    expect(generateBatchMenus.length).toBe(2);
  });
});
