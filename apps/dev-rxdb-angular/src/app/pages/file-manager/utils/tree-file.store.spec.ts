import { RxDB, SortOrderError, type HistoryScopeAPI } from '@aiao/rxdb';
import { SortableFileNode } from '@aiao/rxdb-test/entities';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileDragDropService } from '../services/file-drag-drop.service';
import type { FilePathValidatorService } from '../services/file-path-validator.service';
import { SortMode } from './file-sorters';
import { TreeFileDragDropBase } from './tree-file-drag-drop.base';
import { TreeFileDragDropStore, TreeFileStore } from './tree-file.store';

const makeFile = (
  id: string,
  parentId: string | null,
  name: string,
  type: 'file' | 'folder' = 'folder'
): SortableFileNode =>
  ({
    id,
    parentId,
    name,
    type,
    extension: null,
    sortOrder: id,
    hasChildren: type === 'folder'
  }) as unknown as SortableFileNode;

const makeStore = (files: SortableFileNode[]) =>
  new TreeFileStore<typeof SortableFileNode>(
    {} as RxDB,
    {} as FilePathValidatorService,
    { value: signal(files) },
    SortableFileNode,
    undefined
  );

describe('TreeFileStore.treeNodes', () => {
  beforeEach(() => localStorage.clear());

  it('关键字无匹配时返回空树', () => {
    const store = makeStore([makeFile('root', null, '文档'), makeFile('child', 'root', '说明', 'file')]);
    store.expandedFileIds.set(new Set(['root']));

    store.setSearchKeyword('zzz-绝不匹配');

    expect(store.treeNodes()).toEqual([]);
  });

  it('关键字有匹配时只返回匹配项及其祖先', () => {
    const store = makeStore([
      makeFile('root', null, '文档'),
      makeFile('matched', 'root', '发布说明', 'file'),
      makeFile('other', 'root', '设计稿', 'file')
    ]);
    store.expandedFileIds.set(new Set(['root']));

    store.setSearchKeyword('发布');

    expect(store.treeNodes().map(item => item.node.id)).toEqual(['root', 'matched']);
  });

  it('建树顺序 = 查询顺序', () => {
    // 键的字典序（a < b < z）与查询给出的顺序相反：手动模式不得再按 sortOrder 排序
    const rootB = { ...makeFile('rb', null, 'B'), sortOrder: 'b' } as SortableFileNode;
    const rootA = { ...makeFile('ra', null, 'A'), sortOrder: 'a' } as SortableFileNode;
    const childZ = { ...makeFile('cz', 'rb', 'Z', 'file'), sortOrder: 'z' } as SortableFileNode;
    const childA = { ...makeFile('ca', 'rb', 'a', 'file'), sortOrder: 'a' } as SortableFileNode;
    const store = makeStore([rootB, rootA, childZ, childA]);
    store.expandedFileIds.set(new Set(['rb']));

    expect(store.sortMode()).toBe(SortMode.Manual);
    expect(store.treeNodes().map(item => item.node.id)).toEqual(['rb', 'cz', 'ca', 'ra']);
  });
});

class TestFileEntity {
  static instances: TestFileEntity[] = [];
  static nextId = 0;

  id = `new-file-${String(++TestFileEntity.nextId)}`;
  parentId: string | null = null;
  name = '';
  type: 'file' | 'folder' = 'folder';
  extension: string | null | undefined = null;
  size: number | null | undefined = null;
  /** 页面代码对 `sortOrder` 的每一次赋值都记在这里（新建 / 批量不得赋值） */
  sortOrderWrites: unknown[] = [];
  hasChildren = false;
  parent$ = { set: vi.fn() };
  readonly save = vi.fn(async () => this);
  readonly remove = vi.fn(async () => this);

  set sortOrder(value: unknown) {
    this.sortOrderWrites.push(value);
  }

  constructor() {
    TestFileEntity.instances.push(this);
  }

  static reset(): void {
    TestFileEntity.instances = [];
    TestFileEntity.nextId = 0;
  }
}

const makeActionFile = (
  id: string,
  parentId: string | null,
  name: string,
  type: 'file' | 'folder' = 'folder',
  sortOrder = 'a0'
): SortableFileNode =>
  ({
    id,
    parentId,
    name,
    type,
    extension: type === 'file' ? '.txt' : null,
    size: type === 'file' ? 10 : null,
    sortOrder,
    hasChildren: type === 'folder',
    parent$: { set: vi.fn() },
    save: vi.fn(async function (this: SortableFileNode) {
      return this;
    }),
    remove: vi.fn(async function (this: SortableFileNode) {
      return this;
    })
  }) as unknown as SortableFileNode;

const makeActionStore = (files: SortableFileNode[]) => {
  const removeMany = vi.fn(async (files: SortableFileNode[]) => {
    void files;
  });
  const saveMany = vi.fn(async (files: SortableFileNode[]) => {
    void files;
  });
  const entityManager = {
    removeMany,
    saveMany
  };
  const pathValidator = {
    checkConflict: vi.fn((): ReturnType<FilePathValidatorService['checkConflict']> => null)
  };
  const history = { undo: vi.fn(), redo: vi.fn() };
  const resource = { value: signal(files) };
  const store = new TreeFileStore<typeof SortableFileNode>(
    { entityManager } as unknown as RxDB,
    pathValidator as unknown as FilePathValidatorService,
    resource,
    TestFileEntity as unknown as typeof SortableFileNode,
    history as unknown as HistoryScopeAPI
  );
  return { entityManager, history, pathValidator, resource, store };
};

describe('TreeFileStore actions', () => {
  beforeEach(() => {
    localStorage.clear();
    TestFileEntity.reset();
  });

  it('创建根文件夹、子文件夹和根/子文件，并保留正确的父级状态', async () => {
    const root = makeActionFile('root', null, '根', 'folder', 'a0');
    const { store } = makeActionStore([root]);

    await store.createRootFolder('新根');
    const [newRoot] = TestFileEntity.instances;
    expect(newRoot.type).toBe('folder');
    expect(newRoot.name).toBe('新根');
    expect(newRoot.save).toHaveBeenCalledOnce();
    expect(store.expandedFileIds()).toContain(newRoot.id);

    store.selectFolder(root.id);
    await store.createSubFolder('子文件夹');
    const newChild = TestFileEntity.instances[1];
    expect(newChild.parentId).toBe(root.id);
    expect(store.selectedFolderId()).toBeNull();

    await store.createFile('说明', '.md', 42);
    const newFile = TestFileEntity.instances[2];
    expect(newFile.type).toBe('file');
    expect(newFile.extension).toBe('md');
    expect(newFile.size).toBe(42);
    expect(newFile.parentId).toBeNull();
    expect(newFile.save).toHaveBeenCalledOnce();
  });

  /**
   * 缺陷一：根级已有文件夹 A（`a0`）与文件 X（`a1`）时，旧代码只在「根文件夹」里取尾键，
   * 给新文件夹 B 算出 `a1`，与 X 同键。排序键归引擎：新建只赋业务字段，不读兄弟、不赋 `sortOrder`。
   */
  it('新建文件夹 / 子文件夹 / 文件都不赋 sortOrder（缺陷一：根级文件夹与文件交替新建）', async () => {
    const folderA = makeActionFile('a', null, 'A', 'folder', 'a0');
    const fileX = makeActionFile('x', null, 'X', 'file', 'a1');
    const { store } = makeActionStore([folderA, fileX]);

    await store.createRootFolder('B');
    store.selectFolder(folderA.id);
    await store.createSubFolder('子文件夹');
    await store.createFile('说明', '.md', 1);

    const [rootB, sub, file] = TestFileEntity.instances;
    expect(rootB.sortOrderWrites).toEqual([]);
    expect(sub.sortOrderWrites).toEqual([]);
    expect(file.sortOrderWrites).toEqual([]);
    expect([rootB.save, sub.save, file.save].every(save => save.mock.calls.length === 1)).toBe(true);
  });

  it('冲突时不创建，编辑时排除自身并清理编辑状态', async () => {
    const file = makeActionFile('file', null, '说明', 'file');
    const { pathValidator, store } = makeActionStore([file]);
    pathValidator.checkConflict.mockReturnValueOnce({
      conflictPath: '/说明.txt',
      conflictNode: file,
      attemptedName: '说明.txt'
    });

    await store.createFile('说明', '.txt', 1);
    expect(TestFileEntity.instances).toHaveLength(0);
    expect(store.pathConflictWarning()?.attemptedName).toBe('说明.txt');

    store.clearPathConflict();
    store.startEdit(file.id);
    await store.saveEdit('README', '.md');
    expect(file.name).toBe('README');
    expect(file.extension).toBe('.md');
    expect(file.save).toHaveBeenCalledOnce();
    expect(store.editingFileId()).toBeNull();
  });

  it('计算删除影响，叶子直接删除，父节点级联删除后清空确认态', async () => {
    const root = makeActionFile('root', null, '根');
    const child = makeActionFile('child', 'root', '子');
    const grandchild = makeActionFile('grandchild', 'child', '孙', 'file');
    const leaf = makeActionFile('leaf', null, '叶', 'file');
    const { entityManager, store } = makeActionStore([root, child, grandchild, leaf]);

    await store.deleteFile(leaf);
    expect(leaf.remove).toHaveBeenCalledOnce();

    await store.deleteFile(root);
    expect(store.fileToDelete()).toBe(root);
    expect(store.deleteImpact()).toEqual({ childrenCount: 1, descendantsCount: 2 });

    await store.executeCascadeDelete();
    expect(child.remove).toHaveBeenCalledOnce();
    expect(grandchild.remove).toHaveBeenCalledOnce();
    expect(root.remove).toHaveBeenCalledOnce();
    expect(store.fileToDelete()).toBeNull();

    await store.deleteAllFiles();
    expect(entityManager.removeMany).toHaveBeenCalledWith([root, child, grandchild, leaf]);
  });

  it('搜索、排序、全量展开折叠和本地持久化保持一致', () => {
    const root = makeActionFile('root', null, '文档', 'folder', 'a0');
    const child = makeActionFile('child', 'root', '发布说明', 'file', 'b0');
    const other = makeActionFile('other', null, '图片', 'file', 'c0');
    const { history, store } = makeActionStore([root, child, other]);

    store.expandedFileIds.set(new Set([root.id]));
    store.setSearchKeyword('发布');
    expect(store.matchedFileIds()).toEqual(new Set(['root', 'child']));
    expect(store.treeNodes().map(item => item.node.id)).toEqual(['root', 'child']);
    expect(store.isAllExpanded()).toBe(true);

    store.setSortMode(SortMode.NameDesc);
    expect(localStorage.getItem('file-manager-sort-mode')).toBe(SortMode.NameDesc);
    store.setSearchKeyword('');
    store.toggleExpandAll();
    expect(store.expandedFileIds()).toEqual(new Set());
    store.toggleExpandAll();
    expect(store.expandedFileIds()).toEqual(new Set(['root']));
    expect(store.isAllExpanded()).toBe(true);
    store.toggleExpandAll();
    expect(store.expandedFileIds()).toEqual(new Set());
    store.selectFolder(root.id);
    store.selectFolder(root.id);
    store.cancelSelectFolder();
    store.clearPathConflict();

    expect(store.selectedFolderId()).toBeNull();
    expect(history.undo).not.toHaveBeenCalled();
  });

  it('批量添加是单次 saveMany，节点不带 sortOrder，也不读页面已加载的节点', async () => {
    const existing = makeActionFile('root', null, '已有', 'folder', 'a0');
    const { entityManager, store } = makeActionStore([existing]);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    await store.addBatch(5);

    expect(entityManager.saveMany).toHaveBeenCalledOnce();
    const files = entityManager.saveMany.mock.calls[0][0] as unknown as TestFileEntity[];
    expect(files).toHaveLength(5);
    expect(files.every(file => file.sortOrderWrites.length === 0)).toBe(true);
    expect(new Set(files.map(file => file.id)).size).toBe(5);
    random.mockRestore();
  });
});

/** 目标行的矩形：高 90，上三分之一 [0,30)、中间 [30,60]、下三分之一 (60,90]。 */
const ROW = { top: 0, height: 90 } as DOMRect;
const BEFORE = 5;
const INTO = 45;
const AFTER = 85;

const makeDragStore = (files: SortableFileNode[]) => {
  const reorder = vi.fn(async (id: string, target: object) => {
    void id;
    void target;
  });
  const getRepository = vi.fn(() => ({ reorder }));
  const history = { undo: vi.fn(), redo: vi.fn() } as unknown as HistoryScopeAPI;
  const store = new TreeFileDragDropStore<typeof SortableFileNode>(
    { entityManager: { getRepository } } as unknown as RxDB,
    {} as FilePathValidatorService,
    new FileDragDropService(),
    { value: signal(files) },
    TestFileEntity as unknown as typeof SortableFileNode,
    history
  );
  return { store, reorder, history };
};

/** 拖动 `draggedId`，在 `targetId` 行的 `clientY` 处放下，返回拖动中的判定结果。 */
const dragAndDrop = async (
  store: TreeFileDragDropStore<typeof SortableFileNode>,
  files: SortableFileNode[],
  draggedId: string,
  targetId: string,
  clientY: number
) => {
  const target = files.find(file => file.id === targetId)!;
  store.onDragStart(draggedId);
  const over = store.onDragOver(target, clientY, ROW);
  await store.onDrop(target);
  return over;
};

describe('TreeFileDragDropStore 拖放交给引擎', () => {
  const idleState = { draggedItemId: null, targetItemId: null, dropMode: null, isValidTarget: false };

  beforeEach(() => {
    localStorage.clear();
    TestFileEntity.reset();
  });

  it('维护拖拽状态、无效目标和目标后代高亮', async () => {
    const dragged = makeActionFile('dragged', null, '拖动', 'file', 'a0');
    const target = makeActionFile('target', null, '目标', 'folder', 'b0');
    const child = makeActionFile('target-child', target.id, '子', 'file', 'a0');
    const files = [dragged, target, child];
    const { store, reorder } = makeDragStore(files);

    store.onDragStart(dragged.id);
    expect(store.invalidTargets()).toEqual(new Set(['dragged']));
    const over = store.onDragOver(target, INTO, ROW);
    expect(over).toEqual({ dropMode: 'into', isValid: true });
    expect(store.highlightedFileIds()).toEqual(new Set(['target-child']));

    await store.onDrop(target);
    expect(reorder).toHaveBeenCalledExactlyOnceWith('dragged', { group: { parentId: 'target' } });
    expect(store.expandedFileIds()).toContain(target.id);
    expect(store.dragDropState()).toEqual(idleState);

    store.onDragEnd();
    expect(store.dragDropState().dropMode).toBeNull();
  });

  it('手动模式前后放置的邻居取自组的完整序列', async () => {
    const files = [
      makeActionFile('A', null, 'A'),
      makeActionFile('B', null, 'B'),
      makeActionFile('C', null, 'C', 'file'),
      makeActionFile('x', 'A', 'x', 'file')
    ];
    const { store, reorder } = makeDragStore(files);

    await dragAndDrop(store, files, 'x', 'B', AFTER);

    expect(reorder).toHaveBeenCalledExactlyOnceWith('x', { prevId: 'B', nextId: 'C' });
  });

  describe('reject / noop 不调用 reorder', () => {
    it('拖到自己或后代、拖进文件都被拒，高亮为无效', async () => {
      const files = [
        makeActionFile('F', null, 'F'),
        makeActionFile('c', 'F', 'c', 'file'),
        makeActionFile('Y', null, 'Y', 'file')
      ];
      const { store, reorder } = makeDragStore(files);

      for (const clientY of [BEFORE, INTO, AFTER]) {
        expect((await dragAndDrop(store, files, 'F', 'c', clientY)).isValid).toBe(false);
      }
      expect((await dragAndDrop(store, files, 'F', 'Y', INTO)).isValid).toBe(false);

      expect(reorder).not.toHaveBeenCalled();
      expect(store.dragDropState()).toEqual(idleState);
    });

    it('手动模式原位放下', async () => {
      const files = [makeActionFile('A', null, 'A'), makeActionFile('B', null, 'B'), makeActionFile('C', null, 'C')];
      const { store, reorder } = makeDragStore(files);

      const over = await dragAndDrop(store, files, 'B', 'C', BEFORE);

      expect(over.isValid).toBe(true);
      expect(reorder).not.toHaveBeenCalled();
    });
  });

  describe('非手动模式', () => {
    const makeFiles = () => [
      makeActionFile('F', null, 'F'),
      makeActionFile('x', 'F', 'x', 'file'),
      makeActionFile('G', null, 'G'),
      makeActionFile('H', null, 'H')
    ];

    it('非手动模式同级前后放置被拒、不调用 reorder', async () => {
      const files = makeFiles();
      const { store, reorder } = makeDragStore(files);
      store.setSortMode(SortMode.NameAsc);

      // 根级节点之间（根级目标行仍分三档）
      expect((await dragAndDrop(store, files, 'G', 'H', BEFORE)).isValid).toBe(false);
      expect((await dragAndDrop(store, files, 'G', 'H', AFTER)).isValid).toBe(false);

      expect(reorder).not.toHaveBeenCalled();
    });

    it('非手动模式非根级目标行整行为拖进；拖进当前父文件夹被拒', async () => {
      const files = [...makeFiles(), makeActionFile('y', 'F', 'y', 'file')];
      const { store, reorder } = makeDragStore(files);
      store.setSortMode(SortMode.NameAsc);

      // 目标 y 是 F 的子节点（非根级、文件）：上三分之一也落成 into，文件不能拖进
      const over = await dragAndDrop(store, files, 'x', 'y', BEFORE);
      expect(over).toEqual({ dropMode: 'into', isValid: false });
      // 拖进当前父文件夹 F
      expect((await dragAndDrop(store, files, 'x', 'F', INTO)).isValid).toBe(false);

      expect(reorder).not.toHaveBeenCalled();
    });

    it('非手动模式子级拖到根级节点下方 → { group: { parentId: null } }', async () => {
      const files = makeFiles();
      const { store, reorder } = makeDragStore(files);
      store.setSortMode(SortMode.NameAsc);

      const over = await dragAndDrop(store, files, 'x', 'G', AFTER);

      expect(over).toEqual({ dropMode: 'after', isValid: true });
      expect(reorder).toHaveBeenCalledExactlyOnceWith('x', { group: { parentId: null } });
    });

    it('非手动模式拖进文件夹 → { group: { parentId } }，成功后展开目标', async () => {
      const files = makeFiles();
      const { store, reorder } = makeDragStore(files);
      store.setSortMode(SortMode.NameAsc);

      await dragAndDrop(store, files, 'H', 'G', INTO);

      expect(reorder).toHaveBeenCalledExactlyOnceWith('H', { group: { parentId: 'G' } });
      expect(store.expandedFileIds()).toContain('G');
    });
  });

  describe('拖放失败进页内提示', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      TestBed.resetTestingModule();
    });

    const makeHost = (files: SortableFileNode[]) => {
      const parts = makeDragStore(files);
      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'browser' },
          { provide: RxDB, useValue: {} }
        ]
      });
      class Host extends TreeFileDragDropBase<typeof SortableFileNode> {
        constructor() {
          super(
            parts.store,
            { value: signal(files) },
            TestFileEntity as unknown as typeof SortableFileNode,
            parts.history
          );
        }
      }
      const host = TestBed.runInInjectionContext(() => new Host());
      return { host, ...parts };
    };

    const dropEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent;
    const makeFiles = () => [
      makeActionFile('A', null, 'A'),
      makeActionFile('B', null, 'B'),
      makeActionFile('X', null, 'X')
    ];

    it('reorder 抛 SortOrderError 时页内提示「拖放失败：…」、拖拽状态复位、不弹窗', async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal('alert', alertSpy);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const files = makeFiles();
      const { host, store, reorder } = makeHost(files);
      const error = new SortOrderError('SortableFileNode', 'staleTarget', '邻居已不相邻');
      reorder.mockRejectedValueOnce(error);

      store.onDragStart('X');
      store.onDragOver(files[0], AFTER, ROW);
      await host.onDrop(dropEvent, files[0]);

      expect(host.writeError()).toBe(`拖放失败：${error.message}`);
      expect(host.writeError()).toContain('邻居已不相邻');
      expect(store.dragDropState()).toEqual(idleState);
      expect(alertSpy).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('下一次拖放清空错误', async () => {
      const files = makeFiles();
      const { host, store, reorder } = makeHost(files);
      reorder.mockRejectedValueOnce(new SortOrderError('SortableFileNode', 'staleTarget', '邻居已不相邻'));

      store.onDragStart('X');
      store.onDragOver(files[0], AFTER, ROW);
      await host.onDrop(dropEvent, files[0]);
      expect(host.writeError()).not.toBeNull();

      store.onDragStart('X');
      store.onDragOver(files[0], AFTER, ROW);
      await host.onDrop(dropEvent, files[0]);

      expect(host.writeError()).toBeNull();
      expect(reorder).toHaveBeenCalledTimes(2);
    });
  });
});
