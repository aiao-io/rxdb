import { describe, expect, it } from 'vitest';
import { RxDBAdapterDesktopError } from '../desktop-error.js';
import {
  DESKTOP_HOST_MAX_FILE_CHUNK_BYTES,
  DESKTOP_HOST_MAX_PATH_LENGTH,
  DESKTOP_HOST_MAX_PATH_SEGMENT_BYTES,
  isDesktopHostFileRequestKind,
  parseDesktopHostFileRequest,
  parseDesktopHostRequest
} from '../desktop-host-protocol.js';

const sessionId = '7f1d2c3b-4a59-4e6f-8b0d-1e2f3a4b5c6d';
const writeId = '0c9e1a2b-3d4e-4f50-9a1b-2c3d4e5f6071';
const lockId = '11112222-3333-4444-5555-666677778888';

describe('parseDesktopHostFileRequest', () => {
  it.each([
    ['file.open', { kind: 'file.open' }],
    ['file.close', { kind: 'file.close', sessionId }],
    ['file.stat', { kind: 'file.stat', sessionId, path: 'docs/a.txt' }],
    ['file.list', { kind: 'file.list', sessionId, path: 'docs' }],
    ['file.mkdir', { kind: 'file.mkdir', sessionId, path: 'docs/nested' }],
    ['file.rmdir', { kind: 'file.rmdir', sessionId, path: 'docs' }],
    ['file.remove', { kind: 'file.remove', sessionId, path: 'docs/a.txt' }],
    ['file.move', { kind: 'file.move', sessionId, fromPath: 'a.txt', toPath: 'docs/b.txt' }],
    ['file.read', { kind: 'file.read', sessionId, path: 'a.txt', offset: 0, length: 1024 }],
    ['file.writeBegin', { kind: 'file.writeBegin', sessionId, path: 'a.txt' }],
    ['file.writeCommit', { kind: 'file.writeCommit', sessionId, writeId }],
    ['file.writeAbort', { kind: 'file.writeAbort', sessionId, writeId }],
    ['file.lockAcquire', { kind: 'file.lockAcquire', sessionId, name: 'rxdb-storage:files', mode: 'exclusive' }],
    ['file.lockRelease', { kind: 'file.lockRelease', sessionId, lockId }]
  ])('accepts a well formed %s request', (_label, request) => {
    expect(parseDesktopHostFileRequest(request)).toEqual(request);
  });

  it('accepts a write chunk within the frame limit', () => {
    const chunk = new Uint8Array([1, 2, 3]);
    const request = { kind: 'file.writeChunk', sessionId, writeId, chunk };

    expect(parseDesktopHostFileRequest(request)).toEqual(request);
  });

  it('treats the empty path as the storage root for directory operations', () => {
    expect(parseDesktopHostFileRequest({ kind: 'file.list', sessionId, path: '' })).toEqual({
      kind: 'file.list',
      sessionId,
      path: ''
    });
  });

  it('drops fields that are not part of the contract', () => {
    const parsed = parseDesktopHostFileRequest({ kind: 'file.stat', sessionId, path: 'a.txt', extra: 'ignored' });

    expect(parsed).not.toHaveProperty('extra');
  });

  it('rejects sqlite request kinds', () => {
    expect(() => parseDesktopHostFileRequest({ kind: 'execute', sessionId, sql: 'SELECT 1' })).toThrowError(
      RxDBAdapterDesktopError
    );
    expect(() => parseDesktopHostFileRequest({ kind: 'execute', sessionId, sql: 'SELECT 1' })).toThrowError(
      /protocol_violation/
    );
  });

  it.each([
    ['null', null],
    ['a string', 'file.stat'],
    ['an array', []],
    ['an unknown kind', { kind: 'file.chmod', sessionId, path: 'a.txt' }],
    ['a prototype polluting kind', { kind: 'toString', sessionId }]
  ])('rejects %s', (_label, value) => {
    expect(() => parseDesktopHostFileRequest(value)).toThrowError(/protocol_violation/);
  });

  // 路径是 renderer 唯一能影响物理落盘位置的字段，逐段白名单是 AC#4 的第一道闸
  it.each([
    ['a parent traversal segment', '../escape'],
    ['a nested parent traversal', 'docs/../../escape'],
    ['a current directory segment', './a.txt'],
    ['an absolute path', '/etc/passwd'],
    ['a windows drive letter', 'C:/windows'],
    ['a backslash separator', 'docs\\a.txt'],
    ['an embedded NUL', 'docs/a\u0000.txt'],
    ['a control character', 'docs/a\u0001.txt'],
    ['an empty segment', 'docs//a.txt'],
    ['a trailing separator', 'docs/'],
    ['a trailing dot segment', 'docs/a.'],
    ['a trailing space segment', 'docs/a '],
    ['a windows reserved device name', 'docs/CON'],
    ['a windows reserved device name with extension', 'docs/nul.txt']
  ])('rejects %s', (_label, path) => {
    expect(() => parseDesktopHostFileRequest({ kind: 'file.stat', sessionId, path })).toThrowError(
      /protocol_violation/
    );
  });

  it('rejects a path segment beyond the byte limit', () => {
    const path = 'a'.repeat(DESKTOP_HOST_MAX_PATH_SEGMENT_BYTES + 1);

    expect(() => parseDesktopHostFileRequest({ kind: 'file.stat', sessionId, path })).toThrowError(
      /protocol_violation/
    );
  });

  // 分段合法但拼起来仍可能超出宿主的整路径上限
  it('rejects a path beyond the overall length limit', () => {
    const segment = 'a'.repeat(64);
    const path = new Array(Math.ceil(DESKTOP_HOST_MAX_PATH_LENGTH / 65) + 1).fill(segment).join('/');

    expect(path.length).toBeGreaterThan(DESKTOP_HOST_MAX_PATH_LENGTH);
    expect(() => parseDesktopHostFileRequest({ kind: 'file.stat', sessionId, path })).toThrowError(
      /protocol_violation/
    );
  });

  it('measures the segment limit in UTF-8 bytes, not UTF-16 code units', () => {
    const withinLimit = '中'.repeat(DESKTOP_HOST_MAX_PATH_SEGMENT_BYTES / 3);

    expect(parseDesktopHostFileRequest({ kind: 'file.stat', sessionId, path: withinLimit })).toEqual({
      kind: 'file.stat',
      sessionId,
      path: withinLimit
    });
    expect(() => parseDesktopHostFileRequest({ kind: 'file.stat', sessionId, path: `${withinLimit}中` })).toThrowError(
      /protocol_violation/
    );
  });

  it('rejects the empty path where a concrete file is required', () => {
    expect(() => parseDesktopHostFileRequest({ kind: 'file.remove', sessionId, path: '' })).toThrowError(
      /protocol_violation/
    );
    expect(() => parseDesktopHostFileRequest({ kind: 'file.writeBegin', sessionId, path: '' })).toThrowError(
      /protocol_violation/
    );
  });

  it.each([
    ['a non-string path', { kind: 'file.stat', sessionId, path: 7 }],
    ['a missing path', { kind: 'file.stat', sessionId }],
    ['a non-uuid sessionId', { kind: 'file.stat', sessionId: 'nope', path: 'a.txt' }],
    ['a missing fromPath', { kind: 'file.move', sessionId, toPath: 'b.txt' }],
    ['an escaping toPath', { kind: 'file.move', sessionId, fromPath: 'a.txt', toPath: '../b.txt' }]
  ])('rejects %s', (_label, value) => {
    expect(() => parseDesktopHostFileRequest(value)).toThrowError(/protocol_violation/);
  });

  it.each([
    ['a negative offset', { offset: -1, length: 16 }],
    ['a fractional offset', { offset: 1.5, length: 16 }],
    ['a zero length', { offset: 0, length: 0 }],
    ['a length beyond the frame limit', { offset: 0, length: DESKTOP_HOST_MAX_FILE_CHUNK_BYTES + 1 }]
  ])('rejects a read request with %s', (_label, range) => {
    expect(() => parseDesktopHostFileRequest({ kind: 'file.read', sessionId, path: 'a.txt', ...range })).toThrowError(
      /protocol_violation/
    );
  });

  it('rejects a write chunk beyond the frame limit', () => {
    const chunk = new Uint8Array(DESKTOP_HOST_MAX_FILE_CHUNK_BYTES + 1);

    expect(() => parseDesktopHostFileRequest({ kind: 'file.writeChunk', sessionId, writeId, chunk })).toThrowError(
      /protocol_violation/
    );
  });

  it.each([
    ['a non-binary chunk', { kind: 'file.writeChunk', sessionId, writeId, chunk: [1, 2] }],
    ['a non-uuid writeId', { kind: 'file.writeCommit', sessionId, writeId: 'nope' }],
    ['a non-uuid lockId', { kind: 'file.lockRelease', sessionId, lockId: 'nope' }],
    ['an unknown lock mode', { kind: 'file.lockAcquire', sessionId, name: 'x', mode: 'shared-ish' }],
    ['an empty lock name', { kind: 'file.lockAcquire', sessionId, name: '', mode: 'shared' }]
  ])('rejects %s', (_label, value) => {
    expect(() => parseDesktopHostFileRequest(value)).toThrowError(/protocol_violation/);
  });

  it('accepts both lock modes', () => {
    for (const mode of ['shared', 'exclusive']) {
      const request = { kind: 'file.lockAcquire', sessionId, name: 'files:/a', mode };
      expect(parseDesktopHostFileRequest(request)).toEqual(request);
    }
  });
});

describe('isDesktopHostFileRequestKind', () => {
  it('separates file kinds from sqlite kinds so the router can dispatch on shape alone', () => {
    expect(isDesktopHostFileRequestKind('file.stat')).toBe(true);
    expect(isDesktopHostFileRequestKind('file.lockAcquire')).toBe(true);
    expect(isDesktopHostFileRequestKind('execute')).toBe(false);
    expect(isDesktopHostFileRequestKind('handshake')).toBe(false);
    expect(isDesktopHostFileRequestKind('file.chmod')).toBe(false);
    expect(isDesktopHostFileRequestKind(7)).toBe(false);
  });
});

// sqlite host 的 dispatch 把「不是 open/close/version」的请求一律当 execute 处理，
// 因此 file.* 必须在信任边界上就被 sqlite 解析器拒掉，不能靠下游分支兜底。
describe('parseDesktopHostRequest', () => {
  it('rejects file request kinds', () => {
    expect(() => parseDesktopHostRequest({ kind: 'file.stat', sessionId, path: 'a.txt' })).toThrowError(
      /protocol_violation/
    );
  });
});

describe('DESKTOP_HOST_MAX_FILE_CHUNK_BYTES', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(DESKTOP_HOST_MAX_FILE_CHUNK_BYTES)).toBe(true);
    expect(DESKTOP_HOST_MAX_FILE_CHUNK_BYTES).toBeGreaterThan(0);
  });
});
