/**
 * @fileoverview 增量 SHA-256（US-217 归档摘要）。
 *
 * @remarks
 * 归档可能远大于内存预算，摘要必须边读边算。增量实现只要切块边界处理错一个字节，
 * 结果仍然确定、定长，却不再是 SHA-256——所以用例一律拿一次性的 {@link sha256Hex}
 * 与 `crypto.subtle.digest()` 当裁判，并把输入切成各种不对齐 64 字节块的片段。
 */

import { describe, expect, it } from 'vitest';
import { createSha256, sha256Hex } from '../../system/sha256.js';

const referenceHex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBufferView<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const patternBytes = (length: number): Uint8Array => Uint8Array.from({ length }, (_, index) => (index * 31 + 7) & 0xff);

const digestInPieces = (bytes: Uint8Array, pieceSizes: readonly number[]): string => {
  const hash = createSha256();
  let offset = 0;
  let turn = 0;
  while (offset < bytes.length) {
    const size = pieceSizes[turn % pieceSizes.length];
    hash.update(bytes.subarray(offset, offset + size));
    offset += size;
    turn += 1;
  }
  return hash.digestHex();
};

describe('createSha256 增量摘要', () => {
  it('未喂数据时等于空输入的标准向量', () => {
    expect(createSha256().digestHex()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it.each([0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 1000, 65_537])(
    '长度 %i 按不对齐分片喂入仍与裁判一致',
    async length => {
      const bytes = patternBytes(length);
      const expected = await referenceHex(bytes);
      expect(digestInPieces(bytes, [1, 3, 64, 7, 129])).toBe(expected);
      expect(digestInPieces(bytes, [length || 1])).toBe(expected);
      expect(sha256Hex(bytes)).toBe(expected);
    }
  );

  it('空片段不改变摘要', () => {
    const hash = createSha256();
    hash.update(new Uint8Array(0));
    hash.update(Uint8Array.of(0x61, 0x62, 0x63));
    hash.update(new Uint8Array(0));
    expect(hash.digestHex()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('不改动调用方传入的字节', () => {
    const bytes = patternBytes(200);
    const snapshot = Uint8Array.from(bytes);
    const hash = createSha256();
    hash.update(bytes);
    hash.digestHex();
    expect(bytes).toEqual(snapshot);
  });

  it('digestHex 之后再 update 或 digest 直接抛错，不返回续算的伪摘要', () => {
    const hash = createSha256();
    hash.update(Uint8Array.of(1));
    hash.digestHex();
    expect(() => hash.update(Uint8Array.of(2))).toThrow(/finalized/);
    expect(() => hash.digestHex()).toThrow(/finalized/);
  });
});
