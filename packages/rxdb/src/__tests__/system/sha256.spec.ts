/**
 * @fileoverview T034 红测试：同步 SHA-256 摘要原语（服务 FR-003 的指纹口径）。
 *
 * @remarks
 * 实现目标是 `src/system/sha256.ts`。它只为一件事存在：`computeChangeUnitFingerprint()`
 * 必须是**同步**的——红测试里的 `createUnit()` 就是同步调用它的，而这些指纹会被写进
 * 永不可变的提交历史。
 *
 * 手写一份摘要实现是要还债的，所以这份测试钉的是「它真的是 SHA-256」，而不是
 * 「它真的很稳定」。后者 `return 'x'` 就能过：
 *
 * 1. **FIPS 180-4 的三条已知答案**。自己写的摘要最容易变成「自洽但不是 SHA-256」——
 *    轮常量抄漏一个、`rotr` 写成 `>>`，结果照样确定、照样定长、照样有分辨力，
 *    只是和世界上任何一个 SHA-256 实现都对不上。等到要和别处交叉验证时已经没法改了：
 *    改算法 = 全库历史的 `contentFingerprint` 全部作废。
 * 2. **与 `crypto.subtle.digest()` 逐长度对拍**。分块与填充的边界（55/56/63/64/119/120）
 *    是这类实现唯一会真正写错的地方：短一个字节走一块、长一个字节走两块，
 *    而「abc」这种三字节输入永远试不到那条分支。这里拿浏览器自带的实现当裁判。
 * 3. **字节语义不是字符串语义**。`0x00` 不是终止符，非 ASCII 字节也不是 UTF-8 码点。
 *    把入参当字符串处理的实现会在这两条上分叉。
 */

import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../system/sha256.js';

/** 把 hex 串还原成字节，供对拍用例构造任意字节序列。 */
const bytesOfAscii = (text: string): Uint8Array => Uint8Array.from(text, character => character.charCodeAt(0));

/** 浏览器自带的 SHA-256，作为对拍裁判。 */
const referenceHex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBufferView<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

describe('sha256Hex 就是 FIPS 180-4 的 SHA-256', () => {
  it('空输入对上标准向量', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('"abc" 对上标准向量（FIPS 附录 B.1）', () => {
    expect(sha256Hex(bytesOfAscii('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('56 字节输入对上标准向量（FIPS 附录 B.2）—— 恰好跨到第二块', () => {
    // 56 + 1 字节的 0x80 + 8 字节长度 = 65 > 64：填充必须自己再开一块。
    expect(sha256Hex(bytesOfAscii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
  });

  it('单个 0x00 字节对上标准向量 —— 零不是终止符', () => {
    expect(sha256Hex(Uint8Array.of(0))).toBe('6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d');
  });
});

describe('与 crypto.subtle.digest 逐长度对拍', () => {
  it('分块与填充的边界长度全部一致', async () => {
    // 只测「abc」这种短输入的话，`>> 6` / `+ 9` 写错一个常量都试不出来。
    const lengths = [0, 1, 54, 55, 56, 57, 63, 64, 65, 118, 119, 120, 121, 127, 128, 129, 200, 1000];
    const actual: string[] = [];
    const expected: string[] = [];
    for (const length of lengths) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) & 0xff);
      actual.push(sha256Hex(bytes));
      expected.push(await referenceHex(bytes));
    }
    expect(actual).toEqual(expected);
  });

  it('全 0xff 与全 0x00 也一致 —— 高位字节不被当作符号位', async () => {
    const filled = new Uint8Array(200).fill(0xff);
    const zeroed = new Uint8Array(200);
    expect([sha256Hex(filled), sha256Hex(zeroed)]).toEqual([await referenceHex(filled), await referenceHex(zeroed)]);
  });
});

describe('输出形状', () => {
  it('恒为 64 位小写 hex', () => {
    for (const length of [0, 1, 64, 1000]) {
      expect(sha256Hex(new Uint8Array(length).fill(0x5a))).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('同一份输入连算两次结果相同 —— 没有跨调用的可变状态', () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, index) => index & 0xff);
    expect(sha256Hex(bytes)).toBe(sha256Hex(bytes));
  });

  it('不改动入参', () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5]);
    sha256Hex(bytes);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
  });
});
