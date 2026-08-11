import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './error-message';

describe('getErrorMessage', () => {
  it('Error 取 message，而不是带 "Error: " 前缀的整串', () => {
    expect(getErrorMessage(new Error('连接被拒绝'), '同步失败')).toBe('连接被拒绝');
  });

  /**
   * P2-9 的核心：`String(error)` 对**非 Error** 的对象一律得到 `[object Object]`。
   * Supabase / PostgREST 抛出的就是 `{ message, code, details }` 这样的普通对象。
   */
  it('普通对象取 message 字段，绝不给用户 [object Object]', () => {
    const postgrestError = { message: 'permission denied for table todo', code: '42501' };

    // 旧写法的实际产物，钉在这里作为对照
    expect(String(postgrestError)).toBe('[object Object]');

    expect(getErrorMessage(postgrestError, '同步失败')).toBe('permission denied for table todo');
  });

  it('字符串原样返回', () => {
    expect(getErrorMessage('网络不可达', '同步失败')).toBe('网络不可达');
  });

  it('空 message / 空串 / null / undefined 一律回落到 fallback', () => {
    expect(getErrorMessage(new Error(''), '同步失败')).toBe('同步失败');
    expect(getErrorMessage('   ', '同步失败')).toBe('同步失败');
    expect(getErrorMessage(null, '同步失败')).toBe('同步失败');
    expect(getErrorMessage(undefined, '同步失败')).toBe('同步失败');
    expect(getErrorMessage({ code: 500 }, '同步失败')).toBe('同步失败');
  });
});
