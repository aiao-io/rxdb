import { RxDB, SyncType } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
describe('菜单实体 PGlite 树测试', () => {
  let rxdb: RxDB;

  beforeAll(() => {
    rxdb = new RxDB({
      dbName: `menu-${Date.now()}`,
      context: { userId: 'userId' },
      entities: [MenuLarge],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });

    rxdb
      .adapter('pglite', async db => {
        return new RxDBAdapterPGlite(db, { store: 'memory' });
      })
      .init();
  });

  afterAll(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  describe('树操作', () => {
    let rootMenu: MenuLarge;
    let level1Menu: MenuLarge;
    let level2Menu: MenuLarge;
    let level3Menu: MenuLarge;
    let level4Menu: MenuLarge;
    beforeAll(async () => {
      // 创建测试菜单树结构
      rootMenu = new MenuLarge({ title: 'root' });
      level1Menu = new MenuLarge({ title: 'level1' });
      level2Menu = new MenuLarge({ title: 'level2' });
      level3Menu = new MenuLarge({ title: 'level3' });
      level4Menu = new MenuLarge({ title: 'level4' });

      // 构建父子关系
      rootMenu.children$.add(level1Menu);
      level1Menu.children$.add(level2Menu);
      level2Menu.children$.add(level3Menu);
      level3Menu.children$.add(level4Menu);

      await rootMenu.save();
    });

    it('当 level 为 0 或未定义（无限深度）时应找到所有后代', async () => {
      const tree = await firstValueFrom(MenuLarge.findDescendants({ level: 100 }));
      expect(tree).toHaveLength(5);
      // parentId 可以是 null 或 undefined，取决于实体创建方式
      expect(rootMenu.parentId).toBeFalsy();
      expect(level1Menu.parentId).toEqual(rootMenu.id);
      expect(level2Menu.parentId).toEqual(level1Menu.id);
      expect(level3Menu.parentId).toEqual(level2Menu.id);
      expect(level4Menu.parentId).toEqual(level3Menu.id);

      // 校验：level 为 100 时效果一致
      const treeWithUndefined = await firstValueFrom(MenuLarge.findDescendants({ level: 100 }));
      expect(treeWithUndefined).toHaveLength(5);
    });

    it('默认情况下应找到所有根节点及其后代', async () => {
      const rootNodes = await firstValueFrom(MenuLarge.findDescendants({}));
      expect(rootNodes.length).toBeGreaterThanOrEqual(1);
      expect(rootNodes[0]).toEqual(rootMenu);
    });

    it('应按指定深度查找后代', async () => {
      // level=100 - 所有后代
      const descendantsLevel0 = await firstValueFrom(
        MenuLarge.findDescendants({
          entityId: rootMenu.id,
          level: 100
        })
      );
      expect(descendantsLevel0.length).toEqual(5); // 所有节点：根节点 + 4 个后代

      // level=1 - 包含当前节点 + 直接子级（1 层深度）
      const descendantsLevel1 = await firstValueFrom(
        MenuLarge.findDescendants({
          entityId: rootMenu.id,
          level: 1
        })
      );
      expect(descendantsLevel1.length).toEqual(2); // rootMenu + level1Menu

      // level=2 - 包含当前节点 + 2 层后代
      const descendantsLevel2 = await firstValueFrom(
        MenuLarge.findDescendants({
          entityId: rootMenu.id,
          level: 2
        })
      );
      expect(descendantsLevel2.length).toEqual(3); // rootMenu + level1Menu + level2Menu
    });

    it('应按匹配条件查找后代', async () => {
      const descendantsWithCondition = await firstValueFrom(
        MenuLarge.findDescendants({
          entityId: rootMenu.id,
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: '=',
                value: 'level1'
              }
            ]
          },
          level: 10
        })
      );
      expect(descendantsWithCondition.length).toEqual(2);
    });

    it('当无后代匹配条件时仅返回当前节点', async () => {
      const descendantsWithNoMatch = await firstValueFrom(
        MenuLarge.findDescendants({
          entityId: rootMenu.id,
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: '=',
                value: 'non-existent'
              }
            ]
          },
          level: 10
        })
      );
      expect(descendantsWithNoMatch.length).toEqual(1);
      expect(descendantsWithNoMatch[0]).toEqual(rootMenu);
    });

    it('当 level 为 0 或未定义（无限）时应返回所有后代的正确数量', async () => {
      const totalCount = await firstValueFrom(MenuLarge.countDescendants({ level: 100 }));
      expect(totalCount).toEqual(5); // 所有节点

      // 校验：level 为 100 时效果一致
      const totalCountWithUndefined = await firstValueFrom(MenuLarge.countDescendants({ level: 100 }));
      expect(totalCountWithUndefined).toEqual(5);
    });

    it('应返回特定层级的后代数量', async () => {
      // level=1 - 仅直接子级（不包含当前节点）
      const level1Count = await firstValueFrom(
        MenuLarge.countDescendants({
          entityId: rootMenu.id,
          level: 1
        })
      );
      expect(level1Count).toEqual(1); // 仅 level1Menu

      // level=2 - 2 层后代（不包含当前节点）
      const level2Count = await firstValueFrom(
        MenuLarge.countDescendants({
          entityId: rootMenu.id,
          level: 2
        })
      );
      expect(level2Count).toEqual(2); // level1Menu + level2Menu
    });

    it('应返回所有祖先的正确数量', async () => {
      const ancestorCount = await firstValueFrom(MenuLarge.countAncestors({ entityId: level4Menu.id, level: 10 }));
      expect(ancestorCount).toEqual(4);
    });

    it('应返回指定层级祖先的正确数量', async () => {
      const directAncestorCount = await firstValueFrom(MenuLarge.countAncestors({ entityId: level4Menu.id, level: 1 }));
      expect(directAncestorCount).toEqual(1);
    });

    it('仅返回直接子级的正确数量（level=1，不包含当前节点）', async () => {
      const directDescendantCount = await firstValueFrom(
        MenuLarge.countDescendants({
          entityId: rootMenu.id,
          level: 1
        })
      );
      expect(directDescendantCount).toEqual(1); // 仅 level1Menu
    });

    it('应返回所有后代的正确数量（level=100，无限制）', async () => {
      const allDescendantCount = await firstValueFrom(
        MenuLarge.countDescendants({
          entityId: rootMenu.id,
          level: 100
        })
      );
      expect(allDescendantCount).toEqual(4); // level1Menu + level2Menu + level3Menu + level4Menu
    });

    it('应按指定深度查找祖先', async () => {
      // 查找 1 级祖先
      const directAncestors = await firstValueFrom(
        MenuLarge.findAncestors({
          entityId: level4Menu.id,
          level: 1
        })
      );
      expect(directAncestors.length).toEqual(2);
      expect(directAncestors.includes(level3Menu)).toBeTruthy();

      // 查找 2 级祖先
      const ancestorsLevel2 = await firstValueFrom(
        MenuLarge.findAncestors({
          entityId: level4Menu.id,
          level: 2
        })
      );
      expect(ancestorsLevel2.length).toEqual(3);
      expect(ancestorsLevel2.includes(level3Menu)).toBeTruthy();
      expect(ancestorsLevel2.includes(level2Menu)).toBeTruthy();
      expect(ancestorsLevel2.includes(level1Menu)).toBeFalsy();
    });
  });
});
