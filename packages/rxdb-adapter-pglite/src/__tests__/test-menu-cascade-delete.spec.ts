import { RxDB, SyncType } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { cleanup_db, generateDbName } from './test-utils.js';

describe('树结构 - 级联删除场景', () => {
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

  afterEach(async () => await cleanup_db(adapter));

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

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

    it('删除根节点后 countDescendants 应返回 -1', async () => {
      const root = new MenuLarge({ title: 'deleted-root' });
      const child = new MenuLarge({ title: 'deleted-child' });
      root.children$.add(child);
      await root.save();

      const rootId = root.id;
      await root.remove();

      const count = await firstValueFrom(MenuLarge.countDescendants({ entityId: rootId, level: 100 }));
      expect(count).toBe(-1);
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
