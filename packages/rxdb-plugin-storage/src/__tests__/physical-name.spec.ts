import { describe, expect, it } from 'vitest';

import { StorageBackendError } from '../errors.js';
import {
  decodePhysicalName,
  encodePhysicalName,
  MAX_PHYSICAL_NAME_BYTES
} from '../filesystem/physical-name.js';

describe('physical name encoding', () => {
  it('leaves names that are already filesystem-safe untouched', () => {
    for (const name of ['report.pdf', '中文名.txt', 'a-b_c.1', 'Ω≈ç√.bin', '.hidden']) {
      expect(encodePhysicalName(name)).toBe(name);
      expect(decodePhysicalName(name)).toBe(name);
    }
  });

  it('escapes characters that Windows and macOS reject in file names', () => {
    expect(encodePhysicalName('a?b')).toBe('a%3Fb');
    expect(encodePhysicalName('a*b')).toBe('a%2Ab');
    expect(encodePhysicalName('a:b')).toBe('a%3Ab');
    expect(encodePhysicalName('a"b')).toBe('a%22b');
    expect(encodePhysicalName('a<b>c')).toBe('a%3Cb%3Ec');
    expect(encodePhysicalName('a|b')).toBe('a%7Cb');
    expect(encodePhysicalName('a\\b')).toBe('a%5Cb');
    expect(encodePhysicalName('a/b')).toBe('a%2Fb');
    expect(encodePhysicalName('a\u0001b')).toBe('a%01b');
  });

  it('escapes the escape character itself so encoding stays injective', () => {
    // 若 `%` 不转义，逻辑名 `a%3Fb` 与 `a?b` 会编码成同一个物理名，
    // `copyDirectory` / `listEntries` 的物理→逻辑回推就无法还原原始名称。
    expect(encodePhysicalName('a%3Fb')).toBe('a%253Fb');
    expect(decodePhysicalName('a%253Fb')).toBe('a%3Fb');
    expect(decodePhysicalName(encodePhysicalName('a?b'))).toBe('a?b');
    expect(encodePhysicalName('a%3Fb')).not.toBe(encodePhysicalName('a?b'));
  });

  it('escapes trailing dots and spaces that Windows silently strips', () => {
    expect(encodePhysicalName('report.')).toBe('report%2E');
    expect(encodePhysicalName('report ')).toBe('report%20');
    expect(decodePhysicalName('report%2E')).toBe('report.');
    expect(decodePhysicalName('report%20')).toBe('report ');
    // 只有结尾那一个字符需要转义，中间的点照旧。
    expect(encodePhysicalName('a.b.c')).toBe('a.b.c');
  });

  it('escapes Windows reserved device names, including the extension form', () => {
    expect(encodePhysicalName('CON')).toBe('%43ON');
    expect(encodePhysicalName('con')).toBe('%63on');
    expect(encodePhysicalName('NUL.txt')).toBe('%4EUL.txt');
    expect(encodePhysicalName('COM9')).toBe('%43OM9');
    expect(encodePhysicalName('LPT1.log')).toBe('%4CPT1.log');
    expect(decodePhysicalName('%43ON')).toBe('CON');
    expect(decodePhysicalName('%4EUL.txt')).toBe('NUL.txt');
    // 非保留名不受影响
    expect(encodePhysicalName('CONSOLE')).toBe('CONSOLE');
    expect(encodePhysicalName('COM10')).toBe('COM10');
  });

  it('round-trips every name through encode → decode', () => {
    const samples = [
      'plain.txt',
      'a?b*c:d"e<f>g|h\\i/j',
      '%',
      '%%',
      '%41',
      'CON',
      'aux.TXT',
      'trailing.',
      'trailing ',
      '中文 名字.txt',
      '🙂.png',
      '\u0000\u001f',
      '.',
      '..'
    ];

    for (const name of samples) {
      expect(decodePhysicalName(encodePhysicalName(name))).toBe(name);
    }
  });

  it('keeps encoding injective across the sample set', () => {
    const samples = ['a?b', 'a%3Fb', 'CON', '%43ON', 'x.', 'x%2E'];
    const encoded = samples.map(encodePhysicalName);

    expect(new Set(encoded).size).toBe(samples.length);
  });

  it('rejects an empty name', () => {
    expect(() => encodePhysicalName('')).toThrow(StorageBackendError);
    expect(() => encodePhysicalName('')).toThrow(
      expect.objectContaining({ code: 'invalid_physical_name' })
    );
  });

  it('rejects names whose encoded form exceeds the single-component byte limit', () => {
    // 不做哈希截断：截断不可逆，会打断物理名→逻辑名的回推。宁可以稳定错误码拒绝。
    const tooLong = '?'.repeat(MAX_PHYSICAL_NAME_BYTES / 3 + 1);

    expect(() => encodePhysicalName(tooLong)).toThrow(
      expect.objectContaining({ code: 'name_too_long' })
    );
  });

  it('measures the limit in UTF-8 bytes, not UTF-16 code units', () => {
    // 中文字符每个占 3 字节：85 个字符 = 255 字节恰好通过，86 个即超限。
    const exactlyAtLimit = '中'.repeat(MAX_PHYSICAL_NAME_BYTES / 3);
    const overLimit = `${exactlyAtLimit}中`;

    expect(encodePhysicalName(exactlyAtLimit)).toBe(exactlyAtLimit);
    expect(() => encodePhysicalName(overLimit)).toThrow(
      expect.objectContaining({ code: 'name_too_long' })
    );
  });

  it('rejects physical names carrying a malformed escape', () => {
    for (const malformed of ['a%', 'a%3', 'a%zz', 'a%3z']) {
      expect(() => decodePhysicalName(malformed)).toThrow(
        expect.objectContaining({ code: 'invalid_physical_name' })
      );
    }
  });

  it('rejects escapes that would decode to a non-ASCII byte', () => {
    // 编码器只转义 ASCII，`%80` 及以上说明物理名不是本编码器产出的，
    // 强行解码会得到与原逻辑名不同的字符串 —— 静默的数据损坏。
    expect(() => decodePhysicalName('a%80b')).toThrow(
      expect.objectContaining({ code: 'invalid_physical_name' })
    );
  });
});
