import { TextDecoder as NativeTextDecoder } from 'node:util';
import { describe, expect, it } from 'vitest';
import { textDecoderPolyfill, textEncoderPolyfill } from '../text-encoding-polyfills.js';

const REPLACEMENT = '�';

/** UTF-8 判定的边界字节：ASCII、续字节各段的上下界、各类首字节与非法首字节。 */
const BOUNDARY_BYTES = [
  0x00, 0x41, 0x7f, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0, 0xc1, 0xc2, 0xdf, 0xe0, 0xe1, 0xec, 0xed, 0xee, 0xef,
  0xf0, 0xf1, 0xf3, 0xf4, 0xf5, 0xff
];

function bytes(...values: readonly number[]): Uint8Array {
  return Uint8Array.from(values);
}

function appendBoundaryByte(sequences: readonly number[][]): number[][] {
  return sequences.flatMap(sequence => BOUNDARY_BYTES.map(byte => [...sequence, byte]));
}

/** 边界字节组成的全部 1～3 字节序列，加上四字节首字节开头的全部 4 字节序列。 */
function boundarySequences(): number[][] {
  const one = BOUNDARY_BYTES.map(byte => [byte]);
  const two = appendBoundaryByte(one);
  const three = appendBoundaryByte(two);
  const four = appendBoundaryByte(three.filter(([first]) => first >= 0xf0 && first <= 0xf4));
  return [...one, ...two, ...three, ...four];
}

function throwsOn(decoder: { decode(input: Uint8Array): string }, input: Uint8Array): boolean {
  try {
    decoder.decode(input);
    return false;
  } catch {
    return true;
  }
}

describe('MiniProgramTextEncoder', () => {
  it('按 UTF-8 长度分档写出 1/2/3/4 字节序列', () => {
    const encoder = new textEncoderPolyfill();

    expect(encoder.encoding).toBe('utf-8');
    expect([...encoder.encode('A')]).toEqual([0x41]);
    expect([...encoder.encode('é')]).toEqual([0xc3, 0xa9]);
    expect([...encoder.encode('中')]).toEqual([0xe4, 0xb8, 0xad]);
    expect([...encoder.encode('😀')]).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  });

  it('缺省参数与空串都编码成空数组', () => {
    const encoder = new textEncoderPolyfill();

    expect([...encoder.encode()]).toEqual([]);
    expect([...encoder.encode('')]).toEqual([]);
  });

  it('把落单的代理项按 U+FFFD 计长再写出', () => {
    const encoder = new textEncoderPolyfill();
    const replacement = [0xef, 0xbf, 0xbd];

    expect([...encoder.encode('\ud800')]).toEqual(replacement);
    expect([...encoder.encode('\udc00')]).toEqual(replacement);
    expect([...encoder.encode('\ud800A')]).toEqual([...replacement, 0x41]);
    expect([...encoder.encode('\udfffA')]).toEqual([...replacement, 0x41]);
  });

  it('encodeInto 在目标缓冲放不下整个码点时停在码点边界', () => {
    const encoder = new textEncoderPolyfill();
    const destination = new Uint8Array(4);

    const result = encoder.encodeInto('A中中', destination);

    expect(result).toEqual({ read: 2, written: 4 });
    expect([...destination]).toEqual([0x41, 0xe4, 0xb8, 0xad]);
  });

  it('encodeInto 目标缓冲为空时一个字节都不写', () => {
    const encoder = new textEncoderPolyfill();
    const destination = new Uint8Array(0);

    expect(encoder.encodeInto('A', destination)).toEqual({ read: 0, written: 0 });
  });
});

describe('MiniProgramTextDecoder', () => {
  it('规范化编码标签并拒绝不支持的编码', () => {
    expect(new textDecoderPolyfill().encoding).toBe('utf-8');
    expect(new textDecoderPolyfill('UTF8').encoding).toBe('utf-8');
    expect(new textDecoderPolyfill(' Utf-8 ').encoding).toBe('utf-8');
    expect(new textDecoderPolyfill('utf-16').encoding).toBe('utf-16le');
    expect(new textDecoderPolyfill('utf16le').encoding).toBe('utf-16le');
    expect(() => new textDecoderPolyfill('gbk')).toThrow(RangeError);
    expect(() => new textDecoderPolyfill('gbk')).toThrow('不支持的 TextDecoder 编码: gbk');
  });

  it('接受 ArrayBuffer、视图与缺省输入，拒绝其他类型', () => {
    const decoder = new textDecoderPolyfill();
    const source = bytes(0x41, 0x42, 0x43);

    expect(decoder.decode()).toBe('');
    expect(decoder.decode(source.buffer)).toBe('ABC');
    expect(decoder.decode(source)).toBe('ABC');
    expect(decoder.decode(source.subarray(1))).toBe('BC');
    expect(decoder.decode(new DataView(source.buffer))).toBe('ABC');
    expect(() => decoder.decode(42 as unknown as ArrayBuffer)).toThrow(TypeError);
    expect(() => decoder.decode(42 as unknown as ArrayBuffer)).toThrow('需要 ArrayBuffer 或 ArrayBufferView');
  });

  it('解码 1/2/3/4 字节 UTF-8 序列', () => {
    const decoder = new textDecoderPolyfill();

    expect(decoder.decode(bytes(0x41))).toBe('A');
    expect(decoder.decode(bytes(0xc3, 0xa9))).toBe('é');
    expect(decoder.decode(bytes(0xe4, 0xb8, 0xad))).toBe('中');
    expect(decoder.decode(bytes(0xf0, 0x9f, 0x98, 0x80))).toBe('😀');
  });

  it('拒绝过长编码、代理项与越界码点：第二个字节就出了首字节允许的区间，逐字节各记一个 U+FFFD', () => {
    const decoder = new textDecoderPolyfill();

    expect(decoder.decode(bytes(0xc0, 0x80))).toBe(`${REPLACEMENT}${REPLACEMENT}`);
    expect(decoder.decode(bytes(0xc1, 0xbf))).toBe(`${REPLACEMENT}${REPLACEMENT}`);
    expect(decoder.decode(bytes(0xe0, 0x80, 0x80))).toBe(REPLACEMENT.repeat(3));
    expect(decoder.decode(bytes(0xed, 0xa0, 0x80))).toBe(REPLACEMENT.repeat(3));
    expect(decoder.decode(bytes(0xf0, 0x80, 0x80, 0x80))).toBe(REPLACEMENT.repeat(4));
    expect(decoder.decode(bytes(0xf4, 0x90, 0x80, 0x80))).toBe(REPLACEMENT.repeat(4));
    expect(decoder.decode(bytes(0xf5, 0x80, 0x80, 0x80))).toBe(REPLACEMENT.repeat(4));
  });

  it('合法前缀被截断时整段只记一个 U+FFFD，打断它的字节重新判断，不吞掉后续合法字符', () => {
    const decoder = new textDecoderPolyfill();

    expect(decoder.decode(bytes(0xe4, 0x41, 0x42))).toBe(`${REPLACEMENT}AB`);
    expect(decoder.decode(bytes(0xe4, 0xb8, 0x41))).toBe(`${REPLACEMENT}A`);
    expect(decoder.decode(bytes(0xe4, 0xb8))).toBe(REPLACEMENT);
    expect(decoder.decode(bytes(0xe2, 0x82))).toBe(REPLACEMENT);
    expect(decoder.decode(bytes(0xf0, 0x9f, 0x98))).toBe(REPLACEMENT);
    expect(decoder.decode(bytes(0x41, 0x80, 0x42))).toBe(`A${REPLACEMENT}B`);
    // 截在输入末尾的首字节后面跟着合法字符：那个字符不属于这段前缀
    expect(decoder.decode(bytes(0xe4, 0x41))).toBe(`${REPLACEMENT}A`);
    expect(decoder.decode(bytes(0xf0, 0x9f, 0x41))).toBe(`${REPLACEMENT}A`);
    expect(decoder.decode(bytes(0xe2, 0x82, 0xe2, 0x82, 0xac))).toBe(`${REPLACEMENT}€`);
  });

  it('与原生 TextDecoder 逐例一致：边界字节组成的 1～4 字节序列，替换与 fatal 两种模式都比', () => {
    const native = new NativeTextDecoder();
    const nativeFatal = new NativeTextDecoder('utf-8', { fatal: true });
    const decoder = new textDecoderPolyfill();
    const fatal = new textDecoderPolyfill('utf-8', { fatal: true });

    const mismatches = boundarySequences().filter(sequence => {
      const input = Uint8Array.from(sequence);
      return decoder.decode(input) !== native.decode(input) || throwsOn(fatal, input) !== throwsOn(nativeFatal, input);
    });

    expect(mismatches).toEqual([]);
  });

  it('fatal 模式下任何无效 UTF-8 序列都抛错', () => {
    const decoder = new textDecoderPolyfill('utf-8', { fatal: true });

    expect(decoder.fatal).toBe(true);
    expect(() => decoder.decode(bytes(0xe0, 0x80, 0x80))).toThrow('无效的 UTF-8');
    expect(() => decoder.decode(bytes(0x80))).toThrow(TypeError);
  });

  it('UTF-16LE 下拒绝落单代理项、错配代理对与奇数尾字节', () => {
    const decoder = new textDecoderPolyfill('utf-16le');

    expect(decoder.decode(bytes(0x41, 0x00, 0x2d, 0x4e))).toBe('A中');
    expect(decoder.decode(bytes(0x3d, 0xd8, 0x00, 0xde))).toBe('😀');
    expect(decoder.decode(bytes(0x00, 0xd8))).toBe(REPLACEMENT);
    expect(decoder.decode(bytes(0x00, 0xdc, 0x41, 0x00))).toBe(`${REPLACEMENT}A`);
    expect(decoder.decode(bytes(0x00, 0xd8, 0x41, 0x00))).toBe(`${REPLACEMENT}A`);
    expect(decoder.decode(bytes(0x41, 0x00, 0x42))).toBe(`A${REPLACEMENT}`);
  });

  it('fatal 模式下任何无效 UTF-16LE 序列都抛错', () => {
    const decoder = new textDecoderPolyfill('utf-16le', { fatal: true });

    expect(() => decoder.decode(bytes(0x00, 0xdc))).toThrow('无效的 UTF-16LE');
    expect(() => decoder.decode(bytes(0x00, 0xd8, 0x41, 0x00))).toThrow('无效的 UTF-16LE');
    expect(() => decoder.decode(bytes(0x41))).toThrow('无效的 UTF-16LE');
  });

  it('默认剥离 BOM，ignoreBOM 时保留', () => {
    const withBom = bytes(0xef, 0xbb, 0xbf, 0x41);

    expect(new textDecoderPolyfill().decode(withBom)).toBe('A');
    expect(new textDecoderPolyfill('utf-8', { ignoreBOM: true }).decode(withBom)).toBe('﻿A');
    expect(new textDecoderPolyfill('utf-8', { ignoreBOM: true }).ignoreBOM).toBe(true);
  });
});
