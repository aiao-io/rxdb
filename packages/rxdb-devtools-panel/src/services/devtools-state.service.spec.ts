import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RXDB_DEVTOOLS_MESSAGE, type DevToolsMessage } from '@aiao/rxdb-devtools-panel/wire';
import { ToastService } from '../components/toast.component';
import type { SerializedEvent } from '../types/devtools.types';
import { DatabaseStateService } from './database-state.service';
import { DevToolsStateService } from './devtools-state.service';
import { DEVTOOLS_TRANSPORT } from '../transport';

class PortStub {
  private listener: ((message: DevToolsMessage) => void) | null = null;
  readonly sendMessage = vi.fn();
  readonly unsubscribe = vi.fn();

  subscribe(listener: (message: DevToolsMessage) => void): () => void {
    this.listener = listener;
    return this.unsubscribe;
  }

  emit(type: DevToolsMessage['type'], payload: unknown = null): void {
    this.listener?.({
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'page-to-devtools',
      type,
      payload,
      timestamp: 1,
      sequence: 1
    });
  }
}

class ToastStub {
  readonly success = vi.fn();
  readonly error = vi.fn();
}

function createEvent(sequence: number): SerializedEvent {
  return { id: String(sequence), eventType: 'INSERT', timestamp: sequence, sequence, data: {} };
}

describe('DevToolsStateService message coverage', () => {
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
        { provide: DEVTOOLS_TRANSPORT, useValue: port },
        { provide: ToastService, useValue: toast },
        { provide: DatabaseStateService, useValue: database }
      ]
    });
    service = TestBed.inject(DevToolsStateService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('exposes branch commands and active branch state', () => {
    service.createBranch('feature');
    service.deleteBranch('old');
    service.requestBranches();
    service.switchBranch('feature');
    port.emit('BRANCHES', [
      { id: 'main', activated: false },
      { id: 'feature', activated: true }
    ]);

    expect(port.sendMessage.mock.calls).toEqual([
      ['CREATE_BRANCH', 'feature'],
      ['DELETE_BRANCH', 'old'],
      ['GET_BRANCHES'],
      ['SWITCH_BRANCH', 'feature']
    ]);
    expect(service.activeBranch()?.id).toBe('feature');
    expect(service.switching()).toBe(false);
  });

  it('handles branch lifecycle acknowledgements', () => {
    port.emit('BRANCH_CREATED');
    port.emit('BRANCH_DELETED');
    port.emit('BRANCH_SWITCHED');

    expect(port.sendMessage).toHaveBeenCalledTimes(3);
    expect(port.sendMessage).toHaveBeenCalledWith('GET_BRANCHES');
    expect(database.inspectDb).toHaveBeenCalledOnce();
    expect(toast.success.mock.calls.map(call => call[0])).toEqual([
      'Branch created successfully',
      'Branch deleted successfully',
      'Branch switched successfully'
    ]);
  });

  it('caps the event buffer and clears selection', () => {
    for (let sequence = 0; sequence <= 1000; sequence++) {
      port.emit('EVENT', createEvent(sequence));
    }
    service.selectEvent(service.events()[0] ?? null);

    expect(service.events()).toHaveLength(1000);
    expect(service.events()[0]?.id).toBe('1');
    expect(service.eventIndexes()).toHaveLength(1000);
    expect(service.eventAt(0)?.id).toBe('1');
    expect(service.eventAt(999)?.id).toBe('1000');
    service.clearEvents();
    expect(service.events()).toEqual([]);
    expect(service.selectedEvent()).toBeNull();
  });

  it('uses a fallback protocol error and unsubscribes on destroy', () => {
    service.switchBranch('feature');
    port.emit('ERROR', { message: '' });
    service.ngOnDestroy();

    expect(service.switching()).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('An error occurred');
    expect(port.unsubscribe).toHaveBeenCalledOnce();
  });
});
