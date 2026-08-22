/**
 * @fileoverview `isNetworkError` 的分类口径测试（US-020 AC#16 / D11）。
 *
 * 这条谓词决定 `offlineFallback` 吞哪些错误。判错的代价不对称：
 * - 把网络错误判成业务错误 → 离线时查询直接失败，降级形同虚设
 * - 把业务错误判成网络错误 → 401 / 校验失败被悄悄换成陈旧缓存，调用方永远看不到真正的原因
 *
 * 后者更严重，因此默认方向是「认不出就不是网络错误，原样上抛」。
 */

import { describe, expect, it } from 'vitest';
import { isNetworkError } from '../../repository/network-error.js';
import { NetworkOfflineError, RxDBQueryCacheCapabilityError } from '../../RxDBError.js';

/** 构造带 errno `code` 的 Node 风格错误 */
const errnoError = (code: string): Error => Object.assign(new Error(code), { code });

/** 构造带 HTTP `status` 的响应错误 */
const httpError = (status: number, message: string): Error => Object.assign(new Error(message), { status });

describe('isNetworkError（US-020 AC#16）', () => {
  describe('判为网络错误', () => {
    it('NetworkOfflineError 本身', () => {
      expect(isNetworkError(new NetworkOfflineError(new Error('boom')))).toBe(true);
    });

    it.each(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'])(
      'Node errno %s',
      code => {
        expect(isNetworkError(errnoError(code))).toBe(true);
      }
    );

    it.each(['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'])(
      'fetch 失败的 TypeError：%s',
      message => {
        expect(isNetworkError(new TypeError(message))).toBe(true);
      }
    );

    it('DOMException 风格的 NetworkError / TimeoutError', () => {
      expect(isNetworkError(Object.assign(new Error('x'), { name: 'NetworkError' }))).toBe(true);
      expect(isNetworkError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(true);
    });
  });

  describe('判为业务错误（必须原样上抛）', () => {
    it.each([400, 401, 403, 404, 409, 422, 500, 502, 503])('带 HTTP status %i 的错误', status => {
      expect(isNetworkError(httpError(status, 'server said no'))).toBe(false);
    });

    it('有 status 时压过 errno / 消息特征 —— 拿到响应就不是网络断了', () => {
      expect(isNetworkError(Object.assign(new TypeError('Failed to fetch'), { status: 401 }))).toBe(false);
      expect(isNetworkError(Object.assign(new Error('x'), { status: 503, code: 'ECONNRESET' }))).toBe(false);
    });

    it('RxDB 自身的业务错误', () => {
      expect(isNetworkError(new RxDBQueryCacheCapabilityError('Todo', 'local', ['upsertMany']))).toBe(false);
    });

    it('AbortError —— 调用方主动取消，不是离线', () => {
      expect(isNetworkError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(false);
    });

    it('普通 TypeError —— 消息不含 fetch 特征就不算', () => {
      expect(isNetworkError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    });

    it('errno 形状但不是网络类 errno', () => {
      expect(isNetworkError(errnoError('ENOENT'))).toBe(false);
      expect(isNetworkError(errnoError('SQLITE_BUSY'))).toBe(false);
    });

    it('Postgrest 风格的 code（字符串但非 errno）', () => {
      expect(isNetworkError(Object.assign(new Error('duplicate key'), { code: '23505' }))).toBe(false);
    });
  });

  describe('非错误值', () => {
    it.each([null, undefined, 'ECONNREFUSED', 42, {}])('%o 一律不是网络错误', value => {
      expect(isNetworkError(value)).toBe(false);
    });
  });
});
