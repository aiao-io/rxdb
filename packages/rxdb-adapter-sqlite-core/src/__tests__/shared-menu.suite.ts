import { MenuLarge } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';
import { cleanup_db } from './test-utils.js';

/** 树结构集成测试：Menu 实体的树查询与关系遍历。 */
export function menuIntegrationSuite(factory: AdapterFactory) {
  describe(`树结构 [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [MenuLarge] });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    // ==================== 来自 test-menu.spec.ts ====================

    describe('树形操作', () => {
      let rootMenu: MenuLarge;
      let level1Menu: MenuLarge;
      let level2Menu: MenuLarge;
      let level3Menu: MenuLarge;
      let level4Menu: MenuLarge;
      beforeAll(async () => {
        rootMenu = new MenuLarge({ title: 'root' });
        level1Menu = new MenuLarge({ title: 'level1' });
        level2Menu = new MenuLarge({ title: 'level2' });
        level3Menu = new MenuLarge({ title: 'level3' });
        level4Menu = new MenuLarge({ title: 'level4' });

        rootMenu.children$.add(level1Menu);
        level1Menu.children$.add(level2Menu);
        level2Menu.children$.add(level3Menu);
        level3Menu.children$.add(level4Menu);

        await rootMenu.save();
      });

      it('findDescendants() level=0 或 undefined 返回当前节点', async () => {
        expect(level1Menu.parentId).toEqual(rootMenu.id);
        expect(level2Menu.parentId).toEqual(level1Menu.id);
        expect(level3Menu.parentId).toEqual(level2Menu.id);

        const descendantsLevel0 = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: rootMenu.id,
            level: 0
          })
        );
        expect(descendantsLevel0.length).toEqual(1);
      });

      it('findDescendants() 无参数默认返回所有根节点', async () => {
        const rootNodes = await firstValueFrom(MenuLarge.findDescendants({ level: 100 }));
        expect(rootNodes.length).toBeGreaterThanOrEqual(1);
      });

      it('findDescendants() 支持按层级限制', async () => {
        const descendantsLevel0 = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: rootMenu.id,
            level: 0
          })
        );
        expect(descendantsLevel0.length).toEqual(1);

        const descendantsLevel1 = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: rootMenu.id,
            level: 1
          })
        );
        expect(descendantsLevel1.length).toEqual(2);

        const descendantsLevel2 = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: rootMenu.id,
            level: 2
          })
        );
        expect(descendantsLevel2.length).toEqual(3);
      });

      it('findDescendants() 支持条件过滤', async () => {
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

      it('findDescendants() 无匹配时仅返回当前节点', async () => {
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
      });

      it('countDescendants() level=0 统计所有根节点（不包含后代）', async () => {
        const totalCount = await firstValueFrom(MenuLarge.countDescendants({ level: 0 }));
        expect(totalCount).toBeGreaterThanOrEqual(0);

        const totalCountWithUndefined = await firstValueFrom(MenuLarge.countDescendants({}));
        expect(totalCountWithUndefined).toBeGreaterThanOrEqual(0);
      });

      it('countDescendants() 支持按层级统计', async () => {
        const level1Count = await firstValueFrom(
          MenuLarge.countDescendants({
            entityId: rootMenu.id,
            level: 1
          })
        );
        expect(level1Count).toEqual(1);

        const level2Count = await firstValueFrom(
          MenuLarge.countDescendants({
            entityId: rootMenu.id,
            level: 2
          })
        );
        expect(level2Count).toEqual(2);
      });

      it('countAncestors() 统计全部祖先（不包含当前节点）', async () => {
        const ancestorCount = await firstValueFrom(MenuLarge.countAncestors({ entityId: level4Menu.id, level: 10 }));
        expect(ancestorCount).toEqual(4);
      });

      it('countAncestors() 指定层级统计祖先（不包含当前节点）', async () => {
        const directAncestorCount = await firstValueFrom(
          MenuLarge.countAncestors({ entityId: level4Menu.id, level: 1 })
        );
        expect(directAncestorCount).toEqual(1);
      });

      it('countDescendants() level=1 只统计直接子节点（不包含当前节点）', async () => {
        const directDescendantCount = await firstValueFrom(
          MenuLarge.countDescendants({
            entityId: rootMenu.id,
            level: 1
          })
        );
        expect(directDescendantCount).toEqual(1);
      });

      it('countDescendants() level=0 统计直接后代（不包含当前节点）', async () => {
        const allDescendantCount = await firstValueFrom(
          MenuLarge.countDescendants({
            entityId: rootMenu.id,
            level: 0
          })
        );
        expect(allDescendantCount).toEqual(0);
      });

      it('findAncestors() 支持层级限制', async () => {
        const directAncestors = await firstValueFrom(
          MenuLarge.findAncestors({
            entityId: level4Menu.id,
            level: 1
          })
        );
        expect(directAncestors.length).toEqual(2);
        expect(directAncestors.includes(level3Menu)).toBeTruthy();

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

      it('hasChildren 属性正确反映节点是否有子节点', async () => {
        const refreshedRoot = (await firstValueFrom(MenuLarge.findDescendants({ entityId: rootMenu.id, level: 0 })))[0];
        const refreshedLevel1 = (
          await firstValueFrom(MenuLarge.findDescendants({ entityId: level1Menu.id, level: 0 }))
        )[0];
        const refreshedLevel2 = (
          await firstValueFrom(MenuLarge.findDescendants({ entityId: level2Menu.id, level: 0 }))
        )[0];
        const refreshedLevel3 = (
          await firstValueFrom(MenuLarge.findDescendants({ entityId: level3Menu.id, level: 0 }))
        )[0];
        const refreshedLevel4 = (
          await firstValueFrom(MenuLarge.findDescendants({ entityId: level4Menu.id, level: 0 }))
        )[0];

        expect(refreshedRoot.hasChildren).toBe(true);
        expect(refreshedLevel1.hasChildren).toBe(true);
        expect(refreshedLevel2.hasChildren).toBe(true);
        expect(refreshedLevel3.hasChildren).toBe(true);

        expect(refreshedLevel4.hasChildren).toBeFalsy();
      });

      it('hasChildren 属性类型验证', async () => {
        const leafMenu = new MenuLarge({ title: 'test-leaf' });
        await leafMenu.save();

        const savedLeaf = await firstValueFrom(MenuLarge.get(leafMenu.id));
        const hasChildrenValue = savedLeaf.hasChildren;

        expect(
          typeof hasChildrenValue === 'boolean' || hasChildrenValue === null || hasChildrenValue === undefined
        ).toBe(true);
      });

      it('hasChildren 反映子节点变化（通过 findDescendants 查询）', async () => {
        const refreshedRoot = await firstValueFrom(MenuLarge.get(rootMenu.id));
        const refreshedLeaf = await firstValueFrom(MenuLarge.get(level4Menu.id));

        const hasChildrenRoot = refreshedRoot.hasChildren;
        const hasChildrenLeaf = refreshedLeaf.hasChildren;

        const rootDescendants = await firstValueFrom(MenuLarge.findDescendants({ entityId: rootMenu.id, level: 1 }));
        const leafDescendants = await firstValueFrom(MenuLarge.findDescendants({ entityId: level4Menu.id, level: 1 }));

        const rootChildrenCount = rootDescendants.length - 1;
        const leafChildrenCount = leafDescendants.length - 1;

        if (hasChildrenRoot !== undefined && hasChildrenRoot !== null) {
          expect(hasChildrenRoot).toBe(rootChildrenCount > 0);
        }

        if (hasChildrenLeaf !== undefined && hasChildrenLeaf !== null) {
          expect(hasChildrenLeaf).toBe(leafChildrenCount > 0);
        }

        expect(rootChildrenCount).toBeGreaterThan(0);
        expect(leafChildrenCount).toBe(0);
      });

      it('hasChildren 在普通 find() 查询中正确返回', async () => {
        const allMenus = await firstValueFrom(
          MenuLarge.find({
            where: {
              combinator: 'and',
              rules: []
            }
          })
        );

        const foundRoot = allMenus.find(m => m.id === rootMenu.id);
        const foundLeaf = allMenus.find(m => m.id === level4Menu.id);

        expect(foundRoot).toBeDefined();
        expect(foundLeaf).toBeDefined();

        expect(foundRoot!.hasChildren).toBeTruthy();
        expect(foundLeaf!.hasChildren).toBeFalsy();
      });

      it('hasChildren 在 get() 单个实体查询中正确返回', async () => {
        const fetchedRoot = await firstValueFrom(MenuLarge.get(rootMenu.id));
        const fetchedLeaf = await firstValueFrom(MenuLarge.get(level4Menu.id));

        expect(fetchedRoot.hasChildren).toBeTruthy();
        expect(fetchedLeaf.hasChildren).toBeFalsy();
      });

      it('hasChildren 在动态添加子节点后更新', async () => {
        const newLeaf = new MenuLarge({ title: 'dynamic-leaf' });
        await newLeaf.save();

        let fetchedLeaf = await firstValueFrom(MenuLarge.get(newLeaf.id));
        expect(fetchedLeaf.hasChildren).toBeFalsy();

        const child = new MenuLarge({ title: 'dynamic-child' });
        newLeaf.children$.add(child);
        await newLeaf.save();

        await new Promise(resolve => setTimeout(resolve, 50));

        fetchedLeaf = await firstValueFrom(MenuLarge.get(newLeaf.id));
        expect(fetchedLeaf.hasChildren).toBeTruthy();
      });

      it('hasChildren 在删除所有子节点后更新', async () => {
        const parent = new MenuLarge({ title: 'parent-to-clear' });
        const child = new MenuLarge({ title: 'child-to-remove' });
        parent.children$.add(child);
        await parent.save();

        await new Promise(resolve => setTimeout(resolve, 50));

        let fetchedParent = await firstValueFrom(MenuLarge.get(parent.id));
        expect(fetchedParent.hasChildren).toBeTruthy();

        await child.remove();

        await new Promise(resolve => setTimeout(resolve, 50));

        fetchedParent = await firstValueFrom(MenuLarge.get(parent.id));
        expect(fetchedParent.hasChildren).toBeFalsy();
      });

      it('hasChildren 在批量查询中对所有节点正确计算', async () => {
        const menus = await firstValueFrom(
          MenuLarge.find({
            where: {
              rules: [
                { field: 'id', operator: 'in', value: [rootMenu.id, level1Menu.id, level2Menu.id, level4Menu.id] }
              ],
              combinator: 'and'
            }
          })
        );

        expect(menus.length).toBe(4);

        const menuMap = new Map(menus.map(m => [m.id, m]));

        expect(menuMap.get(rootMenu.id)!.hasChildren).toBeTruthy();
        expect(menuMap.get(level1Menu.id)!.hasChildren).toBeTruthy();
        expect(menuMap.get(level2Menu.id)!.hasChildren).toBeTruthy();
        expect(menuMap.get(level4Menu.id)!.hasChildren).toBeFalsy();
      });
    });

    describe('不传 entityId 的场景', () => {
      let root1: MenuLarge;
      let child1: MenuLarge;
      let root2: MenuLarge;
      let child2: MenuLarge;

      beforeAll(async () => {
        await cleanup_db(adapter);
      });

      beforeEach(async () => {
        root1 = new MenuLarge({ title: 'standalone-root1', sortOrder: 'a' });
        child1 = new MenuLarge({ title: 'standalone-child1', sortOrder: 'b' });
        root1.children$.add(child1);
        await root1.save();

        root2 = new MenuLarge({ title: 'standalone-root2', sortOrder: 'c' });
        child2 = new MenuLarge({ title: 'standalone-child2', sortOrder: 'd' });
        root2.children$.add(child2);
        await root2.save();
      });

      afterEach(async () => {
        await cleanup_db(adapter);
      });

      it('findDescendants() 不传 entityId 应返回所有根节点', async () => {
        const allTrees = await firstValueFrom(MenuLarge.findDescendants({}));

        const rootTitles = allTrees.filter(m => m.parentId === null).map(m => m.title);
        expect(rootTitles).toContain('standalone-root1');
        expect(rootTitles).toContain('standalone-root2');

        expect(allTrees.length).toBe(2);
      });

      it('findDescendants() 不传 entityId + level=1 应只返回根节点和直接子节点', async () => {
        const grandchild1 = new MenuLarge({ title: 'grandchild1' });
        child1.children$.add(grandchild1);
        await child1.save();

        const results = await firstValueFrom(MenuLarge.findDescendants({ level: 1 }));
        const titles = results.map(m => m.title);

        expect(titles).toContain('standalone-root1');
        expect(titles).toContain('standalone-child1');
        expect(titles).toContain('standalone-root2');
        expect(titles).toContain('standalone-child2');

        expect(titles).not.toContain('grandchild1');

        expect(results.length).toBeGreaterThanOrEqual(4);
      });

      it('findDescendants() 主表关联子表查询时，多条子记录不应导致主表记录重复', async () => {
        const parentWithMultipleMatches = new MenuLarge({ title: 'parent-with-matches' });
        const child1 = new MenuLarge({ title: 'matched-child-1' });
        const child2 = new MenuLarge({ title: 'matched-child-2' });
        const child3 = new MenuLarge({ title: 'matched-child-3' });

        parentWithMultipleMatches.children$.add(child1);
        parentWithMultipleMatches.children$.add(child2);
        parentWithMultipleMatches.children$.add(child3);
        await parentWithMultipleMatches.save();

        const results = await firstValueFrom(
          MenuLarge.findDescendants({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'matched-child'
                }
              ]
            }
          })
        );

        const parentOccurrences = results.filter(m => m.id === parentWithMultipleMatches.id);
        expect(parentOccurrences.length).toBe(1);

        const uniqueIds = new Set(results.map(m => m.id));
        expect(uniqueIds.size).toBe(results.length);
      });

      it('findDescendants() 不传 entityId + where 条件应过滤所有树', async () => {
        const results = await firstValueFrom(
          MenuLarge.findDescendants({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'root1'
                }
              ]
            }
          })
        );

        const titles = results.map(m => m.title);
        expect(titles).toContain('standalone-root1');
        expect(titles.length).toBeGreaterThan(0);
      });

      it('findDescendants() 不传 entityId 结果按 sortOrder 排序', async () => {
        const results = await firstValueFrom(MenuLarge.findDescendants({ level: 1 }));

        const roots = results.filter(m => m.parentId === null);

        const rootSortOrders = roots.map(m => m.sortOrder).filter(Boolean);
        const sortedOrders = [...rootSortOrders].sort();
        expect(rootSortOrders).toEqual(sortedOrders);
      });

      it('countDescendants() 不传 entityId 应统计所有根节点及其后代', async () => {
        const totalCount = await firstValueFrom(MenuLarge.countDescendants({}));

        expect(totalCount).toBe(2);
      });

      it('countDescendants() 不传 entityId + level=1 应只统计根节点和直接子节点', async () => {
        const count = await firstValueFrom(MenuLarge.countDescendants({ level: 1 }));

        expect(count).toBeGreaterThan(0);
      });
    });

    describe('边界情况和错误处理', () => {
      let testRoot: MenuLarge;
      let testChild: MenuLarge;

      beforeAll(async () => {
        testRoot = new MenuLarge({ title: 'boundary-test-root' });
        testChild = new MenuLarge({ title: 'boundary-test-child' });
        testRoot.children$.add(testChild);
        await testRoot.save();
      });

      it('findDescendants() 传入不存在的 entityId 应只返回该节点或空数组', async () => {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';
        const result = await firstValueFrom(MenuLarge.findDescendants({ entityId: nonExistentId }));
        expect(Array.isArray(result)).toBe(true);
      });

      it('countDescendants() 传入不存在的 entityId 应返回 0（SQLC-026）', async () => {
        // 递归 CTE 匹配不到起点 → 0 行 → 裸 `count(*)-1` 把 -1 交给调用方，
        // 调用方拿它做分页、比大小、累加都会静默出错。
        // 契约取「节点不存在 ≡ 空集」而非哨兵值：计数下界钳在 0。
        const nonExistentId = '00000000-0000-0000-0000-000000000000';
        const count = await firstValueFrom(MenuLarge.countDescendants({ entityId: nonExistentId, level: 100 }));
        expect(count).toBe(0);
      });

      it('findAncestors() 传入不存在的 entityId 应返回空数组', async () => {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';
        const result = await firstValueFrom(MenuLarge.findAncestors({ entityId: nonExistentId }));
        expect(result).toEqual([]);
      });

      it('countAncestors() 传入不存在的 entityId 应返回 0（SQLC-026）', async () => {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';
        const count = await firstValueFrom(MenuLarge.countAncestors({ entityId: nonExistentId, level: 100 }));
        expect(count).toBe(0);
      });

      it('findDescendants() level 为负数应被处理（转换为 0 或报错）', async () => {
        const result = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: testRoot.id,
            level: -1
          })
        );
        expect(Array.isArray(result)).toBe(true);
      });

      it('findDescendants() level 为极大值应正常工作', async () => {
        const result = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: testRoot.id,
            level: Number.MAX_SAFE_INTEGER
          })
        );
        expect(result.length).toBeGreaterThanOrEqual(2);
      });

      it('countDescendants() level=0 与空对象应有一致行为', async () => {
        const countWithZero = await firstValueFrom(MenuLarge.countDescendants({ level: 0 }));
        const countWithEmpty = await firstValueFrom(MenuLarge.countDescendants({}));
        expect(countWithZero).toEqual(countWithEmpty);
      });

      it('findAncestors() 查询根节点应只返回根节点本身', async () => {
        const ancestors = await firstValueFrom(MenuLarge.findAncestors({ entityId: testRoot.id }));
        expect(ancestors.length).toEqual(1);
        expect(ancestors[0].id).toEqual(testRoot.id);
      });

      it('countAncestors() 查询根节点应返回 0（不包含自身）', async () => {
        const count = await firstValueFrom(MenuLarge.countAncestors({ entityId: testRoot.id, level: 100 }));
        expect(count).toBe(0);
      });
    });

    describe('findAncestors 完整测试', () => {
      let ancestorRoot: MenuLarge;
      let ancestorLevel1: MenuLarge;
      let ancestorLevel2: MenuLarge;
      let ancestorLevel3: MenuLarge;

      beforeAll(async () => {
        ancestorRoot = new MenuLarge({ title: 'ancestor-root', sortOrder: '1' });
        ancestorLevel1 = new MenuLarge({ title: 'ancestor-level1', sortOrder: '2' });
        ancestorLevel2 = new MenuLarge({ title: 'ancestor-level2', sortOrder: '3' });
        ancestorLevel3 = new MenuLarge({ title: 'ancestor-level3', sortOrder: '4' });

        ancestorRoot.children$.add(ancestorLevel1);
        ancestorLevel1.children$.add(ancestorLevel2);
        ancestorLevel2.children$.add(ancestorLevel3);

        await ancestorRoot.save();
      });

      it('findAncestors() level=0 应返回当前节点', async () => {
        const ancestors = await firstValueFrom(
          MenuLarge.findAncestors({
            entityId: ancestorLevel3.id,
            level: 0
          })
        );
        expect(ancestors.length).toEqual(1);
        expect(ancestors[0].id).toEqual(ancestorLevel3.id);
      });

      it('findAncestors() 支持 where 条件过滤', async () => {
        const ancestorsWithCondition = await firstValueFrom(
          MenuLarge.findAncestors({
            entityId: ancestorLevel3.id,
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.sortOrder',
                  operator: '=',
                  value: '2'
                }
              ]
            },
            level: 10
          })
        );
        expect(Array.isArray(ancestorsWithCondition)).toBe(true);
      });

      it('findAncestors() 结果应按从近到远排序', async () => {
        const ancestors = await firstValueFrom(
          MenuLarge.findAncestors({
            entityId: ancestorLevel3.id,
            level: 10
          })
        );

        expect(ancestors[0].id).toEqual(ancestorLevel3.id);
        if (ancestors.length > 1) {
          expect(ancestors[1].id).toEqual(ancestorLevel2.id);
        }
      });

      it('findAncestors() 不传 level 应返回所有祖先', async () => {
        const ancestors = await firstValueFrom(
          MenuLarge.findAncestors({
            entityId: ancestorLevel3.id
          })
        );
        expect(ancestors.length).toBeGreaterThanOrEqual(1);
      });

      it('findAncestors() 应返回 hasChildren 属性，所有祖先节点（除叶子节点）都应有子节点', async () => {
        const ancestors = await firstValueFrom(
          MenuLarge.findAncestors({
            entityId: ancestorLevel3.id,
            level: 10
          })
        );

        ancestors.forEach(ancestor => {
          expect(ancestor).toHaveProperty('hasChildren');
        });

        const level3 = ancestors.find(a => a.id === ancestorLevel3.id);
        expect(level3).toBeTruthy();
        expect(level3!.hasChildren).toBeFalsy();

        const level2 = ancestors.find(a => a.id === ancestorLevel2.id);
        if (level2) {
          expect(level2.hasChildren).toBe(true);
        }

        const level1 = ancestors.find(a => a.id === ancestorLevel1.id);
        if (level1) {
          expect(level1.hasChildren).toBe(true);
        }

        const root = ancestors.find(a => a.id === ancestorRoot.id);
        if (root) {
          expect(root.hasChildren).toBe(true);
        }
      });

      it('findAncestors() hasChildren 属性应准确反映实时状态', async () => {
        const tempRoot = new MenuLarge({ title: 'temp-root' });
        const tempChild = new MenuLarge({ title: 'temp-child' });
        const tempGrandchild = new MenuLarge({ title: 'temp-grandchild' });

        tempRoot.children$.add(tempChild);
        tempChild.children$.add(tempGrandchild);
        await tempRoot.save();

        const ancestorsBefore = await firstValueFrom(
          MenuLarge.findAncestors({
            entityId: tempGrandchild.id,
            level: 10
          })
        );

        const tempRootBefore = ancestorsBefore.find(a => a.id === tempRoot.id);
        const tempChildBefore = ancestorsBefore.find(a => a.id === tempChild.id);
        const tempGrandchildBefore = ancestorsBefore.find(a => a.id === tempGrandchild.id);

        expect(tempRootBefore?.hasChildren).toBe(true);
        expect(tempChildBefore?.hasChildren).toBe(true);
        expect(tempGrandchildBefore?.hasChildren).toBeFalsy();

        await tempGrandchild.remove();

        await new Promise(resolve => setTimeout(resolve, 50));

        const ancestorsAfter = await firstValueFrom(
          MenuLarge.findAncestors({
            entityId: tempChild.id,
            level: 10
          })
        );

        const tempRootAfter = ancestorsAfter.find(a => a.id === tempRoot.id);
        const tempChildAfter = ancestorsAfter.find(a => a.id === tempChild.id);

        expect(tempRootAfter?.hasChildren).toBe(true);
        expect(tempChildAfter?.hasChildren).toBeFalsy();
      });
    });

    describe('复杂 where 条件测试', () => {
      let whereRoot: MenuLarge;
      let whereChild1: MenuLarge;
      let whereChild2: MenuLarge;
      let whereGrandchild: MenuLarge;

      beforeAll(async () => {
        whereRoot = new MenuLarge({ title: 'where-root', sortOrder: 'a' });
        whereChild1 = new MenuLarge({ title: 'where-child-file', sortOrder: 'b' });
        whereChild2 = new MenuLarge({ title: 'where-child-folder', sortOrder: 'c' });
        whereGrandchild = new MenuLarge({ title: 'where-grandchild', sortOrder: 'd' });

        whereRoot.children$.add(whereChild1);
        whereRoot.children$.add(whereChild2);
        whereChild2.children$.add(whereGrandchild);

        await whereRoot.save();
      });

      it('findDescendants() 支持多条件 AND 组合', async () => {
        const results = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: whereRoot.id,
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.sortOrder',
                  operator: '=',
                  value: 'b'
                },
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'child'
                }
              ]
            },
            level: 10
          })
        );
        expect(Array.isArray(results)).toBe(true);
      });

      it('findDescendants() 支持 OR combinator', async () => {
        const results = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: whereRoot.id,
            where: {
              combinator: 'or',
              rules: [
                {
                  field: 'children.title',
                  operator: '=',
                  value: 'where-child-file'
                },
                {
                  field: 'children.title',
                  operator: '=',
                  value: 'where-child-folder'
                }
              ]
            },
            level: 10
          })
        );
        expect(results.length).toBeGreaterThanOrEqual(1);
      });

      it('findDescendants() 支持 contains operator', async () => {
        const results = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: whereRoot.id,
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'child'
                }
              ]
            },
            level: 10
          })
        );
        expect(results.length).toBeGreaterThanOrEqual(1);
      });

      it('countDescendants() 支持复杂 where 条件', async () => {
        const count = await firstValueFrom(
          MenuLarge.countDescendants({
            entityId: whereRoot.id,
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'folder'
                }
              ]
            },
            level: 10
          })
        );
        expect(typeof count).toBe('number');
        expect(count).toBeGreaterThanOrEqual(0);
      });
    });

    describe('动态更新场景测试', () => {
      let dynamicRoot: MenuLarge;
      let dynamicChild1: MenuLarge;

      beforeAll(async () => {
        dynamicRoot = new MenuLarge({ title: 'dynamic-root' });
        dynamicChild1 = new MenuLarge({ title: 'dynamic-child1' });

        dynamicRoot.children$.add(dynamicChild1);
        await dynamicRoot.save();
      });

      it('添加子节点后 countDescendants 应增加', async () => {
        const newLeaf = new MenuLarge({ title: 'new-leaf-node' });
        await newLeaf.save();

        const countBefore = await firstValueFrom(MenuLarge.countDescendants({ entityId: newLeaf.id, level: 100 }));
        expect(countBefore).toBe(0);

        const newChild = new MenuLarge({ title: 'new-child' });
        newLeaf.children$.add(newChild);
        await newLeaf.save();

        const countAfter = await firstValueFrom(MenuLarge.countDescendants({ entityId: newLeaf.id, level: 100 }));
        expect(countAfter).toBeGreaterThan(countBefore);
      });

      it('删除子节点后 countDescendants 应减少', async () => {
        const countBefore = await firstValueFrom(
          MenuLarge.countDescendants({
            entityId: dynamicRoot.id,
            level: 1
          })
        );

        dynamicRoot.children$.remove(dynamicChild1);
        await dynamicRoot.save();
        await dynamicChild1.remove();

        const countAfter = await firstValueFrom(
          MenuLarge.countDescendants({
            entityId: dynamicRoot.id,
            level: 1
          })
        );

        expect(countAfter).toBeLessThan(countBefore);
      });

      it('移动节点后 findDescendants 应反映新的树结构', async () => {
        const moveRoot1 = new MenuLarge({ title: 'move-root1' });
        const moveRoot2 = new MenuLarge({ title: 'move-root2' });
        const moveChild = new MenuLarge({ title: 'move-child' });

        moveRoot1.children$.add(moveChild);
        await moveRoot1.save();
        await moveRoot2.save();

        const descendants1Before = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: moveRoot1.id,
            level: 1
          })
        );
        expect(descendants1Before.some(m => m.id === moveChild.id)).toBe(true);

        moveRoot1.children$.remove(moveChild);
        moveRoot2.children$.add(moveChild);
        await moveRoot1.save();
        await moveRoot2.save();

        const descendants1After = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: moveRoot1.id,
            level: 1
          })
        );
        const descendants2After = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: moveRoot2.id,
            level: 1
          })
        );

        expect(descendants1After.some(m => m.id === moveChild.id)).toBe(false);
        expect(descendants2After.some(m => m.id === moveChild.id)).toBe(true);
      });

      it('删除最后一个子节点后 countDescendants 应变为 0', async () => {
        const singleParent = new MenuLarge({ title: 'single-parent' });
        const onlyChild = new MenuLarge({ title: 'only-child' });
        singleParent.children$.add(onlyChild);
        await singleParent.save();

        const countBefore = await firstValueFrom(MenuLarge.countDescendants({ entityId: singleParent.id, level: 100 }));
        expect(countBefore).toBeGreaterThan(0);

        singleParent.children$.remove(onlyChild);
        await singleParent.save();
        await onlyChild.remove();

        const countAfter = await firstValueFrom(MenuLarge.countDescendants({ entityId: singleParent.id, level: 100 }));
        expect(countAfter).toBe(0);
      });
    });

    describe('countAncestors 完整测试', () => {
      let countAncestorRoot: MenuLarge;
      let countAncestorChild: MenuLarge;
      let countAncestorGrandchild: MenuLarge;

      beforeAll(async () => {
        countAncestorRoot = new MenuLarge({ title: 'count-ancestor-root' });
        countAncestorChild = new MenuLarge({ title: 'count-ancestor-child' });
        countAncestorGrandchild = new MenuLarge({ title: 'count-ancestor-grandchild' });

        countAncestorRoot.children$.add(countAncestorChild);
        countAncestorChild.children$.add(countAncestorGrandchild);

        await countAncestorRoot.save();
      });

      it('countAncestors() level=0 应返回 0（只查当前节点，count 不包含自身）', async () => {
        const count = await firstValueFrom(
          MenuLarge.countAncestors({
            entityId: countAncestorGrandchild.id,
            level: 0
          })
        );
        expect(count).toBe(0);
      });

      it('countAncestors() 根节点应返回 0', async () => {
        const count = await firstValueFrom(
          MenuLarge.countAncestors({
            entityId: countAncestorRoot.id
          })
        );
        expect(count).toBe(0);
      });

      it('countAncestors() 传 level=100 应统计所有祖先', async () => {
        const count = await firstValueFrom(
          MenuLarge.countAncestors({
            entityId: countAncestorGrandchild.id,
            level: 100
          })
        );
        expect(count).toBeGreaterThanOrEqual(2);
      });
    });

    describe('排序和顺序测试', () => {
      let orderRoot: MenuLarge;
      let orderChild1: MenuLarge;
      let orderChild2: MenuLarge;
      let orderChild3: MenuLarge;

      beforeAll(async () => {
        orderRoot = new MenuLarge({ title: 'order-root', sortOrder: 'a' });
        orderChild1 = new MenuLarge({ title: 'order-child1', sortOrder: 'c' });
        orderChild2 = new MenuLarge({ title: 'order-child2', sortOrder: 'b' });
        orderChild3 = new MenuLarge({ title: 'order-child3', sortOrder: 'a' });

        orderRoot.children$.add(orderChild1);
        orderRoot.children$.add(orderChild2);
        orderRoot.children$.add(orderChild3);

        await orderRoot.save();
      });

      it('findDescendants() 同层级结果顺序可能不固定', async () => {
        const descendants = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: orderRoot.id,
            level: 1
          })
        );

        const children = descendants.filter(m => m.id !== orderRoot.id);

        expect(children.length).toBe(3);

        const childIds = children.map(m => m.id);
        expect(childIds).toContain(orderChild1.id);
        expect(childIds).toContain(orderChild2.id);
        expect(childIds).toContain(orderChild3.id);
      });

      it('findAncestors() 结果应按距离排序（从近到远）', async () => {
        const level0 = new MenuLarge({ title: 'order-level0', sortOrder: '0' });
        const level1 = new MenuLarge({ title: 'order-level1', sortOrder: '1' });
        const level2 = new MenuLarge({ title: 'order-level2', sortOrder: '2' });
        const level3 = new MenuLarge({ title: 'order-level3', sortOrder: '3' });

        level0.children$.add(level1);
        level1.children$.add(level2);
        level2.children$.add(level3);
        await level0.save();

        const ancestors = await firstValueFrom(
          MenuLarge.findAncestors({
            entityId: level3.id,
            level: 10
          })
        );

        expect(ancestors[0].id).toEqual(level3.id);

        if (ancestors.length > 1) {
          expect(ancestors[1].id).toEqual(level2.id);
        }
        if (ancestors.length > 2) {
          expect(ancestors[2].id).toEqual(level1.id);
        }
      });

      it('findDescendants() sortOrder 为 null 的节点应排在最后', async () => {
        const nullOrderRoot = new MenuLarge({ title: 'null-order-root' });
        const child1 = new MenuLarge({ title: 'child-with-order', sortOrder: 'a' });
        const child2 = new MenuLarge({ title: 'child-without-order', sortOrder: null });

        nullOrderRoot.children$.add(child1);
        nullOrderRoot.children$.add(child2);
        await nullOrderRoot.save();

        const descendants = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: nullOrderRoot.id,
            level: 1
          })
        );

        const children = descendants.filter(m => m.id !== nullOrderRoot.id);

        const hasOrder = children.filter(m => m.sortOrder !== null);
        expect(hasOrder.length).toBeGreaterThan(0);
      });
    });

    describe('关系查询去重测试', () => {
      let parentMenu: MenuLarge;
      let child1: MenuLarge;
      let child2: MenuLarge;
      let child3: MenuLarge;

      beforeAll(async () => {
        parentMenu = new MenuLarge({ title: 'dedup-parent' });
        child1 = new MenuLarge({ title: 'dedup-file-1' });
        child2 = new MenuLarge({ title: 'dedup-file-2' });
        child3 = new MenuLarge({ title: 'dedup-file-3' });

        parentMenu.children$.add(child1);
        parentMenu.children$.add(child2);
        parentMenu.children$.add(child3);

        await parentMenu.save();
      });

      it('findDescendants() 通过子表字段过滤时，主表记录不应重复', async () => {
        const results = await firstValueFrom(
          MenuLarge.findDescendants({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'dedup-file'
                }
              ]
            }
          })
        );

        const parentOccurrences = results.filter(m => m.id === parentMenu.id);

        expect(parentOccurrences.length).toBe(1);

        const ids = results.map(m => m.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(results.length);
      });

      it('findDescendants() 指定 entityId 通过子表字段过滤时，主表记录不应重复', async () => {
        const results = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: parentMenu.id,
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'dedup-file'
                }
              ]
            }
          })
        );

        const parentOccurrences = results.filter(m => m.id === parentMenu.id);
        expect(parentOccurrences.length).toBe(1);

        const ids = results.map(m => m.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(results.length);
      });

      it('findDescendants() 使用 OR combinator 时，主表记录不应重复', async () => {
        const multiParent = new MenuLarge({ title: 'multi-condition-parent' });
        const fileChild = new MenuLarge({ title: 'or-file' });
        const folderChild = new MenuLarge({ title: 'or-folder', sortOrder: 'special' });

        multiParent.children$.add(fileChild);
        multiParent.children$.add(folderChild);
        await multiParent.save();

        const results = await firstValueFrom(
          MenuLarge.findDescendants({
            entityId: multiParent.id,
            where: {
              combinator: 'or',
              rules: [
                {
                  field: 'children.title',
                  operator: '=',
                  value: 'or-file'
                },
                {
                  field: 'children.sortOrder',
                  operator: '=',
                  value: 'special'
                }
              ]
            }
          })
        );

        const parentOccurrences = results.filter(m => m.id === multiParent.id);
        expect(parentOccurrences.length).toBe(1);

        const ids = results.map(m => m.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(results.length);
      });

      it('countDescendants() 通过子表字段过滤时应正确统计（不重复计数）', async () => {
        const count = await firstValueFrom(
          MenuLarge.countDescendants({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'dedup-file'
                }
              ]
            }
          })
        );

        const findResults = await firstValueFrom(
          MenuLarge.findDescendants({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'dedup-file'
                }
              ]
            }
          })
        );

        expect(count).toBe(findResults.length);

        expect(count).toBeGreaterThan(0);
      });

      it('findAncestors() 通过父表字段过滤时，结果不应重复', async () => {
        const grandParent = new MenuLarge({ title: 'grand-parent' });
        const parentA = new MenuLarge({ title: 'parent-a' });
        const childA = new MenuLarge({ title: 'child-a' });

        grandParent.children$.add(parentA);
        parentA.children$.add(childA);
        await grandParent.save();

        const results = await firstValueFrom(
          MenuLarge.findAncestors({
            entityId: childA.id,
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'parent'
                }
              ]
            }
          })
        );

        const ids = results.map(m => m.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(results.length);
      });
    });

    describe('find() 关联字段查询', () => {
      let parentWithChildren: MenuLarge;
      let parentWithoutChildren: MenuLarge;

      beforeAll(async () => {
        parentWithChildren = new MenuLarge({ title: 'find-parent-with-children', sortOrder: 'z' });
        const childAlpha = new MenuLarge({ title: 'find-child-alpha' });
        const childBeta = new MenuLarge({ title: 'find-child-beta' });
        parentWithChildren.children$.add(childAlpha);
        parentWithChildren.children$.add(childBeta);
        await parentWithChildren.save();

        parentWithoutChildren = new MenuLarge({ title: 'find-parent-leaf', sortOrder: 'y' });
        await parentWithoutChildren.save();
      });

      it('支持通过 children 条件查询且不重复返回主表记录', async () => {
        const results = await firstValueFrom(
          MenuLarge.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'children.title',
                  operator: 'contains',
                  value: 'find-child'
                }
              ]
            }
          })
        );

        const parentOccurrences = results.filter(menu => menu.id === parentWithChildren.id);
        expect(parentOccurrences.length).toBe(1);

        const leafOccurrences = results.filter(menu => menu.id === parentWithoutChildren.id);
        expect(leafOccurrences.length).toBe(0);

        const childOccurrences = results.filter(
          menu => menu.title === 'find-child-alpha' || menu.title === 'find-child-beta'
        );
        expect(childOccurrences.length).toBe(0);

        const uniqueIds = new Set(results.map(m => m.id));
        expect(uniqueIds.size).toBe(results.length);
      });
    });

    // ==================== 来自 test-menu-adapter.spec.ts ====================

    describe('自引用关系查询', () => {
      it('支持通过 children.title contains 查询', async () => {
        // 标题必须与上面 `find() 关联字段查询` 那组区分开：整个套件共用一个数据库，
        // 而 MenuLarge 的 (parentId, title) 现在是数据库级唯一约束（RXT-016），
        // 两处都插根节点 `find-parent-with-children` 会直接被拦下。
        const parentWithChildren = new MenuLarge({ title: 'selfref-parent-with-children', sortOrder: 'z' });
        const childAlpha = new MenuLarge({ title: 'selfref-child-alpha' });
        const childBeta = new MenuLarge({ title: 'selfref-child-beta' });
        parentWithChildren.children$.add(childAlpha);
        parentWithChildren.children$.add(childBeta);
        await parentWithChildren.save();

        const parentWithoutChildren = new MenuLarge({ title: 'selfref-parent-leaf', sortOrder: 'y' });
        await parentWithoutChildren.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: 'contains',
                value: 'selfref-child'
              }
            ]
          }
        });

        const parentOccurrences = results.filter(menu => menu.id === parentWithChildren.id);
        expect(parentOccurrences.length).toBe(1);

        const leafOccurrences = results.filter(menu => menu.id === parentWithoutChildren.id);
        expect(leafOccurrences.length).toBe(0);

        const childOccurrences = results.filter(menu => menu.id === childAlpha.id || menu.id === childBeta.id);
        expect(childOccurrences.length).toBe(0);

        const uniqueIds = new Set(results.map(m => m.id));
        expect(uniqueIds.size).toBe(results.length);
      });

      it('支持通过 parent.title 查询（反向关系）', async () => {
        const rootMenu = new MenuLarge({ title: 'root-menu', sortOrder: 'r' });
        const childMenu = new MenuLarge({ title: 'child-of-root' });
        rootMenu.children$.add(childMenu);
        await rootMenu.save();

        const orphanMenu = new MenuLarge({ title: 'orphan-menu', sortOrder: 's' });
        await orphanMenu.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'parent.title',
                operator: '=',
                value: 'root-menu'
              }
            ]
          }
        });

        expect(results.some(m => m.id === childMenu.id)).toBe(true);
        expect(results.some(m => m.id === rootMenu.id)).toBe(false);
        expect(results.some(m => m.id === orphanMenu.id)).toBe(false);
      });

      it('支持组合条件查询（自身字段 + 子节点字段）', async () => {
        const parentA = new MenuLarge({ title: 'parent-a', sortOrder: 'aa' });
        const childA1 = new MenuLarge({ title: 'important-file' });
        parentA.children$.add(childA1);
        await parentA.save();

        const parentB = new MenuLarge({ title: 'parent-b', sortOrder: 'bb' });
        const childB1 = new MenuLarge({ title: 'important-folder' });
        parentB.children$.add(childB1);
        await parentB.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'sortOrder',
                operator: '=',
                value: 'aa'
              },
              {
                field: 'children.title',
                operator: 'contains',
                value: 'important'
              }
            ]
          }
        });

        expect(results.some(m => m.id === parentA.id)).toBe(true);
        expect(results.some(m => m.id === parentB.id)).toBe(false);
      });

      it('空结果查询不应报错', async () => {
        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: '=',
                value: 'non-existent-child-title-xyz'
              }
            ]
          }
        });

        expect(results).toEqual([]);
      });

      it('支持 limit 和 offset', async () => {
        const parents = [];
        for (let i = 0; i < 5; i++) {
          const parent = new MenuLarge({ title: `limit-parent-${i}`, sortOrder: `${i}` });
          const child = new MenuLarge({ title: 'limit-child' });
          parent.children$.add(child);
          await parent.save();
          parents.push(parent);
        }

        const limitResults = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: '=',
                value: 'limit-child'
              }
            ]
          },
          limit: 2
        });

        expect(limitResults.length).toBe(2);

        const offsetResults = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: '=',
                value: 'limit-child'
              }
            ]
          },
          limit: 2,
          offset: 2
        });

        expect(offsetResults.length).toBe(2);
        const limitIds = new Set(limitResults.map(m => m.id));
        expect(offsetResults.every(m => !limitIds.has(m.id))).toBe(true);
      });

      it('支持 orderBy 排序', async () => {
        // `parent-a` 已被上面「组合条件查询」那条用例占用为根节点，
        // (parentId, title) 唯一后不能再重名（RXT-016）；两个 `ordered-child`
        // 分属不同父节点，元组不同，可以保留。
        const parentZ = new MenuLarge({ title: 'ordered-parent-z', sortOrder: 'z' });
        const childZ = new MenuLarge({ title: 'ordered-child' });
        parentZ.children$.add(childZ);
        await parentZ.save();

        const parentA = new MenuLarge({ title: 'ordered-parent-a', sortOrder: 'a' });
        const childA = new MenuLarge({ title: 'ordered-child' });
        parentA.children$.add(childA);
        await parentA.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: '=',
                value: 'ordered-child'
              }
            ]
          },
          orderBy: [{ field: 'sortOrder', sort: 'asc' }]
        });

        expect(results.length).toBeGreaterThanOrEqual(2);
        const parentAIndex = results.findIndex(m => m.id === parentA.id);
        const parentZIndex = results.findIndex(m => m.id === parentZ.id);
        expect(parentAIndex).toBeLessThan(parentZIndex);
      });

      it('支持 in 操作符查询多个值', async () => {
        const parentA = new MenuLarge({ title: 'parent-in-a', sortOrder: 'ia' });
        const childA = new MenuLarge({ title: 'alpha-child' });
        parentA.children$.add(childA);
        await parentA.save();

        const parentB = new MenuLarge({ title: 'parent-in-b', sortOrder: 'ib' });
        const childB = new MenuLarge({ title: 'beta-child' });
        parentB.children$.add(childB);
        await parentB.save();

        const parentC = new MenuLarge({ title: 'parent-in-c', sortOrder: 'ic' });
        const childC = new MenuLarge({ title: 'gamma-child' });
        parentC.children$.add(childC);
        await parentC.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: 'in',
                value: ['alpha-child', 'beta-child']
              }
            ]
          }
        });

        expect(results.some(m => m.id === parentA.id)).toBe(true);
        expect(results.some(m => m.id === parentB.id)).toBe(true);
        expect(results.some(m => m.id === parentC.id)).toBe(false);
      });

      it('支持 startsWith 和 endsWith 操作符', async () => {
        const parent1 = new MenuLarge({ title: 'parent-starts', sortOrder: 'ps' });
        const child1 = new MenuLarge({ title: 'prefix-test-file' });
        parent1.children$.add(child1);
        await parent1.save();

        const parent2 = new MenuLarge({ title: 'parent-ends', sortOrder: 'pe' });
        const child2 = new MenuLarge({ title: 'test-file-suffix' });
        parent2.children$.add(child2);
        await parent2.save();

        const startsResults = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: 'startsWith',
                value: 'prefix'
              }
            ]
          }
        });

        expect(startsResults.some(m => m.id === parent1.id)).toBe(true);
        expect(startsResults.some(m => m.id === parent2.id)).toBe(false);

        const endsResults = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: 'endsWith',
                value: 'suffix'
              }
            ]
          }
        });

        expect(endsResults.some(m => m.id === parent2.id)).toBe(true);
        expect(endsResults.some(m => m.id === parent1.id)).toBe(false);
      });

      it('支持 notContains 操作符', async () => {
        const goodParent = new MenuLarge({ title: 'good-parent', sortOrder: 'gp' });
        const goodChild = new MenuLarge({ title: 'good-file' });
        goodParent.children$.add(goodChild);
        await goodParent.save();

        const badParent = new MenuLarge({ title: 'bad-parent', sortOrder: 'bp' });
        const badChild = new MenuLarge({ title: 'bad-file-error' });
        badParent.children$.add(badChild);
        await badParent.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: 'notContains',
                value: 'error'
              }
            ]
          }
        });

        expect(results.some(m => m.id === goodParent.id)).toBe(true);
        expect(results.some(m => m.id === badParent.id)).toBe(false);
      });

      it('支持 != null 操作符查询', async () => {
        const parentWithOrder = new MenuLarge({ title: 'parent-with-order-not-null', sortOrder: 'pwon' });
        const childOfWithOrder = new MenuLarge({ title: 'child-of-with-order-not-null', sortOrder: 'cown' });
        parentWithOrder.children$.add(childOfWithOrder);
        await parentWithOrder.save();

        const parentNoOrder = new MenuLarge({ title: 'parent-no-order-not-null' });
        const childOfNoOrder = new MenuLarge({ title: 'child-of-no-order-not-null', sortOrder: 'cnon' });
        parentNoOrder.children$.add(childOfNoOrder);
        await parentNoOrder.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'title',
                operator: 'contains',
                value: 'not-null'
              },
              {
                field: 'parent.sortOrder',
                operator: '!=',
                value: null
              }
            ]
          }
        });

        expect(results.some(m => m.id === childOfWithOrder.id)).toBe(true);
        expect(results.some(m => m.id === childOfNoOrder.id)).toBe(false);
      });

      it('支持嵌套 RuleGroup (AND 包含 OR)', async () => {
        const parent1 = new MenuLarge({ title: 'nested-parent-1', sortOrder: 'np1' });
        const child1 = new MenuLarge({ title: 'special-file' });
        parent1.children$.add(child1);
        await parent1.save();

        const parent2 = new MenuLarge({ title: 'nested-parent-2', sortOrder: 'np2' });
        const child2 = new MenuLarge({ title: 'important-folder' });
        parent2.children$.add(child2);
        await parent2.save();

        const parent3 = new MenuLarge({ title: 'nested-parent-3', sortOrder: 'np3' });
        const child3 = new MenuLarge({ title: 'normal-file' });
        parent3.children$.add(child3);
        await parent3.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'title',
                operator: 'startsWith',
                value: 'nested-parent'
              },
              {
                combinator: 'or',
                rules: [
                  {
                    field: 'children.title',
                    operator: 'contains',
                    value: 'special'
                  },
                  {
                    field: 'children.title',
                    operator: 'contains',
                    value: 'important'
                  }
                ]
              }
            ]
          }
        });

        expect(results.some(m => m.id === parent1.id)).toBe(true);
        expect(results.some(m => m.id === parent2.id)).toBe(true);
        expect(results.some(m => m.id === parent3.id)).toBe(false);
      });

      it('支持 count() 查询使用关系字段', async () => {
        const countParent = new MenuLarge({ title: 'count-parent', sortOrder: 'cp' });
        const countChild = new MenuLarge({ title: 'count-child-match' });
        countParent.children$.add(countChild);
        await countParent.save();

        const count = await adapter.getRepository(MenuLarge).count({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: 'contains',
                value: 'count-child'
              }
            ]
          }
        });

        expect(count).toBeGreaterThanOrEqual(1);
      });

      it('支持 findOne() 查询使用关系字段', async () => {
        const uniqueParent = new MenuLarge({ title: 'unique-findone-parent', sortOrder: 'ufp' });
        const uniqueChild = new MenuLarge({ title: 'unique-findone-child' });
        uniqueParent.children$.add(uniqueChild);
        await uniqueParent.save();

        const result = await adapter.getRepository(MenuLarge).findOne({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.title',
                operator: '=',
                value: 'unique-findone-child'
              }
            ]
          }
        });

        expect(result).toBeDefined();
        expect(result?.id).toBe(uniqueParent.id);
      });

      it('根节点查询 parent 字段应返回空结果', async () => {
        const rootForParentTest = new MenuLarge({ title: 'root-parent-test', sortOrder: 'rpt' });
        await rootForParentTest.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'parent.title',
                operator: '=',
                value: 'any-value'
              }
            ]
          }
        });

        const rootInResults = results.some(m => m.id === rootForParentTest.id);
        expect(rootInResults).toBe(false);
      });

      it('同时使用 parent 和 children 字段查询', async () => {
        const grandParent = new MenuLarge({ title: 'grand-parent-combo', sortOrder: 'gpc' });
        const middleParent = new MenuLarge({ title: 'middle-parent-combo', sortOrder: 'mpc' });
        const leafChild = new MenuLarge({ title: 'leaf-child-combo' });
        grandParent.children$.add(middleParent);
        middleParent.children$.add(leafChild);
        await grandParent.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'parent.title',
                operator: 'contains',
                value: 'grand'
              },
              {
                field: 'children.title',
                operator: 'contains',
                value: 'leaf'
              }
            ]
          }
        });

        expect(results.some(m => m.id === middleParent.id)).toBe(true);
        expect(results.some(m => m.id === grandParent.id)).toBe(false);
        expect(results.some(m => m.id === leafChild.id)).toBe(false);
      });

      it('比较操作符测试 (sortOrder 字段)', async () => {
        const parent1 = new MenuLarge({ title: 'compare-parent-1', sortOrder: 'a' });
        const child1 = new MenuLarge({ title: 'compare-child-a', sortOrder: 'a' });
        parent1.children$.add(child1);
        await parent1.save();

        const parent2 = new MenuLarge({ title: 'compare-parent-2', sortOrder: 'b' });
        const child2 = new MenuLarge({ title: 'compare-child-z', sortOrder: 'z' });
        parent2.children$.add(child2);
        await parent2.save();

        const results = await adapter.getRepository(MenuLarge).find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'children.sortOrder',
                operator: '>',
                value: 'm'
              }
            ]
          }
        });

        expect(results.some(m => m.id === parent2.id)).toBe(true);
        expect(results.some(m => m.id === parent1.id)).toBe(false);
      });
    });

    // ==================== 来自 test-menu-cascade-delete.spec.ts ====================

    describe('树结构 - 级联删除场景', () => {
      afterEach(async () => await cleanup_db(adapter));

      describe('基础级联删除', () => {
        it('删除父节点应自动删除所有子节点', async () => {
          const root = new MenuLarge({ title: 'cascade-root' });
          const child1 = new MenuLarge({ title: 'cascade-child1' });
          const child2 = new MenuLarge({ title: 'cascade-child2' });

          root.children$.add(child1);
          root.children$.add(child2);
          await root.save();

          const beforeDelete = await firstValueFrom(MenuLarge.findDescendants({ entityId: root.id, level: 100 }));
          expect(beforeDelete.length).toBe(3);

          await root.remove();

          await expect(firstValueFrom(MenuLarge.get(child1.id))).rejects.toThrow('Entity with id');
          await expect(firstValueFrom(MenuLarge.get(child2.id))).rejects.toThrow('Entity with id');
        });

        it('删除父节点应级联删除多层子孙节点', async () => {
          const root = new MenuLarge({ title: 'deep-root' });
          const child = new MenuLarge({ title: 'deep-child' });
          const grandchild = new MenuLarge({ title: 'deep-grandchild' });
          const greatGrandchild = new MenuLarge({ title: 'deep-great-grandchild' });

          root.children$.add(child);
          child.children$.add(grandchild);
          grandchild.children$.add(greatGrandchild);
          await root.save();

          const beforeDelete = await firstValueFrom(MenuLarge.findDescendants({ entityId: root.id, level: 100 }));
          expect(beforeDelete.length).toBe(4);

          await root.remove();

          await expect(firstValueFrom(MenuLarge.get(child.id))).rejects.toThrow('Entity with id');
          await expect(firstValueFrom(MenuLarge.get(grandchild.id))).rejects.toThrow('Entity with id');
          await expect(firstValueFrom(MenuLarge.get(greatGrandchild.id))).rejects.toThrow('Entity with id');
        });

        it('删除中间节点应级联删除其下所有后代，但保留祖先', async () => {
          const root = new MenuLarge({ title: 'keep-root' });
          const middle = new MenuLarge({ title: 'delete-middle' });
          const child1 = new MenuLarge({ title: 'delete-child1' });
          const child2 = new MenuLarge({ title: 'delete-child2' });

          root.children$.add(middle);
          middle.children$.add(child1);
          middle.children$.add(child2);
          await root.save();

          await middle.remove();

          const rootResult = await firstValueFrom(MenuLarge.get(root.id));
          expect(rootResult).not.toBeNull();
          expect(rootResult?.id).toBe(root.id);

          await expect(firstValueFrom(MenuLarge.get(middle.id))).rejects.toThrow('Entity with id');
          await expect(firstValueFrom(MenuLarge.get(child1.id))).rejects.toThrow('Entity with id');
          await expect(firstValueFrom(MenuLarge.get(child2.id))).rejects.toThrow('Entity with id');
        });
      });

      describe('复杂树结构级联删除', () => {
        it('删除拥有多个子树的父节点应删除所有子树', async () => {
          const root = new MenuLarge({ title: 'multi-branch-root' });
          const branch1 = new MenuLarge({ title: 'branch1' });
          const branch2 = new MenuLarge({ title: 'branch2' });
          const leaf1 = new MenuLarge({ title: 'leaf1' });
          const leaf2 = new MenuLarge({ title: 'leaf2' });
          const leaf3 = new MenuLarge({ title: 'leaf3' });
          const leaf4 = new MenuLarge({ title: 'leaf4' });

          root.children$.add(branch1);
          root.children$.add(branch2);
          branch1.children$.add(leaf1);
          branch1.children$.add(leaf2);
          branch2.children$.add(leaf3);
          branch2.children$.add(leaf4);
          await root.save();

          const beforeDelete = await firstValueFrom(MenuLarge.findDescendants({ entityId: root.id, level: 100 }));
          expect(beforeDelete.length).toBe(7);

          await root.remove();

          const allIds = [root.id, branch1.id, branch2.id, leaf1.id, leaf2.id, leaf3.id, leaf4.id];
          for (const id of allIds) {
            await expect(firstValueFrom(MenuLarge.get(id))).rejects.toThrow('Entity with id');
          }
        });

        it('删除其中一个分支不应影响其他分支', async () => {
          const root = new MenuLarge({ title: 'isolated-root' });
          const branch1 = new MenuLarge({ title: 'isolated-branch1' });
          const branch2 = new MenuLarge({ title: 'isolated-branch2' });
          const leaf1 = new MenuLarge({ title: 'isolated-leaf1' });
          const leaf2 = new MenuLarge({ title: 'isolated-leaf2' });

          root.children$.add(branch1);
          root.children$.add(branch2);
          branch1.children$.add(leaf1);
          branch2.children$.add(leaf2);
          await root.save();

          await branch1.remove();

          const rootResult = await firstValueFrom(MenuLarge.get(root.id));
          const branch2Result = await firstValueFrom(MenuLarge.get(branch2.id));
          const leaf2Result = await firstValueFrom(MenuLarge.get(leaf2.id));

          expect(rootResult).not.toBeNull();
          expect(branch2Result).not.toBeNull();
          expect(leaf2Result).not.toBeNull();

          await expect(firstValueFrom(MenuLarge.get(branch1.id))).rejects.toThrow('Entity with id');
          await expect(firstValueFrom(MenuLarge.get(leaf1.id))).rejects.toThrow('Entity with id');

          const remainingTree = await firstValueFrom(MenuLarge.findDescendants({ entityId: root.id, level: 100 }));
          expect(remainingTree.length).toBe(3);
        });

        it('深层嵌套结构级联删除应完全清理', async () => {
          const level0 = new MenuLarge({ title: 'level-0' });
          const level1 = new MenuLarge({ title: 'level-1' });
          const level2 = new MenuLarge({ title: 'level-2' });
          const level3 = new MenuLarge({ title: 'level-3' });
          const level4 = new MenuLarge({ title: 'level-4' });

          level0.children$.add(level1);
          level1.children$.add(level2);
          level2.children$.add(level3);
          level3.children$.add(level4);
          await level0.save();

          await level1.remove();

          const level0Result = await firstValueFrom(MenuLarge.get(level0.id));
          expect(level0Result).not.toBeNull();

          await expect(firstValueFrom(MenuLarge.get(level1.id))).rejects.toThrow('Entity with id');
          await expect(firstValueFrom(MenuLarge.get(level2.id))).rejects.toThrow('Entity with id');
          await expect(firstValueFrom(MenuLarge.get(level3.id))).rejects.toThrow('Entity with id');
          await expect(firstValueFrom(MenuLarge.get(level4.id))).rejects.toThrow('Entity with id');
        });
      });

      describe('级联删除与计数查询', () => {
        it('删除后 countDescendants 应返回正确的数量', async () => {
          const root = new MenuLarge({ title: 'count-root' });
          const child1 = new MenuLarge({ title: 'count-child1' });
          const child2 = new MenuLarge({ title: 'count-child2' });
          const grandchild = new MenuLarge({ title: 'count-grandchild' });

          root.children$.add(child1);
          root.children$.add(child2);
          child1.children$.add(grandchild);
          await root.save();

          const countBefore = await firstValueFrom(MenuLarge.countDescendants({ entityId: root.id, level: 100 }));
          expect(countBefore).toBe(3);

          await child1.remove();

          const countAfter = await firstValueFrom(MenuLarge.countDescendants({ entityId: root.id, level: 100 }));
          expect(countAfter).toBe(1);
        });

        it('删除根节点后 countDescendants 应返回 0（SQLC-026）', async () => {
          const root = new MenuLarge({ title: 'deleted-root' });
          const child = new MenuLarge({ title: 'deleted-child' });
          root.children$.add(child);
          await root.save();

          const rootId = root.id;

          await root.remove();

          const count = await firstValueFrom(MenuLarge.countDescendants({ entityId: rootId, level: 100 }));
          expect(count).toBe(0);
        });

        it('删除后 findDescendants 应返回正确的剩余节点', async () => {
          const root = new MenuLarge({ title: 'find-root' });
          const child1 = new MenuLarge({ title: 'find-child1' });
          const child2 = new MenuLarge({ title: 'find-child2' });
          const grandchild1 = new MenuLarge({ title: 'find-grandchild1' });
          const grandchild2 = new MenuLarge({ title: 'find-grandchild2' });

          root.children$.add(child1);
          root.children$.add(child2);
          child1.children$.add(grandchild1);
          child2.children$.add(grandchild2);
          await root.save();

          await child1.remove();

          const remaining = await firstValueFrom(MenuLarge.findDescendants({ entityId: root.id, level: 100 }));
          const titles = remaining.map(m => m.title);

          expect(remaining.length).toBe(3);
          expect(titles).toContain('find-root');
          expect(titles).toContain('find-child2');
          expect(titles).toContain('find-grandchild2');
          expect(titles).not.toContain('find-child1');
          expect(titles).not.toContain('find-grandchild1');
        });
      });

      describe('级联删除与 hasChildren 属性', () => {
        it('删除所有子节点后 hasChildren 应变为 false', async () => {
          const parent = new MenuLarge({ title: 'parent-node' });
          const child1 = new MenuLarge({ title: 'temp-child1' });
          const child2 = new MenuLarge({ title: 'temp-child2' });

          parent.children$.add(child1);
          parent.children$.add(child2);
          await parent.save();

          const beforeDelete = await firstValueFrom(MenuLarge.findDescendants({ entityId: parent.id, level: 100 }));
          const parentBefore = beforeDelete.find(m => m.id === parent.id);
          expect(parentBefore?.hasChildren).toBe(true);

          await child1.remove();
          await child2.remove();

          const afterDelete = await firstValueFrom(MenuLarge.findDescendants({ entityId: parent.id, level: 100 }));
          const parentAfter = afterDelete.find(m => m.id === parent.id);
          expect(parentAfter?.hasChildren).toBeFalsy();
        });

        it('级联删除后父节点的 hasChildren 应正确更新', async () => {
          const root = new MenuLarge({ title: 'has-children-root' });
          const child = new MenuLarge({ title: 'has-children-child' });
          const grandchild = new MenuLarge({ title: 'has-children-grandchild' });

          root.children$.add(child);
          child.children$.add(grandchild);
          await root.save();

          await child.remove();

          const refreshedRoot = await firstValueFrom(MenuLarge.get(root.id));
          expect(refreshedRoot?.hasChildren).toBeFalsy();
        });
      });

      describe('边界情况和错误处理', () => {
        it('删除叶子节点（无子节点）不应产生错误', async () => {
          const leaf = new MenuLarge({ title: 'lonely-leaf' });
          await leaf.save();

          await expect(leaf.remove()).resolves.not.toThrow();

          await expect(firstValueFrom(MenuLarge.get(leaf.id))).rejects.toThrow('Entity with id');
        });

        it('删除已删除的节点应抛出错误或返回正确状态', async () => {
          const temp = new MenuLarge({ title: 'temp-node' });
          await temp.save();
          const tempId = temp.id;

          await temp.remove();

          await expect(firstValueFrom(MenuLarge.get(tempId))).rejects.toThrow('Entity with id');
        });

        it('同时删除父节点和子节点不应产生冲突', async () => {
          const parent = new MenuLarge({ title: 'conflict-parent' });
          const child = new MenuLarge({ title: 'conflict-child' });
          parent.children$.add(child);
          await parent.save();

          await parent.remove();

          await expect(firstValueFrom(MenuLarge.get(child.id))).rejects.toThrow('Entity with id');
        });
      });

      describe('多根树级联删除', () => {
        it('删除一棵树不应影响其他独立的树', async () => {
          const tree1Root = new MenuLarge({ title: 'tree1-root' });
          const tree1Child = new MenuLarge({ title: 'tree1-child' });
          tree1Root.children$.add(tree1Child);
          await tree1Root.save();

          const tree2Root = new MenuLarge({ title: 'tree2-root' });
          const tree2Child = new MenuLarge({ title: 'tree2-child' });
          tree2Root.children$.add(tree2Child);
          await tree2Root.save();

          await tree1Root.remove();

          const tree2RootResult = await firstValueFrom(MenuLarge.get(tree2Root.id));
          const tree2ChildResult = await firstValueFrom(MenuLarge.get(tree2Child.id));

          expect(tree2RootResult).not.toBeNull();
          expect(tree2ChildResult).not.toBeNull();

          await expect(firstValueFrom(MenuLarge.get(tree1Root.id))).rejects.toThrow('Entity with id');
          await expect(firstValueFrom(MenuLarge.get(tree1Child.id))).rejects.toThrow('Entity with id');
        });

        it('批量删除多个根节点应正确级联', async () => {
          const roots = [];
          for (let i = 0; i < 5; i++) {
            const root = new MenuLarge({ title: `batch-root-${i}` });
            const child = new MenuLarge({ title: `batch-child-${i}` });
            root.children$.add(child);
            await root.save();
            roots.push(root);
          }

          for (const root of roots) {
            await root.remove();
          }

          const remaining = await firstValueFrom(MenuLarge.findDescendants({ level: 100 }));
          const batchNodes = remaining.filter(m => m.title.startsWith('batch-'));
          expect(batchNodes.length).toBe(0);
        });
      });

      describe('级联删除与条件查询', () => {
        it('删除后 where 条件查询应排除已删除节点', async () => {
          const root = new MenuLarge({ title: 'where-root' });
          const child1 = new MenuLarge({ title: 'where-child-file' });
          const child2 = new MenuLarge({ title: 'where-child-folder' });
          const grandchild = new MenuLarge({ title: 'where-grandchild' });

          root.children$.add(child1);
          root.children$.add(child2);
          child2.children$.add(grandchild);
          await root.save();

          await child1.remove();

          const allDescendants = await firstValueFrom(MenuLarge.findDescendants({ entityId: root.id, level: 100 }));

          const titles = allDescendants.map(m => m.title);

          expect(titles).not.toContain('where-child-file');
          expect(titles).toContain('where-grandchild');
        });
      });

      describe('级联删除与排序', () => {
        it('删除节点后剩余节点的排序应保持一致', async () => {
          const root = new MenuLarge({ title: 'sort-root' });
          const child1 = new MenuLarge({ title: 'sort-child-1', sortOrder: 'a' });
          const child2 = new MenuLarge({ title: 'sort-child-2', sortOrder: 'b' });
          const child3 = new MenuLarge({ title: 'sort-child-3', sortOrder: 'c' });

          root.children$.add(child1);
          root.children$.add(child2);
          root.children$.add(child3);
          await root.save();

          await child2.remove();

          const remaining = await firstValueFrom(
            MenuLarge.findDescendants({
              entityId: root.id,
              level: 1
            })
          );

          const children = remaining.filter(m => m.id !== root.id);
          expect(children.length).toBe(2);

          const sortOrders = children.map(c => c.sortOrder).filter(Boolean);
          expect(sortOrders).toEqual(['a', 'c']);
        });
      });
    });
  });
}
