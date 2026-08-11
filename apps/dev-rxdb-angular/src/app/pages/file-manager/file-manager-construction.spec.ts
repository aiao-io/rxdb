import { RxDB } from '@aiao/rxdb';
import { FileLarge } from '@aiao/rxdb-test/entities';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FileManagerLazyPage from './file-manager-lazy/file-manager-lazy.page';
import { FILE_HISTORY, TreeFileLazyStore } from './file-manager-lazy/file-manager-lazy.store';

describe('file manager construction contract', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('懒加载页复用 DI 提供的唯一 store 与 history', () => {
    const lazyStore = {
      visibleNodes: signal<FileLarge[]>([]),
      pathConflictWarning: signal(null),
      setSearchKeyword: vi.fn()
    } as unknown as TreeFileLazyStore<typeof FileLarge>;
    const history = { undo: vi.fn(), redo: vi.fn() };
    const storeFactory = vi.fn(() => lazyStore);
    const historyFactory = vi.fn(() => history);

    TestBed.configureTestingModule({
      providers: [
        { provide: RxDB, useValue: {} },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: TreeFileLazyStore, useFactory: storeFactory },
        { provide: FILE_HISTORY, useFactory: historyFactory }
      ]
    });

    const page = TestBed.runInInjectionContext(() => new FileManagerLazyPage());

    expect(page.store).toBe(lazyStore);
    expect(page.history).toBe(history);
    expect(storeFactory).toHaveBeenCalledTimes(1);
    expect(historyFactory).toHaveBeenCalledTimes(1);
  });

  it('懒加载页的显示、委托和销毁行为保持可观察', () => {
    const loadingNodes = signal(new Set<string>());
    const nodeErrors = signal(new Map<string, Error>());
    const lazyStore = {
      visibleNodes: signal<FileLarge[]>([]),
      pathConflictWarning: signal(null),
      expandedFileIds: signal(new Set<string>()),
      editingFileId: signal<string | null>(null),
      selectedFolderId: signal<string | null>(null),
      fileToDelete: signal<FileLarge | null>(null),
      searchKeyword: signal(''),
      matchedFileIds: signal(new Set<string>()),
      expandedCount: signal(0),
      isAllExpanded: signal(false),
      treeNodes: signal([]),
      deleteImpact: signal({ childrenCount: 0, descendantsCount: 0 }),
      sortMode: signal('manual'),
      dragDropState: signal({
        draggedItemId: null,
        targetItemId: null,
        dropMode: null,
        isValidTarget: false
      }),
      invalidTargets: signal(new Set<string>()),
      highlightedFileIds: signal(new Set<string>()),
      loadingNodes,
      nodeErrors,
      setSearchKeyword: vi.fn(),
      retryLoadChildren: vi.fn(),
      ngOnDestroy: vi.fn()
    };
    const history = { undo: vi.fn(), redo: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: RxDB, useValue: {} },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: TreeFileLazyStore, useValue: lazyStore },
        { provide: FILE_HISTORY, useValue: history }
      ]
    });

    const page = TestBed.runInInjectionContext(() => new FileManagerLazyPage());
    const folder = { type: 'folder', name: '文档', extension: null } as unknown as FileLarge;
    const plainFile = { type: 'file', name: 'README', extension: null } as unknown as FileLarge;
    const namedFile = { type: 'file', name: 'README.txt', extension: 'txt' } as unknown as FileLarge;
    const extensionFile = { type: 'file', name: 'README', extension: 'txt' } as unknown as FileLarge;

    expect(page.getDisplayName(folder)).toBe('文档');
    expect(page.getDisplayName(plainFile)).toBe('README');
    expect(page.getDisplayName(namedFile)).toBe('README.txt');
    expect(page.getDisplayName(extensionFile)).toBe('README.txt');

    const error = new Error('加载失败');
    loadingNodes.set(new Set(['folder']));
    nodeErrors.set(new Map([['folder', error]]));
    expect(page.isNodeLoading('folder')).toBe(true);
    expect(page.getNodeError('folder')).toBe(error);
    page.retryLoadChildren('folder');
    page.clearSearch();
    expect(lazyStore.retryLoadChildren).toHaveBeenCalledWith('folder');
    expect(lazyStore.setSearchKeyword).toHaveBeenCalledWith('');

    page.toggle_history();
    page.ngOnDestroy();
    expect(lazyStore.ngOnDestroy).toHaveBeenCalledOnce();
  });
});
