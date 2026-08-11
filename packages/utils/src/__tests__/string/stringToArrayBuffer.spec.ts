import { describe, expect, it } from 'vitest';
import { stringToArrayBuffer } from '../../string/stringToArrayBuffer.js';

describe('stringToArrayBuffer', () => {
  it('should preserve raw byte values from a binary string', () => {
    const input = String.fromCharCode(0, 127, 128, 255);
    const buffer = stringToArrayBuffer(input);
    expect(Array.from(new Uint8Array(buffer))).toEqual([0, 127, 128, 255]);
  });
});
