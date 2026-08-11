import { RxDB, SyncType } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { PGliteTreeRepository } from '../repository/PGliteTreeRepository.js';
import { generateDbName } from './test-utils.js';

describe('树结构', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'userId' },
      entities: [MenuLarge],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', db => {
      return new RxDBAdapterPGlite(db, { store: 'memory' });
    });
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  describe('自引用关系查询', () => {
    it('支持通过 children.title contains 查询', async () => {
      const parentWithChildren = new MenuLarge({ title: 'find-parent-with-children', sortOrder: 'z' });
      const childAlpha = new MenuLarge({ title: 'find-child-alpha' });
      const childBeta = new MenuLarge({ title: 'find-child-beta' });
      parentWithChildren.children$.add(childAlpha);
      parentWithChildren.children$.add(childBeta);
      await parentWithChildren.save();

      const parentWithoutChildren = new MenuLarge({ title: 'find-parent-leaf', sortOrder: 'y' });
      await parentWithoutChildren.save();

      const results = await adapter.getRepository(MenuLarge).find({
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
      });

      // 验证父节点只出现一次（即使有两个匹配的子节点）
      const parentOccurrences = results.filter(menu => menu.id === parentWithChildren.id);
      expect(parentOccurrences.length).toBe(1);

      // 验证没有子节点或子节点不匹配的父节点不在结果中
      const leafOccurrences = results.filter(menu => menu.id === parentWithoutChildren.id);
      expect(leafOccurrences.length).toBe(0);

      // 验证子节点不在结果中（查询的是父节点）
      const childOccurrences = results.filter(menu => menu.id === childAlpha.id || menu.id === childBeta.id);
      expect(childOccurrences.length).toBe(0);

      // 验证结果中的 ID 都是唯一的
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

      // 只返回父节点标题为 'root-menu' 的子节点
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

      // 只返回 sortOrder='aa' 且有包含 'important' 的子节点
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

      const repository = adapter.getRepository<typeof MenuLarge, PGliteTreeRepository<typeof MenuLarge>>(MenuLarge);
      const result = await repository.findOne({
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
});
