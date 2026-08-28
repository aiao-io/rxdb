import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RXDB_DEVTOOLS_MESSAGE, type DevToolsMessage } from '../../shared/types';
import { ToastService } from '../components/toast.component';
import type { Branch, DbInfo, EntityData, SerializedEvent } from '../types/devtools.types';
import { DatabaseStateService } from './database-state.service';
import { DevToolsStateService } from './devtools-state.service';
import { PortService } from './port.service';

class PortStub {
  private listener: ((message: DevToolsMessage) => void) | null = null;
  readonly sendMessage = vi.fn();

  subscribe(listener: (message: DevToolsMessage) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  emit(type: DevToolsMessage['type'], payload: unknown = null): void {
    this.listener?.({
      direction: 'page-to-devtools',
      payload,
      sequence: 0,
      source: RXDB_DEVTOOLS_MESSAGE,
      timestamp: 0,
      type
    });
  }
}

class ToastStub {
  readonly error = vi.fn();
  readonly success = vi.fn();
}

describe('DatabaseStateService', () => {
  let port: PortStub;
  let toast: ToastStub;
  let service: DatabaseStateService;

  beforeEach(() => {
    port = new PortStub();
    toast = new ToastStub();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DatabaseStateService,
        { provide: PortService, useValue: port },
        { provide: ToastService, useValue: toast }
      ]
    });
    service = TestBed.inject(DatabaseStateService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('keeps concurrent results and loading state isolated by namespace and entity name', () => {
    service.queryEntity('User', 'alpha');
    service.queryEntity('User', 'beta');

    const alpha: EntityData = { data: [{ id: 'alpha' }], entityName: 'User', namespace: 'alpha', error: null };
    const beta: EntityData = { data: [{ id: 'beta' }], entityName: 'User', namespace: 'beta', error: null };
    port.emit('ENTITY_DATA', alpha);

    expect(service.getEntityData('User', 'alpha')).toEqual(alpha);
    expect(service.getEntityData('User', 'beta')).toBeNull();
    expect(service.isEntityLoading('User', 'alpha')).toBe(false);
    expect(service.isEntityLoading('User', 'beta')).toBe(true);

    port.emit('ENTITY_DATA', beta);

    expect(service.getEntityData('User', 'alpha')).toEqual(alpha);
    expect(service.getEntityData('User', 'beta')).toEqual(beta);
    expect(port.sendMessage).toHaveBeenNthCalledWith(1, 'QUERY_ENTITY', {
      entityName: 'User',
      namespace: 'alpha',
      limit: 100
    });
  });

  it('resets all state on disconnect', () => {
    const dbInfo: DbInfo = { dbName: 'test', entities: [], version: '1' };
    service.inspectDb();
    service.queryEntity('todos');
    port.emit('DB_INFO', dbInfo);
    port.emit('DISCONNECT');

    expect(service.dbInfo()).toBeNull();
    expect(service.getEntityData('todos', 'public')).toBeNull();
    expect(service.dbLoading()).toBe(false);
    expect(service.isEntityLoading('todos')).toBe(false);
  });

  it('clears pending state and reports protocol errors', () => {
    service.inspectDb();
    service.queryEntity('todos');
    port.emit('ERROR', { message: 'query failed' });

    expect(service.dbLoading()).toBe(false);
    expect(service.isEntityLoading('todos')).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('query failed');
  });

  it('maps the structured error code to a UI kind', () => {
    service.queryEntity('StorageFileMeta', 'storage');
    port.emit('ENTITY_DATA', {
      data: [],
      entityName: 'StorageFileMeta',
      namespace: 'storage',
      error: '实体 StorageFileMeta 不存在',
      _meta: { errorCode: 'ENTITY_NOT_FOUND' }
    } satisfies EntityData);

    expect(service.getEntityErrorKind('StorageFileMeta', 'storage')).toBe('entity-not-found');
  });

  // 连接器可能比面板新：未知码必须安全落到 'unknown'，而不是抛或漏判。
  it('falls back to unknown for an unrecognised error code', () => {
    port.emit('ENTITY_DATA', {
      data: [],
      entityName: 'todos',
      error: 'boom',
      _meta: { errorCode: 'FUTURE_CODE' as never }
    } satisfies EntityData);

    expect(service.getEntityErrorKind('todos')).toBe('unknown');
  });

  // ENTITY_DATA 永远是对某个具体槽位的应答，两个消费页面都已就地渲染错误。
  // 再弹一次全局 toast 是纯重复通知 —— 整类不再 toast，不是给某个码开白名单。
  it('never escalates an entity error into a global toast', () => {
    port.emit('ENTITY_DATA', {
      data: [],
      entityName: 'StorageFileMeta',
      namespace: 'storage',
      error: '实体 StorageFileMeta 不存在',
      _meta: { errorCode: 'ENTITY_NOT_FOUND' }
    } satisfies EntityData);
    port.emit('ENTITY_DATA', { data: [], entityName: 'todos', error: 'disk exploded' } satisfies EntityData);

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('clears the error kind together with the rest of the state on disconnect', () => {
    port.emit('ENTITY_DATA', {
      data: [],
      entityName: 'todos',
      error: 'boom',
      _meta: { errorCode: 'RXDB_NOT_READY' }
    } satisfies EntityData);
    port.emit('DISCONNECT');

    expect(service.getEntityErrorKind('todos')).toBeNull();
  });

  // 握手前发出的查询会被三处静默丢弃（PortService 无端口 / background 无 tabId /
  // bridge 退回 window 总线后连接器丢弃非 PING）。页面在 ngOnInit 里发的那一条正好落在这个窗口。
  it('replays the queries it wanted once the handshake lands', () => {
    service.queryEntity('StorageFileMeta', 'storage', 50);
    port.sendMessage.mockClear();

    port.emit('HANDSHAKE');

    expect(port.sendMessage).toHaveBeenCalledWith('QUERY_ENTITY', {
      entityName: 'StorageFileMeta',
      namespace: 'storage',
      limit: 50
    });
  });

  it('still replays after a DISCONNECT reset — the intent outlives the connection', () => {
    service.queryEntity('todos');
    port.emit('DISCONNECT');
    port.sendMessage.mockClear();

    port.emit('HANDSHAKE');

    expect(port.sendMessage).toHaveBeenCalledWith('QUERY_ENTITY', {
      entityName: 'todos',
      namespace: 'public',
      limit: 100
    });
  });
});

describe('DevToolsStateService', () => {
  let port: PortStub;
  let toast: ToastStub;
  let database: { inspectDb: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> };
  let service: DevToolsStateService;

  beforeEach(() => {
    port = new PortStub();
    toast = new ToastStub();
    database = { inspectDb: vi.fn(), reset: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DevToolsStateService,
        { provide: PortService, useValue: port },
        { provide: ToastService, useValue: toast },
        { provide: DatabaseStateService, useValue: database }
      ]
    });
    service = TestBed.inject(DevToolsStateService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('initializes database and branches after handshake', () => {
    port.emit('HANDSHAKE');

    expect(service.connected()).toBe(true);
    expect(port.sendMessage).toHaveBeenCalledWith('GET_BRANCHES');
    expect(database.inspectDb).toHaveBeenCalledOnce();
  });

  it('clears connected state on disconnect', () => {
    const event: SerializedEvent = { data: {}, eventType: 'INSERT', id: '1', sequence: 1, timestamp: 1 };
    const branches: Branch[] = [{ activated: true, id: 'main' }];
    port.emit('HANDSHAKE');
    port.emit('EVENT', event);
    port.emit('BRANCHES', branches);
    service.selectEvent(event);
    service.switchBranch('main');

    port.emit('DISCONNECT');

    expect(service.connected()).toBe(false);
    expect(service.events()).toEqual([]);
    expect(service.selectedEvent()).toBeNull();
    expect(service.branches()).toEqual([]);
    expect(service.switching()).toBe(false);
    expect(database.reset).toHaveBeenCalledOnce();
  });

  it('completes a branch switch and refreshes state', () => {
    service.switchBranch('feature');
    port.emit('BRANCH_SWITCHED');

    expect(service.switching()).toBe(false);
    expect(port.sendMessage).toHaveBeenCalledWith('SWITCH_BRANCH', 'feature');
    expect(port.sendMessage).toHaveBeenCalledWith('GET_BRANCHES');
    expect(database.inspectDb).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('Branch switched successfully');
  });
});
