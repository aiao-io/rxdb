import { RxDB } from '@aiao/rxdb';
import { SortableFileLarge } from '@aiao/rxdb-test/entities';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileDragDropService } from '../services/file-drag-drop.service';
import { FilePathValidatorService } from '../services/file-path-validator.service';
import { FileSearchService } from '../services/file-search.service';
import { FILE_ENTITY_CLASS, FILE_HISTORY, TreeFileLazyStore } from './file-manager-lazy.store';

const roots = new BehaviorSubject<SortableFileLarge[]>([]);
const allFiles = new BehaviorSubject<SortableFileLarge[]>([]);
const childQueries = new Map<string, BehaviorSubject<SortableFileLarge[]>>();
/** 模拟库里的子树：节点 id -> 自身 + 全部后代 */
const subtrees = new Map<string, SortableFileLarge[]>();
let failingNodeId: string | null = null;
const removeMany = vi.fn(async (files: SortableFileLarge[]) => {
  void files;
});
/** 引擎重排的替身 */
const reorder = vi.fn(async (id: string, target: object) => {
  void id;
  void target;
});

interface QueryOptions {
  where?: { rules?: Array<{ field: string; value: unknown }> };
}

class TestFileEntityClass {
  static findAll = (options: object): Observable<SortableFileLarge[]> => {
    const rules = (options as QueryOptions).where?.rules ?? [];
    return rules.length > 0 ? roots.asObservable() : allFiles.asObservable();
  };

  static findDescendants = (options: { entityId: string }): Observable<SortableFileLarge[]> => {
    return of(subtrees.get(options.entityId) ?? []);
  };

  static find = (options: object): Observable<SortableFileLarge[]> => {
    const parentId = (options as QueryOptions).where?.rules?.find(rule => rule.field === 'parentId')?.value;
    if (parentId === failingNodeId) return throwError(() => new Error(`load ${String(parentId)} failed`));
    const key = String(parentId);
    let query = childQueries.get(key);
    if (!query) {
      query = new BehaviorSubject<SortableFileLarge[]>([]);
      childQueries.set(key, query);
    }
    return query.asObservable();
  };
}

const makeFile = (
  id: string,
  name: string,
  parentId: string | null = null,
  type: 'file' | 'folder' = 'folder',
  hasChildren = type === 'folder'
): SortableFileLarge =>
  ({
    id,
    parentId,
    name,
    type,
    extension: type === 'file' ? '.txt' : null,
    sortOrder: 'a0',
    hasChildren,
    save: vi.fn(async function (this: SortableFileLarge) {
      return this;
    }),
    remove: vi.fn(async function (this: SortableFileLarge) {
      return this;
    })
  }) as unknown as SortableFileLarge;

describe('TreeFileLazyStore.treeNodes', () => {
  beforeEach(() => {
    localStorage.clear();
    roots.next([makeFile('root-a', '文档'), makeFile('root-b', '图片')]);
    allFiles.next([]);
    childQueries.clear();
    subtrees.clear();
    failingNodeId = null;
    reorder.mockReset();
    removeMany.mockClear();
    TestBed.configureTestingModule({
      providers: [
        TreeFileLazyStore,
        FilePathValidatorService,
        FileSearchService,
        FileDragDropService,
        {
          provide: RxDB,
          useValue: {
            entityManager: { saveMany: vi.fn(), removeMany, getRepository: vi.fn(() => ({ reorder })) }
          }
        },
        { provide: FILE_ENTITY_CLASS, useValue: TestFileEntityClass },
        { provide: FILE_HISTORY, useValue: {} }
      ]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('关键字无匹配时返回空树', () => {
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);

    store.setSearchKeyword('zzz-绝不匹配');

    expect(store.treeNodes()).toEqual([]);
  });

  it('关键字为空时返回已加载节点', () => {
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);

    store.setSearchKeyword('');

    expect(store.treeNodes().map(item => item.node.id)).toEqual(['root-a', 'root-b']);
  });

  it('文件不可展开，文件夹展开后订阅子节点并可递归折叠', async () => {
    const file = makeFile('file', '说明', null, 'file', false);
    const root = makeFile('root', '文档', null, 'folder', true);
    const child = makeFile('child', '子目录', root.id, 'folder', true);
    const grandchild = makeFile('grandchild', '内容', child.id, 'file', false);
    roots.next([file, root]);
    childQueries.set(root.id, new BehaviorSubject([child]));
    childQueries.set(child.id, new BehaviorSubject([grandchild]));
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);

    store.toggleExpand(file);
    expect(store.expandedFileIds()).toEqual(new Set());
    store.toggleExpand(root);
    store.toggleExpand(child);

    expect(store.treeNodes().map(item => item.node.id)).toEqual(['file', 'root', 'child', 'grandchild']);
    expect(store.loadingNodes()).toEqual(new Set());
    expect(store.isExpanded(root.id)).toBe(true);

    store.collapseNode(root.id);
    expect(store.expandedFileIds()).toEqual(new Set());
    expect(store.visibleNodes().map(node => node.id)).toEqual(['file', 'root']);
    await Promise.resolve();
  });

  it('加载错误会记录 nodeErrors，重试后清除错误并恢复子节点', () => {
    const root = makeFile('root', '文档', null, 'folder', true);
    roots.next([root]);
    failingNodeId = root.id;
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);

    store.expandNode(root.id);
    expect(store.nodeErrors().get(root.id)?.message).toBe('load root failed');
    expect(store.loadingNodes()).not.toContain(root.id);

    failingNodeId = null;
    childQueries.set(root.id, new BehaviorSubject([makeFile('child', '子', root.id, 'file', false)]));
    store.retryLoadChildren(root.id);

    expect(store.nodeErrors().has(root.id)).toBe(false);
    expect(store.treeNodes().map(item => item.node.id)).toEqual(['root', 'child']);
  });

  it('全量模式过滤空名称并自动展开文件夹，折叠后恢复根模式', () => {
    const root = makeFile('root', '根', null, 'folder', true);
    const child = makeFile('child', '子', root.id, 'file', false);
    const blank = makeFile('blank', '   ', null, 'file', false);
    roots.next([root]);
    allFiles.next([root, child, blank]);
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);

    store.expandAll();
    expect(store.isFullMode()).toBe(true);
    expect(store.expandedFileIds()).toEqual(new Set(['root']));
    expect(store.treeNodes().map(item => item.node.id)).toEqual(['root', 'child']);
    // 空白名称的行只是不展示，仍在拖放取组序列的完整集合里
    expect(store.visibleNodes().map(node => node.id)).toEqual(['root', 'blank', 'child']);

    store.toggleExpandAll();
    expect(store.isFullMode()).toBe(false);
    expect(store.expandedFileIds()).toEqual(new Set());
    expect(store.visibleNodes().map(node => node.id)).toEqual(['root']);
  });

  it('批量添加重置旧订阅和展开状态，并重新订阅根节点', async () => {
    const root = makeFile('root', '根', null, 'folder', true);
    roots.next([root]);
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);
    store.expandNode(root.id);
    store.expandedFileIds.set(new Set([root.id]));

    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await store.addBatch(3);
    random.mockRestore();

    const entityManager = (TestBed.inject(RxDB) as unknown as { entityManager: { saveMany: ReturnType<typeof vi.fn> } })
      .entityManager;
    expect(entityManager.saveMany).toHaveBeenCalledOnce();
    expect(entityManager.saveMany.mock.calls[0][0]).toHaveLength(3);
    expect(store.expandedFileIds()).toEqual(new Set());
    expect(store.loadingNodes()).toEqual(new Set());
    expect(store.visibleNodes()).toEqual([root]);
  });

  it('批量添加的节点不带 sortOrder，不以已加载的根节点为锚点（排序键归引擎）', async () => {
    const existingRoot = makeFile('root', '根', null, 'folder', true);
    roots.next([existingRoot]);
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);

    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await store.addBatch(20);
    random.mockRestore();

    const entityManager = (TestBed.inject(RxDB) as unknown as { entityManager: { saveMany: ReturnType<typeof vi.fn> } })
      .entityManager;
    const saved = entityManager.saveMany.mock.calls[0][0] as object[];
    expect(saved).toHaveLength(20);
    expect(saved.some(file => Object.hasOwn(file, 'sortOrder'))).toBe(false);
  });

  it('搜索警告明确提示折叠节点仅搜索已加载数据', () => {
    const root = makeFile('root', '文档', null, 'folder', true);
    roots.next([root]);
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);

    store.setSearchKeyword('发布');

    expect(store.searchWarning()).toEqual({
      message: '搜索仅限于已加载的节点。展开更多文件夹以搜索其子项。',
      loadedCount: 1
    });
  });

  it('销毁时取消根和子订阅', () => {
    const root = makeFile('root', '根', null, 'folder', true);
    const children$ = new BehaviorSubject<SortableFileLarge[]>([makeFile('child', '子', root.id, 'file', false)]);
    roots.next([root]);
    childQueries.set(root.id, children$);
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);
    store.expandNode(root.id);

    store.ngOnDestroy();
    roots.next([makeFile('new-root', '新根')]);
    children$.next([]);

    expect(store.visibleNodes().map(node => node.id)).toEqual(['root', 'child']);
  });

  it('建树顺序 = 查询顺序', () => {
    // 键的字典序与查询顺序相反：手动模式不得再按 sortOrder 排序，也不得文件夹优先
    const file = { ...makeFile('file', '说明', null, 'file', false), sortOrder: 'a' } as SortableFileLarge;
    const folder = { ...makeFile('folder', '文档'), sortOrder: 'b' } as SortableFileLarge;
    roots.next([folder, file]);
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);

    expect(store.treeNodes().map(item => item.node.id)).toEqual(['folder', 'file']);
  });

  it('查询不传 orderBy', () => {
    const findAll = vi.spyOn(TestFileEntityClass, 'findAll');
    const find = vi.spyOn(TestFileEntityClass, 'find');
    const root = makeFile('root', '文档');
    roots.next([root]);
    const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);

    store.expandNode(root.id);
    store.expandAll();

    // 根查询、子节点查询、展开全部三处
    expect(findAll).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenCalledTimes(1);
    for (const [options] of [...findAll.mock.calls, ...find.mock.calls]) {
      expect(options).not.toHaveProperty('orderBy');
    }
    findAll.mockRestore();
    find.mockRestore();
  });

  describe('删除折叠文件夹', () => {
    it('折叠且子节点未加载的文件夹：库里有子节点就弹对话框，级联删除取库里的整棵子树', async () => {
      const folded = makeFile('folded', '折叠的文件夹', null, 'folder', true);
      const child = makeFile('c', 'c', 'folded', 'file', false);
      const grandchild = makeFile('g', 'g', 'c', 'file', false);
      roots.next([folded]);
      subtrees.set('folded', [folded, child, grandchild]);
      const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);
      vi.spyOn(TestFileEntityClass, 'findAll').mockReturnValueOnce(of([child]));

      await store.deleteFile(folded);

      expect(folded.remove).not.toHaveBeenCalled();
      expect(store.fileToDelete()).toBe(folded);
      expect(store.deleteImpact()).toEqual({ childrenCount: 1, descendantsCount: 2 });

      await store.executeCascadeDelete();

      expect(removeMany).toHaveBeenCalledExactlyOnceWith([folded, child, grandchild]);
      expect(store.fileToDelete()).toBeNull();
    });
  });

  describe('拖放交给引擎', () => {
    const ROW = { top: 0, height: 90 } as DOMRect;
    const INTO = 45;

    it('拖进折叠且子节点未加载的节点：目标为 { group }，不读子节点', async () => {
      const parent = makeFile('P', '文档', null, 'folder', true);
      const dragged = makeFile('X', '说明', null, 'file', false);
      roots.next([parent, dragged]);
      const find = vi.spyOn(TestFileEntityClass, 'find');
      const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);
      // 放下瞬间已发出的子节点查询次数：P 折叠，没有订阅过它的子节点
      const childQueriesAtReorder: number[] = [];
      reorder.mockImplementation(async () => {
        childQueriesAtReorder.push(find.mock.calls.length);
      });

      store.onDragStart(dragged.id);
      store.onDragOver(parent, INTO, ROW);
      await store.onDrop(parent);

      expect(reorder).toHaveBeenCalledExactlyOnceWith('X', { group: { parentId: 'P' } });
      expect(childQueriesAtReorder).toEqual([0]);
      // 成功后展开目标并订阅它的子节点，新节点随订阅回流
      expect(store.isExpanded('P')).toBe(true);
      expect(find).toHaveBeenCalledTimes(1);
      expect(store.dragDropState()).toEqual({
        draggedItemId: null,
        targetItemId: null,
        dropMode: null,
        isValidTarget: false
      });
      find.mockRestore();
    });

    it('展开全部后组里有空白名称的行：邻居按完整组换算，夹在中间的隐藏行不被漏掉', async () => {
      const [a, hidden, b, x] = [
        makeFile('A', '甲', null, 'file', false),
        makeFile('H', '   ', null, 'file', false),
        makeFile('B', '乙', null, 'file', false),
        makeFile('X', '丙', null, 'file', false)
      ];
      roots.next([a, hidden, b, x]);
      allFiles.next([a, hidden, b, x]);
      const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);
      store.expandAll();
      expect(store.treeNodes().map(item => item.node.id)).toEqual(['A', 'B', 'X']);

      store.onDragStart(x.id);
      store.onDragOver(a, 80, ROW);
      await store.onDrop(a);

      expect(reorder).toHaveBeenCalledExactlyOnceWith('X', { prevId: 'A', nextId: 'H' });
    });

    it('拖放被拒时不调用 reorder，也不展开目标', async () => {
      const parent = makeFile('P', '文档', null, 'folder', true);
      roots.next([parent]);
      const store = TestBed.inject(TreeFileLazyStore<typeof SortableFileLarge>);

      store.onDragStart(parent.id);
      store.onDragOver(parent, INTO, ROW);
      await store.onDrop(parent);

      expect(reorder).not.toHaveBeenCalled();
      expect(store.isExpanded('P')).toBe(false);
    });
  });
});
