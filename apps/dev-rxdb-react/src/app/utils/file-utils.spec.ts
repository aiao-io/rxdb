import { describe, expect, it } from 'vitest';
import { type FileEntity, generateBatchFiles } from './file-utils';

/**
 * US-031：文件与文件夹的排序键由引擎追加到所属组末尾，生成器一概不写。
 *
 * 此前按「已加载的根节点」算根级起点键，文件夹优先的显示顺序下最后一个根不是尾键，
 * 批量追加的根级节点会与库里已有的键相撞。
 */
describe('generateBatchFiles 不写排序键', () => {
  class FakeFile implements FileEntity {
    readonly id: string = crypto.randomUUID();
    parentId: string | null = null;
    sortOrder: string | null = null;
    hasChildren: boolean | null = null;
    readonly name: string;
    readonly type: string;
    readonly parent$ = {
      set: (parent: FakeFile | null) => {
        this.parentId = parent?.id ?? null;
      }
    };
    constructor(readonly seed: Record<string, unknown>) {
      this.name = seed['name'] as string;
      this.type = seed['type'] as string;
    }
  }

  it('构造入参不含 sortOrder，生成后的节点 sortOrder 保持缺省', () => {
    const files = generateBatchFiles<FakeFile>(80, FakeFile);

    expect(files).toHaveLength(80);
    for (const file of files) {
      expect(Object.keys(file.seed)).not.toContain('sortOrder');
      expect(file.sortOrder).toBeNull();
    }
  });

  it('生成器只收数量与实体类，不再收已有根节点', () => {
    expect(generateBatchFiles.length).toBe(2);
  });

  it('文件夹与文件混合生成，层级通过 parent$ 关联到本批已建的文件夹', () => {
    const files = generateBatchFiles<FakeFile>(200, FakeFile);
    const ids = new Set(files.map(file => file.id));
    const parents = files.filter(file => file.parentId !== null);

    expect(parents.length).toBeGreaterThan(0);
    for (const file of parents) expect(ids.has(file.parentId as string)).toBe(true);
  });
});
