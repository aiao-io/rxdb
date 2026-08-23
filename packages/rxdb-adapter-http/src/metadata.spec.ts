import { describe, expect, it } from 'vitest';
import { HttpInvalidMetadataError } from './errors.js';
import { canonicalizeMetadata } from './metadata.js';

/**
 * US-212 AC#14：metadata 的 `updatedAt` 必须以**规范化 ISO 字符串**交给 core。
 *
 * `diffMetadata` 按**字典序**直接比 `remote.updatedAt > localUpdatedAt`，而本地侧恒是
 * `toISOString()` 的形态（UTC `Z` + 3 位毫秒）。两侧形态不同就会得出与时间序相反的结论，
 * 且全程无异常——错的只是结论：判 stale 则无谓重拉，判 fresh 则缓存卡死。
 */
describe('canonicalizeMetadata', () => {
  const rows = (updatedAt: unknown): unknown[] => [{ id: 'a', updatedAt }];

  it('已规范化的串原样透出（AC#14①）', () => {
    // 规范形态过一遍不该有任何漂移，否则「规范化」本身就是新的不确定源
    expect(canonicalizeMetadata('Recipe', rows('2026-08-23T10:30:00.000Z'))).toEqual([
      { id: 'a', updatedAt: '2026-08-23T10:30:00.000Z' }
    ]);
  });

  describe('合法但不规范的串要 canonicalize 后再交给 core（AC#14②）', () => {
    it.each([
      // 字典序逐字符比到时位得出 18 > 10，而 UTC 上它其实更早——反向结论，静默
      ['时区偏移', '2026-08-23T18:00:00+08:00', '2026-08-23T10:00:00.000Z'],
      ['缺毫秒', '2026-08-23T10:00:00Z', '2026-08-23T10:00:00.000Z'],
      ['+00:00 代替 Z', '2026-08-23T10:00:00+00:00', '2026-08-23T10:00:00.000Z'],
      ['多于 3 位小数秒', '2026-08-23T10:00:00.123456Z', '2026-08-23T10:00:00.123Z'],
      ['缺秒', '2026-08-23T10:00Z', '2026-08-23T10:00:00.000Z'],
      ['负偏移', '2026-08-23T05:00:00-05:00', '2026-08-23T10:00:00.000Z']
    ])('%s', (_label, wire, expected) => {
      expect(canonicalizeMetadata('Recipe', rows(wire))[0].updatedAt).toBe(expected);
    });

    it('规范化后仍是 string，不是 Date（AC#14 坑一）', () => {
      // Date 那侧比较会走 number 提示，字符串侧转成 NaN，比较恒 false ⇒ 所有行判 fresh
      const [row] = canonicalizeMetadata('Recipe', rows('2026-08-23T18:00:00+08:00'));
      expect(typeof row.updatedAt).toBe('string');
      expect(row.updatedAt).not.toBeInstanceOf(Date);
    });
  });

  describe('不合契约的行抛 HttpInvalidMetadataError，不吞（AC#14③）', () => {
    it.each([
      ['纯垃圾串', 'not-a-date'],
      ['月份越界', '2026-13-45T00:00:00Z'],
      ['非 ISO 但 Date.parse 认', 'Aug 23, 2026'],
      ['无时区标识（按本地时区解析，跨机器结论不同）', '2026-08-23T10:00:00'],
      ['epoch 数字', 1_755_945_600_000],
      ['Date 实例', new Date('2026-08-23T10:00:00Z')],
      ['null', null],
      ['缺字段', undefined]
    ])('updatedAt 是 %s', (_label, updatedAt) => {
      expect(() => canonicalizeMetadata('Recipe', rows(updatedAt))).toThrow(HttpInvalidMetadataError);
    });

    it.each([
      ['缺 id', { updatedAt: '2026-08-23T10:00:00.000Z' }],
      ['id 非字符串', { id: 7, updatedAt: '2026-08-23T10:00:00.000Z' }],
      ['id 为空串', { id: '', updatedAt: '2026-08-23T10:00:00.000Z' }],
      ['行不是对象', 'nope'],
      ['行为 null', null]
    ])('%s', (_label, row) => {
      expect(() => canonicalizeMetadata('Recipe', [row])).toThrow(HttpInvalidMetadataError);
    });

    it('响应体不是数组也抛', () => {
      expect(() => canonicalizeMetadata('Recipe', { rows: [] } as unknown as unknown[])).toThrow(
        HttpInvalidMetadataError
      );
    });

    it('错误带上实体名与可定位的细节', () => {
      const error = (() => {
        try {
          canonicalizeMetadata('Recipe', rows('not-a-date'));
          return undefined;
        } catch (e) {
          return e as HttpInvalidMetadataError;
        }
      })();
      expect(error).toBeInstanceOf(HttpInvalidMetadataError);
      expect(error?.entityName).toBe('Recipe');
      expect(error?.message).toMatch(/not-a-date/);
    });
  });

  it('只透出 id 与 updatedAt，丢弃额外字段', () => {
    // metadata 通道必须绕开实体解码：多带的字段既没用，又会诱导下游把它当成完整行
    const result = canonicalizeMetadata('Recipe', [
      { id: 'a', updatedAt: '2026-08-23T10:00:00.000Z', title: 'x', deleted: false }
    ]);
    expect(Object.keys(result[0]).sort()).toEqual(['id', 'updatedAt']);
  });

  it('空结果集返回空数组', () => {
    expect(canonicalizeMetadata('Recipe', [])).toEqual([]);
  });
});
