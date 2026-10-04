/**
 * @fileoverview 代码包 wasm 的构建期指纹：字节数 + FNV-1a 32 位散列。
 *
 * 两端没有同一个可信的字节来源：模拟器把 `.wasm` 的二进制读改写成 UTF-8 文本，iOS 真机的代码包又没有
 * `.base64.txt` 文本副本（v3 探针实测 10022）。构建时给每个 wasm 记下指纹，运行时据此判断读到的字节是不是原样。
 * 只防平台改写、不防篡改，所以不用密码学散列。
 *
 * 本文件不 import 任何模块，也只用可擦除的类型语法：构建脚本经 Node 的类型剥离直接 import 它，与运行时共用一份算法。
 */

/** 一个 wasm 的指纹。 */
export interface WasmFingerprint {
  /** 字节数。 */
  readonly bytes: number;
  /** FNV-1a 32 位散列，无符号整数。 */
  readonly fnv1a: number;
}

/** 代码包相对路径 → 指纹。 */
export type WasmFingerprints = Readonly<Record<string, WasmFingerprint>>;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * 算指纹。
 *
 * @param bytes - wasm 字节
 */
export function fingerprintWasm(bytes: Uint8Array): WasmFingerprint {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < bytes.byteLength; index++) hash = Math.imul(hash ^ bytes[index], FNV_PRIME);
  return { bytes: bytes.byteLength, fnv1a: hash >>> 0 };
}

/**
 * 字节是否与指纹一致；长度不同时不算散列。
 *
 * @param bytes - 读到的字节
 * @param expected - 构建时记下的指纹
 */
export function matchesFingerprint(bytes: Uint8Array, expected: WasmFingerprint): boolean {
  return bytes.byteLength === expected.bytes && fingerprintWasm(bytes).fnv1a === expected.fnv1a;
}
