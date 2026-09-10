import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseStateService } from '../services/database-state.service';
import { DevToolsEndpointService } from '../services/devtools-endpoint.service';
import { OpfsService } from '../services/opfs.service';
import { FakeDevToolsHostAccess } from '../testing';
import { DEVTOOLS_HOST_ACCESS } from '../transport';
import type { DbInfo, EntityData, EntityErrorKind, OPFSFile } from '../types/devtools.types';
import { DatabasePage } from './database.page';
import { OpfsPage } from './opfs.page';
import { StoragePage } from './storage.page';

/** 桩里的 errorCode → kind 映射；与真实服务同表，页面才测得到同一条分支。 */
const ENTITY_ERROR_KINDS: Record<string, EntityErrorKind | undefined> = {
  ENTITY_NOT_FOUND: 'entity-not-found',
  ENTITY_AMBIGUOUS: 'entity-ambiguous',
  RXDB_NOT_READY: 'rxdb-not-ready',
  KEYRING_LOCKED: 'keyring-locked'
};

class DatabaseStateStub {
  readonly dbInfo = signal<DbInfo | null>(null);
  readonly dbLoading = signal(false);
  readonly entityDataByKey = signal<ReadonlyMap<string, EntityData>>(new Map());
  readonly inspectDb = vi.fn();
  readonly queryEntity = vi.fn();
  readonly isEntityLoading = vi.fn(
    (entity: string | null, namespace = 'public') => `${namespace}:${entity}` === 'work:loading'
  );
  readonly entityErrorKindByKey = signal<ReadonlyMap<string, EntityErrorKind>>(new Map());

  setEntityData(data: EntityData): void {
    const namespace = data.namespace ?? 'public';
    this.entityDataByKey.update(current => new Map(current).set(`${namespace}:${data.entityName}`, data));
    const kind = ENTITY_ERROR_KINDS[data._meta?.errorCode ?? ''];
    if (kind)
      this.entityErrorKindByKey.update(current => new Map(current).set(`${namespace}:${data.entityName}`, kind));
  }

  getEntityErrorKind(entityName: string, namespace = 'public'): EntityErrorKind | null {
    return this.entityErrorKindByKey().get(`${namespace}:${entityName}`) ?? null;
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

  // 「对端没装 @aiao/rxdb-plugin-storage」是可解释的正常状态，不是查询失败：
  // 页面用告知性 banner 说明，而不是把它渲染成红色错误。
  it('reports a missing plugin instead of an error when the entity is not registered', () => {
    state.setEntityData({
      entityName: 'StorageFileMeta',
      namespace: 'storage',
      error: '实体 StorageFileMeta 不存在',
      data: [],
      _meta: { errorCode: 'ENTITY_NOT_FOUND' }
    });

    expect(page.pluginMissing()).toBe(true);
    expect(page.error()).toBeNull();
  });

  it('keeps rendering a real query failure as an error', () => {
    state.setEntityData({ entityName: 'StorageFileMeta', namespace: 'storage', error: 'disk exploded', data: [] });

    expect(page.pluginMissing()).toBe(false);
    expect(page.error()).toBe('disk exploded');
  });

  // 还没有任何应答时不能抢答「没装插件」—— 那和真相长得一模一样，会误导用户去装已经装了的包。
  it('does not claim a missing plugin before the first reply arrives', () => {
    expect(page.pluginMissing()).toBe(false);
  });
});

/**
 * 只提供页面用到的那一块协商状态。
 *
 * @remarks
 * 页面读的是 `state()?.descriptors`，所以桩只需要一个能被写值的同名信号；
 * 把整个 `DevToolsEndpointService` 搬进单测会顺带把 transport 也拖进来，
 * 而这条断言与传输层无关。
 */
class EndpointStub {
  /** 协商状态信号；页面只拿它当「有变化」的信号用，不读里面的字段。 */
  readonly state = signal<string | null>(null);

  /** descriptors 挂在端点实例上，与真实实现同形（`endpoint.descriptors`）。 */
  descriptors: { domain: string; runtime?: string }[] = [];

  resolve(): { descriptors: { domain: string; runtime?: string }[] } | null {
    return { descriptors: this.descriptors };
  }

  #ticks = 0;

  /**
   * 改一次 descriptors 并推进状态，模拟一次协商推进。
   *
   * @remarks
   * 状态值必须**每次都不同**：信号值没变就不会触发重算，页面读到的还是上一轮的
   * descriptors——那会让这条用例在实现正确时也误报。
   */
  publish(descriptors: { domain: string; runtime?: string }[]): void {
    this.descriptors = descriptors;
    this.#ticks += 1;
    this.state.set(`tick-${String(this.#ticks)}`);
  }
}

describe('OpfsPage', () => {
  let opfs: OpfsStub;
  let page: OpfsPage;
  let hostAccess: FakeDevToolsHostAccess;
  let endpoint: EndpointStub;

  const directory: OPFSFile = { name: 'docs', path: '/docs', type: 'directory' };
  const file: OPFSFile = { name: 'readme.md', path: '/readme.md', type: 'file', size: 2048, lastModified: 1 };

  beforeEach(() => {
    opfs = new OpfsStub();
    hostAccess = new FakeDevToolsHostAccess();
    endpoint = new EndpointStub();
    TestBed.configureTestingModule({
      providers: [
        OpfsPage,
        { provide: OpfsService, useValue: opfs },
        { provide: DEVTOOLS_HOST_ACCESS, useValue: hostAccess },
        { provide: DevToolsEndpointService, useValue: endpoint }
      ]
    });
    page = TestBed.inject(OpfsPage);
  });

  afterEach(() => TestBed.resetTestingModule());

  /**
   * US-904 阶段 D AC#47 / US-905 AC#6：`runtime` 只用于显示，不参与任何行为判定。
   *
   * @remarks
   * 与 `apps/dev-rxdb-tauri/src/devtools/tauri-vfs-providers.spec.ts` 那条同口径，只是落在 UI 侧：
   * 换掉 `runtime` 之后，页面**除了这一个显示值以外**读出来的东西必须逐项不变。
   * 光断言「显示对了」挡不住有人日后拿 runtime 去分叉逻辑。
   */
  it('exposes the files runtime for display only', () => {
    expect(page.filesRuntime()).toBeNull();

    endpoint.publish([{ domain: 'files', runtime: 'electron' }]);
    expect(page.filesRuntime()).toBe('electron');

    const before = { viewMode: page.viewMode(), path: page.pathSegments(), loading: page.loading() };
    endpoint.publish([{ domain: 'files', runtime: 'tauri' }]);
    expect(page.filesRuntime()).toBe('tauri');
    expect({ viewMode: page.viewMode(), path: page.pathSegments(), loading: page.loading() }).toEqual(before);

    // 领域对不上就不显示——不能拿 `database` 或 `settings` 的 runtime 冒充文件来源。
    endpoint.publish([{ domain: 'settings', runtime: 'electron' }]);
    expect(page.filesRuntime()).toBeNull();
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
    expect(hostAccess.reloadCount).toBe(1);
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
