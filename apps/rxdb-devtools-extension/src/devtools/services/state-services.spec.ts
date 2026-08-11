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
