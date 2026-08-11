import { describe, expect, it } from 'vitest';
import { base64Encode } from '../../crypto/base64Encode.js';

describe('base64Encode', () => {
  it('1', () => {
    const base64 = base64Encode('aaa');
    expect(base64).toBe('YWFh');
  });
  it('2', () => {
    const base64 = base64Encode('bbb');
    expect(base64).toBe('YmJi');
  });
  it('3', () => {
    const base64 = base64Encode([1, 2, 3]);
    expect(base64).toBe('AQID');
  });

  it('should encode large byte arrays without overflowing the call stack', () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, index) => index % 256);
    const base64 = base64Encode(bytes);
    expect(base64).toBe(Buffer.from(bytes).toString('base64'));
  });
});

it('encodes strings as UTF-8', () => {
  expect(base64Encode('你好')).toBe(Buffer.from('你好', 'utf8').toString('base64'));
});
