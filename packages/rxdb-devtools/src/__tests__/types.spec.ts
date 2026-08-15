import { describe, expect, it } from 'vitest';
import {
    createMessage,
    isDevToolsMessage,
    RXDB_DEVTOOLS_MESSAGE,
    type AnyDevToolsMessage,
    type SerializedEvent
} from '../types.js';

const VALID_ENVELOPE = {
  source: RXDB_DEVTOOLS_MESSAGE,
  direction: 'devtools-to-page',
  timestamp: 1,
  sequence: 0
} as const;

function command(type: string, payload: unknown): Record<string, unknown> {
  return { ...VALID_ENVELOPE, type, payload };
}

describe('types', () => {
  describe('RXDB_DEVTOOLS_MESSAGE', () => {
    it('MUST be @aiao/rxdb-devtools', () => {
      expect(RXDB_DEVTOOLS_MESSAGE).toBe('@aiao/rxdb-devtools');
    });
  });

  describe('isDevToolsMessage', () => {
    it('MUST return true for valid message', () => {
      const msg: AnyDevToolsMessage = {
        source: RXDB_DEVTOOLS_MESSAGE,
        direction: 'page-to-devtools',
        type: 'HANDSHAKE',
        payload: null,
        timestamp: Date.now(),
        sequence: 1
      };
      expect(isDevToolsMessage(msg)).toBe(true);
    });

    it.each([
      ['HANDSHAKE_ACK', null],
      ['PING', null],
      ['CLEAR', null],
      ['DISCONNECT', null],
      ['DISCONNECT_RXDB', { requestId: 'request-1' }],
      ['INSPECT_DB', null],
      ['QUERY_ENTITY', { entityName: 'User' }],
      ['QUERY_ENTITY', { entityName: 'User', limit: 1 }],
      ['QUERY_ENTITY', { entityName: 'User', limit: 1000 }],
      ['GET_BRANCHES', null],
      ['SWITCH_BRANCH', 'main'],
      ['CREATE_BRANCH', 'feature'],
      ['DELETE_BRANCH', 'feature']
    ])('MUST accept valid %s command payload', (type, payload) => {
      expect(isDevToolsMessage(command(type, payload))).toBe(true);
    });

    it('MUST accept a valid optional tabId', () => {
      expect(isDevToolsMessage({ ...command('PING', null), tabId: 1 })).toBe(true);
    });

    it('MUST accept a valid optional session', () => {
      expect(isDevToolsMessage({ ...command('PING', null), session: 'tok-1' })).toBe(true);
      expect(isDevToolsMessage({ ...command('INSPECT_DB', null), session: 'tok-1' })).toBe(true);
    });

    it.each(['', '   ', 1, null])('MUST reject invalid session %#', session => {
      expect(isDevToolsMessage({ ...command('PING', null), session })).toBe(false);
    });

    it('MUST accept v2 handshake payload with sessionToken', () => {
      expect(
        isDevToolsMessage({
          source: RXDB_DEVTOOLS_MESSAGE,
          direction: 'page-to-devtools',
          type: 'HANDSHAKE',
          payload: { protocolVersion: 2, capabilities: 'full', sessionToken: 'abc' },
          timestamp: 1,
          sequence: 0
        })
      ).toBe(true);
    });

    it('MUST still accept v1 handshake payload without sessionToken', () => {
      expect(
        isDevToolsMessage({
          source: RXDB_DEVTOOLS_MESSAGE,
          direction: 'page-to-devtools',
          type: 'HANDSHAKE',
          payload: { protocolVersion: 1, capabilities: 'full' },
          timestamp: 1,
          sequence: 0
        })
      ).toBe(true);
    });

    it.each([
      ['HANDSHAKE', null],
      ['DB_INFO', null],
      ['DB_INFO', { version: '1.0.0', dbName: 'app', capabilities: 'full', entities: [] }],
      [
        'DB_INFO',
        {
          version: '1.0.0',
          dbName: 'app',
          capabilities: 'readonly',
          entities: [{ name: 'User', namespace: 'public', encryptedFields: ['ssn'] }]
        }
      ],
      ['ENTITY_DATA', { entityName: 'User', error: null, data: [{ id: 'u-1' }] }],
      ['ENTITY_DATA', { entityName: 'User', namespace: 'alpha', error: null, data: [{ id: 'u-1' }] }],
      ['ENTITY_DATA', { entityName: 'User', error: '实体 User 不存在', data: [] }],
      ['ENTITY_DATA', { entityName: 'User', error: null, data: [], _meta: { encryptedFields: ['ssn'] } }],
      [
        'ENTITY_DATA',
        { entityName: 'User', error: 'keyring is locked', data: [], _meta: { errorCode: 'KEYRING_LOCKED' } }
      ],
      ['ENTITY_DATA', { entityName: 'User', error: null, data: [] }],
      ['BRANCHES', []]
    ])('MUST accept valid outbound %s payload', (type, payload) => {
      expect(isDevToolsMessage({ ...VALID_ENVELOPE, direction: 'page-to-devtools', type, payload })).toBe(true);
    });

    // 只有 `failed` 允许（且要求）带 error；其余三态必须是 success + error: null。
    // 旧夹具把 `forced` 也写成带 error 的失败态 —— 语义矩阵上线后它才暴露出来。
    it.each([
      ['graceful', true, null],
      ['forced', true, null],
      ['failed', false, 'disconnect failed'],
      ['not-connected', true, null]
    ])('MUST accept truthful disconnect result status %s', (status, success, error) => {
      expect(
        isDevToolsMessage({
          ...VALID_ENVELOPE,
          direction: 'page-to-devtools',
          type: 'DISCONNECT_RXDB_RESULT',
          payload: { requestId: 'request-1', success, error, status }
        })
      ).toBe(true);
    });

    it.each([
      ['成功态却带 error', { success: true, error: 'boom', status: 'graceful' }],
      ['forced 却报失败', { success: false, error: null, status: 'forced' }],
      ['failed 却报成功', { success: true, error: 'boom', status: 'failed' }],
      ['failed 却没有 error', { success: false, error: null, status: 'failed' }],
      ['not-connected 却带 error', { success: true, error: 'boom', status: 'not-connected' }]
    ])('MUST reject self-contradictory disconnect result (%s)', (_label, partial) => {
      expect(
        isDevToolsMessage({
          ...VALID_ENVELOPE,
          direction: 'page-to-devtools',
          type: 'DISCONNECT_RXDB_RESULT',
          payload: { requestId: 'request-1', ...partial }
        })
      ).toBe(false);
    });

    it.each([
      ['error 非空却带数据', { entityName: 'User', error: 'boom', data: [{ id: 'u-1' }] }],
      ['entityName 为空', { entityName: '', error: null, data: [] }],
      ['error 是空串', { entityName: 'User', error: '', data: [] }],
      ['_meta 混入未知键', { entityName: 'User', error: null, data: [], _meta: { unknown: 1 } }],
      [
        '_meta.encryptedFields 不是字符串数组',
        { entityName: 'User', error: null, data: [], _meta: { encryptedFields: [1] } }
      ],
      ['namespace 为空', { entityName: 'User', namespace: '', error: null, data: [] }]
    ])('MUST reject self-contradictory ENTITY_DATA payload (%s)', (_label, payload) => {
      expect(
        isDevToolsMessage({ ...VALID_ENVELOPE, direction: 'page-to-devtools', type: 'ENTITY_DATA', payload })
      ).toBe(false);
    });

    it.each([
      ['缺 capabilities', { version: '1.0.0', dbName: 'app', entities: [] }],
      ['capabilities 不在枚举内', { version: '1.0.0', dbName: 'app', capabilities: 'admin', entities: [] }],
      ['多出未知键', { version: '1.0.0', dbName: 'app', capabilities: 'full', entities: [], extra: 1 }],
      [
        'entity 缺 namespace',
        { version: '1.0.0', dbName: 'app', capabilities: 'full', entities: [{ name: 'User', encryptedFields: [] }] }
      ]
    ])('MUST reject malformed DB_INFO payload (%s)', (_label, payload) => {
      expect(isDevToolsMessage({ ...VALID_ENVELOPE, direction: 'page-to-devtools', type: 'DB_INFO', payload })).toBe(
        false
      );
    });

    it.each([
      ['DISCONNECT_RXDB_RESULT', { requestId: '', success: true, error: null, status: 'graceful' }],
      ['DISCONNECT_RXDB_RESULT', { requestId: 'request-1', success: 'yes', error: null, status: 'graceful' }],
      ['DISCONNECT_RXDB_RESULT', { requestId: 'request-1', success: false, error: 1, status: 'failed' }],
      ['DISCONNECT_RXDB_RESULT', { requestId: 'request-1', success: false, error: 'failed', status: 'unknown' }],
      [
        'DISCONNECT_RXDB_RESULT',
        { requestId: 'request-1', success: true, error: null, status: 'graceful', extra: true }
      ],
      ['DB_INFO', []],
      ['ENTITY_DATA', []],
      ['BRANCHES', {}]
    ])('MUST reject malformed outbound %s payload', (type, payload) => {
      expect(isDevToolsMessage({ ...VALID_ENVELOPE, direction: 'page-to-devtools', type, payload })).toBe(false);
    });

    it.each([
      null,
      undefined,
      'string',
      42,
      true,
      {},
      { source: RXDB_DEVTOOLS_MESSAGE },
      { ...command('PING', null), direction: 'sideways' },
      { ...command('PING', null), type: 'UNKNOWN' },
      { ...VALID_ENVELOPE, type: 'PING' },
      { ...command('PING', null), timestamp: 'now' },
      { ...command('PING', null), timestamp: Number.NaN },
      { ...command('PING', null), sequence: -1 },
      { ...command('PING', null), sequence: 1.5 },
      { ...command('PING', null), tabId: 0 },
      { ...command('PING', null), tabId: '1' },
      { ...command('PING', null), unexpected: true }
    ])('MUST reject malformed message envelope %#', value => {
      expect(isDevToolsMessage(value)).toBe(false);
    });

    it.each([
      ['HANDSHAKE_ACK', {}],
      ['PING', 'ping'],
      ['CLEAR', undefined],
      ['DISCONNECT', false],
      ['DISCONNECT_RXDB', null],
      ['DISCONNECT_RXDB', { requestId: '' }],
      ['DISCONNECT_RXDB', { requestId: 'request-1', extra: true }],
      ['INSPECT_DB', {}],
      ['QUERY_ENTITY', null],
      ['QUERY_ENTITY', { entityName: '' }],
      ['QUERY_ENTITY', { entityName: 'User', limit: 0 }],
      ['QUERY_ENTITY', { entityName: 'User', limit: -1 }],
      ['QUERY_ENTITY', { entityName: 'User', limit: 1001 }],
      ['QUERY_ENTITY', { entityName: 'User', limit: 1.5 }],
      ['QUERY_ENTITY', { entityName: 'User', limit: Number.POSITIVE_INFINITY }],
      ['QUERY_ENTITY', { entityName: 'User', limit: '10' }],
      ['QUERY_ENTITY', { entityName: 'User', extra: true }],
      ['GET_BRANCHES', []],
      ['SWITCH_BRANCH', ''],
      ['CREATE_BRANCH', {}],
      ['DELETE_BRANCH', null]
    ])('MUST reject malformed %s command payload', (type, payload) => {
      expect(isDevToolsMessage(command(type, payload))).toBe(false);
    });
  });

  describe('createMessage', () => {
    it('MUST create message with all fields', () => {
      const before = Date.now();
      const msg = createMessage('HANDSHAKE', 'page-to-devtools', null, 1);

      expect(msg.source).toBe(RXDB_DEVTOOLS_MESSAGE);
      expect(msg.direction).toBe('page-to-devtools');
      expect(msg.type).toBe('HANDSHAKE');
      expect(msg.payload).toBeNull();
      expect(msg.sequence).toBe(1);
      expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    });

    it('MUST accept typed payload', () => {
      // RDT-014：payload 的类型由 `type` 推出来。这里补全 `SerializedEvent` 的五个字段
      // 不是仪式感 —— 少任何一个都编译不过（见下面的 @ts-expect-error 用例）。
      const event: SerializedEvent = {
        id: 'e1',
        eventType: 'ENTITY_LOCAL_CREATE',
        timestamp: 1,
        sequence: 5,
        data: { entityId: 'u-1' }
      };
      const msg = createMessage('EVENT', 'page-to-devtools', event, 5);
      expect(msg.payload).toEqual(event);
    });

    it('MUST reject a payload that does not match the message type', () => {
      // @ts-expect-error EVENT 的 payload 必须是完整 SerializedEvent，不能是任意对象
      createMessage('EVENT', 'page-to-devtools', { id: 'e1' }, 5);
      // @ts-expect-error HANDSHAKE 的 direction 只有 page-to-devtools
      createMessage('HANDSHAKE', 'devtools-to-page', null, 1);
      // @ts-expect-error SWITCH_BRANCH 的 payload 是 branchId 字符串，不是 null
      createMessage('SWITCH_BRANCH', 'devtools-to-page', null, 1);
      expect(true).toBe(true);
    });

    it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('MUST throw RangeError for sequence %p', sequence => {
      expect(() => createMessage('PING', 'devtools-to-page', null, sequence)).toThrow(RangeError);
    });

    it('MUST create different message types', () => {
      const handshake = createMessage('HANDSHAKE', 'page-to-devtools', null, 1);
      const ack = createMessage('HANDSHAKE_ACK', 'devtools-to-page', null, 2);
      const ping = createMessage('PING', 'devtools-to-page', null, 3);
      const clear = createMessage('CLEAR', 'devtools-to-page', null, 5);
      const disconnect = createMessage('DISCONNECT', 'page-to-devtools', null, 6);
      const disconnectRxdb = createMessage('DISCONNECT_RXDB', 'devtools-to-page', { requestId: 'req-1' }, 7);
      const disconnectRxdbResult = createMessage(
        'DISCONNECT_RXDB_RESULT',
        'page-to-devtools',
        { requestId: 'req-1', success: true, error: null, status: 'graceful' },
        8
      );

      expect(handshake.type).toBe('HANDSHAKE');
      expect(ack.type).toBe('HANDSHAKE_ACK');
      expect(ping.type).toBe('PING');
      expect(clear.type).toBe('CLEAR');
      expect(disconnect.type).toBe('DISCONNECT');
      expect(disconnectRxdb.type).toBe('DISCONNECT_RXDB');
      expect(disconnectRxdbResult.type).toBe('DISCONNECT_RXDB_RESULT');
    });

    it('MUST create a valid message recognized by isDevToolsMessage', () => {
      const msg = createMessage(
        'EVENT',
        'page-to-devtools',
        { id: 'e1', eventType: 'TEST', timestamp: 1, sequence: 1, data: {} },
        1
      );
      expect(isDevToolsMessage(msg)).toBe(true);
    });
  });
});
