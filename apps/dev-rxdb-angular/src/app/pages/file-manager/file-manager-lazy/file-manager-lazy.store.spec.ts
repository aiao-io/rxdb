import { RxDB } from '@aiao/rxdb';
import { FileLarge } from '@aiao/rxdb-test/entities';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileDragDropService } from '../services/file-drag-drop.service';
import { FilePathValidatorService } from '../services/file-path-validator.service';
import { FileSearchService } from '../services/file-search.service';
import { FILE_ENTITY_CLASS, FILE_HISTORY, TreeFileLazyStore } from './file-manager-lazy.store';

const roots = new BehaviorSubject<FileLarge[]>([]);
const allFiles = new BehaviorSubject<FileLarge[]>([]);
const childQueries = new Map<string, BehaviorSubject<FileLarge[]>>();
let failingNodeId: string | null = null;

interface QueryOptions {
  where?: { rules?: Array<{ field: string; value: unknown }> };
}

class TestFileEntityClass {
  static findAll = (options: object): Observable<FileLarge[]> => {
    const rules = (options as QueryOptions).where?.rules ?? [];
    return rules.length > 0 ? roots.asObservable() : allFiles.asObservable();
  };

  static find = (options: object): Observable<FileLarge[]> => {
    const parentId = (options as QueryOptions).where?.rules?.find(rule => rule.field === 'parentId')?.value;
    if (parentId === failingNodeId) return throwError(() => new Error(`load ${String(parentId)} failed`));
    const key = String(parentId);
    let query = childQueries.get(key);
    if (!query) {
      query = new BehaviorSubject<FileLarge[]>([]);
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
): FileLarge =>
  ({
    id,
    parentId,
    name,
    type,
    extension: type === 'file' ? '.txt' : null,
    sortOrder: 'a0',
    hasChildren,
    save: vi.fn(async function (this: FileLarge) {
      return this;
    }),
    remove: vi.fn(async function (this: FileLarge) {
      return this;
    })
  }) as unknown as FileLarge;

describe('TreeFileLazyStore.treeNodes', () => {
  beforeEach(() => {
    localStorage.clear();
    roots.next([makeFile('root-a', '文档'), makeFile('root-b', '图片')]);
    allFiles.next([]);
    childQueries.clear();
    failingNodeId = null;
    TestBed.configureTestingModule({
      providers: [
        TreeFileLazyStore,
        FilePathValidatorService,
        FileSearchService,
        FileDragDropService,
        { provide: RxDB, useValue: { entityManager: { saveMany: vi.fn(), removeMany: vi.fn() } } },
        { provide: FILE_ENTITY_CLASS, useValue: TestFileEntityClass },
        { provide: FILE_HISTORY, useValue: {} }
      ]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('关键字无匹配时返回空树', () => {
    const store = TestBed.inject(TreeFileLazyStore<typeof FileLarge>);

    store.setSearchKeyword('zzz-绝不匹配');

    expect(store.treeNodes()).toEqual([]);
  });

  it('关键字为空时返回已加载节点', () => {
    const store = TestBed.inject(TreeFileLazyStore<typeof FileLarge>);

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
    const store = TestBed.inject(TreeFileLazyStore<typeof FileLarge>);

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
    const store = TestBed.inject(TreeFileLazyStore<typeof FileLarge>);

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
    const store = TestBed.inject(TreeFileLazyStore<typeof FileLarge>);

    store.expandAll();
    expect(store.isFullMode()).toBe(true);
    expect(store.expandedFileIds()).toEqual(new Set(['root']));
    expect(store.treeNodes().map(item => item.node.id)).toEqual(['root', 'child']);

    store.toggleExpandAll();
    expect(store.isFullMode()).toBe(false);
    expect(store.expandedFileIds()).toEqual(new Set());
    expect(store.visibleNodes().map(node => node.id)).toEqual(['root']);
  });

  it('批量添加重置旧订阅和展开状态，并重新订阅根节点', async () => {
    const root = makeFile('root', '根', null, 'folder', true);
    roots.next([root]);
    const store = TestBed.inject(TreeFileLazyStore<typeof FileLarge>);
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

  it('搜索警告明确提示折叠节点仅搜索已加载数据', () => {
    const root = makeFile('root', '文档', null, 'folder', true);
    roots.next([root]);
    const store = TestBed.inject(TreeFileLazyStore<typeof FileLarge>);

    store.setSearchKeyword('发布');

    expect(store.searchWarning()).toEqual({
      message: '搜索仅限于已加载的节点。展开更多文件夹以搜索其子项。',
      loadedCount: 1
    });
  });

  it('销毁时取消根和子订阅', () => {
    const root = makeFile('root', '根', null, 'folder', true);
    const children$ = new BehaviorSubject<FileLarge[]>([makeFile('child', '子', root.id, 'file', false)]);
    roots.next([root]);
    childQueries.set(root.id, children$);
    const store = TestBed.inject(TreeFileLazyStore<typeof FileLarge>);
    store.expandNode(root.id);

    store.ngOnDestroy();
    roots.next([makeFile('new-root', '新根')]);
    children$.next([]);

    expect(store.visibleNodes().map(node => node.id)).toEqual(['root', 'child']);
  });
});
