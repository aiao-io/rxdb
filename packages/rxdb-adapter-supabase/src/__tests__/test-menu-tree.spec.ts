/**
 * @description SupabaseTreeRepository 测试 - 邻接表模式的树形查询
 *
 * 测试 Supabase 适配器的树形结构查询功能，使用 MenuLarge Entity。
 *
 * ⚠️ 前置条件：需要在 Supabase 中创建 MenuLarge 表
 *
 * 如何创建表：
 * 1. 查看 SQL 脚本：packages/rxdb-adapter-supabase/sql/create-menu-table.sql
 * 2. 在 Supabase SQL Editor 中执行该脚本
 *
 * 测试行为：
 * - 如果表不存在：前置检查立即失败
 * - 如果表结构完整：运行完整的树形查询测试
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RxDB, SyncType } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { RxDBAdapterSupabase } from '../index.js';
import type { SupabaseTreeRepository } from '../SupabaseTreeRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

type MenuLargeFixture = MenuLarge & { title: string; sortOrder?: string };

function setMenuFields(menu: MenuLarge, title: string, sortOrder?: string): void {
  const fixture = menu as MenuLargeFixture;
  fixture.title = title;
  fixture.sortOrder = sortOrder;
}

/**
 * 测试数据结构：
 *
 * rootMenu
 * ├── level1Menu
 * │   └── level2Menu
 * │       └── level3Menu
 * │           └── level4Menu (叶子节点)
 */

describe('SupabaseTreeRepository - MenuLarge 树形查询', () => {
  let adapter: RxDBAdapterSupabase;
  let rxdb: RxDB;
  let repository: SupabaseTreeRepository<typeof MenuLarge>;
  let tableExists = false;

  // 测试数据
  let rootMenu: MenuLarge;
  let level1Menu: MenuLarge;
  let level2Menu: MenuLarge;
  let level3Menu: MenuLarge;
  let level4Menu: MenuLarge;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `tree-test-${Date.now()}`,
      context: { userId: 'test-user' },
      entities: [MenuLarge],
      sync: {
        remote: {
          adapter: 'supabase'
        },
        type: SyncType.None
      }
    });

    rxdb.adapter(
      'supabase',
      async db =>
        new RxDBAdapterSupabase(db, {
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SUPABASE_KEY
        })
    );

    rxdb.init();
    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();

    // 检查 MenuLarge 表是否存在
    try {
      tableExists = await adapter.isTableExisted(MenuLarge);
      if (!tableExists) {
        throw new Error('MenuLarge 表不存在，请先执行测试环境初始化');
      }
    } catch (error) {
      throw new Error(`检查 MenuLarge 表失败: ${(error as Error).message}`, { cause: error });
    }

    // 获取 TreeRepository
    repository = adapter.getRepository(MenuLarge) as SupabaseTreeRepository<typeof MenuLarge>;

    // 创建测试数据
    if (tableExists) {
      rootMenu = new MenuLarge();
      setMenuFields(rootMenu, `test-root-${Date.now()}`, 'a');
      await repository.create(rootMenu);

      level1Menu = new MenuLarge();
      setMenuFields(level1Menu, 'test-level1', 'b');
      level1Menu.parentId = rootMenu.id;
      await repository.create(level1Menu);

      level2Menu = new MenuLarge();
      setMenuFields(level2Menu, 'test-level2', 'c');
      level2Menu.parentId = level1Menu.id;
      await repository.create(level2Menu);

      level3Menu = new MenuLarge();
      setMenuFields(level3Menu, 'test-level3', 'd');
      level3Menu.parentId = level2Menu.id;
      await repository.create(level3Menu);

      level4Menu = new MenuLarge();
      setMenuFields(level4Menu, 'test-level4', 'e');
      level4Menu.parentId = level3Menu.id;
      await repository.create(level4Menu);
    }
  });

  afterAll(async () => {
    // 清理测试数据（按依赖顺序删除）
    if (tableExists && repository) {
      try {
        if (level4Menu?.id) await repository.remove(level4Menu);
        if (level3Menu?.id) await repository.remove(level3Menu);
        if (level2Menu?.id) await repository.remove(level2Menu);
        if (level1Menu?.id) await repository.remove(level1Menu);
        if (rootMenu?.id) await repository.remove(rootMenu);
      } catch {
        /* 忽略清理错误。 */
      }
    }
  });

  describe('findDescendants - 查询子孙节点', () => {
    it('查询所有后代节点（包含当前节点）', async () => {
      const descendants = await repository.findDescendants({ entityId: rootMenu.id, level: 100 });

      // 应该包含 root + level1 + level2 + level3 + level4 = 5 个节点
      expect(descendants.length).toBe(5);

      // 验证所有节点都在结果中
      const ids = descendants.map(d => d.id);
      expect(ids).toContain(rootMenu.id);
      expect(ids).toContain(level1Menu.id);
      expect(ids).toContain(level2Menu.id);
      expect(ids).toContain(level3Menu.id);
      expect(ids).toContain(level4Menu.id);
    });

    it('level=0 只返回当前节点', async () => {
      const descendants = await repository.findDescendants({ entityId: rootMenu.id, level: 0 });

      // level=0 只返回当前节点
      expect(descendants.length).toBe(1);
      expect(descendants[0].id).toBe(rootMenu.id);
    });

    it('level=1 返回当前节点 + 直接子节点', async () => {
      const descendants = await repository.findDescendants({ entityId: rootMenu.id, level: 1 });

      // level=1: root + level1 = 2 个节点
      expect(descendants.length).toBe(2);

      const ids = descendants.map(d => d.id);
      expect(ids).toContain(rootMenu.id);
      expect(ids).toContain(level1Menu.id);
    });

    it('level=2 返回当前节点 + 2层子孙', async () => {
      const descendants = await repository.findDescendants({ entityId: rootMenu.id, level: 2 });

      // level=2: root + level1 + level2 = 3 个节点
      expect(descendants.length).toBe(3);

      const ids = descendants.map(d => d.id);
      expect(ids).toContain(rootMenu.id);
      expect(ids).toContain(level1Menu.id);
      expect(ids).toContain(level2Menu.id);
    });

    it('叶子节点应该只返回自身', async () => {
      const descendants = await repository.findDescendants({ entityId: level4Menu.id, level: 100 });

      // 叶子节点只有自身
      expect(descendants.length).toBe(1);
      expect(descendants[0].id).toBe(level4Menu.id);
    });

    it('不传 entityId 应返回所有根节点', async () => {
      const descendants = await repository.findDescendants({ level: 0 });

      // 应该返回所有 parentId 为 null 的根节点
      expect(descendants.length).toBeGreaterThan(0);
      descendants.forEach(d => {
        expect(d.parentId).toBeNull();
      });
    });

    it('不存在的节点应返回空数组', async () => {
      const descendants = await repository.findDescendants({
        entityId: '00000000-0000-0000-0000-000000000000'
      });

      expect(descendants).toEqual([]);
    });
  });

  describe('countDescendants - 统计子孙数量', () => {
    it('统计所有后代数量（不包含当前节点）', async () => {
      const count = await repository.countDescendants({ entityId: rootMenu.id, level: 100 });

      // 后代数量 = 5 - 1 = 4（不包含 root 自身）
      expect(count).toBe(4);
    });

    it('level=1 只统计直接子节点（不包含当前节点）', async () => {
      const count = await repository.countDescendants({ entityId: rootMenu.id, level: 1 });

      // level=1: 只有 level1，所以是 1
      expect(count).toBe(1);
    });

    it('level=0 应返回 0（只有当前节点，不统计后代）', async () => {
      const count = await repository.countDescendants({ entityId: rootMenu.id, level: 0 });

      // level=0 只包含当前节点，后代数量为 0
      expect(count).toBe(0);
    });

    it('叶子节点后代数量应为 0', async () => {
      const count = await repository.countDescendants({ entityId: level4Menu.id, level: 100 });

      expect(count).toBe(0);
    });
  });

  describe('findAncestors - 查询祖先节点', () => {
    it('查询所有祖先节点（包含当前节点）', async () => {
      const ancestors = await repository.findAncestors({ entityId: level4Menu.id, level: 100 });

      // 应该包含 level4 + level3 + level2 + level1 + root = 5 个节点
      expect(ancestors.length).toBe(5);

      // 验证所有节点都在结果中
      const ids = ancestors.map(a => a.id);
      expect(ids).toContain(level4Menu.id);
      expect(ids).toContain(level3Menu.id);
      expect(ids).toContain(level2Menu.id);
      expect(ids).toContain(level1Menu.id);
      expect(ids).toContain(rootMenu.id);
    });

    it('level=0 只返回当前节点', async () => {
      const ancestors = await repository.findAncestors({ entityId: level4Menu.id, level: 0 });

      // level=0 只返回当前节点
      expect(ancestors.length).toBe(1);
      expect(ancestors[0].id).toBe(level4Menu.id);
    });

    it('level=1 返回当前节点 + 直接父节点', async () => {
      const ancestors = await repository.findAncestors({ entityId: level4Menu.id, level: 1 });

      // level=1: level4 + level3 = 2 个节点
      expect(ancestors.length).toBe(2);

      const ids = ancestors.map(a => a.id);
      expect(ids).toContain(level4Menu.id);
      expect(ids).toContain(level3Menu.id);
    });

    it('根节点应该只返回自身', async () => {
      const ancestors = await repository.findAncestors({ entityId: rootMenu.id, level: 100 });

      // 根节点没有父节点，只返回自身
      expect(ancestors.length).toBe(1);
      expect(ancestors[0].id).toBe(rootMenu.id);
    });

    it('不传 entityId 应返回空数组', async () => {
      const ancestors = await repository.findAncestors({});

      expect(ancestors).toEqual([]);
    });

    it('不存在的节点应返回空数组', async () => {
      const ancestors = await repository.findAncestors({
        entityId: '00000000-0000-0000-0000-000000000000'
      });

      expect(ancestors).toEqual([]);
    });

    it('祖先节点包含预期的节点', async () => {
      const ancestors = await repository.findAncestors({ entityId: level4Menu.id, level: 100 });

      // 验证包含所有预期节点
      const ids = ancestors.map(a => a.id);
      expect(ids).toContain(level4Menu.id);
      expect(ids).toContain(level3Menu.id);
      expect(ids).toContain(level2Menu.id);
      expect(ids).toContain(level1Menu.id);
      expect(ids).toContain(rootMenu.id);
    });
  });

  describe('countAncestors - 统计祖先数量', () => {
    it('统计所有祖先数量（不包含当前节点）', async () => {
      const count = await repository.countAncestors({ entityId: level4Menu.id, level: 100 });

      // 祖先数量 = 5 - 1 = 4（不包含 level4 自身）
      expect(count).toBe(4);
    });

    it('level=1 只统计直接父节点（不包含当前节点）', async () => {
      const count = await repository.countAncestors({ entityId: level4Menu.id, level: 1 });

      // level=1: 只有 level3，所以是 1
      expect(count).toBe(1);
    });

    it('level=0 应返回 0（只有当前节点，不统计祖先）', async () => {
      const count = await repository.countAncestors({ entityId: level4Menu.id, level: 0 });

      // level=0 只包含当前节点，祖先数量为 0
      expect(count).toBe(0);
    });

    it('根节点祖先数量应为 0', async () => {
      const count = await repository.countAncestors({ entityId: rootMenu.id, level: 100 });

      expect(count).toBe(0);
    });
  });

  describe('hasChildren 属性测试', () => {
    it('非叶子节点应该有 hasChildren=true', async () => {
      const descendants = await repository.findDescendants({ entityId: rootMenu.id, level: 0 });
      const root = descendants.find(d => d.id === rootMenu.id);

      // rootMenu 有子节点，所以 hasChildren 应该为 true
      expect(root?.hasChildren).toBe(true);
    });

    it('叶子节点应该有 hasChildren=false', async () => {
      const descendants = await repository.findDescendants({ entityId: level4Menu.id, level: 0 });
      const leaf = descendants.find(d => d.id === level4Menu.id);

      // level4Menu 是叶子节点，所以 hasChildren 应该为 false
      expect(leaf?.hasChildren).toBeFalsy();
    });
  });

  describe('边界情况测试', () => {
    it('负数 level 应被拒绝', async () => {
      await expect(repository.findDescendants({ entityId: rootMenu.id, level: -1 })).rejects.toThrow(
        /integer between 0 and 100/
      );
    });

    it('超过上限的 level 应被拒绝', async () => {
      await expect(repository.findDescendants({ entityId: rootMenu.id, level: 101 })).rejects.toThrow(
        /integer between 0 and 100/
      );
    });
  });

  describe('动态更新测试', () => {
    let dynamicParent: MenuLarge;
    let dynamicChild: MenuLarge | null;

    afterEach(async () => {
      // 清理动态测试数据
      if (tableExists && repository) {
        try {
          if (dynamicChild?.id) await repository.remove(dynamicChild);
          if (dynamicParent?.id) await repository.remove(dynamicParent);
        } catch {
          /* 忽略清理错误。 */
        }
      }
    });

    it('添加子节点后 countDescendants 应增加', async () => {
      // 创建一个新的父节点
      dynamicParent = new MenuLarge();
      setMenuFields(dynamicParent, `dynamic-parent-${Date.now()}`);
      await repository.create(dynamicParent);

      // 初始状态：无子节点
      const countBefore = await repository.countDescendants({ entityId: dynamicParent.id, level: 100 });
      expect(countBefore).toBe(0);

      // 添加子节点
      dynamicChild = new MenuLarge();
      setMenuFields(dynamicChild, 'dynamic-child');
      dynamicChild.parentId = dynamicParent.id;
      await repository.create(dynamicChild);

      // 验证计数增加
      const countAfter = await repository.countDescendants({ entityId: dynamicParent.id, level: 100 });
      expect(countAfter).toBe(1);
    });

    it('删除子节点后 countDescendants 应减少', async () => {
      // 创建父节点和子节点
      dynamicParent = new MenuLarge();
      setMenuFields(dynamicParent, `dynamic-parent-${Date.now()}`);
      await repository.create(dynamicParent);

      dynamicChild = new MenuLarge();
      setMenuFields(dynamicChild, 'dynamic-child-to-remove');
      dynamicChild.parentId = dynamicParent.id;
      await repository.create(dynamicChild);

      // 验证有子节点
      const countBefore = await repository.countDescendants({ entityId: dynamicParent.id, level: 100 });
      expect(countBefore).toBe(1);

      // 删除子节点
      await repository.remove(dynamicChild);
      dynamicChild = null;

      // 验证计数减少
      const countAfter = await repository.countDescendants({ entityId: dynamicParent.id, level: 100 });
      expect(countAfter).toBe(0);
    });
  });
});
