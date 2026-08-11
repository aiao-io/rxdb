import { describe, expect, it } from 'vitest';
import { utf8StringToArrayBuffer } from '../../string/utf8StringToArrayBuffer.js';

describe('utf8StringToArrayBuffer', () => {
  it('should preserve unicode content', () => {
    const input = '你好, world';
    const buffer = utf8StringToArrayBuffer(input);
    expect(new TextDecoder().decode(buffer)).toBe(input);
  });
});
