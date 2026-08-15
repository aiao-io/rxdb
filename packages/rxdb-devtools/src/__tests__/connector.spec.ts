import { throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DevToolsConnector, getDevToolsConnector, resetDevToolsConnector } from '../connector.js';
import { RXDB_DEVTOOLS_MESSAGE } from '../types.js';
import type { MockRxDBShape } from './fixtures/mock-rxdb.js';
import { createMockRxDB, listenerCount, MOCK_DB_NAME, MOCK_VERSION } from './fixtures/mock-rxdb.js';
import {
    createPostMessageSpy,
    resetSessionFixture,
    withoutSession,
    wrapMessageListener
} from './fixtures/session-command.js';

type GetEntityMetadata = NonNullable<Parameters<DevToolsConnector['init']>[1]>;

/**
 * 造一个只会同步抛错的 repository。
 *
 * @remarks
 * 走 `MockRxDBShape['entityManager']` 而不是内联对象字面量：`find` 的返回类型在
 * 夹具形状里是订阅句柄，抛错分支根本走不到返回值，只能靠一次显式转换让 TS 收下。
 */
function throwingEntityManager(error: unknown): MockRxDBShape['entityManager'] {
  return {
    getRepository: () => ({
      find: () => {
        throw error;
      }
    })
  } as unknown as MockRxDBShape['entityManager'];
}

describe('DevToolsConnector', () => {
  let connector: DevToolsConnector;
  let postMessageSpy: ReturnType<typeof vi.fn>;
  let addEventSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetSessionFixture();
    postMessageSpy = createPostMessageSpy();
    addEventSpy = vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'postMessage').mockImplementation(postMessageSpy as unknown as typeof window.postMessage);
    connector = new DevToolsConnector();
  });

  afterEach(() => {
    connector.disconnect();
    resetSessionFixture();
    vi.restoreAllMocks();
  });

  function getHandler(): (event: MessageEvent) => void {
    const registered = addEventSpy.mock.calls.find(call => call[0] === 'message');
    if (!registered) throw new Error('message listener not registered');
    return wrapMessageListener(registered[1] as EventListener) as (event: MessageEvent) => void;
  }

  function dispatchMessage(handler: (event: MessageEvent) => void, type: string, payload: unknown = null): void {
    handler({
      source: window,
      origin: location.origin,
      data: {
        source: RXDB_DEVTOOLS_MESSAGE,
        direction: 'devtools-to-page',
        type,
        payload,
        timestamp: Date.now(),
        sequence: 1
      }
    } as unknown as MessageEvent);
  }

  it('MUST start disconnected', () => {
    expect(connector.connected).toBe(false);
  });

  it('MUST be enabled by default', () => {
    expect(connector.enabled).toBe(true);
  });

  it('MUST respect enabled=false option', () => {
    const c = new DevToolsConnector({ enabled: false });
    expect(c.enabled).toBe(false);
  });

  it('MUST warn without throwing when window.postMessage throws', () => {
    const error = new Error('postMessage failed');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    postMessageSpy.mockImplementation(() => {
      throw error;
    });

    expect(() => connector.init(createMockRxDB())).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(`[${RXDB_DEVTOOLS_MESSAGE}] Failed to post message:`, error);
  });

  describe('init', () => {
    it('MUST send HANDSHAKE message', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      expect(postMessageSpy).toHaveBeenCalled();
      const msg = postMessageSpy.mock.calls[0][0];
      expect(msg.source).toBe(RXDB_DEVTOOLS_MESSAGE);
      expect(msg.type).toBe('HANDSHAKE');
      expect(msg.direction).toBe('page-to-devtools');
      expect(msg.payload).toEqual({
        protocolVersion: 2,
        capabilities: 'full',
        sessionToken: expect.stringMatching(/^[0-9a-f]{64}$/)
      });
    });

    it('MUST subscribe to RxDB events', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      expect(rxdb._listeners.size).toBeGreaterThan(0);
    });

    it('MUST not init when enabled=false', () => {
      const c = new DevToolsConnector({ enabled: false });
      const rxdb = createMockRxDB();
      c.init(rxdb);

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('MUST not init same instance twice', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);
      const callCount = postMessageSpy.mock.calls.length;

      connector.init(rxdb);
      expect(postMessageSpy.mock.calls.length).toBe(callCount);
    });

    it('MUST set up message listener on window', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      expect(addEventSpy).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('disconnect', () => {
    it('MUST send DISCONNECT message', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);
      postMessageSpy.mockClear();

      connector.disconnect();

      expect(postMessageSpy).toHaveBeenCalled();
      const msg = postMessageSpy.mock.calls[0][0];
      expect(msg.type).toBe('DISCONNECT');
    });

    it('MUST unsubscribe from RxDB events', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      connector.disconnect();

      expect(listenerCount(rxdb)).toBe(0);
    });

    it('MUST set connected to false', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      // 模拟握手确认。
      dispatchMessage(getHandler(), 'HANDSHAKE_ACK');
      expect(connector.connected).toBe(true);

      connector.disconnect();
      expect(connector.connected).toBe(false);
    });
  });

  describe('message handling', () => {
    let messageHandler: (event: MessageEvent) => void;

    beforeEach(() => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);
      messageHandler = getHandler();
    });

    function sendDevToolsMessage(type: string, payload: unknown = null) {
      dispatchMessage(messageHandler, type, payload);
    }

    it('MUST connect on HANDSHAKE_ACK', () => {
      sendDevToolsMessage('HANDSHAKE_ACK');
      expect(connector.connected).toBe(true);
    });

    it('MUST resend handshake on PING', () => {
      postMessageSpy.mockClear();
      sendDevToolsMessage('PING');

      const msgs = postMessageSpy.mock.calls.map(c => c[0]);
      expect(msgs.some((m: Record<string, string>) => m.type === 'HANDSHAKE')).toBe(true);
    });

    it('MUST disconnect on DISCONNECT message', () => {
      sendDevToolsMessage('HANDSHAKE_ACK');
      expect(connector.connected).toBe(true);

      sendDevToolsMessage('DISCONNECT');
      expect(connector.connected).toBe(false);
    });

    it('MUST disconnect RxDB instances and reply with result', async () => {
      const disconnectAll = vi.fn().mockResolvedValue(undefined);
      connector.disconnect();
      vi.restoreAllMocks();

      resetSessionFixture();
      postMessageSpy = createPostMessageSpy();
      addEventSpy = vi.spyOn(window, 'addEventListener');
      vi.spyOn(window, 'postMessage').mockImplementation(postMessageSpy as unknown as typeof window.postMessage);
      connector = new DevToolsConnector();

      const rxdb = createMockRxDB({ disconnectAll });
      connector.init(rxdb);
      messageHandler = getHandler();
      postMessageSpy.mockClear();

      sendDevToolsMessage('DISCONNECT_RXDB', { requestId: 'req-1' });

      await vi.waitFor(() => {
        expect(disconnectAll).toHaveBeenCalledTimes(1);
      });

      await vi.waitFor(() => {
        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'DISCONNECT_RXDB_RESULT',
            direction: 'page-to-devtools',
            payload: { requestId: 'req-1', success: true, error: null, status: 'graceful' }
          }),
          // RDT-011：targetOrigin 必须是精确来源。`'*'` 会把实体数据广播给
          // 页面里任意跨源 iframe —— 断言写死这一点，退回通配符立刻变红。
          location.origin
        );
      });
    });

    it('MUST ignore messages from different source', () => {
      messageHandler({
        source: window,
        data: { source: 'other', type: 'HANDSHAKE_ACK' }
      } as unknown as MessageEvent);
      expect(connector.connected).toBe(false);
    });

    it('MUST ignore messages from wrong direction', () => {
      messageHandler({
        source: window,
        data: {
          source: RXDB_DEVTOOLS_MESSAGE,
          direction: 'page-to-devtools',
          type: 'HANDSHAKE_ACK'
        }
      } as unknown as MessageEvent);
      expect(connector.connected).toBe(false);
    });

    it('MUST ignore messages from different window source', () => {
      messageHandler({
        source: {} as Window,
        data: {
          source: RXDB_DEVTOOLS_MESSAGE,
          direction: 'devtools-to-page',
          type: 'HANDSHAKE_ACK'
        }
      } as unknown as MessageEvent);
      expect(connector.connected).toBe(false);
    });
  });

  describe('event buffering', () => {
    it('MUST buffer events when not connected', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      postMessageSpy.mockClear();
      rxdb.emit('ENTITY_LOCAL_CREATE', { type: 'ENTITY_LOCAL_CREATE', entityId: 'e1' });

      // 断开连接时不应发送 EVENT 消息。
      const eventMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'EVENT');
      expect(eventMsgs).toHaveLength(0);
    });

    it('MUST flush buffer on HANDSHAKE_ACK', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      // 在断开连接时发出事件。
      rxdb.emit('ENTITY_LOCAL_CREATE', { type: 'ENTITY_LOCAL_CREATE', entityId: 'e1' });

      postMessageSpy.mockClear();

      // 模拟握手确认。
      dispatchMessage(getHandler(), 'HANDSHAKE_ACK');

      const eventMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'EVENT');
      expect(eventMsgs.length).toBeGreaterThanOrEqual(1);
    });

    it('MUST send events directly when connected', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      // 建立连接。
      dispatchMessage(getHandler(), 'HANDSHAKE_ACK');

      postMessageSpy.mockClear();
      rxdb.emit('SYNC_BEGIN', { type: 'SYNC_BEGIN' });

      const eventMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'EVENT');
      expect(eventMsgs).toHaveLength(1);
    });
  });

  describe('INSPECT_DB handling', () => {
    it('MUST send DB_INFO with null when no metadata available', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      const handler = getHandler();
      postMessageSpy.mockClear();

      dispatchMessage(handler, 'INSPECT_DB');

      const dbInfoMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'DB_INFO');
      expect(dbInfoMsgs).toHaveLength(1);
    });

    it('MUST send DB_INFO with entity info when metadata available', () => {
      class UserEntity {}
      const getMetadata: GetEntityMetadata = entity =>
        entity === UserEntity ? { name: 'User', namespace: 'public' } : undefined;

      const rxdb = createMockRxDB({ config: { entities: [UserEntity] } });

      connector.init(rxdb, getMetadata);
      const handler = getHandler();
      postMessageSpy.mockClear();

      dispatchMessage(handler, 'INSPECT_DB');

      const dbInfoMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'DB_INFO');
      expect(dbInfoMsgs).toHaveLength(1);
      expect(dbInfoMsgs[0][0].payload).toEqual({
        version: MOCK_VERSION,
        dbName: MOCK_DB_NAME,
        // RDT-007：面板据此禁用越权按钮，漏了它面板只能靠试错发现命令被丢弃。
        capabilities: 'full',
        entities: [{ name: 'User', namespace: 'public', encryptedFields: [] }]
      });
    });

    it('MUST include encryptedFields in DB_INFO when entity has encrypted properties', () => {
      class SecretEntity {}
      const getMetadata: GetEntityMetadata = entity =>
        entity === SecretEntity ?
          {
            name: 'Secret',
            namespace: 'public',
            encryptedPropertyMap: new Map([
              ['ssn', { encrypted: true }],
              ['phone', { encrypted: true }]
            ])
          }
        : undefined;

      const rxdb = createMockRxDB({ config: { entities: [SecretEntity] } });

      connector.init(rxdb, getMetadata);
      const handler = getHandler();
      postMessageSpy.mockClear();

      dispatchMessage(handler, 'INSPECT_DB');

      const dbInfoMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'DB_INFO');
      expect(dbInfoMsgs).toHaveLength(1);
      expect(dbInfoMsgs[0][0].payload.entities[0].encryptedFields).toEqual(['ssn', 'phone']);
    });
  });

  describe('QUERY_ENTITY handling', () => {
    it('MUST send error when the entity is not registered', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      const handler = getHandler();
      postMessageSpy.mockClear();

      dispatchMessage(handler, 'QUERY_ENTITY', { entityName: 'User' });

      const dataMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'ENTITY_DATA');
      expect(dataMsgs).toHaveLength(1);
      expect(dataMsgs[0][0].payload).toEqual({ entityName: 'User', error: '实体 User 不存在', data: [] });
    });

    it('MUST report RxDB 未初始化 once the observed instance has been detached', async () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      const handler = getHandler();
      const send = (type: string, payload: unknown): void => {
        dispatchMessage(handler, type, payload);
      };

      // 断开被观测实例后 message 监听仍在（DevTools 通道没断），
      // 于是「命令到达时 #rxdbInstance 为 null」是真实可达状态，不是假想分支。
      send('DISCONNECT_RXDB', { requestId: 'req-detach' });
      await vi.waitFor(() => {
        const results = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'DISCONNECT_RXDB_RESULT');
        expect(results).toHaveLength(1);
      });

      postMessageSpy.mockClear();
      send('QUERY_ENTITY', { entityName: 'User' });

      const dataMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'ENTITY_DATA');
      expect(dataMsgs).toHaveLength(1);
      expect(dataMsgs[0][0].payload).toEqual({ entityName: 'User', error: 'RxDB 未初始化', data: [] });
    });

    it('MUST include _meta.encryptedFields in ENTITY_DATA when entity has encrypted properties', async () => {
      class SecretEntity {}
      const getMetadata: GetEntityMetadata = entity =>
        entity === SecretEntity ?
          {
            name: 'Secret',
            namespace: 'public',
            encryptedPropertyMap: new Map([['ssn', { encrypted: true }]])
          }
        : undefined;

      const mockSubscribe = (cb: (docs: unknown[]) => void) => {
        const sub = { unsubscribe: vi.fn() };
        queueMicrotask(() => cb([{ id: '1', ssn: 'decrypted-value' }]));
        return sub;
      };

      const rxdb = createMockRxDB({
        config: { entities: [SecretEntity] },
        entityManager: {
          getRepository: () => ({
            find: () => ({ subscribe: mockSubscribe })
          })
        }
      });

      connector.init(rxdb, getMetadata);
      const handler = getHandler();

      postMessageSpy.mockClear();

      dispatchMessage(handler, 'QUERY_ENTITY', { entityName: 'Secret' });

      await vi.waitFor(() => {
        const dataMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'ENTITY_DATA');
        expect(dataMsgs).toHaveLength(1);
        expect(dataMsgs[0][0].payload.data).toEqual([{ id: '1', ssn: '[encrypted]' }]);
        expect(dataMsgs[0][0].payload._meta).toEqual({ encryptedFields: ['ssn'] });
      });
    });

    it('MUST return KEYRING_LOCKED error code when EncryptedLockedError is thrown', () => {
      class SecretEntity {}
      const getMetadata: GetEntityMetadata = entity =>
        entity === SecretEntity ?
          {
            name: 'Secret',
            namespace: 'public',
            encryptedPropertyMap: new Map([['ssn', { encrypted: true }]])
          }
        : undefined;

      const lockedError = new Error('keyring is locked while reading encrypted column');
      lockedError.name = 'EncryptedLockedError';

      const rxdb = createMockRxDB({
        config: { entities: [SecretEntity] },
        entityManager: throwingEntityManager(lockedError)
      });

      connector.init(rxdb, getMetadata);
      const handler = getHandler();

      postMessageSpy.mockClear();

      dispatchMessage(handler, 'QUERY_ENTITY', { entityName: 'Secret' });

      const dataMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'ENTITY_DATA');
      expect(dataMsgs).toHaveLength(1);
      expect(dataMsgs[0][0].payload.error).toContain('keyring is locked');
      expect(dataMsgs[0][0].payload._meta.errorCode).toBe('KEYRING_LOCKED');
      expect(dataMsgs[0][0].payload.data).toEqual([]);
    });

    it('MUST return asynchronous Observable errors', () => {
      class UserEntity {}
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const rxdb = createMockRxDB({
        config: { entities: [UserEntity] },
        entityManager: {
          getRepository: () => ({ find: () => throwError(() => new Error('query failed')) })
        }
      });

      connector.init(rxdb, entity => (entity === UserEntity ? { name: 'User', namespace: 'public' } : undefined));
      const handler = getHandler();
      postMessageSpy.mockClear();

      dispatchMessage(handler, 'QUERY_ENTITY', { entityName: 'User' });

      const dataMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'ENTITY_DATA');
      expect(dataMsgs[0][0].payload).toEqual({ entityName: 'User', error: 'query failed', data: [] });
    });
  });

  describe('GET_BRANCHES handling', () => {
    it('MUST send empty branches when no branch entity is registered', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      const handler = getHandler();
      postMessageSpy.mockClear();

      dispatchMessage(handler, 'GET_BRANCHES');

      const branchMsgs = postMessageSpy.mock.calls.filter(c => c[0]?.type === 'BRANCHES');
      expect(branchMsgs).toHaveLength(1);
      expect(branchMsgs[0][0].payload).toEqual([]);
    });
  });

  describe('branch commands', () => {
    /** 三个分支命令走同一条 `#runBranchOp`，逐个验证「转发到 versionManager」与「未初始化时不静默」。 */
    const BRANCH_COMMANDS = [
      ['SWITCH_BRANCH', 'switchBranch', 'branch-1'],
      ['CREATE_BRANCH', 'createBranch', 'new-branch'],
      ['DELETE_BRANCH', 'removeBranch', 'branch-2']
    ] as const;

    function sendCommand(type: string, payload: unknown): void {
      dispatchMessage(getHandler(), type, payload);
    }

    it.each(BRANCH_COMMANDS)('MUST forward %s to versionManager.%s', (type, method, payload) => {
      const spy = vi.fn().mockResolvedValue(undefined);
      const rxdb = createMockRxDB({
        versionManager: {
          switchBranch: () => Promise.resolve(),
          createBranch: () => Promise.resolve(),
          removeBranch: () => Promise.resolve(),
          [method]: spy
        } as unknown as MockRxDBShape['versionManager']
      });
      connector.init(rxdb);

      sendCommand(type, payload);

      expect(spy).toHaveBeenCalledWith(payload);
    });

    it.each(BRANCH_COMMANDS)(
      'MUST log an error for %s once the instance has been detached',
      async (type, _, payload) => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
        const rxdb = createMockRxDB();
        connector.init(rxdb);

        sendCommand('DISCONNECT_RXDB', { requestId: 'req-detach' });
        await vi.waitFor(() => {
          expect(postMessageSpy.mock.calls.filter(c => c[0]?.type === 'DISCONNECT_RXDB_RESULT')).toHaveLength(1);
        });

        sendCommand(type, payload);

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('RxDB 未初始化'));
      }
    );
  });

  describe('session token', () => {
    it('MUST silently drop session-required commands without a token', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);
      const handler = getHandler();
      postMessageSpy.mockClear();

      withoutSession(() => {
        dispatchMessage(handler, 'INSPECT_DB');
      });

      expect(postMessageSpy.mock.calls.filter(c => c[0]?.type === 'DB_INFO')).toHaveLength(0);
    });
  });
});

describe('getDevToolsConnector / resetDevToolsConnector', () => {
  afterEach(() => {
    resetDevToolsConnector();
    vi.restoreAllMocks();
  });

  it('MUST return same instance on repeated calls', () => {
    vi.spyOn(window, 'postMessage').mockImplementation(vi.fn());
    const a = getDevToolsConnector();
    const b = getDevToolsConnector();
    expect(a).toBe(b);
  });

  it('MUST return new instance after reset', () => {
    vi.spyOn(window, 'postMessage').mockImplementation(vi.fn());
    vi.spyOn(window, 'removeEventListener').mockImplementation(vi.fn());
    const a = getDevToolsConnector();
    resetDevToolsConnector();
    const b = getDevToolsConnector();
    expect(a).not.toBe(b);
  });
});
