import { describe, expect, it } from 'vitest';
import { RxDBAdapterDesktopError } from '../desktop/desktop-error.js';
import {
  DESKTOP_HOST_MAX_BINDINGS,
  DESKTOP_HOST_MAX_BLOB_BYTES,
  DESKTOP_HOST_MAX_SQL_LENGTH,
  DESKTOP_HOST_PROTOCOL_VERSION,
  parseDesktopHostChangeEvent,
  parseDesktopHostHandshakeResult,
  parseDesktopHostRequest
} from '../desktop/desktop-host-protocol.js';
import { SQLiteChangeType } from '../sqlite-backend.interface.js';

const sessionId = '7f1d2c3b-4a59-4e6f-8b0d-1e2f3a4b5c6d';

const openRequest = { kind: 'open', storage: { engine: 'sqlite', databaseName: 'app.sqlite3' } };
const executeRequest = { kind: 'execute', sessionId, sql: 'SELECT 1', bindings: [] };

describe('parseDesktopHostRequest', () => {
  it('accepts a well formed open request', () => {
    expect(parseDesktopHostRequest(openRequest)).toEqual(openRequest);
  });

  it.each([
    ['handshake', { kind: 'handshake' }],
    ['execute', executeRequest],
    ['version', { kind: 'version', sessionId }],
    ['close', { kind: 'close', sessionId }]
  ])('accepts a well formed %s request', (_label, request) => {
    expect(parseDesktopHostRequest(request)).toEqual(request);
  });

  // 握手是协议里唯一**无副作用**的请求：它没有会话可指、也没有存储可开。多带来的字段
  // 一律留在信任边界外，否则「无副作用」就成了一句只在正常入参下成立的话。
  it('parses a handshake without letting anything else across the boundary', () => {
    const noisy = { kind: 'handshake', sessionId, storage: { engine: 'pglite', dataDirectoryName: 'pg' } };
    expect(parseDesktopHostRequest(noisy)).toStrictEqual({ kind: 'handshake' });
  });

  it('accepts every SQLiteCompatibleType binding', () => {
    const bindings = [1, 'a', 9007199254740993n, new Uint8Array([1, 2]), [3, 4], null];
    const parsed = parseDesktopHostRequest({ ...executeRequest, bindings });
    expect(parsed).toEqual({ ...executeRequest, bindings });
  });

  // `undefined` 在既有后端里就等于 SQL NULL：wa-sqlite 的 `bind_collection` 直接跳过该位（未绑定的参数
  // 在 SQLite 里读作 NULL），oo1 的 `bindOne` 把 `undefined` 与 `null` 并到同一分支。可空外键因此会以
  // `undefined` 的形态一路走到这里，而 `node:sqlite` 不认它——归一化必须发生在信任边界上。
  it('normalizes an undefined binding to SQL NULL', () => {
    const parsed = parseDesktopHostRequest({ ...executeRequest, bindings: [1, undefined, 'x'] });
    expect(parsed).toStrictEqual({ ...executeRequest, bindings: [1, null, 'x'] });
  });

  it('defaults omitted bindings to an empty list', () => {
    const parsed = parseDesktopHostRequest({ kind: 'execute', sessionId, sql: 'SELECT 1' });
    expect(parsed).toEqual({ kind: 'execute', sessionId, sql: 'SELECT 1', bindings: [] });
  });

  // IPC 入参来自渲染进程，即便有 contextIsolation 也不可信
  it.each([
    ['null', null],
    ['a string', 'execute'],
    ['a number', 7],
    ['an array', []],
    ['an unknown kind', { kind: 'drop', sessionId }],
    ['a missing kind', { sessionId }],
    ['a prototype polluting kind', { kind: 'toString', sessionId }]
  ])('rejects %s', (_label, value) => {
    expect(() => parseDesktopHostRequest(value)).toThrowError(RxDBAdapterDesktopError);
    expect(() => parseDesktopHostRequest(value)).toThrowError(/protocol_violation/);
  });

  it.each([
    ['a non-string sessionId', { kind: 'version', sessionId: 42 }],
    ['an empty sessionId', { kind: 'version', sessionId: '' }],
    ['a non-uuid sessionId', { kind: 'version', sessionId: 'not-a-uuid' }]
  ])('rejects %s', (_label, value) => {
    expect(() => parseDesktopHostRequest(value)).toThrowError(/protocol_violation/);
  });

  it('rejects a non-string sql', () => {
    expect(() => parseDesktopHostRequest({ ...executeRequest, sql: 1 })).toThrowError(/protocol_violation/);
  });

  it('rejects sql beyond the size limit', () => {
    const sql = 'a'.repeat(DESKTOP_HOST_MAX_SQL_LENGTH + 1);
    expect(() => parseDesktopHostRequest({ ...executeRequest, sql })).toThrowError(/protocol_violation/);
  });

  it('rejects non-array bindings', () => {
    expect(() => parseDesktopHostRequest({ ...executeRequest, bindings: 'x' })).toThrowError(/protocol_violation/);
  });

  it('rejects too many bindings', () => {
    const bindings = new Array(DESKTOP_HOST_MAX_BINDINGS + 1).fill(1);
    expect(() => parseDesktopHostRequest({ ...executeRequest, bindings })).toThrowError(/protocol_violation/);
  });

  it.each([
    ['a function', () => 1],
    ['an object', { a: 1 }],
    ['a boolean', true],
    ['a symbol', Symbol('x')],
    ['a nested non-number array', ['a']]
  ])('rejects %s as a binding', (_label, binding) => {
    expect(() => parseDesktopHostRequest({ ...executeRequest, bindings: [binding] })).toThrowError(
      /protocol_violation/
    );
  });

  it('rejects a blob beyond the size limit', () => {
    const binding = new Uint8Array(DESKTOP_HOST_MAX_BLOB_BYTES + 1);
    expect(() => parseDesktopHostRequest({ ...executeRequest, bindings: [binding] })).toThrowError(
      /protocol_violation/
    );
  });

  /**
   * 数组形态的 blob 必须逐元素是字节。
   *
   * @remarks
   * host 侧的绑定路径是 `Uint8Array.from(binding)`（node-sqlite-engine.ts:109），而它对
   * 越界 / 小数 / NaN 一律**静默**按模 256 折回：`[300, -1, 1.5, NaN]` 落库成 `[44, 255, 1, 0]`。
   * 只校验 `typeof item === 'number'` 的话，一次写入就能在库里留下与调用方本意无关的字节，
   * 而且读回来还是「成功」—— 信任边界上最不该放过的那类静默改写。
   */
  it.each([
    ['out of range', [300]],
    ['negative', [-1]],
    ['fractional', [1.5]],
    ['NaN', [Number.NaN]],
    ['Infinity', [Number.POSITIVE_INFINITY]]
  ])('rejects a %s element in an array blob', (_label, binding) => {
    expect(() => parseDesktopHostRequest({ ...executeRequest, bindings: [binding] })).toThrowError(
      /protocol_violation/
    );
  });

  it('accepts the full byte range in an array blob', () => {
    const binding = [0, 1, 127, 128, 255];
    expect(parseDesktopHostRequest({ ...executeRequest, bindings: [binding] })).toEqual({
      ...executeRequest,
      bindings: [binding]
    });
  });

  // storage 是 open 请求里唯一可以影响物理落盘位置的字段
  it('rejects an open request whose database name escapes the app scope', () => {
    const request = { kind: 'open', storage: { engine: 'sqlite', databaseName: '../escape' } };
    expect(() => parseDesktopHostRequest(request)).toThrowError(/invalid_database_name/);
  });

  it('rejects an open request with an unsupported engine', () => {
    const request = { kind: 'open', storage: { engine: 'pglite', dataDirectoryName: 'pg' } };
    expect(() => parseDesktopHostRequest(request)).toThrowError(/unsupported_runtime_engine/);
  });

  it('drops fields that are not part of the contract', () => {
    const parsed = parseDesktopHostRequest({ ...executeRequest, extra: 'ignored' });
    expect(parsed).not.toHaveProperty('extra');
  });
});

describe('parseDesktopHostChangeEvent', () => {
  const event = {
    type: SQLiteChangeType.SQLITE_INSERT,
    dbName: 'main',
    tableName: 'rxdb$user',
    rowIds: [1n, 2n],
    recordAt: new Date(0)
  };

  it('accepts a well formed change event', () => {
    expect(parseDesktopHostChangeEvent(event)).toEqual(event);
  });

  it.each([
    ['null', null],
    ['an unknown change type', { ...event, type: 99 }],
    ['a non-string tableName', { ...event, tableName: 1 }],
    ['non-bigint rowIds', { ...event, rowIds: [1] }],
    ['a non-array rowIds', { ...event, rowIds: 1n }],
    ['a non-date recordAt', { ...event, recordAt: 0 }]
  ])('rejects %s', (_label, value) => {
    expect(() => parseDesktopHostChangeEvent(value)).toThrowError(/protocol_violation/);
  });
});

describe('parseDesktopHostHandshakeResult', () => {
  it('accepts a host that speaks this exact protocol version', () => {
    const result = { protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION };
    expect(parseDesktopHostHandshakeResult(result)).toStrictEqual(result);
  });

  it.each([
    ['a newer host', DESKTOP_HOST_PROTOCOL_VERSION + 1],
    ['an older host', DESKTOP_HOST_PROTOCOL_VERSION - 1],
    ['a host that reports nothing', undefined],
    ['a host that reports a string', String(DESKTOP_HOST_PROTOCOL_VERSION)]
  ])('rejects %s', (_label, protocolVersion) => {
    expect(() => parseDesktopHostHandshakeResult({ protocolVersion })).toThrowError(/protocol_violation/);
  });

  // 两个数字都要在消息里：只说「协议不匹配」的话，排查的人还得自己去两个仓位翻常量。
  it('names both versions so the mismatch is diagnosable without reading two repositories', () => {
    const skewed = DESKTOP_HOST_PROTOCOL_VERSION + 1;
    expect(() => parseDesktopHostHandshakeResult({ protocolVersion: skewed })).toThrowError(
      new RegExp(`${skewed}\\b.*\\b${DESKTOP_HOST_PROTOCOL_VERSION}\\b`)
    );
  });
});

describe('DESKTOP_HOST_PROTOCOL_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(DESKTOP_HOST_PROTOCOL_VERSION)).toBe(true);
    expect(DESKTOP_HOST_PROTOCOL_VERSION).toBeGreaterThan(0);
  });
});
