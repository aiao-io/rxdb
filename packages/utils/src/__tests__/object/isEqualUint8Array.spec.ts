import { describe, expect, it } from 'vitest';
import { isEqualUint8Array } from '../../object/isEqualUint8Array.js';

describe('isEqualUint8Array', () => {
  it('1', () => {
    expect(isEqualUint8Array(new Uint8Array([42, 0]), new Uint8Array([42, 0]))).toBe(true);
  });
  it('2', () => {
    expect(isEqualUint8Array(new Uint8Array([42, 0]), new Uint8Array([42]))).toBe(false);
  });
});
