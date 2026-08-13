import { SQLiteChangeType } from '@aiao/rxdb-adapter-sqlite-core';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterDesktopError } from '../desktop-error.js';
import {
  DESKTOP_HOST_MAX_BINDINGS,
  DESKTOP_HOST_MAX_BLOB_BYTES,
  DESKTOP_HOST_MAX_SQL_LENGTH,
  DESKTOP_HOST_PROTOCOL_VERSION,
  parseDesktopHostChangeEvent,
  parseDesktopHostRequest
} from '../desktop-host-protocol.js';

const sessionId = '7f1d2c3b-4a59-4e6f-8b0d-1e2f3a4b5c6d';

const openRequest = { kind: 'open', storage: { engine: 'sqlite', databaseName: 'app.sqlite3' } };
const executeRequest = { kind: 'execute', sessionId, sql: 'SELECT 1', bindings: [] };

describe('parseDesktopHostRequest', () => {
  it('accepts a well formed open request', () => {
    expect(parseDesktopHostRequest(openRequest)).toEqual(openRequest);
  });

  it.each([
    ['execute', executeRequest],
    ['version', { kind: 'version', sessionId }],
    ['close', { kind: 'close', sessionId }]
  ])('accepts a well formed %s request', (_label, request) => {
    expect(parseDesktopHostRequest(request)).toEqual(request);
  });

  it('accepts every SQLiteCompatibleType binding', () => {
    const bindings = [1, 'a', 9007199254740993n, new Uint8Array([1, 2]), [3, 4], null];
    const parsed = parseDesktopHostRequest({ ...executeRequest, bindings });
    expect(parsed).toEqual({ ...executeRequest, bindings });
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
    ['undefined', undefined],
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

describe('DESKTOP_HOST_PROTOCOL_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(DESKTOP_HOST_PROTOCOL_VERSION)).toBe(true);
    expect(DESKTOP_HOST_PROTOCOL_VERSION).toBeGreaterThan(0);
  });
});
