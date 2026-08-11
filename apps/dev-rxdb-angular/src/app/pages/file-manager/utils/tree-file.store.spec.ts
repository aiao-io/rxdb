import type { HistoryScopeAPI, RxDB } from '@aiao/rxdb';
import { FileNode } from '@aiao/rxdb-test/entities';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileDragDropService } from '../services/file-drag-drop.service';
import type { FilePathValidatorService } from '../services/file-path-validator.service';
import { SortMode } from './file-sorters';
import { TreeFileDragDropStore, TreeFileStore } from './tree-file.store';

const makeFile = (id: string, parentId: string | null, name: string, type: 'file' | 'folder' = 'folder'): FileNode =>
  ({ id, parentId, name, type, extension: null, sortOrder: id, hasChildren: type === 'folder' }) as unknown as FileNode;

const makeStore = (files: FileNode[]) =>
  new TreeFileStore<typeof FileNode>(
    {} as RxDB,
    {} as FilePathValidatorService,
    { value: signal(files) },
    FileNode,
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
  sortOrder: string | null = 'a0';
  hasChildren = false;
  parent$ = { set: vi.fn() };
  readonly save = vi.fn(async () => this);
  readonly remove = vi.fn(async () => this);

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
): FileNode =>
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
    save: vi.fn(async function (this: FileNode) {
      return this;
    }),
    remove: vi.fn(async function (this: FileNode) {
      return this;
    })
  }) as unknown as FileNode;

const makeActionStore = (files: FileNode[]) => {
  const removeMany = vi.fn(async (files: FileNode[]) => {
    void files;
  });
  const saveMany = vi.fn(async (files: FileNode[]) => {
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
  const store = new TreeFileStore<typeof FileNode>(
    { entityManager } as unknown as RxDB,
    pathValidator as unknown as FilePathValidatorService,
    resource,
    TestFileEntity as unknown as typeof FileNode,
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

  it('批量添加按单次事务保存，并为每个节点生成排序键', async () => {
    const { entityManager, store } = makeActionStore([]);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    await store.addBatch(5);

    const [files] = entityManager.saveMany.mock.calls[0];
    expect(files).toHaveLength(5);
    expect(files.every(file => Boolean(file.sortOrder))).toBe(true);
    expect(new Set(files.map(file => file.id)).size).toBe(5);
    random.mockRestore();
  });
});

describe('TreeFileDragDropStore actions', () => {
  beforeEach(() => {
    localStorage.clear();
    TestFileEntity.reset();
  });

  it('维护拖拽状态、无效目标和目标后代高亮', async () => {
    const dragged = makeActionFile('dragged', null, '拖动', 'file', 'a0');
    const target = makeActionFile('target', null, '目标', 'folder', 'b0');
    const child = makeActionFile('target-child', target.id, '子', 'file', 'a0');
    const dragDropService = {
      getInvalidTargets: vi.fn(() => new Set(['dragged'])),
      calculateDropMode: vi.fn(() => 'into' as const),
      isValidDrop: vi.fn(() => true),
      executeDrop: vi.fn(async () => ({ success: true, newParentId: target.id }))
    };
    const { resource } = makeActionStore([dragged, target, child]);
    const store = new TreeFileDragDropStore<typeof FileNode>(
      {} as RxDB,
      {} as FilePathValidatorService,
      dragDropService as unknown as FileDragDropService,
      resource,
      TestFileEntity as unknown as typeof FileNode,
      {} as HistoryScopeAPI
    );

    store.onDragStart(dragged.id);
    expect(store.invalidTargets()).toEqual(new Set(['dragged']));
    const over = store.onDragOver(target, 50, { top: 0, bottom: 100 } as DOMRect);
    expect(over).toEqual({ dropMode: 'into', isValid: true });
    expect(store.highlightedFileIds()).toEqual(new Set(['target-child']));

    await store.onDrop(target);
    expect(dragDropService.executeDrop).toHaveBeenCalledWith(dragged.id, target.id, 'into', [dragged, target, child]);
    expect(store.expandedFileIds()).toContain(target.id);
    expect(store.dragDropState()).toMatchObject({ draggedItemId: null, targetItemId: null });

    store.onDragEnd();
    expect(store.dragDropState().dropMode).toBeNull();
  });
});
