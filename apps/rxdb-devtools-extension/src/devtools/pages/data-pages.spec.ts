import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseStateService } from '../services/database-state.service';
import { OpfsService } from '../services/opfs.service';
import type { DbInfo, EntityData, OPFSFile } from '../types/devtools.types';
import { DatabasePage } from './database.page';
import { OpfsPage } from './opfs.page';
import { StoragePage } from './storage.page';

class DatabaseStateStub {
  readonly dbInfo = signal<DbInfo | null>(null);
  readonly dbLoading = signal(false);
  readonly entityDataByKey = signal<ReadonlyMap<string, EntityData>>(new Map());
  readonly inspectDb = vi.fn();
  readonly queryEntity = vi.fn();
  readonly isEntityLoading = vi.fn(
    (entity: string | null, namespace = 'public') => `${namespace}:${entity}` === 'work:loading'
  );

  setEntityData(data: EntityData): void {
    const namespace = data.namespace ?? 'public';
    this.entityDataByKey.update(current => new Map(current).set(`${namespace}:${data.entityName}`, data));
  }

  getEntityData(entityName: string, namespace = 'public'): EntityData | null {
    return this.entityDataByKey().get(`${namespace}:${entityName}`) ?? null;
  }
}

class OpfsStub {
  readonly currentPath = signal('/');
  readonly files = signal<OPFSFile[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly viewMode = signal<'list' | 'grid'>('list');
  readonly refresh = vi.fn(() => Promise.resolve());
  readonly navigateTo = vi.fn((path: string) => this.currentPath.set(path));
  readonly toggleViewMode = vi.fn(() => this.viewMode.update(mode => (mode === 'list' ? 'grid' : 'list')));
  readonly download = vi.fn(() => Promise.resolve());
  readonly delete = vi.fn(() => Promise.resolve());
  readonly upload = vi.fn(() => Promise.resolve(true));
  readonly createDirectory = vi.fn(() => Promise.resolve(true));
}

function createEvent<T extends Event>(values: Partial<T>): T {
  return values as T;
}

describe('DatabasePage', () => {
  let state: DatabaseStateStub;
  let page: DatabasePage;

  beforeEach(() => {
    state = new DatabaseStateStub();
    TestBed.configureTestingModule({ providers: [DatabasePage, { provide: DatabaseStateService, useValue: state }] });
    page = TestBed.inject(DatabasePage);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('loads database info and groups public and namespaced entities', () => {
    page.ngOnInit();
    state.dbInfo.set({
      version: '1',
      dbName: 'demo',
      entities: [
        { name: 'users', namespace: 'public', encryptedFields: [] },
        { name: 'files', namespace: '', encryptedFields: [] },
        { name: 'todos', namespace: 'work', encryptedFields: [] },
        { name: 'events', namespace: 'work', encryptedFields: [] },
        { name: 'logs', namespace: 'audit', encryptedFields: [] },
        { name: '', namespace: 'ignored', encryptedFields: [] }
      ]
    });

    expect(state.inspectDb).toHaveBeenCalledOnce();
    expect(page.groupedEntities()).toEqual({
      publicEntities: [
        { name: 'users', namespace: 'public', encryptedFields: [] },
        { name: 'files', namespace: '', encryptedFields: [] }
      ],
      namespacedGroups: [
        {
          namespace: 'work',
          entities: [
            { name: 'todos', namespace: 'work', encryptedFields: [] },
            { name: 'events', namespace: 'work', encryptedFields: [] }
          ]
        },
        { namespace: 'audit', entities: [{ name: 'logs', namespace: 'audit', encryptedFields: [] }] }
      ]
    });
  });

  it('isolates entity results and refreshes only a selected entity', () => {
    expect(page.groupedEntities()).toEqual({ publicEntities: [], namespacedGroups: [] });
    page.refreshEntity();
    expect(state.queryEntity).not.toHaveBeenCalled();

    const alpha = { name: 'todos', namespace: 'alpha', encryptedFields: [] };
    const beta = { name: 'todos', namespace: 'beta', encryptedFields: [] };
    page.selectEntity(alpha);
    state.setEntityData({ entityName: 'todos', namespace: 'beta', error: null, data: [{ id: 'wrong' }] });
    expect(page.entityData()).toBeNull();

    state.setEntityData({ entityName: 'todos', namespace: 'alpha', error: null, data: [{ id: 'right' }] });
    expect(page.entityData()?.data).toEqual([{ id: 'right' }]);
    page.selectEntity(beta);
    expect(page.entityData()?.data).toEqual([{ id: 'wrong' }]);
    page.refreshEntity();
    expect(state.queryEntity).toHaveBeenNthCalledWith(1, 'todos', 'alpha');
    expect(state.queryEntity).toHaveBeenNthCalledWith(2, 'todos', 'beta');
    expect(state.queryEntity).toHaveBeenNthCalledWith(3, 'todos', 'beta');
  });
});

describe('StoragePage', () => {
  let state: DatabaseStateStub;
  let page: StoragePage;

  beforeEach(() => {
    state = new DatabaseStateStub();
    TestBed.configureTestingModule({ providers: [StoragePage, { provide: DatabaseStateService, useValue: state }] });
    page = TestBed.inject(StoragePage);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('queries storage metadata, sorts rows and exposes details', () => {
    page.ngOnInit();
    state.setEntityData({
      entityName: 'StorageFileMeta',
      namespace: 'storage',
      error: null,
      data: [
        { id: '2', name: 'b', mimeType: 'text/plain', size: 2048, opfsPath: '/z', contentVersion: 1 },
        { id: '1', name: 'a', mimeType: 'text/plain', size: 0, opfsPath: '/a', contentVersion: 2 }
      ]
    });

    expect(state.queryEntity).toHaveBeenCalledWith('StorageFileMeta', 'storage');
    expect(page.rows().map(row => row.id)).toEqual(['1', '2']);
    expect(page.error()).toBeNull();
    expect(page.fmtSize(0)).toBe('0 B');
    // P2-16：Storage 页不再自带一份 formatFileSize，统一走 opfs-page.utils 的实现，
    // 因此小数位口径与 OPFS 页一致（`2.0 KB` 而非旧私有实现的 `2 KB`）——
    // 两页显示同一个大小时用同一种写法，正是统一的目的。
    expect(page.fmtSize(2048)).toBe('2.0 KB');
    expect(page.fmtDate()).toBe('');
    expect(page.fmtDate('invalid')).toBe('');
    expect(page.fmtDate(new Date(1))).not.toBe('');
    expect(page.fmtDate(1)).not.toBe('');

    page.selectRow({ id: '2' });
    expect(page.selectedRow()?.id).toBe('2');
    expect(page.detailJson()).toContain('"opfsPath": "/z"');
    page.selectRow({ id: '2' });
    expect(page.selectedRow()).toBeNull();
    expect(page.detailJson()).toBe('');
  });

  it('ignores another page entity result and exposes storage errors', () => {
    state.setEntityData({ entityName: 'todos', namespace: 'public', error: 'wrong', data: [] });
    expect(page.rows()).toEqual([]);
    expect(page.error()).toBeNull();

    state.setEntityData({ entityName: 'StorageFileMeta', namespace: 'storage', error: 'failed', data: [] });
    expect(page.error()).toBe('failed');
  });

  it('rejects malformed or duplicate storage rows instead of rendering unstable track keys', () => {
    state.setEntityData({
      entityName: 'StorageFileMeta',
      namespace: 'storage',
      error: null,
      data: [
        { name: 'missing-id', mimeType: 'text/plain', size: 1, opfsPath: '/a', contentVersion: 1 },
        { id: 'same', name: 'a', mimeType: 'text/plain', size: 1, opfsPath: '/b', contentVersion: 1 },
        { id: 'same', name: 'b', mimeType: 'text/plain', size: 1, opfsPath: '/c', contentVersion: 1 }
      ]
    });

    expect(page.rows()).toEqual([]);
    expect(page.error()).toBe('StorageFileMeta 返回了无效或重复的实体数据');
  });
});

describe('OpfsPage', () => {
  let opfs: OpfsStub;
  let page: OpfsPage;
  let reload: ReturnType<typeof vi.fn>;

  const directory: OPFSFile = { name: 'docs', path: '/docs', type: 'directory' };
  const file: OPFSFile = { name: 'readme.md', path: '/readme.md', type: 'file', size: 2048, lastModified: 1 };

  beforeEach(() => {
    opfs = new OpfsStub();
    reload = vi.fn();
    vi.stubGlobal('chrome', { devtools: { inspectedWindow: { reload } } } as unknown as typeof chrome);
    TestBed.configureTestingModule({ providers: [OpfsPage, { provide: OpfsService, useValue: opfs }] });
    page = TestBed.inject(OpfsPage);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('refreshes, navigates, counts files and derives breadcrumbs', async () => {
    page.ngOnInit();
    await vi.waitFor(() => expect(opfs.refresh).toHaveBeenCalledOnce());
    expect(page.pathSegments()).toEqual([]);
    opfs.files.set([directory, file]);
    opfs.currentPath.set('/docs/nested');

    expect(page.pathSegments()).toEqual([
      { name: 'docs', path: '/docs' },
      { name: 'nested', path: '/docs/nested' }
    ]);
    expect(page.fileCounts()).toEqual({ directories: 1, files: 1 });
    page.navigateTo('/docs');
    expect(opfs.navigateTo).toHaveBeenCalledWith('/docs');
    await page.refresh();
  });

  it('switches views and activates grid items by type', () => {
    page.setViewMode('list');
    expect(opfs.toggleViewMode).not.toHaveBeenCalled();
    page.setViewMode('grid');
    expect(opfs.toggleViewMode).toHaveBeenCalledOnce();

    page.activateGridItem(directory);
    page.activateGridItem(file);
    expect(opfs.navigateTo).toHaveBeenCalledWith('/docs');
    expect(opfs.download).toHaveBeenCalledWith(file);
  });

  it('handles delete confirmation', () => {
    page.deleteFile(file);
    page.confirmDelete();
    expect(opfs.delete).toHaveBeenCalledWith(file);
    expect(page.deleteConfirmFile()).toBeNull();
    page.confirmDelete();
  });

  it('reloads the inspected page', () => {
    page.reloadInspectedPage();
    expect(reload).toHaveBeenCalledWith({});
  });

  it('handles drag state and uploads dropped files', async () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const target = {} as EventTarget;
    const dropped = new File(['a'], 'a.txt');
    const drag = createEvent<DragEvent>({ preventDefault, stopPropagation, currentTarget: target, target });

    page.onDragEnter(drag);
    expect(page.isDragging()).toBe(true);
    page.onDragOver(drag);
    page.onDragLeave(
      createEvent<DragEvent>({ preventDefault, stopPropagation, currentTarget: target, target: document.body })
    );
    expect(page.isDragging()).toBe(true);
    page.onDragLeave(drag);
    expect(page.isDragging()).toBe(false);

    page.onDrop(createEvent<DragEvent>({ preventDefault, stopPropagation }));
    expect(opfs.upload).not.toHaveBeenCalled();
    page.onDrop(
      createEvent<DragEvent>({
        preventDefault,
        stopPropagation,
        dataTransfer: { files: [dropped] } as unknown as DataTransfer
      })
    );
    await vi.waitFor(() => expect(opfs.upload).toHaveBeenCalledWith(dropped));
  });

  it('uploads sequentially and creates only non-empty folders', async () => {
    const first = new File(['1'], '1.txt');
    const second = new File(['2'], '2.txt');
    await page.uploadFiles([first, second]);
    expect(opfs.upload.mock.calls.map(call => (call as unknown as [File])[0].name)).toEqual(['1.txt', '2.txt']);

    page.newFolderName.set('   ');
    page.createFolder();
    expect(opfs.createDirectory).not.toHaveBeenCalled();
    page.showNewFolderDialog.set(true);
    page.newFolderName.set(' docs ');
    page.createFolder();
    expect(opfs.createDirectory).toHaveBeenCalledWith('docs');
    expect(page.newFolderName()).toBe('');
    expect(page.showNewFolderDialog()).toBe(false);
  });

  it('opens and closes context actions by file type', () => {
    const preventDefault = vi.fn();
    page.onContextMenu(createEvent<MouseEvent>({ preventDefault, clientX: 10, clientY: 20 }), directory);
    expect(page.contextMenuState()).toEqual({ show: true, x: 10, y: 20, file: directory });
    page.contextMenuOpen();
    expect(opfs.navigateTo).toHaveBeenCalledWith('/docs');

    page.onContextMenu(createEvent<MouseEvent>({ preventDefault, clientX: 1, clientY: 2 }), file);
    page.contextMenuDownload();
    expect(opfs.download).toHaveBeenCalledWith(file);

    page.onContextMenu(createEvent<MouseEvent>({ preventDefault, clientX: 1, clientY: 2 }), directory);
    page.contextMenuDownload();
    expect(opfs.download).toHaveBeenCalledTimes(1);

    page.closeContextMenu();
    page.contextMenuOpen();
    page.contextMenuDownload();
    page.contextMenuDelete();

    page.onContextMenu(createEvent<MouseEvent>({ preventDefault, clientX: 1, clientY: 2 }), file);
    page.contextMenuDelete();
    expect(page.deleteConfirmFile()).toBe(file);
    expect(page.contextMenuState().show).toBe(false);
  });
});
