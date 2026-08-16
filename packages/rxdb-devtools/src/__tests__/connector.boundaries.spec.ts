import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DevToolsConnector } from '../connector.js';
import type { DisconnectStatus } from '../types.js';
import { RXDB_DEVTOOLS_MESSAGE } from '../types.js';
import {
  createPostMessageSpy,
  installChannelStub,
  restoreChannelStub,
  sendToConnector
} from './fixtures/devtools-channel.js';
import type { MockRxDB, MockRxDBShape } from './fixtures/mock-rxdb.js';
import { createMockRxDB, listenerCount, MOCK_DB_NAME, MOCK_VERSION } from './fixtures/mock-rxdb.js';

type DisconnectResult = { success: boolean; error: string | null; status: DisconnectStatus };
type GetEntityMetadata = NonNullable<Parameters<DevToolsConnector['init']>[1]>;

interface PostedMessage {
  type: string;
  payload: unknown;
}

const DEVTOOLS_GLOBAL_KEY = '__AIAO_RXDB_DEVTOOLS__' as const;
type DevtoolsWindow = Window & {
  [DEVTOOLS_GLOBAL_KEY]?: { disconnectRxdb(timeoutMs?: number): Promise<DisconnectResult> };
};

/** 取 `window` 总线上注册的监听器；只有验证「命令走错信道」的用例需要它。 */
function getMessageHandler(addEventSpy: ReturnType<typeof vi.spyOn>): (event: MessageEvent) => void {
  const calls = addEventSpy.mock.calls as unknown as unknown[][];
  const listener = calls.find(call => call[0] === 'message')?.[1];
  if (typeof listener !== 'function') throw new Error('message listener not registered');
  return listener as (event: MessageEvent) => void;
}

/** 经握手交出的私有端口把消息送进连接器 —— 协议 v2 下命令唯一的合法入口。 */
function dispatchRaw(data: unknown): void {
  sendToConnector(data);
}

function dispatchCommand(type: string, payload: unknown): void {
  dispatchRaw({
    source: RXDB_DEVTOOLS_MESSAGE,
    direction: 'devtools-to-page',
    type,
    payload,
    timestamp: Date.now(),
    sequence: 1
  });
}

function postedMessages(postMessageSpy: ReturnType<typeof vi.fn>, type: string): PostedMessage[] {
  return postMessageSpy.mock.calls.map(call => call[0] as PostedMessage).filter(message => message.type === type);
}

function inspectDb(): void {
  dispatchCommand('INSPECT_DB', null);
}

function getGlobalHelper(): DevtoolsWindow[typeof DEVTOOLS_GLOBAL_KEY] {
  return (window as DevtoolsWindow)[DEVTOOLS_GLOBAL_KEY];
}

describe('DevToolsConnector boundaries', () => {
  let connector: DevToolsConnector;
  let postMessageSpy: ReturnType<typeof vi.fn>;
  let addEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    installChannelStub();
    postMessageSpy = createPostMessageSpy();
    addEventSpy = vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'postMessage').mockImplementation(postMessageSpy as unknown as typeof window.postMessage);
    connector = new DevToolsConnector();
  });

  const extraConnectors: DevToolsConnector[] = [];

  /** 建一个非默认配置的连接器，并登记到 afterEach 统一拆掉（否则 window 上会留监听）。 */
  function createConnector(options: ConstructorParameters<typeof DevToolsConnector>[0]): DevToolsConnector {
    const created = new DevToolsConnector(options);
    extraConnectors.push(created);
    return created;
  }

  afterEach(() => {
    connector.disconnect();
    while (extraConnectors.length > 0) extraConnectors.pop()?.disconnect();
    restoreChannelStub();
    vi.restoreAllMocks();
  });

  it('MUST reject malformed envelopes before invoking a command handler', async () => {
    const disconnectAll = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    connector.init(createMockRxDB({ disconnectAll }));
    postMessageSpy.mockClear();

    dispatchRaw({
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'devtools-to-page',
      type: 'DISCONNECT_RXDB',
      payload: { requestId: 'request-1' },
      timestamp: 'invalid',
      sequence: 1
    });
    await Promise.resolve();

    expect(disconnectAll).not.toHaveBeenCalled();
    expect(postedMessages(postMessageSpy, 'DISCONNECT_RXDB_RESULT')).toHaveLength(0);
  });

  it.each([0, -1, 1001, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '10', null, undefined])(
    'MUST reject explicit invalid query limit %s without querying',
    limit => {
      class UserEntity {}
      const find = vi.fn(() => ({ subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) }));
      const rxdb = createMockRxDB({
        config: { entities: [UserEntity] },
        entityManager: { getRepository: () => ({ find }) }
      });
      const getMetadata: GetEntityMetadata = entity =>
        entity === UserEntity ? { name: 'User', namespace: 'public' } : undefined;

      connector.init(rxdb, getMetadata);
      postMessageSpy.mockClear();

      dispatchCommand('QUERY_ENTITY', { entityName: 'User', limit });

      expect(find).not.toHaveBeenCalled();
      expect(postedMessages(postMessageSpy, 'ENTITY_DATA')).toHaveLength(0);
    }
  );

  it.each([undefined, 1, 1000])('MUST query with accepted limit %s', limit => {
    class UserEntity {}
    const find = vi.fn(() => ({ subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) }));
    const rxdb = createMockRxDB({
      config: { entities: [UserEntity] },
      entityManager: { getRepository: () => ({ find }) }
    });
    const getMetadata: GetEntityMetadata = entity =>
      entity === UserEntity ? { name: 'User', namespace: 'public' } : undefined;

    connector.init(rxdb, getMetadata);
    const payload = limit === undefined ? { entityName: 'User' } : { entityName: 'User', limit };

    dispatchCommand('QUERY_ENTITY', payload);

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ limit: limit ?? 1000 }));
  });

  it('MUST handle a synchronous query Observable once and mask metadata-declared fields', () => {
    class SecretEntity {}
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((callback: (docs: unknown[]) => void) => {
      const document = {
        toJSON: () => ({ id: '1', name: 'Ada', ssn: 'plaintext', profile: { ssn: 'nested-plaintext' } })
      };
      callback([document]);
      callback([{ id: '2', name: 'ignored', ssn: 'ignored' }]);
      return { unsubscribe };
    });
    const rxdb = createMockRxDB({
      config: { entities: [SecretEntity] },
      entityManager: { getRepository: () => ({ find: () => ({ subscribe }) }) }
    });
    const getMetadata: GetEntityMetadata = entity =>
      entity === SecretEntity ?
        { name: 'Secret', namespace: 'public', encryptedPropertyMap: new Map([['ssn', true]]) }
      : undefined;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    connector.init(rxdb, getMetadata);
    postMessageSpy.mockClear();

    dispatchCommand('QUERY_ENTITY', { entityName: 'Secret' });

    const responses = postedMessages(postMessageSpy, 'ENTITY_DATA');
    expect(responses).toHaveLength(1);
    expect(responses[0]?.payload).toEqual({
      entityName: 'Secret',
      error: null,
      data: [{ id: '1', name: 'Ada', ssn: '[encrypted]', profile: { ssn: 'nested-plaintext' } }],
      _meta: { encryptedFields: ['ssn'] }
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('MUST mask encrypted bigint/binary before applying the shared QUERY_ENTITY wire serializer', () => {
    class SecretEntity {}
    const source = new Uint8Array([9, 0, 255, 8]);
    const binary = source.subarray(1, 3);
    const subscribe = vi.fn((callback: (docs: unknown[]) => void) => {
      callback([
        {
          toJSON: () => ({
            id: 9_007_199_254_740_993n,
            count: 9_223_372_036_854_775_807n,
            binary,
            secretCount: 11n,
            secretBinary: new Uint8Array(64).fill(7)
          })
        }
      ]);
      return { unsubscribe: vi.fn() };
    });
    const rxdb = createMockRxDB({
      config: { entities: [SecretEntity] },
      entityManager: { getRepository: () => ({ find: () => ({ subscribe }) }) }
    });
    connector.init(rxdb, entity =>
      entity === SecretEntity ?
        {
          name: 'Secret',
          namespace: 'public',
          encryptedPropertyMap: new Map([
            ['secretCount', true],
            ['secretBinary', true]
          ])
        }
      : undefined
    );
    postMessageSpy.mockClear();

    dispatchCommand('QUERY_ENTITY', { entityName: 'Secret' });

    expect(postedMessages(postMessageSpy, 'ENTITY_DATA')[0]?.payload).toEqual({
      entityName: 'Secret',
      error: null,
      data: [
        {
          id: { $rxdb: 1, type: 'bigint', value: '9007199254740993' },
          count: { $rxdb: 1, type: 'bigint', value: '9223372036854775807' },
          binary: { $rxdb: 1, type: 'binary', encoding: 'base64url', value: 'AP8', byteLength: 2 },
          secretCount: '[encrypted]',
          secretBinary: '[encrypted]'
        }
      ],
      _meta: { encryptedFields: ['secretCount', 'secretBinary'] }
    });
    expect(source).toEqual(new Uint8Array([9, 0, 255, 8]));
  });

  // RDT-001：#entityTypeMap / #encryptedFieldsMap 都以裸 `metadata.name` 建 key，
  // 而上游用 `namespace:name` 作实体身份（SchemaManager 明确允许不同 namespace 下重名）。
  // 后写覆盖前写 → 查询落到错误 namespace 的仓库，事件遮罩套用另一个 namespace 的加密字段集。
  describe('RDT-001 namespace 必须参与实体身份', () => {
    class AlphaUser {}
    class BetaUser {}

    const twoNamespaceMetadata: GetEntityMetadata = entity => {
      if (entity === AlphaUser) {
        return { name: 'User', namespace: 'alpha', encryptedPropertyMap: new Map([['ssn', true]]) };
      }
      if (entity === BetaUser) {
        return { name: 'User', namespace: 'beta', encryptedPropertyMap: new Map([['token', true]]) };
      }
      return undefined;
    };

    it('事件遮罩必须使用事件自身 namespace 对应的加密字段集', () => {
      const rxdb = createMockRxDB({ config: { entities: [AlphaUser, BetaUser] } });
      connector.init(rxdb, twoNamespaceMetadata);
      dispatchCommand('HANDSHAKE_ACK', null);
      postMessageSpy.mockClear();

      rxdb.emit('ENTITY_LOCAL_UPDATE', {
        type: 'ENTITY_LOCAL_UPDATE',
        entities: [
          { namespace: 'alpha', entity: 'User', patch: { ssn: 'alpha-secret', token: 'alpha-token' } },
          { namespace: 'beta', entity: 'User', patch: { ssn: 'beta-ssn', token: 'beta-secret' } }
        ]
      });

      const events = postedMessages(postMessageSpy, 'EVENT');
      const entities = (events[0]?.payload as { data: { entities: { patch: Record<string, unknown> }[] } }).data
        .entities;
      // alpha 声明加密 ssn：ssn 必须被遮罩，token 不是它的加密字段 → 原样
      expect(entities[0]?.patch.ssn).toBe('[encrypted]');
      expect(entities[0]?.patch.token).toBe('alpha-token');
      // beta 声明加密 token：token 必须被遮罩，ssn 原样
      expect(entities[1]?.patch.token).toBe('[encrypted]');
      expect(entities[1]?.patch.ssn).toBe('beta-ssn');
    });

    it('QUERY_ENTITY 带 namespace 时必须命中对应 namespace 的仓库并在响应中回显身份', () => {
      const queried: unknown[] = [];
      const rxdb = createMockRxDB({
        config: { entities: [AlphaUser, BetaUser] },
        entityManager: {
          getRepository: (entityType: unknown) => {
            queried.push(entityType);
            return {
              find: () => ({
                subscribe: (next: (documents: unknown[]) => void) => {
                  next([{ id: 'alpha-user' }]);
                  return { unsubscribe: () => undefined };
                }
              })
            };
          }
        } as unknown as MockRxDBShape['entityManager']
      });
      connector.init(rxdb, twoNamespaceMetadata);
      postMessageSpy.mockClear();

      dispatchCommand('QUERY_ENTITY', { entityName: 'User', namespace: 'alpha', limit: 10 });

      expect(queried).toEqual([AlphaUser]);
      expect(postedMessages(postMessageSpy, 'ENTITY_DATA')[0]?.payload).toEqual({
        entityName: 'User',
        namespace: 'alpha',
        error: null,
        data: [{ id: 'alpha-user' }],
        _meta: { encryptedFields: ['ssn'] }
      });
    });

    it('QUERY_ENTITY 未带 namespace 且名称有歧义时返回结构化错误，不得随意挑一个', () => {
      const rxdb = createMockRxDB({
        config: { entities: [AlphaUser, BetaUser] },
        entityManager: {
          getRepository: () => ({ find: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }) })
        } as unknown as MockRxDBShape['entityManager']
      });
      connector.init(rxdb, twoNamespaceMetadata);
      postMessageSpy.mockClear();

      dispatchCommand('QUERY_ENTITY', { entityName: 'User', limit: 10 });

      const responses = postedMessages(postMessageSpy, 'ENTITY_DATA');
      expect(responses).toHaveLength(1);
      const payload = responses[0]?.payload as { error: string | null };
      expect(payload.error).toContain('ambiguous');
    });
  });

  it('MUST mask encrypted fields in event entity patch, inversePatch, and data', () => {
    class SecretEntity {}
    const rxdb = createMockRxDB({ config: { entities: [SecretEntity] } });
    const getMetadata: GetEntityMetadata = entity =>
      entity === SecretEntity ?
        { name: 'Secret', namespace: 'public', encryptedPropertyMap: new Map([['ssn', true]]) }
      : undefined;

    connector.init(rxdb, getMetadata);
    dispatchCommand('HANDSHAKE_ACK', null);
    postMessageSpy.mockClear();

    rxdb.emit('ENTITY_LOCAL_UPDATE', {
      type: 'ENTITY_LOCAL_UPDATE',
      entities: [
        {
          entity: 'Secret',
          id: '1',
          patch: { name: 'Ada', ssn: 'new-plaintext', nested: { ssn: 'nested-new' } },
          inversePatch: { name: 'Grace', ssn: 'old-plaintext' },
          data: { name: 'Lin', ssn: 'remote-plaintext' }
        }
      ]
    });

    const events = postedMessages(postMessageSpy, 'EVENT');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual(
      expect.objectContaining({
        data: {
          entities: [
            {
              entity: 'Secret',
              id: '1',
              patch: { name: 'Ada', ssn: '[encrypted]', nested: { ssn: 'nested-new' } },
              inversePatch: { name: 'Grace', ssn: '[encrypted]' },
              data: { name: 'Lin', ssn: '[encrypted]' }
            }
          ]
        }
      })
    );
  });

  it('MUST serialize history change values uniformly and redact the target entity fields first', () => {
    class SecretEntity {}
    class ChangeEntity {}
    const rxdb = createMockRxDB({ config: { entities: [SecretEntity, ChangeEntity] } });
    const getMetadata: GetEntityMetadata = entity => {
      if (entity === SecretEntity) {
        return { name: 'Secret', namespace: 'public', encryptedPropertyMap: new Map([['secret', true]]) };
      }
      if (entity === ChangeEntity) return { name: 'RxDBChange', namespace: 'rxdb' };
      return undefined;
    };
    connector.init(rxdb, getMetadata);
    dispatchCommand('HANDSHAKE_ACK', null);
    postMessageSpy.mockClear();

    rxdb.emit('ENTITY_LOCAL_CREATE', {
      type: 'ENTITY_LOCAL_CREATE',
      entities: [
        {
          namespace: 'rxdb',
          entity: 'RxDBChange',
          patch: {
            namespace: 'public',
            entity: 'Secret',
            entityId: 9_007_199_254_740_993n,
            patch: { count: 1n, binary: new Uint8Array([0, 255]), secret: new Uint8Array(128) },
            inversePatch: { count: 0n, binary: new Uint8Array([1, 2]), secret: 5n }
          },
          inversePatch: null
        }
      ]
    });

    const event = postedMessages(postMessageSpy, 'EVENT')[0]?.payload as {
      data: { entities: Array<{ patch: Record<string, unknown> }> };
    };
    expect(event.data.entities[0]?.patch).toEqual({
      namespace: 'public',
      entity: 'Secret',
      entityId: { $rxdb: 1, type: 'bigint', value: '9007199254740993' },
      patch: {
        count: { $rxdb: 1, type: 'bigint', value: '1' },
        binary: { $rxdb: 1, type: 'binary', encoding: 'base64url', value: 'AP8', byteLength: 2 },
        secret: '[encrypted]'
      },
      inversePatch: {
        count: { $rxdb: 1, type: 'bigint', value: '0' },
        binary: { $rxdb: 1, type: 'binary', encoding: 'base64url', value: 'AQI', byteLength: 2 },
        secret: '[encrypted]'
      }
    });
  });

  it.each(['CONFLICT_DETECTED', 'CONFLICT_PENDING'] as const)(
    'MUST mask local, remote, and base using the %s conflict namespace',
    eventType => {
      class AlphaUser {}
      class BetaUser {}
      const rxdb = createMockRxDB({ config: { entities: [AlphaUser, BetaUser] } });
      const getMetadata: GetEntityMetadata = entity => {
        if (entity === AlphaUser) {
          return { name: 'User', namespace: 'alpha', encryptedPropertyMap: new Map([['ssn', true]]) };
        }
        if (entity === BetaUser) {
          return { name: 'User', namespace: 'beta', encryptedPropertyMap: new Map([['token', true]]) };
        }
        return undefined;
      };
      const conflicts = [
        {
          entityKey: 'alpha:User:1',
          local: {
            namespace: 'alpha',
            entity: 'User',
            patch: { name: 'alpha-local', ssn: 'alpha-local-secret', token: 'alpha-local-token' }
          },
          remote: {
            namespace: 'alpha',
            entity: 'User',
            inversePatch: { name: 'alpha-remote', ssn: 'alpha-remote-secret', token: 'alpha-remote-token' }
          },
          base: { name: 'alpha-base', ssn: 'alpha-base-secret', token: 'alpha-base-token' }
        },
        {
          entityKey: 'beta:User:2',
          local: {
            namespace: 'beta',
            entity: 'User',
            patch: { name: 'beta-local', ssn: 'beta-local-ssn', token: 'beta-local-secret' }
          },
          remote: {
            namespace: 'beta',
            entity: 'User',
            inversePatch: { name: 'beta-remote', ssn: 'beta-remote-ssn', token: 'beta-remote-secret' }
          },
          base: { name: 'beta-base', ssn: 'beta-base-ssn', token: 'beta-base-secret' }
        }
      ];
      const expectedConflicts = [
        {
          entityKey: 'alpha:User:1',
          local: {
            namespace: 'alpha',
            entity: 'User',
            patch: { name: 'alpha-local', ssn: '[encrypted]', token: 'alpha-local-token' }
          },
          remote: {
            namespace: 'alpha',
            entity: 'User',
            inversePatch: { name: 'alpha-remote', ssn: '[encrypted]', token: 'alpha-remote-token' }
          },
          base: { name: 'alpha-base', ssn: '[encrypted]', token: 'alpha-base-token' }
        },
        {
          entityKey: 'beta:User:2',
          local: {
            namespace: 'beta',
            entity: 'User',
            patch: { name: 'beta-local', ssn: 'beta-local-ssn', token: '[encrypted]' }
          },
          remote: {
            namespace: 'beta',
            entity: 'User',
            inversePatch: { name: 'beta-remote', ssn: 'beta-remote-ssn', token: '[encrypted]' }
          },
          base: { name: 'beta-base', ssn: 'beta-base-ssn', token: '[encrypted]' }
        }
      ];

      connector.init(rxdb, getMetadata);
      dispatchCommand('HANDSHAKE_ACK', null);
      postMessageSpy.mockClear();

      const conflictEvent =
        eventType === 'CONFLICT_DETECTED' ?
          { type: eventType, conflicts, resolved: 0, deferred: 2 }
        : { type: eventType, conflicts };
      rxdb.emit(eventType, conflictEvent);

      const events = postedMessages(postMessageSpy, 'EVENT');
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toEqual(
        expect.objectContaining({
          eventType,
          data:
            eventType === 'CONFLICT_DETECTED' ?
              { conflicts: expectedConflicts, resolved: 0, deferred: 2 }
            : { conflicts: expectedConflicts }
        })
      );
    }
  );

  it('MUST serialize bigint/binary on both conflict sides without mutating either patch', () => {
    class UserEntity {}
    const localBinary = new Uint8Array([0, 255]);
    const remoteBinary = new Uint8Array([1, 2]);
    const localPatch = { count: 9_007_199_254_740_993n, binary: localBinary };
    const remotePatch = { count: -9_223_372_036_854_775_808n, binary: remoteBinary };
    const rxdb = createMockRxDB({ config: { entities: [UserEntity] } });
    connector.init(rxdb, entity => (entity === UserEntity ? { name: 'User', namespace: 'public' } : undefined));
    dispatchCommand('HANDSHAKE_ACK', null);
    postMessageSpy.mockClear();

    rxdb.emit('CONFLICT_PENDING', {
      type: 'CONFLICT_PENDING',
      conflicts: [
        {
          entityKey: 'public:User:1',
          local: { namespace: 'public', entity: 'User', patch: localPatch },
          remote: { namespace: 'public', entity: 'User', inversePatch: remotePatch },
          base: null
        }
      ]
    });

    const event = postedMessages(postMessageSpy, 'EVENT')[0]?.payload as {
      data: { conflicts: Array<Record<string, unknown>> };
    };
    expect(event.data.conflicts[0]).toEqual({
      entityKey: 'public:User:1',
      local: {
        namespace: 'public',
        entity: 'User',
        patch: {
          count: { $rxdb: 1, type: 'bigint', value: '9007199254740993' },
          binary: { $rxdb: 1, type: 'binary', encoding: 'base64url', value: 'AP8', byteLength: 2 }
        }
      },
      remote: {
        namespace: 'public',
        entity: 'User',
        inversePatch: {
          count: { $rxdb: 1, type: 'bigint', value: '-9223372036854775808' },
          binary: { $rxdb: 1, type: 'binary', encoding: 'base64url', value: 'AQI', byteLength: 2 }
        }
      },
      base: null
    });
    expect(localPatch).toEqual({ count: 9_007_199_254_740_993n, binary: new Uint8Array([0, 255]) });
    expect(remotePatch).toEqual({ count: -9_223_372_036_854_775_808n, binary: new Uint8Array([1, 2]) });
  });

  it('MUST handle a synchronous branches Observable once', () => {
    class BranchEntity {}
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((callback: (branches: unknown[]) => void) => {
      callback([{ id: 'main', activated: true }]);
      callback([{ id: 'ignored', activated: false }]);
      return { unsubscribe };
    });
    const rxdb = createMockRxDB({
      config: { entities: [BranchEntity] },
      entityManager: { getRepository: () => ({ find: () => ({ subscribe }) }) }
    });
    const getMetadata: GetEntityMetadata = entity =>
      entity === BranchEntity ? { name: 'RxDBBranch', namespace: 'system' } : undefined;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    connector.init(rxdb, getMetadata);
    postMessageSpy.mockClear();

    dispatchCommand('GET_BRANCHES', null);

    const responses = postedMessages(postMessageSpy, 'BRANCHES');
    expect(responses).toHaveLength(1);
    expect(responses[0]?.payload).toEqual([{ id: 'main', activated: true }]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('MUST fail fast on a different instance without polluting first-instance state', () => {
    class FirstEntity {}
    class SecondEntity {}
    const first = createMockRxDB({ config: { entities: [FirstEntity] } });
    const second = createMockRxDB({ config: { entities: [SecondEntity] } });
    const firstMetadata: GetEntityMetadata = entity =>
      entity === FirstEntity ? { name: 'First', namespace: 'public' } : undefined;
    const secondMetadata = vi.fn<GetEntityMetadata>(entity =>
      entity === SecondEntity ? { name: 'Second', namespace: 'public' } : undefined
    );

    connector.init(first, firstMetadata);
    const firstListenerCount = listenerCount(first);

    expect(() => connector.init(second, secondMetadata)).toThrow(/single RxDB instance/i);
    expect(secondMetadata).not.toHaveBeenCalled();
    expect(listenerCount(second)).toBe(0);
    expect(listenerCount(first)).toBe(firstListenerCount);

    postMessageSpy.mockClear();
    inspectDb();
    expect(postedMessages(postMessageSpy, 'DB_INFO')[0]?.payload).toEqual({
      version: MOCK_VERSION,
      dbName: MOCK_DB_NAME,
      capabilities: 'full',
      entities: [{ name: 'First', namespace: 'public', encryptedFields: [] }]
    });
  });

  it('MUST retain instance, listeners, and helper after disconnect rejection so retry can succeed', async () => {
    const disconnectAll = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('disconnect rejected'))
      .mockResolvedValueOnce(undefined);
    const rxdb = createMockRxDB({ disconnectAll });
    connector.init(rxdb);
    const helper = getGlobalHelper();
    if (!helper) throw new Error('global helper not registered');

    const first = await helper.disconnectRxdb(20);

    expect(first).toEqual({ success: false, error: 'disconnect rejected', status: 'failed' });
    expect(getGlobalHelper()).toBe(helper);
    expect(listenerCount(rxdb)).toBeGreaterThan(0);

    const retryHelper = getGlobalHelper();
    if (!retryHelper) throw new Error('global helper removed after failure');
    const second = await retryHelper.disconnectRxdb(20);

    expect(second).toEqual({ success: true, error: null, status: 'graceful' });
    expect(disconnectAll).toHaveBeenCalledTimes(2);
    expect(listenerCount(rxdb)).toBe(0);
    expect(getGlobalHelper()).toBeUndefined();
  });

  it('MUST retain retry state after disconnect timeout', async () => {
    const disconnectAll = vi.fn<() => Promise<void>>().mockImplementation(() => new Promise(() => undefined));
    const rxdb = createMockRxDB({ disconnectAll });
    connector.init(rxdb);
    const helper = getGlobalHelper();
    if (!helper) throw new Error('global helper not registered');

    const result = await helper.disconnectRxdb(1);

    expect(result.status).toBe('failed');
    expect(result.success).toBe(false);
    expect(result.error).toContain('超时');
    expect(getGlobalHelper()).toBe(helper);
    expect(listenerCount(rxdb)).toBeGreaterThan(0);
  });

  it('MUST retain retry state when forced release fails', async () => {
    const disconnectAll = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('disconnect rejected'));
    const getAdapter = vi.fn().mockRejectedValue(new Error('force failed'));
    const rxdb = createMockRxDB({
      disconnectAll,
      getAdapter,
      config: { sync: { local: { adapter: 'wa-sqlite' } } }
    });
    connector.init(rxdb);
    const helper = getGlobalHelper();
    if (!helper) throw new Error('global helper not registered');

    const result = await helper.disconnectRxdb(20);

    expect(result).toEqual({
      success: false,
      error: 'disconnect rejected; force failed',
      status: 'failed'
    });
    expect(getGlobalHelper()).toBe(helper);
    expect(listenerCount(rxdb)).toBeGreaterThan(0);
  });

  it('MUST explicitly report forced success and clean up only after worker termination succeeds', async () => {
    const terminate = vi.fn();
    const worker = { terminate } as unknown as Worker;
    const rxdb = createMockRxDB({
      disconnectAll: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('disconnect rejected')),
      getAdapter: vi.fn().mockResolvedValue({ options: { workerInstance: worker } }),
      config: { sync: { local: { adapter: 'wa-sqlite' } } }
    });
    connector.init(rxdb);
    const helper = getGlobalHelper();
    if (!helper) throw new Error('global helper not registered');

    const result = await helper.disconnectRxdb(20);

    expect(result).toEqual({ success: true, error: null, status: 'forced' });
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(listenerCount(rxdb)).toBe(0);
    expect(getGlobalHelper()).toBeUndefined();
  });

  it('MUST report truthful graceful and not-connected statuses in DISCONNECT_RXDB_RESULT', async () => {
    connector.init(createMockRxDB());
    postMessageSpy.mockClear();

    dispatchCommand('DISCONNECT_RXDB', { requestId: 'request-1' });

    await vi.waitFor(() => {
      expect(postedMessages(postMessageSpy, 'DISCONNECT_RXDB_RESULT')[0]?.payload).toEqual({
        requestId: 'request-1',
        success: true,
        error: null,
        status: 'graceful'
      });
    });

    postMessageSpy.mockClear();
    dispatchCommand('DISCONNECT_RXDB', { requestId: 'request-2' });

    await vi.waitFor(() => {
      expect(postedMessages(postMessageSpy, 'DISCONNECT_RXDB_RESULT')[0]?.payload).toEqual({
        requestId: 'request-2',
        success: true,
        error: null,
        status: 'not-connected'
      });
    });
  });

  it('MUST force-release via sharedWorker port.close when disconnectAll fails', async () => {
    const close = vi.fn();
    const sharedWorker = { port: { close } } as unknown as SharedWorker;
    const rxdb = createMockRxDB({
      disconnectAll: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('disconnect rejected')),
      getAdapter: vi.fn().mockResolvedValue({ options: { sharedWorkerInstance: sharedWorker } }),
      config: { sync: { local: { adapter: 'wa-sqlite' } } }
    });
    connector.init(rxdb);
    const helper = getGlobalHelper();
    if (!helper) throw new Error('global helper not registered');

    const result = await helper.disconnectRxdb(20);

    expect(result).toEqual({ success: true, error: null, status: 'forced' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(getGlobalHelper()).toBeUndefined();
  });

  it('MUST fail force-release when adapter has neither worker nor sharedWorker', async () => {
    const rxdb = createMockRxDB({
      disconnectAll: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('disconnect rejected')),
      getAdapter: vi.fn().mockResolvedValue({ options: {} }),
      config: { sync: { local: { adapter: 'wa-sqlite' } } }
    });
    connector.init(rxdb);
    const helper = getGlobalHelper();
    if (!helper) throw new Error('global helper not registered');

    const result = await helper.disconnectRxdb(20);

    expect(result).toEqual({ success: false, error: 'disconnect rejected', status: 'failed' });
    expect(getGlobalHelper()).toBe(helper);
  });

  it('MUST ignore messages from a different origin', () => {
    connector.init(createMockRxDB());
    const handler = getMessageHandler(addEventSpy);
    postMessageSpy.mockClear();

    handler({
      source: window,
      origin: 'https://evil.example',
      data: {
        source: RXDB_DEVTOOLS_MESSAGE,
        direction: 'devtools-to-page',
        type: 'PING',
        payload: null,
        timestamp: Date.now(),
        sequence: 1
      }
    } as unknown as MessageEvent);

    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it('MUST drop buffered events on CLEAR so a later handshake ack flushes nothing', () => {
    const rxdb = createMockRxDB();
    connector.init(rxdb);
    rxdb.emit('SYNC_BEGIN', { type: 'SYNC_BEGIN' });
    postMessageSpy.mockClear();

    expect(() => dispatchCommand('CLEAR', null)).not.toThrow();
    // CLEAR 本身不回包：它改的是连接器的本地缓冲，DevTools 侧没有需要对账的响应。
    expect(postMessageSpy).not.toHaveBeenCalled();

    dispatchCommand('HANDSHAKE_ACK', null);

    expect(postedMessages(postMessageSpy, 'EVENT')).toHaveLength(0);
  });

  it('MUST keep the sequence monotonic across CLEAR', () => {
    const rxdb = createMockRxDB();
    connector.init(rxdb);
    dispatchCommand('HANDSHAKE_ACK', null);
    rxdb.emit('SYNC_BEGIN', { type: 'SYNC_BEGIN' });
    const before = postedMessages(postMessageSpy, 'EVENT')[0]?.payload as { sequence: number };
    postMessageSpy.mockClear();

    dispatchCommand('CLEAR', null);
    rxdb.emit('SYNC_COMPLETE', { type: 'SYNC_COMPLETE' });

    // sequence 是 wire 上的全局定序键。CLEAR 只清历史，不能把它归零 ——
    // 归零会让 CLEAR 前后两条不同事件共用序号，DevTools 侧的去重直接吃掉后来的那条。
    const after = postedMessages(postMessageSpy, 'EVENT')[0]?.payload as { sequence: number };
    expect(after.sequence).toBeGreaterThan(before.sequence);
  });

  it('MUST skip entities whose metadata has no name', () => {
    class NamedEntity {}
    class AnonymousEntity {}
    const rxdb = createMockRxDB({
      config: { entities: [NamedEntity, AnonymousEntity], dbName: 'app' },
      version: '2.0.0'
    });
    const getMetadata: GetEntityMetadata = entity => {
      if (entity === NamedEntity) return { name: 'Named', namespace: 'public' };
      if (entity === AnonymousEntity) return { name: '', namespace: 'public' };
      return undefined;
    };

    connector.init(rxdb, getMetadata);
    postMessageSpy.mockClear();
    inspectDb();

    expect(postedMessages(postMessageSpy, 'DB_INFO')[0]?.payload).toEqual({
      version: '2.0.0',
      dbName: 'app',
      capabilities: 'full',
      entities: [{ name: 'Named', namespace: 'public', encryptedFields: [] }]
    });
  });

  it('MUST reply when QUERY_ENTITY targets a missing entity name', () => {
    class UserEntity {}
    const find = vi.fn();
    const rxdb = createMockRxDB({
      config: { entities: [UserEntity] },
      entityManager: { getRepository: () => ({ find }) }
    });
    connector.init(rxdb, entity => (entity === UserEntity ? { name: 'User' } : undefined));
    postMessageSpy.mockClear();

    dispatchCommand('QUERY_ENTITY', { entityName: 'Missing' });

    expect(find).not.toHaveBeenCalled();
    expect(postedMessages(postMessageSpy, 'ENTITY_DATA')[0]?.payload).toEqual({
      entityName: 'Missing',
      error: '实体 Missing 不存在',
      data: []
    });
  });

  it('MUST degrade only the cyclic node and keep sibling fields of a circular document', () => {
    class UserEntity {}
    const circular: Record<string, unknown> = { id: 'cyclic-1', name: 'Ada' };
    circular['self'] = circular;
    const subscribe = vi.fn((callback: (docs: unknown[]) => void) => {
      callback([circular]);
      return { unsubscribe: vi.fn() };
    });
    const rxdb = createMockRxDB({
      config: { entities: [UserEntity] },
      entityManager: { getRepository: () => ({ find: () => ({ subscribe }) }) }
    });
    connector.init(rxdb, entity => (entity === UserEntity ? { name: 'User' } : undefined));
    postMessageSpy.mockClear();

    dispatchCommand('QUERY_ENTITY', { entityName: 'User' });

    // 环引用不是「无法序列化」：safeSerialize 会把成环的那个节点降级成 '[Circular]'，
    // 兄弟字段照常输出。整条记录塌成 { id, _error } 等于调试工具把要调试的数据吃掉了。
    expect(postedMessages(postMessageSpy, 'ENTITY_DATA')[0]?.payload).toEqual({
      entityName: 'User',
      error: null,
      data: [{ id: 'cyclic-1', name: 'Ada', self: '[Circular]' }]
    });
  });

  it('MUST fall back to an id-only record only when toJSON itself throws', () => {
    class UserEntity {}
    const subscribe = vi.fn((callback: (docs: unknown[]) => void) => {
      callback([
        {
          id: 'broken-1',
          toJSON: () => {
            throw new Error('toJSON failed');
          }
        }
      ]);
      return { unsubscribe: vi.fn() };
    });
    const rxdb = createMockRxDB({
      config: { entities: [UserEntity] },
      entityManager: { getRepository: () => ({ find: () => ({ subscribe }) }) }
    });
    connector.init(rxdb, entity => (entity === UserEntity ? { name: 'User' } : undefined));
    postMessageSpy.mockClear();

    dispatchCommand('QUERY_ENTITY', { entityName: 'User' });

    expect(postedMessages(postMessageSpy, 'ENTITY_DATA')[0]?.payload).toEqual({
      entityName: 'User',
      error: null,
      data: [{ id: 'broken-1', _error: 'Cannot serialize' }]
    });
  });

  it('MUST handle observer-style subscribe with next/error and non-record branch rows', async () => {
    class BranchEntity {}
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((observer: { next: (value: unknown[]) => void; error: (error: unknown) => void }) => {
      observer.next([{ id: 'main', activated: true }, 'not-a-record', { id: 123, activated: 'yes' }, null]);
      observer.next([{ id: 'ignored' }]);
      return { unsubscribe };
    });
    const rxdb = createMockRxDB({
      config: { entities: [BranchEntity] },
      entityManager: {
        getRepository: () => ({
          find: () => ({
            pipe: () => ({}),
            subscribe
          })
        })
      } as unknown as MockRxDBShape['entityManager']
    });
    connector.init(rxdb, entity => (entity === BranchEntity ? { name: 'RxDBBranch' } : undefined));
    postMessageSpy.mockClear();

    dispatchCommand('GET_BRANCHES', null);

    expect(postedMessages(postMessageSpy, 'BRANCHES')[0]?.payload).toEqual([
      { id: 'main', activated: true },
      { id: '', activated: false },
      { id: '', activated: false },
      { id: '', activated: false }
    ]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('MUST post empty BRANCHES when branch Observable errors asynchronously', async () => {
    class BranchEntity {}
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((observer: { next: (value: unknown[]) => void; error: (error: unknown) => void }) => {
      queueMicrotask(() => observer.error('branch boom'));
      return { unsubscribe };
    });
    const rxdb = createMockRxDB({
      config: { entities: [BranchEntity] },
      entityManager: {
        getRepository: () => ({
          find: () => ({
            pipe: () => ({}),
            subscribe
          })
        })
      } as unknown as MockRxDBShape['entityManager']
    });
    connector.init(rxdb, entity => (entity === BranchEntity ? { name: 'RxDBBranch' } : undefined));
    postMessageSpy.mockClear();

    dispatchCommand('GET_BRANCHES', null);

    await vi.waitFor(() => {
      expect(postedMessages(postMessageSpy, 'BRANCHES')[0]?.payload).toEqual([]);
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('MUST post empty BRANCHES when find throws synchronously', () => {
    class BranchEntity {}
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rxdb = createMockRxDB({
      config: { entities: [BranchEntity] },
      entityManager: {
        getRepository: () => ({
          find: () => {
            throw 'sync branch error';
          }
        })
      }
    });
    connector.init(rxdb, entity => (entity === BranchEntity ? { name: 'RxDBBranch' } : undefined));
    postMessageSpy.mockClear();

    dispatchCommand('GET_BRANCHES', null);

    expect(postedMessages(postMessageSpy, 'BRANCHES')[0]?.payload).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('MUST run branch ops through versionManager and refresh branches afterwards', async () => {
    class BranchEntity {}
    const switchBranch = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const createBranch = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('create failed'));
    const removeBranch = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const branchRows = [{ id: 'main', activated: true }];
    const subscribe = vi.fn((callback: (branches: unknown[]) => void) => {
      callback(branchRows);
      return { unsubscribe: vi.fn() };
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rxdb = createMockRxDB({
      config: { entities: [BranchEntity] },
      entityManager: { getRepository: () => ({ find: () => ({ subscribe }) }) },
      versionManager: { switchBranch, createBranch, removeBranch }
    });
    connector.init(rxdb, entity => (entity === BranchEntity ? { name: 'RxDBBranch' } : undefined));

    postMessageSpy.mockClear();
    dispatchCommand('SWITCH_BRANCH', 'feature');
    await vi.waitFor(() => expect(switchBranch).toHaveBeenCalledWith('feature'));
    await vi.waitFor(() => expect(postedMessages(postMessageSpy, 'BRANCHES').length).toBeGreaterThan(0));

    postMessageSpy.mockClear();
    dispatchCommand('CREATE_BRANCH', 'feature-2');
    await vi.waitFor(() => expect(createBranch).toHaveBeenCalledWith('feature-2'));
    await vi.waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    await vi.waitFor(() => expect(postedMessages(postMessageSpy, 'BRANCHES').length).toBeGreaterThan(0));

    postMessageSpy.mockClear();
    dispatchCommand('DELETE_BRANCH', 'feature-2');
    await vi.waitFor(() => expect(removeBranch).toHaveBeenCalledWith('feature-2'));
    await vi.waitFor(() => expect(postedMessages(postMessageSpy, 'BRANCHES').length).toBeGreaterThan(0));
  });

  it('MUST refresh branches on SWITCH_BRANCH_COMMIT and on removes that touch the branch entity', () => {
    class BranchEntity {}
    const subscribe = vi.fn((callback: (branches: unknown[]) => void) => {
      callback([{ id: 'main', activated: true }]);
      return { unsubscribe: vi.fn() };
    });
    const rxdb = createMockRxDB({
      config: { entities: [BranchEntity] },
      entityManager: { getRepository: () => ({ find: () => ({ subscribe }) }) }
    });
    connector.init(rxdb, entity => (entity === BranchEntity ? { name: 'RxDBBranch' } : undefined));
    dispatchCommand('HANDSHAKE_ACK', null);
    postMessageSpy.mockClear();

    rxdb.emit('SWITCH_BRANCH_COMMIT', { type: 'SWITCH_BRANCH_COMMIT' });
    rxdb.emit('ENTITY_LOCAL_REMOVE', {
      type: 'ENTITY_LOCAL_REMOVE',
      entities: [{ entity: 'RxDBBranch', ids: ['feature-1'] }]
    });
    rxdb.emit('ENTITY_REMOTE_REMOVE', {
      type: 'ENTITY_REMOTE_REMOVE',
      entities: [
        { entity: 'Todo', ids: ['t-1'] },
        { entity: 'RxDBBranch', ids: ['feature-2'] }
      ]
    });

    expect(postedMessages(postMessageSpy, 'BRANCHES')).toHaveLength(3);
  });

  it.each([
    ['空 entities 列表', []],
    ['与分支无关的实体', [{ entity: 'Todo', ids: ['t-1'] }]],
    ['同名但别的 namespace', [{ entity: 'RxDBBranch', namespace: 'tenant-b', ids: ['x'] }]],
    ['形状不合预期的元素', ['not-a-record', null, { ids: ['t-1'] }]]
  ])('MUST NOT refresh branches when a remove event carries %s', (_label, entities) => {
    class BranchEntity {}
    const find = vi.fn(() => ({ subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) }));
    const rxdb = createMockRxDB({
      config: { entities: [BranchEntity] },
      entityManager: { getRepository: () => ({ find }) }
    });
    connector.init(rxdb, entity => (entity === BranchEntity ? { name: 'RxDBBranch' } : undefined));
    dispatchCommand('HANDSHAKE_ACK', null);
    find.mockClear();
    postMessageSpy.mockClear();

    // 任意实体删一行就重查分支表，是把 devtools 变成 O(删除次数) 的放大器：
    // 批量删 1000 行 Todo 会打出 1000 次分支查询，且每次都推一条 BRANCHES。
    rxdb.emit('ENTITY_LOCAL_REMOVE', { type: 'ENTITY_LOCAL_REMOVE', entities });
    rxdb.emit('ENTITY_REMOTE_REMOVE', { type: 'ENTITY_REMOTE_REMOVE', entities });

    expect(find).not.toHaveBeenCalled();
    expect(postedMessages(postMessageSpy, 'BRANCHES')).toHaveLength(0);
  });

  it('MUST NOT refresh branches when no branch entity is registered at all', () => {
    class TodoEntity {}
    const find = vi.fn(() => ({ subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) }));
    const rxdb = createMockRxDB({
      config: { entities: [TodoEntity] },
      entityManager: { getRepository: () => ({ find }) }
    });
    connector.init(rxdb, entity => (entity === TodoEntity ? { name: 'Todo' } : undefined));
    dispatchCommand('HANDSHAKE_ACK', null);
    find.mockClear();
    postMessageSpy.mockClear();

    rxdb.emit('ENTITY_LOCAL_REMOVE', {
      type: 'ENTITY_LOCAL_REMOVE',
      entities: [{ entity: 'RxDBBranch', ids: ['feature-1'] }]
    });

    expect(find).not.toHaveBeenCalled();
    expect(postedMessages(postMessageSpy, 'BRANCHES')).toHaveLength(0);
  });

  it('MUST leave non-entity event payloads unmasked', () => {
    class SecretEntity {}
    const rxdb = createMockRxDB({ config: { entities: [SecretEntity] } });
    connector.init(rxdb, entity =>
      entity === SecretEntity ? { name: 'Secret', encryptedPropertyMap: new Map([['ssn', true]]) } : undefined
    );
    dispatchCommand('HANDSHAKE_ACK', null);
    postMessageSpy.mockClear();

    rxdb.emit('SYNC_COMPLETE', {
      type: 'SYNC_COMPLETE',
      entities: 'not-an-array',
      note: 'ok'
    });
    rxdb.emit('ENTITY_LOCAL_UPDATE', {
      type: 'ENTITY_LOCAL_UPDATE',
      entities: [{ entity: 'Other', patch: { ssn: 'plain' } }, 'skip-me', { entity: 'Secret' }]
    });

    const events = postedMessages(postMessageSpy, 'EVENT');
    expect(events).toHaveLength(2);
    expect((events[0]?.payload as { data: Record<string, unknown> }).data.entities).toBe('not-an-array');
    expect((events[1]?.payload as { data: { entities: unknown[] } }).data.entities).toEqual([
      { entity: 'Other', patch: { ssn: 'plain' } },
      'skip-me',
      { entity: 'Secret' }
    ]);
  });

  it('MUST NOT postMessage ENTITY_DATA when an in-flight query Observable resolves after disconnect()', () => {
    class UserEntity {}
    const unsubscribe = vi.fn();
    let deliver: ((docs: unknown[]) => void) | undefined;
    const find = vi.fn(() => ({
      subscribe: (callback: (docs: unknown[]) => void) => {
        deliver = callback;
        return { unsubscribe };
      }
    }));
    const rxdb = createMockRxDB({
      config: { entities: [UserEntity] },
      entityManager: { getRepository: () => ({ find }) }
    });
    connector.init(rxdb, entity => (entity === UserEntity ? { name: 'User' } : undefined));
    dispatchCommand('QUERY_ENTITY', { entityName: 'User' });
    expect(deliver).toBeTypeOf('function');
    postMessageSpy.mockClear();

    connector.disconnect();
    deliver?.([{ id: '1' }]);

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(postedMessages(postMessageSpy, 'ENTITY_DATA')).toHaveLength(0);
  });

  it('MUST cancel a hung QUERY_ENTITY subscription and reply with a timeout error once the timeout elapses', () => {
    class UserEntity {}
    vi.useFakeTimers();
    try {
      const unsubscribe = vi.fn();
      const find = vi.fn(() => ({ subscribe: vi.fn(() => ({ unsubscribe })) }));
      const rxdb = createMockRxDB({
        config: { entities: [UserEntity] },
        entityManager: { getRepository: () => ({ find }) }
      });
      connector.init(rxdb, entity => (entity === UserEntity ? { name: 'User' } : undefined));
      postMessageSpy.mockClear();

      dispatchCommand('QUERY_ENTITY', { entityName: 'User' });
      expect(postedMessages(postMessageSpy, 'ENTITY_DATA')).toHaveLength(0);

      vi.advanceTimersByTime(10_000);

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      const responses = postedMessages(postMessageSpy, 'ENTITY_DATA');
      expect(responses).toHaveLength(1);
      const payload = responses[0]?.payload as { entityName: string; error: string; data: unknown[] };
      expect(payload).toMatchObject({ entityName: 'User', data: [] });
      expect(payload.error).toMatch(/timed out/i);
    } finally {
      vi.useRealTimers();
    }
  });

  // RDT-019：timer 在 subscribe() 之前就建好了。若 subscribe() 同步抛错，
  // 这个 timer 既没人清、也没人 settle —— 定时器泄漏，且调用方要等满超时才收到一个
  // 误导性的 "timed out"，而真实原因（subscribe 抛的那个错）被完全吞掉。
  it('MUST report the synchronous subscribe failure and clear the pending timeout', () => {
    class UserEntity {}
    vi.useFakeTimers();
    try {
      const find = vi.fn(() => ({
        subscribe: vi.fn(() => {
          throw new Error('subscribe exploded');
        })
      }));
      const rxdb = createMockRxDB({
        config: { entities: [UserEntity] },
        entityManager: { getRepository: () => ({ find }) }
      });
      connector.init(rxdb, entity => (entity === UserEntity ? { name: 'User' } : undefined));
      postMessageSpy.mockClear();

      dispatchCommand('QUERY_ENTITY', { entityName: 'User' });

      // 必须立刻回报真实错误，而不是等超时
      const immediate = postedMessages(postMessageSpy, 'ENTITY_DATA');
      expect(immediate).toHaveLength(1);
      expect((immediate[0]?.payload as { error: string }).error).toMatch(/subscribe exploded/i);

      // 且 timer 已被清掉：推进到超时之后不得再冒出第二条
      postMessageSpy.mockClear();
      vi.advanceTimersByTime(10_000);
      expect(postedMessages(postMessageSpy, 'ENTITY_DATA')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('MUST NOT query or broadcast branches for commit/remove events while not connected', () => {
    class BranchEntity {}
    const find = vi.fn(() => ({ subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) }));
    const rxdb = createMockRxDB({
      config: { entities: [BranchEntity] },
      entityManager: { getRepository: () => ({ find }) }
    });
    connector.init(rxdb, entity => (entity === BranchEntity ? { name: 'RxDBBranch' } : undefined));
    postMessageSpy.mockClear();

    rxdb.emit('ENTITY_LOCAL_REMOVE', {
      type: 'ENTITY_LOCAL_REMOVE',
      entities: [{ entity: 'RxDBBranch', ids: ['feature-1'] }]
    });
    rxdb.emit('SWITCH_BRANCH_COMMIT', { type: 'SWITCH_BRANCH_COMMIT' });
    rxdb.emit('ENTITY_REMOTE_REMOVE', {
      type: 'ENTITY_REMOTE_REMOVE',
      entities: [{ entity: 'RxDBBranch', ids: ['feature-2'] }]
    });

    expect(find).not.toHaveBeenCalled();
    expect(postedMessages(postMessageSpy, 'BRANCHES')).toHaveLength(0);
  });

  it('MUST NOT start a second branch query while one is already in flight', async () => {
    class BranchEntity {}
    const find = vi.fn(() => ({
      subscribe: (callback: (branches: unknown[]) => void) => {
        const unsubscribe = vi.fn();
        queueMicrotask(() => callback([{ id: 'main', activated: true }]));
        return { unsubscribe };
      }
    }));
    const rxdb = createMockRxDB({
      config: { entities: [BranchEntity] },
      entityManager: { getRepository: () => ({ find }) }
    });
    connector.init(rxdb, entity => (entity === BranchEntity ? { name: 'RxDBBranch' } : undefined));
    dispatchCommand('HANDSHAKE_ACK', null);
    postMessageSpy.mockClear();
    find.mockClear();

    rxdb.emit('ENTITY_LOCAL_REMOVE', {
      type: 'ENTITY_LOCAL_REMOVE',
      entities: [{ entity: 'RxDBBranch', ids: ['feature-1'] }]
    });
    rxdb.emit('ENTITY_REMOTE_REMOVE', {
      type: 'ENTITY_REMOTE_REMOVE',
      entities: [{ entity: 'RxDBBranch', ids: ['feature-2'] }]
    });

    expect(find).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => expect(postedMessages(postMessageSpy, 'BRANCHES').length).toBeGreaterThan(0));
    expect(find).toHaveBeenCalledTimes(1);
  });

  describe('capability tiers', () => {
    class BranchEntity {}
    const branchMetadata: GetEntityMetadata = entity => (entity === BranchEntity ? { name: 'RxDBBranch' } : undefined);

    function initWith(capabilities: 'none' | 'readonly' | 'full'): {
      rxdb: MockRxDB;
      switchBranch: ReturnType<typeof vi.fn>;
    } {
      const switchBranch = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined);
      const rxdb = createMockRxDB({
        config: { entities: [BranchEntity] },
        // 分支仓库必须**真的推一次值**：夹具默认的 find 返回一个永不回调的订阅，
        // 用它测「只读档能回 GET_BRANCHES」等于在测夹具的惰性，命令被丢弃也一样是空数组。
        entityManager: {
          getRepository: () => ({
            find: () => ({
              subscribe: (next: (branches: unknown[]) => void) => {
                next([{ id: 'main', activated: true }]);
                return { unsubscribe: () => undefined };
              }
            })
          })
        },
        versionManager: {
          switchBranch,
          createBranch: () => Promise.resolve(),
          removeBranch: () => Promise.resolve()
        }
      });
      const scoped = createConnector({ capabilities });
      scoped.init(rxdb, branchMetadata);
      postMessageSpy.mockClear();
      return { rxdb, switchBranch };
    }

    it('MUST default to the full tier and announce it in the handshake', () => {
      const rxdb = createMockRxDB();
      connector.init(rxdb);

      expect(connector.capabilities).toBe('full');
      const handshake = postedMessages(postMessageSpy, 'HANDSHAKE')[0];
      expect(handshake?.payload).toEqual({ protocolVersion: 2, capabilities: 'full' });
    });

    it.each(['none', 'readonly', 'full'] as const)('MUST announce the configured %s tier', capabilities => {
      const scoped = createConnector({ capabilities });
      scoped.init(createMockRxDB());

      expect(scoped.capabilities).toBe(capabilities);
      expect(postedMessages(postMessageSpy, 'HANDSHAKE')[0]?.payload).toEqual({ protocolVersion: 2, capabilities });
    });

    it('MUST answer readonly commands at the readonly tier', () => {
      initWith('readonly');

      inspectDb();
      dispatchCommand('GET_BRANCHES', null);

      expect(postedMessages(postMessageSpy, 'DB_INFO')).toHaveLength(1);
      expect(postedMessages(postMessageSpy, 'BRANCHES')).toHaveLength(1);
    });

    it.each([
      ['SWITCH_BRANCH', 'feature-1'],
      ['CREATE_BRANCH', 'feature-2'],
      ['DELETE_BRANCH', 'feature-3']
    ])('MUST silently drop the mutating command %s at the readonly tier', async (type, payload) => {
      const { switchBranch } = initWith('readonly');

      dispatchCommand(type, payload);
      await Promise.resolve();

      expect(switchBranch).not.toHaveBeenCalled();
      // 静默丢弃而非回错：回错等于给伪造方一个"这条命令存在"的存在性探针，
      // 也会让面板把权限问题误报成运行时故障。
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('MUST silently drop DISCONNECT_RXDB at the readonly tier', async () => {
      const { rxdb } = initWith('readonly');

      dispatchCommand('DISCONNECT_RXDB', { requestId: 'request-1' });
      await Promise.resolve();

      expect(rxdb.disconnectAll).not.toHaveBeenCalled();
      expect(postedMessages(postMessageSpy, 'DISCONNECT_RXDB_RESULT')).toHaveLength(0);
    });

    it('MUST drop readonly commands at the none tier while keeping the transport alive', () => {
      initWith('none');

      inspectDb();
      dispatchCommand('QUERY_ENTITY', { entityName: 'RxDBBranch' });
      dispatchCommand('GET_BRANCHES', null);

      expect(postMessageSpy).not.toHaveBeenCalled();

      // 传输层命令（握手 / 缓冲 / 断连）不受能力档影响，否则 none 档等于连不上。
      dispatchCommand('PING', null);
      expect(postedMessages(postMessageSpy, 'HANDSHAKE')).toHaveLength(1);
    });

    it('MUST NOT subscribe, buffer or flush any event at the none tier', () => {
      // 本用例先前断言的正是 US-904 阶段 B AC#9 明令禁止的行为：`none` 档曾照常订阅并写 buffer，
      // 一条 `HANDSHAKE_ACK` 就把它们整批冲出去。US-904 已预先授权——`none` 档零泄漏
      // 属安全收敛，不受「用户可见行为不变」约束——所以这里改的是判据本身，
      // 而不是给 AC#9 加一个把旧行为保留下来的 opt-in 开关。
      const { rxdb } = initWith('none');
      rxdb.emit('SYNC_BEGIN', { type: 'SYNC_BEGIN' });

      dispatchCommand('HANDSHAKE_ACK', null);

      expect(postedMessages(postMessageSpy, 'EVENT')).toHaveLength(0);
      // 拒绝必须发生在订阅处而不是出站处：只在出站拦截的话事件仍会进 buffer，
      // 「没有 EVENT 帧」就只是暂时的。
      expect(listenerCount(rxdb)).toBe(0);
    });

    it('MUST drop data commands that arrive on the window bus instead of the private port', () => {
      initWith('full');
      const handler = getMessageHandler(addEventSpy);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      postMessageSpy.mockClear();

      handler({
        source: window,
        origin: location.origin,
        data: {
          source: RXDB_DEVTOOLS_MESSAGE,
          direction: 'devtools-to-page',
          type: 'INSPECT_DB',
          payload: null,
          timestamp: Date.now(),
          sequence: 1
        }
      } as unknown as MessageEvent);

      expect(postedMessages(postMessageSpy, 'DB_INFO')).toHaveLength(0);
    });
  });

  describe('concurrent disconnect', () => {
    it('MUST share a single in-flight disconnect across overlapping callers', async () => {
      let resolveDisconnect: (() => void) | undefined;
      const disconnectAll = vi
        .fn<() => Promise<void>>()
        .mockImplementation(() => new Promise<void>(resolve => (resolveDisconnect = resolve)));
      const rxdb = createMockRxDB({ disconnectAll });
      connector.init(rxdb);
      const helper = getGlobalHelper();
      if (!helper) throw new Error('global helper not registered');
      postMessageSpy.mockClear();

      const first = helper.disconnectRxdb(5000);
      dispatchCommand('DISCONNECT_RXDB', { requestId: 'request-1' });
      dispatchCommand('DISCONNECT_RXDB', { requestId: 'request-2' });
      const second = helper.disconnectRxdb(5000);

      // 并发的断开请求必须复用同一次 disconnectAll：四路各调一次会让适配器
      // 在关闭中途再收到关闭命令，wa-sqlite 一侧表现为 worker 已 terminate 后
      // 仍被 postMessage，抛的是与断开无关的诊断噪声。
      await vi.waitFor(() => expect(disconnectAll).toHaveBeenCalled());
      expect(disconnectAll).toHaveBeenCalledTimes(1);

      resolveDisconnect?.();
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(firstResult).toEqual({ success: true, error: null, status: 'graceful' });
      expect(secondResult).toEqual(firstResult);

      // 每个 requestId 仍各回一条：合流的是执行，不是应答。
      await vi.waitFor(() => expect(postedMessages(postMessageSpy, 'DISCONNECT_RXDB_RESULT')).toHaveLength(2));
      expect(
        postedMessages(postMessageSpy, 'DISCONNECT_RXDB_RESULT').map(
          message => (message.payload as { requestId: string }).requestId
        )
      ).toEqual(['request-1', 'request-2']);
    });

    it('MUST release the latch after a failed disconnect so an explicit retry runs again', async () => {
      const disconnectAll = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('disconnect rejected'))
        .mockResolvedValueOnce(undefined);
      const rxdb = createMockRxDB({ disconnectAll });
      connector.init(rxdb);
      const helper = getGlobalHelper();
      if (!helper) throw new Error('global helper not registered');

      const [a, b] = await Promise.all([helper.disconnectRxdb(5000), helper.disconnectRxdb(5000)]);

      expect(a).toEqual({ success: false, error: 'disconnect rejected', status: 'failed' });
      expect(b).toEqual(a);
      expect(disconnectAll).toHaveBeenCalledTimes(1);

      // 闩锁只覆盖"这一次"断开。失败时实例与监听按约定保留，重试必须真的重跑，
      // 否则第一次失败会把连接器永久钉死在失败态。
      const retry = await helper.disconnectRxdb(5000);

      expect(retry).toEqual({ success: true, error: null, status: 'graceful' });
      expect(disconnectAll).toHaveBeenCalledTimes(2);
    });

    it('MUST short-circuit to not-connected once the instance is gone', async () => {
      const disconnectAll = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const rxdb = createMockRxDB({ disconnectAll });
      connector.init(rxdb);
      const helper = getGlobalHelper();
      if (!helper) throw new Error('global helper not registered');

      expect(await helper.disconnectRxdb(5000)).toEqual({ success: true, error: null, status: 'graceful' });
      expect(await helper.disconnectRxdb(5000)).toEqual({ success: true, error: null, status: 'not-connected' });
      expect(disconnectAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('opaque origin', () => {
    const originalOrigin = location.origin;

    function setOrigin(value: string): void {
      Object.defineProperty(location, 'origin', { value, configurable: true });
    }

    afterEach(() => {
      setOrigin(originalOrigin);
    });

    it('MUST disable itself and warn once when the document has an opaque origin', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      setOrigin('null');
      const scoped = createConnector({});

      scoped.init(createMockRxDB());

      // targetOrigin 传 'null' 时 postMessage 静默失败：一条消息都到不了面板，
      // 却没有任何诊断信号。宁可显式停用并说清楚原因。
      expect(scoped.enabled).toBe(false);
      expect(postMessageSpy).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('MUST broadcast with a wildcard target only when opaque origin is explicitly allowed', () => {
      setOrigin('null');
      const scoped = createConnector({ allowOpaqueOrigin: true });

      scoped.init(createMockRxDB());

      expect(scoped.enabled).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'HANDSHAKE' }), '*', [
        expect.anything()
      ]);
    });

    it('MUST target the exact origin on a normal document', () => {
      connector.init(createMockRxDB());

      // 广播用 '*' 会把握手（连同私有端口）交给任意跨域 iframe。
      expect(postMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'HANDSHAKE' }), location.origin, [
        expect.anything()
      ]);
      expect(postMessageSpy).not.toHaveBeenCalledWith(expect.anything(), '*', expect.anything());
    });
  });
});
