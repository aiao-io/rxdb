import { addWasmBytes, wasmBytes } from './__tests__/fake-alipay.js';
import { fingerprintWasm, matchesFingerprint } from './wasm-fingerprint.js';

describe('fingerprintWasm', () => {
  it('记字节数与 FNV-1a 32 位散列（无符号）', () => {
    // FNV-1a 公开测试向量：空串与 "a"
    expect(fingerprintWasm(new Uint8Array(0))).toEqual({ bytes: 0, fnv1a: 0x811c9dc5 });
    expect(fingerprintWasm(Uint8Array.from([0x61]))).toEqual({ bytes: 1, fnv1a: 0xe40c292c });
  });

  it('同样的字节同样的指纹，不同的 wasm 指纹不同', () => {
    expect(fingerprintWasm(Uint8Array.from(wasmBytes))).toEqual(fingerprintWasm(wasmBytes));
    expect(fingerprintWasm(addWasmBytes)).not.toEqual(fingerprintWasm(wasmBytes));
  });
});

describe('matchesFingerprint', () => {
  const expected = fingerprintWasm(wasmBytes);

  it('原样的字节对得上', () => {
    expect(matchesFingerprint(Uint8Array.from(wasmBytes), expected)).toBe(true);
  });

  it('长度不同直接判不符', () => {
    expect(matchesFingerprint(wasmBytes.slice(1), expected)).toBe(false);
  });

  it('长度相同、改了一个字节也判不符', () => {
    const tampered = Uint8Array.from(wasmBytes);
    tampered[8] ^= 0xff;
    expect(matchesFingerprint(tampered, expected)).toBe(false);
  });
});
