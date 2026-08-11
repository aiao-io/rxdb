import { isArrayBuffer, isString, isUint8Array } from '../types/index.js';

const toBinaryString = (value: ArrayLike<number>): string => {
  const chunkSize = 0x8000;
  let result = '';
  // `Array.from(value)` 原本在**循环体内**，每个分块都要把整个输入完整复制一遍 ——
  // n/chunkSize 次全量复制，复杂度 O(n²/chunkSize)。
  // TypedArray 走 subarray（零拷贝视图），其余只在进入循环前物化一次（UTL-018）
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as Uint8Array;
    for (let index = 0; index < view.length; index += chunkSize) {
      result += String.fromCharCode.apply(null, view.subarray(index, index + chunkSize) as unknown as number[]);
    }
    return result;
  }
  const materialized = Array.from(value);
  for (let index = 0; index < materialized.length; index += chunkSize) {
    result += String.fromCharCode(...materialized.slice(index, index + chunkSize));
  }
  return result;
};

const encodeBinary = (value: ArrayLike<number>): string => {
  if (typeof globalThis.btoa !== 'function') {
    throw new Error('Base64 encoding requires globalThis.btoa');
  }
  return globalThis.btoa(toBinaryString(value));
};

/**
 * 将 UTF-8 文本或字节数据编码为 Base64。
 *
 * @param value - UTF-8 字符串或字节数据
 * @returns Base64 字符串
 */
export const base64Encode = (value: Uint8Array | ArrayBuffer | string | number[]): string => {
  if (isString(value)) return encodeBinary(new TextEncoder().encode(value));
  if (isUint8Array(value) || Array.isArray(value)) return encodeBinary(value);
  if (isArrayBuffer(value)) return encodeBinary(new Uint8Array(value));
  throw new TypeError(`Unsupported type for base64 encoding: ${value === null ? 'null' : typeof value}`);
};
