import type { RxDBEntityId } from '@aiao/rxdb';
import { MenuSimple } from '@aiao/rxdb-test/entities';
import { beforeEach, describe, expect, it } from 'vitest';
import { MenuSearchService } from './menu-search.service';

// 测试用的简化菜单数据
const createTestMenu = (id: RxDBEntityId, title: string, parentId: RxDBEntityId | null): MenuSimple => {
  return { id, title, parentId } as unknown as MenuSimple;
};

describe('MenuSearchService', () => {
  let service: MenuSearchService;
  let testMenus: MenuSimple[];

  beforeEach(() => {
    service = new MenuSearchService();

    // 创建测试菜单结构:
    // - 首页
    //   - 关于我们
    //     - 团队介绍
    //   - 联系方式
    // - 产品中心
    //   - 产品列表
    // - 新闻资讯
    testMenus = [
      createTestMenu('home', '首页', null),
      createTestMenu('about', '关于我们', 'home'),
      createTestMenu('team', '团队介绍', 'about'),
      createTestMenu('contact', '联系方式', 'home'),
      createTestMenu('products', '产品中心', null),
      createTestMenu('product-list', '产品列表', 'products'),
      createTestMenu('news', '新闻资讯', null)
    ];
  });

  describe('filterTreeNodes', () => {
    it('应该返回匹配的菜单ID', () => {
      const result = service.filterTreeNodes(testMenus, '产品');

      expect(result.size).toBe(2);
      expect(result.has('products')).toBe(true);
      expect(result.has('product-list')).toBe(true);
    });

    it('应该支持模糊匹配', () => {
      const result = service.filterTreeNodes(testMenus, '关于');

      expect(result.size).toBe(1);
      expect(result.has('about')).toBe(true);
    });

    it('应该不区分大小写', () => {
      const menusWithEnglish = [createTestMenu('menu1', 'Home', null), createTestMenu('menu2', 'home', null)];

      const result = service.filterTreeNodes(menusWithEnglish, 'HOME');

      expect(result.size).toBe(2);
    });

    it('应该处理空关键词', () => {
      const result = service.filterTreeNodes(testMenus, '');

      expect(result.size).toBe(0);
    });

    it('应该处理只有空格的关键词', () => {
      const result = service.filterTreeNodes(testMenus, '   ');

      expect(result.size).toBe(0);
    });

    it('应该自动修剪关键词空格', () => {
      const result = service.filterTreeNodes(testMenus, '  首页  ');

      expect(result.size).toBe(1);
      expect(result.has('home')).toBe(true);
    });

    it('应该返回空集合（无匹配）', () => {
      const result = service.filterTreeNodes(testMenus, '不存在的菜单');

      expect(result.size).toBe(0);
    });

    it('应该处理空菜单列表', () => {
      const result = service.filterTreeNodes([], '测试');

      expect(result.size).toBe(0);
    });

    it('应该匹配部分文本', () => {
      const result = service.filterTreeNodes(testMenus, '介');

      expect(result.size).toBe(1);
      expect(result.has('team')).toBe(true);
    });

    it('应该保留 number、bigint 与 string ID 类型', () => {
      const menus = [
        createTestMenu(0, 'typed', null),
        createTestMenu(0n, 'typed', null),
        createTestMenu('0', 'typed', null)
      ];

      expect(service.filterTreeNodes(menus, 'typed')).toEqual(new Set<RxDBEntityId>([0, 0n, '0']));
    });
  });

  describe('expandMatchedAncestors', () => {
    it('应该展开匹配项的所有祖先节点', () => {
      const matchedIds = new Set(['team']); // 团队介绍
      const result = service.expandMatchedAncestors(testMenus, matchedIds);

      expect(result.size).toBe(2);
      expect(result.has('about')).toBe(true); // 父节点
      expect(result.has('home')).toBe(true); // 祖父节点
    });

    it('应该处理根节点（无祖先）', () => {
      const matchedIds = new Set(['home']);
      const result = service.expandMatchedAncestors(testMenus, matchedIds);

      expect(result.size).toBe(0);
    });

    it('应该处理一级子节点', () => {
      const matchedIds = new Set(['about']);
      const result = service.expandMatchedAncestors(testMenus, matchedIds);

      expect(result.size).toBe(1);
      expect(result.has('home')).toBe(true);
    });

    it('应该处理多个匹配项', () => {
      const matchedIds = new Set(['team', 'contact']);
      const result = service.expandMatchedAncestors(testMenus, matchedIds);

      expect(result.size).toBe(2);
      expect(result.has('about')).toBe(true);
      expect(result.has('home')).toBe(true);
    });

    it('应该去重祖先节点', () => {
      const matchedIds = new Set(['team', 'about']); // team 和 about 都有共同祖先 home
      const result = service.expandMatchedAncestors(testMenus, matchedIds);

      expect(result.size).toBe(2);
      expect(result.has('home')).toBe(true);
      expect(result.has('about')).toBe(true);
    });

    it('应该处理空匹配集合', () => {
      const matchedIds = new Set<RxDBEntityId>();
      const result = service.expandMatchedAncestors(testMenus, matchedIds);

      expect(result.size).toBe(0);
    });

    it('应该处理孤立节点（找不到父节点）', () => {
      const orphanMenu = createTestMenu('orphan', '孤立节点', 'non-existent');
      const menusWithOrphan = [...testMenus, orphanMenu];
      const matchedIds = new Set(['orphan']);

      const result = service.expandMatchedAncestors(menusWithOrphan, matchedIds);

      expect(result.size).toBe(0);
    });

    it('应该处理循环引用（安全退出）', () => {
      const circularMenus = [createTestMenu('a', 'A', 'b'), createTestMenu('b', 'B', 'a')];
      const matchedIds = new Set(['a']);

      // 应该不会无限循环
      const result = service.expandMatchedAncestors(circularMenus, matchedIds);

      expect(result.size).toBeGreaterThanOrEqual(0);
    });

    it('应该把 0 和 0n 作为有效祖先 ID', () => {
      const menus = [
        createTestMenu(0, 'number root', null),
        createTestMenu(0n, 'bigint parent', 0),
        createTestMenu('leaf', 'leaf', 0n)
      ];

      expect(service.expandMatchedAncestors(menus, new Set<RxDBEntityId>(['leaf']))).toEqual(
        new Set<RxDBEntityId>([0n, 0])
      );
    });
  });

  describe('shouldShowMenu', () => {
    it('应该显示匹配的菜单', () => {
      const matchedIds = new Set(['home']);

      expect(service.shouldShowMenu('home', testMenus, matchedIds)).toBe(true);
    });

    it('应该显示有匹配子节点的菜单', () => {
      const matchedIds = new Set(['team']); // 团队介绍匹配

      // 父节点 about 和祖父节点 home 应该显示
      expect(service.shouldShowMenu('about', testMenus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu('home', testMenus, matchedIds)).toBe(true);
    });

    it('应该隐藏无匹配的菜单', () => {
      const matchedIds = new Set(['home']);

      expect(service.shouldShowMenu('products', testMenus, matchedIds)).toBe(false);
      expect(service.shouldShowMenu('news', testMenus, matchedIds)).toBe(false);
    });

    it('应该处理深层嵌套', () => {
      const matchedIds = new Set(['team']); // 团队介绍（3级节点）

      // 所有祖先应该显示
      expect(service.shouldShowMenu('home', testMenus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu('about', testMenus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu('team', testMenus, matchedIds)).toBe(true);

      // 无关节点应该隐藏
      expect(service.shouldShowMenu('contact', testMenus, matchedIds)).toBe(false);
    });

    it('应该显示有任意后代匹配的菜单', () => {
      const matchedIds = new Set(['product-list']);

      expect(service.shouldShowMenu('products', testMenus, matchedIds)).toBe(true);
    });

    it('应该处理空匹配集合', () => {
      const matchedIds = new Set<RxDBEntityId>();

      expect(service.shouldShowMenu('home', testMenus, matchedIds)).toBe(false);
    });

    it('应该处理不存在的菜单ID', () => {
      const matchedIds = new Set(['home']);

      expect(service.shouldShowMenu('non-existent', testMenus, matchedIds)).toBe(false);
    });

    it('应该处理无子节点的菜单', () => {
      const matchedIds = new Set(['other']);

      // news 无子节点且不匹配
      expect(service.shouldShowMenu('news', testMenus, matchedIds)).toBe(false);
    });

    it('应该处理多个匹配项', () => {
      const matchedIds = new Set(['home', 'products']);

      expect(service.shouldShowMenu('home', testMenus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu('products', testMenus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu('news', testMenus, matchedIds)).toBe(false);
    });

    it('应该沿 0 和 0n 父链查找匹配后代', () => {
      const menus = [
        createTestMenu(0, 'number root', null),
        createTestMenu(0n, 'bigint parent', 0),
        createTestMenu('leaf', 'leaf', 0n)
      ];
      const matchedIds = new Set<RxDBEntityId>(['leaf']);

      expect(service.shouldShowMenu(0, menus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu(0n, menus, matchedIds)).toBe(true);
    });
  });

  describe('综合场景测试', () => {
    it('应该支持完整的搜索流程', () => {
      // 1. 搜索关键词
      const matchedIds = service.filterTreeNodes(testMenus, '产品');
      expect(matchedIds.size).toBe(2);

      // 2. 获取需要展开的祖先节点
      const toExpand = service.expandMatchedAncestors(testMenus, matchedIds);
      expect(toExpand).toEqual(new Set(['products']));

      // 3. 验证哪些菜单应该显示
      expect(service.shouldShowMenu('products', testMenus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu('product-list', testMenus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu('home', testMenus, matchedIds)).toBe(false);
    });

    it('应该支持深层搜索流程', () => {
      // 搜索深层节点
      const matchedIds = service.filterTreeNodes(testMenus, '团队');
      expect(matchedIds.size).toBe(1);

      // 需要展开 about 和 home
      const toExpand = service.expandMatchedAncestors(testMenus, matchedIds);
      expect(toExpand.size).toBe(2);
      expect(toExpand.has('about')).toBe(true);
      expect(toExpand.has('home')).toBe(true);

      // 验证显示逻辑
      expect(service.shouldShowMenu('team', testMenus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu('about', testMenus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu('home', testMenus, matchedIds)).toBe(true);
      expect(service.shouldShowMenu('contact', testMenus, matchedIds)).toBe(false);
    });

    it('应该处理无匹配的搜索', () => {
      const matchedIds = service.filterTreeNodes(testMenus, '不存在');
      expect(matchedIds.size).toBe(0);

      const toExpand = service.expandMatchedAncestors(testMenus, matchedIds);
      expect(toExpand.size).toBe(0);

      // 所有菜单都不应显示
      testMenus.forEach(menu => {
        expect(service.shouldShowMenu(menu.id, testMenus, matchedIds)).toBe(false);
      });
    });
  });
});
