import type { RxDB } from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promoteChildrenAndRemove } from './promote-children';

const mocks = vi.hoisted(() => ({ getEntityMutations: vi.fn() }));

vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  getEntityMutations: mocks.getEntityMutations
}));

interface Node {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  parentId: string | null;
  sortOrder?: string;
  save: () => Promise<void>;
  remove: () => Promise<void>;
}

const makeNode = (id: string, parentId: string | null, sortOrder?: string): Node => ({
  id,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  parentId,
  ...(sortOrder === undefined ? {} : { sortOrder }),
  save: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve())
});

describe('promoteChildrenAndRemove', () => {
  const mutationsMap = { create: new Map(), update: new Map(), remove: new Map() };
  const mutations = vi.fn(() => Promise.resolve());
  const rxdb = { entityManager: { mutations } } as unknown as RxDB;

  beforeEach(() => {
    mocks.getEntityMutations.mockReset().mockReturnValue(mutationsMap);
    mutations.mockClear();
  });

  it('子节点只改 parentId 到被删节点的父节点，一次 mutations 提交，不逐条 save / remove', async () => {
    const deleted = makeNode('p', 'g');
    const c1 = makeNode('c1', 'p', 'a0');
    const c2 = makeNode('c2', 'p', 'a1');

    await promoteChildrenAndRemove(rxdb, deleted, [c1, c2]);

    expect([c1.parentId, c2.parentId]).toEqual(['g', 'g']);
    expect([c1.sortOrder, c2.sortOrder]).toEqual(['a0', 'a1']);
    expect(mocks.getEntityMutations).toHaveBeenCalledExactlyOnceWith({
      needSaveEntities: [c1, c2],
      needRemoveEntities: [deleted]
    });
    expect(mutations).toHaveBeenCalledExactlyOnceWith(mutationsMap);
    expect(c1.save).not.toHaveBeenCalled();
    expect(deleted.remove).not.toHaveBeenCalled();
  });

  it('根节点被删时子节点提升为根（parentId 置 null），且不给没有键的子节点赋 sortOrder', async () => {
    const deleted = makeNode('p', null);
    const child = makeNode('c', 'p');

    await promoteChildrenAndRemove(rxdb, deleted, [child]);

    expect(child.parentId).toBeNull();
    expect(Object.keys(child)).not.toContain('sortOrder');
  });

  it('mutations 失败时错误原样抛出，由调用方的 runWrite 接管', async () => {
    mutations.mockRejectedValueOnce(new Error('事务回滚'));

    await expect(promoteChildrenAndRemove(rxdb, makeNode('p', null), [makeNode('c', 'p')])).rejects.toThrow('事务回滚');
  });
});
