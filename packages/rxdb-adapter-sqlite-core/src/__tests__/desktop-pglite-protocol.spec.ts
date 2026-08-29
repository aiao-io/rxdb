/**
 * PGlite 桌面线协议（US-208 AC#2 / #6 / #11）。
 *
 * @remarks
 * 这套断言的重点不是「字段读对了」，而是三条只能在协议层保证的性质：
 * 1. `pg.*` 与 `file.*` / SQLite 两族解析器**互不接受**对方的 kind（否则一条请求会被
 *    当成另一族的默认分支执行）；
 * 2. `pg.handshake` 之前不碰任何有副作用的字段，版本不匹配时目录不会被创建（AC#11）；
 * 3. 事务 ID 必须是 host 签发的 UUID，缺席与显式 `null` 不是同一件事。
 */

import { describe, expect, it } from 'vitest';
import { RxDBAdapterDesktopError, isRxDBAdapterDesktopErrorCode } from '../desktop/desktop-error.js';
import { parseDesktopHostFileRequest, parseDesktopHostRequest } from '../desktop/desktop-host-protocol.js';
import {
  DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS,
  DESKTOP_PGLITE_MAX_BEGIN_TIMEOUT_MS,
  DESKTOP_PGLITE_MAX_PARAM_DEPTH,
  DESKTOP_PGLITE_PROTOCOL_VERSION,
  assertDesktopPgliteResponse,
  isDesktopPgliteRequestKind,
  parseDesktopPgliteHandshakeResult,
  parseDesktopPgliteNotifyMessage,
  parseDesktopPgliteOpenResult,
  parseDesktopPgliteRequest
} from '../desktop/desktop-pglite-protocol.js';

const SESSION = '2f1f2b8a-1c1d-4a2b-9f3c-6d5e4f3a2b1c';
const TRANSACTION = 'a0b1c2d3-e4f5-4a6b-8c9d-0e1f2a3b4c5d';

const openRequest = { kind: 'pg.open', storage: { engine: 'pglite', dataDirectoryName: 'app-pgdata' } };

describe('desktop pglite protocol', () => {
  describe('请求解析', () => {
    it('握手不读任何字段，renderer 多塞的东西一概进不来', () => {
      expect(parseDesktopPgliteRequest({ kind: 'pg.handshake', dataDirectoryName: '../escape' })).toEqual({
        kind: 'pg.handshake'
      });
    });

    it('pg.open 只承载 data directory 形状，SQLite 单文件被按引擎拒绝', () => {
      expect(parseDesktopPgliteRequest(openRequest)).toEqual({
        kind: 'pg.open',
        storage: { engine: 'pglite', dataDirectoryName: 'app-pgdata' }
      });

      expect(() =>
        parseDesktopPgliteRequest({ kind: 'pg.open', storage: { engine: 'sqlite', databaseName: 'a.sqlite3' } })
      ).toThrowError(/^\[unsupported_runtime_engine\]/);
    });

    it('目录名沿用逻辑名白名单，路径穿越进不来', () => {
      expect(() =>
        parseDesktopPgliteRequest({ kind: 'pg.open', storage: { engine: 'pglite', dataDirectoryName: '../escape' } })
      ).toThrowError(/^\[invalid_database_name\]/);
    });

    it('pg.query 归一化 undefined 参数为 NULL，并保留事务 ID', () => {
      expect(
        parseDesktopPgliteRequest({
          kind: 'pg.query',
          sessionId: SESSION,
          sql: 'SELECT $1, $2',
          params: [undefined, 1n],
          transactionId: TRANSACTION
        })
      ).toEqual({
        kind: 'pg.query',
        sessionId: SESSION,
        sql: 'SELECT $1, $2',
        params: [null, 1n],
        transactionId: TRANSACTION
      });
    });

    it('事务 ID 缺席合法，显式 null 是违规', () => {
      expect(parseDesktopPgliteRequest({ kind: 'pg.query', sessionId: SESSION, sql: 'SELECT 1' })).not.toHaveProperty(
        'transactionId',
        null
      );

      expect(() =>
        parseDesktopPgliteRequest({ kind: 'pg.query', sessionId: SESSION, sql: 'SELECT 1', transactionId: null })
      ).toThrowError(/^\[protocol_violation\]/);
      expect(() =>
        parseDesktopPgliteRequest({ kind: 'pg.query', sessionId: SESSION, sql: 'SELECT 1', transactionId: 'tx-1' })
      ).toThrowError(/must be a UUID string issued by the host/);
    });

    it('接受结构化克隆能搬运的参数，拒绝搬不动的', () => {
      const params = [null, true, 1, 2n, 'x', new Date(0), new Uint8Array([1, 2]), [1, [2]], { a: { b: 1 } }];
      const parsed = parseDesktopPgliteRequest({ kind: 'pg.query', sessionId: SESSION, sql: 'SELECT 1', params });
      expect(parsed).toMatchObject({ params });

      for (const bad of [() => 1, Symbol('s'), new Map(), new Set()]) {
        expect(() =>
          parseDesktopPgliteRequest({ kind: 'pg.query', sessionId: SESSION, sql: 'SELECT 1', params: [bad] })
        ).toThrowError(/^\[protocol_violation\]/);
      }
    });

    it('嵌套参数有深度上限，自引用不会把 host 转到栈溢出', () => {
      const deep: unknown[] = [];
      let cursor = deep;
      for (let level = 0; level <= DESKTOP_PGLITE_MAX_PARAM_DEPTH + 1; level += 1) {
        const next: unknown[] = [];
        cursor.push(next);
        cursor = next;
      }

      expect(() =>
        parseDesktopPgliteRequest({ kind: 'pg.query', sessionId: SESSION, sql: 'SELECT 1', params: [deep] })
      ).toThrowError(/exceeds the maximum nesting depth/);
    });

    it('pg.exec 不收参数——多语句脚本无法绑定', () => {
      expect(
        parseDesktopPgliteRequest({ kind: 'pg.exec', sessionId: SESSION, sql: 'SELECT 1; SELECT 2', params: [1] })
      ).toEqual({ kind: 'pg.exec', sessionId: SESSION, sql: 'SELECT 1; SELECT 2' });
    });

    it('pg.begin 的超时被夹在上限内，缺省用默认值', () => {
      expect(parseDesktopPgliteRequest({ kind: 'pg.begin', sessionId: SESSION })).toEqual({
        kind: 'pg.begin',
        sessionId: SESSION,
        timeout: DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS
      });

      expect(() =>
        parseDesktopPgliteRequest({
          kind: 'pg.begin',
          sessionId: SESSION,
          timeout: DESKTOP_PGLITE_MAX_BEGIN_TIMEOUT_MS + 1
        })
      ).toThrowError(/timeout must be an integer within/);
      // 0 会把 fail-fast 变成 never-start，等价于取消了事务能力，因此不是合法档位。
      expect(() => parseDesktopPgliteRequest({ kind: 'pg.begin', sessionId: SESSION, timeout: 0 })).toThrowError(
        /timeout must be an integer within/
      );
    });

    it('commit / rollback 必须点名事务，close / version 只要会话', () => {
      expect(parseDesktopPgliteRequest({ kind: 'pg.commit', sessionId: SESSION, transactionId: TRANSACTION })).toEqual({
        kind: 'pg.commit',
        sessionId: SESSION,
        transactionId: TRANSACTION
      });
      expect(() => parseDesktopPgliteRequest({ kind: 'pg.rollback', sessionId: SESSION })).toThrowError(
        /transactionId must be a UUID/
      );
      expect(parseDesktopPgliteRequest({ kind: 'pg.close', sessionId: SESSION })).toEqual({
        kind: 'pg.close',
        sessionId: SESSION
      });
    });
  });

  describe('三族解析器互不接受对方的 kind', () => {
    it('pg.* 进不了 SQLite 与文件解析器', () => {
      // SQLite 的 dispatch 把「不是 open/close/version/handshake」的一律当 execute 跑，
      // 所以一条 `pg.query` 若能通过那个解析器，它的 sql 就会被当成 SQLite 语句执行。
      expect(() => parseDesktopHostRequest({ kind: 'pg.query', sessionId: SESSION, sql: 'SELECT 1' })).toThrowError(
        /unknown request kind pg\.query/
      );
      expect(() => parseDesktopHostFileRequest({ kind: 'pg.query', sessionId: SESSION })).toThrowError(
        /unknown file request kind pg\.query/
      );
    });

    it('SQLite 与文件的 kind 也进不了 pg 解析器', () => {
      for (const kind of ['handshake', 'open', 'execute', 'version', 'close', 'file.open', 'file.read']) {
        expect(isDesktopPgliteRequestKind(kind)).toBe(false);
        expect(() => parseDesktopPgliteRequest({ kind, sessionId: SESSION, sql: 'SELECT 1' })).toThrowError(
          /unknown pglite request kind/
        );
      }
    });

    it('isDesktopPgliteRequestKind 认得全部 pg.* 请求', () => {
      const kinds = [
        'pg.handshake',
        'pg.open',
        'pg.query',
        'pg.exec',
        'pg.begin',
        'pg.commit',
        'pg.rollback',
        'pg.version',
        'pg.close'
      ];
      for (const kind of kinds) expect(isDesktopPgliteRequestKind(kind)).toBe(true);
      expect(isDesktopPgliteRequestKind('pg.notify')).toBe(false);
    });
  });

  describe('应答与推送', () => {
    it('握手在任何副作用之前核对版本', () => {
      expect(parseDesktopPgliteHandshakeResult({ protocolVersion: DESKTOP_PGLITE_PROTOCOL_VERSION })).toEqual({
        protocolVersion: DESKTOP_PGLITE_PROTOCOL_VERSION
      });
      expect(() => parseDesktopPgliteHandshakeResult({ protocolVersion: 99 })).toThrowError(
        /host speaks pglite protocol 99 but this client speaks 1/
      );
    });

    it('open 应答带第二道版本核对与逻辑位置', () => {
      expect(
        parseDesktopPgliteOpenResult({
          sessionId: SESSION,
          resolvedLocation: 'userData/pgdata/app-pgdata',
          protocolVersion: DESKTOP_PGLITE_PROTOCOL_VERSION
        })
      ).toEqual({
        sessionId: SESSION,
        resolvedLocation: 'userData/pgdata/app-pgdata',
        protocolVersion: DESKTOP_PGLITE_PROTOCOL_VERSION
      });

      expect(() =>
        parseDesktopPgliteOpenResult({ sessionId: SESSION, resolvedLocation: 1, protocolVersion: 1 })
      ).toThrowError(/resolvedLocation must be a string/);
    });

    it('错误应答还原成本地异常，未知错误码按协议违规处理', () => {
      expect(() =>
        assertDesktopPgliteResponse('pg.query', { kind: 'error', code: 'transaction_not_found', message: 'gone' })
      ).toThrowError(RxDBAdapterDesktopError);
      expect(() =>
        assertDesktopPgliteResponse('pg.query', { kind: 'error', code: 'made_up', message: 'x' })
      ).toThrowError(/^\[protocol_violation\]/);
      expect(() => assertDesktopPgliteResponse('pg.query', { kind: 'pg.exec', result: [] })).toThrowError(
        /expected a pg\.query response but the host answered pg\.exec/
      );
    });

    it('两个新错误码都在契约内，能跨 IPC 活着回来', () => {
      expect(isRxDBAdapterDesktopErrorCode('transaction_not_found')).toBe(true);
      expect(isRxDBAdapterDesktopErrorCode('transaction_unavailable')).toBe(true);
    });

    it('推送的是裸 NOTIFY，批量与去重留在渲染进程', () => {
      expect(
        parseDesktopPgliteNotifyMessage({
          kind: 'pg.notify',
          sessionId: SESSION,
          channel: 'public$Todo_notify',
          payload: '{"operation":1,"ids":["a"]}'
        })
      ).toEqual({ sessionId: SESSION, channel: 'public$Todo_notify', payload: '{"operation":1,"ids":["a"]}' });

      expect(() =>
        parseDesktopPgliteNotifyMessage({ kind: 'pg.notify', sessionId: SESSION, channel: 1, payload: 'x' })
      ).toThrowError(/channel and payload must be strings/);
      expect(() =>
        parseDesktopPgliteNotifyMessage({ kind: 'change', sessionId: SESSION, channel: 'c', payload: 'p' })
      ).toThrowError(/expected a pg\.notify message/);
    });
  });
});
