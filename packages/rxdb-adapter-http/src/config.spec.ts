import { describe, expect, it } from 'vitest';
import { DEFAULT_HTTP_CONFIG, resolveHttpConfig } from './config.js';
import { HttpConfigError } from './errors.js';

/**
 * US-212 AC#31：五个数值配置在**构造期**校验并 fail-fast。
 *
 * 判据是 **finite 正整数**不是 `> 0` —— `1.5` 会让 `offset += limit` 逐页漂移、
 * `Infinity` 等于放弃触顶保护，两者都能过 `> 0`。
 */
describe('resolveHttpConfig', () => {
  const NUMERIC_FIELDS = ['pageSize', 'idChunkSize', 'maxPages', 'requestTimeoutMs', 'maxEmptyPages'] as const;

  it('缺省时返回对标 supabase 的默认值', () => {
    expect(resolveHttpConfig({})).toEqual({
      pageSize: 1000,
      idChunkSize: 100,
      maxEmptyPages: 3,
      maxPages: 1000,
      requestTimeoutMs: 30000
    });
    expect(DEFAULT_HTTP_CONFIG.pageSize).toBe(1000);
  });

  it('逐字段可覆盖，未覆盖的保持默认', () => {
    expect(resolveHttpConfig({ pageSize: 50 })).toMatchObject({ pageSize: 50, idChunkSize: 100 });
  });

  describe.each(NUMERIC_FIELDS)('%s', field => {
    // 每个退化取值一条用例：AC#31 明写「五个字段都要覆盖」
    it.each([
      ['小数', 1.5],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['NaN', Number.NaN],
      ['负数', -1]
    ])('%s 抛 HttpConfigError', (_label, value) => {
      expect(() => resolveHttpConfig({ [field]: value })).toThrow(HttpConfigError);
    });

    it('错误信息含字段名与实际值', () => {
      // 构造期报错没有调用栈上下文，不带字段名等于让接入方猜
      expect(() => resolveHttpConfig({ [field]: -1 })).toThrow(new RegExp(`${field}.*-1`));
    });
  });

  it('0 对四个字段非法', () => {
    for (const field of ['pageSize', 'idChunkSize', 'maxPages', 'requestTimeoutMs'] as const) {
      expect(() => resolveHttpConfig({ [field]: 0 })).toThrow(HttpConfigError);
    }
  });

  it('maxEmptyPages 是唯一允许 0 的字段（语义：不容忍空页）', () => {
    expect(resolveHttpConfig({ maxEmptyPages: 0 }).maxEmptyPages).toBe(0);
  });

  it('抛出的错误带上 field 与 value，便于调用方断言而不是 match 字符串', () => {
    try {
      resolveHttpConfig({ pageSize: Number.POSITIVE_INFINITY });
      expect.unreachable('应当抛错');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpConfigError);
      expect((error as HttpConfigError).field).toBe('pageSize');
      expect((error as HttpConfigError).value).toBe(Number.POSITIVE_INFINITY);
    }
  });
});
