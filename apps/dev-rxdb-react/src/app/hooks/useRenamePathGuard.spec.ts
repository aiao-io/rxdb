import { describe, expect, it, vi } from 'vitest';
import { FilePathNode } from './useFilePathValidator';
import { MenuPathNode } from './useMenuPathValidator';
import { renameFileWithPathGuard, renameMenuWithPathGuard } from './useRenamePathGuard';

describe('rename path guard', () => {
  it('菜单重命名冲突时不执行更新', async () => {
    const current: MenuPathNode = { id: '1', title: 'Current', parentId: null };
    const sibling: MenuPathNode = { id: '2', title: 'Target', parentId: null };
    const update = vi.fn(async () => undefined);

    const conflict = await renameMenuWithPathGuard(current, 'target', [current, sibling], update);

    expect(conflict?.conflictNode).toBe(sibling);
    expect(update).not.toHaveBeenCalled();
  });

  it('菜单合法重命名只更新当前节点', async () => {
    const current: MenuPathNode = { id: '1', title: 'Current', parentId: null };
    const update = vi.fn(async () => undefined);

    const conflict = await renameMenuWithPathGuard(current, 'Next', [current], update);

    expect(conflict).toBeNull();
    expect(update).toHaveBeenCalledWith(current, 'Next');
  });

  it('文件重命名按扩展名检测同级冲突', async () => {
    const current: FilePathNode = { id: '1', name: 'current', extension: 'md', type: 'file', parentId: null };
    const sibling: FilePathNode = { id: '2', name: 'target', extension: 'md', type: 'file', parentId: null };
    const update = vi.fn(async () => undefined);

    const conflict = await renameFileWithPathGuard(current, 'TARGET', [current, sibling], update);

    expect(conflict?.conflictNode).toBe(sibling);
    expect(update).not.toHaveBeenCalled();
  });
});
