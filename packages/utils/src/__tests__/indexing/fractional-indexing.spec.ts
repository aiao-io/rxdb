import { describe, expect, it } from 'vitest';
import { BASE_52_DIGITS, generateKeyBetween, generateKeysBetween } from '../../indexing/fractional-indexing.js';

const BASE_10_DIGITS = '0123456789';
const BASE_62_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE_95_DIGITS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

/** 捕获返回值或错误消息，便于用同一张表断言正常与异常两类结果 */
function attempt(fn: () => string | string[]): string {
  try {
    const result = fn();
    return Array.isArray(result) ? result.join(' ') : result;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** 确定性 LCG，用于顺序性属性测试（避免随机导致的不可复现失败） */
function createRandom(): () => number {
  let seed = 1;
  return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

describe('fractional-indexing', () => {
  describe('generateKeyBetween 默认字母表', () => {
    function assertKey(a: string | null, b: string | null, expected: string) {
      expect(attempt(() => generateKeyBetween(a, b))).toEqual(expected);
    }

    it('生成基础键', () => {
      assertKey(null, null, 'a0');
      assertKey(null, 'a0', 'Zz');
      assertKey(null, 'Zz', 'Zy');
      assertKey('a0', null, 'a1');
      assertKey('a1', null, 'a2');
    });

    it('生成中间键', () => {
      assertKey('a0', 'a1', 'a0V');
      assertKey('a1', 'a2', 'a1V');
      assertKey('a0V', 'a1', 'a0l');
      assertKey('Zz', 'a0', 'ZzV');
      assertKey('Zz', 'a1', 'a0');
    });

    it('处理边界情况', () => {
      assertKey(null, 'Y00', 'Xzzz');
      assertKey('bzz', null, 'c000');
      assertKey('a0', 'a0V', 'a0G');
      assertKey('a0', 'a0G', 'a08');
      assertKey('b125', 'b129', 'b127');
      assertKey('a0', 'a1V', 'a1');
      assertKey('Zz', 'a01', 'a0');
      assertKey(null, 'a0V', 'a0');
      assertKey(null, 'b999', 'b99');
    });

    it('处理超长键', () => {
      assertKey(null, 'A00000000000000000000000000', 'invalid order key: A00000000000000000000000000');
      assertKey(null, 'A000000000000000000000000001', 'A000000000000000000000000000V');
      assertKey('zzzzzzzzzzzzzzzzzzzzzzzzzzy', null, 'zzzzzzzzzzzzzzzzzzzzzzzzzzz');
      assertKey('zzzzzzzzzzzzzzzzzzzzzzzzzzz', null, 'zzzzzzzzzzzzzzzzzzzzzzzzzzzV');
    });

    it('拒绝非法键', () => {
      assertKey('a00', null, 'invalid order key: a00');
      assertKey('a00', 'a1', 'invalid order key: a00');
      assertKey('0', '1', 'invalid order key head: 0');
    });

    it('顺序颠倒的边界会被自动交换而非报错', () => {
      assertKey('a1', 'a0', 'a0V');
      expect(generateKeyBetween('a2', 'a0')).toEqual(generateKeyBetween('a0', 'a2'));
    });

    it('两端相等仍然报错', () => {
      expect(() => generateKeyBetween('a0', 'a0')).toThrow();
    });
  });

  describe('generateKeysBetween 自带头字符的 base-10', () => {
    function assertKeys(a: string | null, b: string | null, n: number, expected: string) {
      expect(attempt(() => generateKeysBetween(a, b, n, BASE_10_DIGITS))).toEqual(expected);
    }

    // 显式传入 digits 时，头字符取自 digits 本身：0-4 为负长度头，5-9 为正长度头，
    // 4/5 表示最短（长度 2）的整数部分，因此键中不含任何字母。
    it('批量生成键', () => {
      assertKeys(null, null, 5, '50 51 52 53 54');
      assertKeys('54', null, 10, '55 56 57 58 59 600 601 602 603 604');
      assertKeys(null, '50', 5, '45 46 47 48 49');
      assertKeys('50', '52', 20, '501 502 503 5035 504 505 506 507 508 509 51 511 512 513 514 515 516 517 518 519');
    });

    it('n 为 0 时返回空数组', () => {
      expect(generateKeysBetween(null, null, 0, BASE_10_DIGITS)).toEqual([]);
    });
  });

  describe('generateKeyBetween base-95 搭配 A-Z/a-z 头字符', () => {
    // base-95 长度为奇数，无法自带（必须偶数的）头字母表，显式传入默认的 A-Z/a-z 保持拉丁头字符
    function assertKey(a: string | null, b: string | null, expected: string) {
      expect(attempt(() => generateKeyBetween(a, b, BASE_95_DIGITS, BASE_52_DIGITS))).toEqual(expected);
    }

    it('生成键', () => {
      assertKey('a00', 'a01', 'a00P');
      assertKey('a0/', 'a00', 'a0/P');
      assertKey(null, null, 'a ');
      assertKey('a ', null, 'a!');
      assertKey(null, 'a ', 'Z~');
      assertKey('a0 ', 'a0!', 'invalid order key: a0 ');
      assertKey(null, 'A                          0', 'A                          (');
      assertKey('a~', null, 'b  ');
      assertKey('Z~', null, 'a ');
      assertKey('b   ', null, 'invalid order key: b   ');
      assertKey('a0', 'a0V', 'a0;');
      assertKey('a  1', 'a  2', 'a  1P');
      assertKey(null, 'A                          ', 'invalid order key: A                          ');
    });
  });

  describe('自定义字母表', () => {
    function assertKeys(digits: string, a: string | null, b: string | null, n: number, expected: string) {
      expect(attempt(() => generateKeysBetween(a, b, n, digits))).toEqual(expected);
    }

    it('base-2 整数范围极小但仍可用', () => {
      assertKeys('01', null, null, 8, '10 11 111 1111 11111 111111 1111111 11111111');
      assertKeys('01', '10', null, 1, '11');
      assertKeys('01', '10', '11', 1, '101');
    });

    it('接受 Latin-1 单字节字母表', () => {
      assertKeys('¡¢£¤¥¦', null, null, 6, '¤¡ ¤¢ ¤£ ¤¤ ¤¥ ¤¦');
    });

    it('接受字符码低于 A 的符号字母表', () => {
      assertKeys(' !#$%&', null, null, 6, '$  $! $# $$ $% $&');
    });

    it('拒绝多字节字母表', () => {
      assertKeys('ΑΒΓΔΕΖΗΘ', null, null, 10, 'digits must be single-byte (char code 0-255): ΑΒΓΔΕΖΗΘ');
    });

    it('校验同样覆盖批量入口', () => {
      assertKeys(
        '0',
        null,
        null,
        5,
        'digits must be at least 2 characters in strictly ascending character code order: 0'
      );
    });
  });

  describe('intDigits 头字母表', () => {
    function assertKey(digits: string, intDigits: string, a: string | null, b: string | null, expected: string) {
      expect(attempt(() => generateKeyBetween(a, b, digits, intDigits))).toEqual(expected);
    }

    // 负长度头限定为 A/B，正长度头限定为 a/b；内侧一对 (B, a) 表示长度 2，外侧一对 (A, b) 表示长度 3
    it('限制整数部分可增长的范围', () => {
      assertKey(BASE_10_DIGITS, 'ABab', 'a0', 'a1', 'a05');
      assertKey(BASE_10_DIGITS, 'ABab', 'a9', null, 'b00');
      assertKey(BASE_10_DIGITS, 'ABab', 'b00', null, 'b01');
      assertKey(BASE_10_DIGITS, 'ABab', 'a0', null, 'a1');
      assertKey(BASE_10_DIGITS, 'ABab', null, 'B9', 'B8');
    });

    it('拒绝不在头字母表内的头字符', () => {
      assertKey(BASE_10_DIGITS, 'ABab', 'c00', null, 'invalid order key head: c');
      assertKey(BASE_10_DIGITS, 'ABab', '00', '01', 'invalid order key head: 0');
    });

    it('intDigits 与 digits 相同时生成无字母键', () => {
      assertKey(BASE_10_DIGITS, BASE_10_DIGITS, null, null, '50');
      assertKey(BASE_10_DIGITS, BASE_10_DIGITS, '50', null, '51');
      assertKey(BASE_10_DIGITS, BASE_10_DIGITS, '59', null, '600');
      assertKey(BASE_10_DIGITS, BASE_10_DIGITS, null, '50', '49');
      assertKey(BASE_10_DIGITS, BASE_10_DIGITS, '56', '57', '565');
    });

    it('省略 intDigits 等价于传入 digits', () => {
      const random = createRandom();
      const list: string[] = [];
      for (let i = 0; i < 2000; i++) {
        const pos = Math.floor(random() * (list.length + 1));
        const a = pos > 0 ? list[pos - 1] : null;
        const b = pos < list.length ? list[pos] : null;
        const omitted = generateKeyBetween(a, b, BASE_10_DIGITS);
        expect(omitted).toEqual(generateKeyBetween(a, b, BASE_10_DIGITS, BASE_10_DIGITS));
        list.splice(pos, 0, omitted);
      }
    });
  });

  describe('字母表校验', () => {
    function assertKey(digits: string, intDigits: string, expected: string) {
      expect(attempt(() => generateKeyBetween(null, null, digits, intDigits))).toEqual(expected);
    }

    it('digits 必须至少 2 字符且严格升序', () => {
      const message = 'digits must be at least 2 characters in strictly ascending character code order: ';
      assertKey('0213456789', 'ABab', `${message}0213456789`);
      assertKey('0', 'ABab', `${message}0`);
      assertKey('0012', 'ABab', `${message}0012`);
    });

    it('intDigits 还必须为偶数长度', () => {
      const message =
        'intDigits must be an even number of at least 2 characters in strictly ascending character code order: ';
      assertKey(BASE_10_DIGITS, 'abc', `${message}abc`);
      assertKey(BASE_10_DIGITS, 'ba', `${message}ba`);
      assertKey(BASE_10_DIGITS, '', `${message}`);
    });

    it('intDigits 必须单字节', () => {
      assertKey(BASE_10_DIGITS, 'ΑΒΓΔ', 'intDigits must be single-byte (char code 0-255): ΑΒΓΔ');
    });
  });

  describe('顺序性', () => {
    function assertOrdering(digits?: string, intDigits?: string) {
      const random = createRandom();
      const list: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const pos = Math.floor(random() * (list.length + 1));
        const a = pos > 0 ? list[pos - 1] : null;
        const b = pos < list.length ? list[pos] : null;
        const key = generateKeyBetween(a, b, digits, intDigits);
        expect(a === null || a < key).toBe(true);
        expect(b === null || key < b).toBe(true);
        list.splice(pos, 0, key);
      }
      expect([...list].sort()).toEqual(list);
    }

    it('默认字母表下 1000 次随机插入仍保持字典序', () => {
      assertOrdering();
    });

    it('各类自定义字母表下保持字典序', () => {
      assertOrdering(BASE_10_DIGITS);
      assertOrdering(' !#$%&');
      assertOrdering('¡¢£¤¥¦');
      assertOrdering(BASE_62_DIGITS);
      assertOrdering(BASE_10_DIGITS, BASE_10_DIGITS);
    });

    it('base-2 自带头字符范围不足，需外挂更宽的头字母表', () => {
      assertOrdering('01', BASE_52_DIGITS);
    });
  });
});
