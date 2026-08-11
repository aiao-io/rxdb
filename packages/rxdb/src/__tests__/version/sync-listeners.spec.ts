import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ENTITY_REMOTE_CREATE_EVENT,
  ENTITY_REMOTE_REMOVE_EVENT,
  ENTITY_REMOTE_UPDATE_EVENT,
  EntityRemoteCreatedEvent,
  EntityRemoteRemovedEvent,
  EntityRemoteUpdatedEvent,
  type RxDBEntityRemoteCreatedEventData
} from '../../rxdb-events.js';
import type { HistoryManager } from '../../version/HistoryManager.js';
import { isIgnorableDetachedVersionEventError, setupVersionSyncListeners } from '../../version/sync-listeners.js';
import type { VersionManager } from '../../version/VersionManager.js';

type RemoteEventType =
  typeof ENTITY_REMOTE_CREATE_EVENT | typeof ENTITY_REMOTE_UPDATE_EVENT | typeof ENTITY_REMOTE_REMOVE_EVENT;
type RemoteEntityEvent = EntityRemoteCreatedEvent | EntityRemoteUpdatedEvent | EntityRemoteRemovedEvent;
type RemoteEventHandler = (event: RemoteEntityEvent) => void;
type SyncBranches = () => Promise<void>;
type GetCurrentBranch = () => Promise<{ id: string }>;
type IncrementPullableCount = (count: number) => void;

type HarnessOptions = {
  connected?: boolean;
  getCurrentBranch?: GetCurrentBranch;
  hasRemoteAdapter?: boolean;
  syncBranches?: SyncBranches;
};

type SyncListenerHarness = {
  addEventListener: ReturnType<typeof vi.fn<(type: RemoteEventType, handler: RemoteEventHandler) => void>>;
  connected$: BehaviorSubject<boolean>;
  emit: (event: RemoteEntityEvent) => void;
  getCurrentBranch: ReturnType<typeof vi.fn<GetCurrentBranch>>;
  incrementPullableCount: ReturnType<typeof vi.fn<IncrementPullableCount>>;
  listeners: Map<RemoteEventType, Set<RemoteEventHandler>>;
  removeEventListener: ReturnType<typeof vi.fn<(type: RemoteEventType, handler: RemoteEventHandler) => void>>;
  result: ReturnType<typeof setupVersionSyncListeners>;
  syncBranches: ReturnType<typeof vi.fn<SyncBranches>>;
};

type RemoteEventCase = {
  eventName: string;
  label: string;
  create: (entities: RxDBEntityRemoteCreatedEventData[]) => RemoteEntityEvent;
};

const REMOTE_EVENT_CASES: readonly RemoteEventCase[] = [
  {
    eventName: ENTITY_REMOTE_CREATE_EVENT,
    label: 'onRemoteCreate',
    create: entities => new EntityRemoteCreatedEvent(entities)
  },
  {
    eventName: ENTITY_REMOTE_UPDATE_EVENT,
    label: 'onRemoteUpdate',
    create: entities => new EntityRemoteUpdatedEvent(entities)
  },
  {
    eventName: ENTITY_REMOTE_REMOVE_EVENT,
    label: 'onRemoteRemove',
    create: entities => new EntityRemoteRemovedEvent(entities)
  }
];

const createRemoteEntity = (
  type: 'INSERT' | 'UPDATE' | 'DELETE',
  id: string,
  branchId?: string
): RxDBEntityRemoteCreatedEventData => ({
  type,
  namespace: 'app',
  entity: 'Todo',
  id,
  recordAt: new Date('2026-07-10T00:00:00.000Z'),
  data: { id },
  ...(branchId === undefined ? {} : { branchId })
});

const settleDetachedTasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createHarness = (options: HarnessOptions = {}): SyncListenerHarness => {
  const connected$ = new BehaviorSubject(options.connected ?? false);
  const listeners = new Map<RemoteEventType, Set<RemoteEventHandler>>();
  const addEventListener = vi.fn<(type: RemoteEventType, handler: RemoteEventHandler) => void>((type, handler) => {
    const handlers = listeners.get(type) ?? new Set<RemoteEventHandler>();
    handlers.add(handler);
    listeners.set(type, handlers);
  });
  const removeEventListener = vi.fn<(type: RemoteEventType, handler: RemoteEventHandler) => void>((type, handler) => {
    listeners.get(type)?.delete(handler);
  });
  const syncBranches = vi.fn<SyncBranches>(options.syncBranches ?? (() => Promise.resolve()));
  const getCurrentBranch = vi.fn<GetCurrentBranch>(options.getCurrentBranch ?? (() => Promise.resolve({ id: 'main' })));
  const incrementPullableCount = vi.fn<IncrementPullableCount>();
  const rxdb = {
    config:
      options.hasRemoteAdapter === false ?
        {}
      : {
          sync: {
            remote: { adapter: 'remote' }
          }
        },
    connected$: connected$.asObservable(),
    addEventListener,
    removeEventListener
  };
  const versionManager = {
    rxdb,
    syncBranches,
    getCurrentBranch
  } as unknown as VersionManager;
  const historyManager = { incrementPullableCount } as unknown as HistoryManager;
  const result = setupVersionSyncListeners(versionManager, historyManager);

  return {
    addEventListener,
    connected$,
    emit: event => {
      const type = event.type as RemoteEventType;
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
    getCurrentBranch,
    incrementPullableCount,
    listeners,
    removeEventListener,
    result,
    syncBranches
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isIgnorableDetachedVersionEventError', () => {
  const cases: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ['errno 44', { errno: 44 }, true],
    ['AbortError', { name: 'AbortError' }, true],
    ['adapter shutdown', new Error('database is closed'), true],
    ['ordinary error', new Error('query failed'), false],
    ['null', null, false],
    ['primitive', 44, false]
  ];

  for (const [name, error, expected] of cases) {
    it(`classifies ${name}`, () => {
      expect(isIgnorableDetachedVersionEventError(error)).toBe(expected);
    });
  }
});

describe('setupVersionSyncListeners connected lifecycle', () => {
  it('syncs only after a configured remote adapter becomes connected', () => {
    const harness = createHarness({ connected: false });

    expect(harness.result.subscriptions).toHaveLength(1);
    expect(harness.syncBranches).not.toHaveBeenCalled();

    harness.connected$.next(false);
    expect(harness.syncBranches).not.toHaveBeenCalled();

    harness.connected$.next(true);
    expect(harness.syncBranches).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe to connected$ without a remote adapter', () => {
    const harness = createHarness({ connected: true, hasRemoteAdapter: false });

    expect(harness.result.subscriptions).toHaveLength(0);
    expect(harness.syncBranches).not.toHaveBeenCalled();

    harness.connected$.next(false);
    harness.connected$.next(true);

    expect(harness.syncBranches).not.toHaveBeenCalled();
    expect(harness.addEventListener).toHaveBeenCalledTimes(3);
  });

  it('swallows sync rejection and retries on the next connected emission', async () => {
    const syncError = new Error('sync failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createHarness({
      connected: true,
      syncBranches: () => Promise.reject(syncError)
    });

    await settleDetachedTasks();

    expect(harness.syncBranches).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();

    harness.connected$.next(false);
    harness.connected$.next(true);
    await settleDetachedTasks();

    expect(harness.syncBranches).toHaveBeenCalledTimes(2);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('setupVersionSyncListeners remote events', () => {
  for (const eventCase of REMOTE_EVENT_CASES) {
    it(`counts current and branchless entities for ${eventCase.eventName}`, async () => {
      const harness = createHarness();
      const event = eventCase.create([
        createRemoteEntity('INSERT', 'current', 'main'),
        createRemoteEntity('UPDATE', 'other', 'feature'),
        createRemoteEntity('DELETE', 'branchless')
      ]);

      harness.emit(event);
      await settleDetachedTasks();

      expect(harness.getCurrentBranch).toHaveBeenCalledTimes(1);
      expect(harness.incrementPullableCount).toHaveBeenCalledOnce();
      expect(harness.incrementPullableCount).toHaveBeenCalledWith(2);
    });
  }

  it('does not increment when every entity belongs to another branch', async () => {
    const harness = createHarness();

    harness.emit(
      new EntityRemoteUpdatedEvent([
        createRemoteEntity('UPDATE', 'feature-1', 'feature'),
        createRemoteEntity('UPDATE', 'feature-2', 'feature')
      ])
    );
    await settleDetachedTasks();

    expect(harness.getCurrentBranch).toHaveBeenCalledTimes(1);
    expect(harness.incrementPullableCount).not.toHaveBeenCalled();
  });

  const ignorableErrors: ReadonlyArray<readonly [string, unknown, RemoteEventCase]> = [
    ['errno 44', { errno: 44 }, REMOTE_EVENT_CASES[0]],
    ['AbortError', { name: 'AbortError' }, REMOTE_EVENT_CASES[1]],
    ['adapter shutdown', new Error('adapter is disconnected'), REMOTE_EVENT_CASES[2]]
  ];

  for (const [name, error, eventCase] of ignorableErrors) {
    it(`does not log ${name} from ${eventCase.eventName}`, async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const harness = createHarness({ getCurrentBranch: () => Promise.reject(error) });

      harness.emit(eventCase.create([createRemoteEntity('INSERT', name)]));
      await settleDetachedTasks();

      expect(harness.incrementPullableCount).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });
  }

  for (const eventCase of REMOTE_EVENT_CASES) {
    it(`logs ordinary errors from ${eventCase.eventName}`, async () => {
      const error = new Error(`${eventCase.eventName} failed`);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const harness = createHarness({ getCurrentBranch: () => Promise.reject(error) });

      harness.emit(eventCase.create([createRemoteEntity('INSERT', eventCase.eventName)]));
      await settleDetachedTasks();

      expect(consoleError).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(`[VersionManager] ${eventCase.label} failed:`, error);
    });
  }
});

describe('setupVersionSyncListeners cleanup lifecycle', () => {
  it('removes the exact remote handlers and unsubscribes connected sync', async () => {
    const harness = createHarness({ connected: false });
    const registeredListeners = harness.addEventListener.mock.calls;

    expect(registeredListeners.map(([type]) => type)).toEqual([
      ENTITY_REMOTE_CREATE_EVENT,
      ENTITY_REMOTE_UPDATE_EVENT,
      ENTITY_REMOTE_REMOVE_EVENT
    ]);
    expect(harness.result.removers).toHaveLength(3);

    for (const remove of harness.result.removers) {
      remove();
    }
    for (const subscription of harness.result.subscriptions) {
      subscription.unsubscribe();
    }

    expect(harness.removeEventListener).toHaveBeenCalledTimes(3);
    for (const [type, handler] of registeredListeners) {
      expect(harness.removeEventListener).toHaveBeenCalledWith(type, handler);
      expect(harness.listeners.get(type)?.has(handler)).toBe(false);
    }
    expect(harness.result.subscriptions.every(subscription => subscription.closed)).toBe(true);

    harness.connected$.next(true);
    harness.emit(new EntityRemoteCreatedEvent([createRemoteEntity('INSERT', 'after-cleanup', 'main')]));
    await settleDetachedTasks();

    expect(harness.syncBranches).not.toHaveBeenCalled();
    expect(harness.getCurrentBranch).not.toHaveBeenCalled();
    expect(harness.incrementPullableCount).not.toHaveBeenCalled();
  });
});
