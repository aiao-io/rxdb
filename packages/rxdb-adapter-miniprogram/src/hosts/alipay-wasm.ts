/**
 * @fileoverview 支付宝逻辑层的 wasm 运行时：从代码包取出原样字节，交给标准 `WebAssembly.instantiate`。
 *
 * 两端没有同一个可信的字节来源（US-211 支付宝探针 v3–v6 实测）：
 *
 * - 开发者工具模拟器把代码包文件当 UTF-8 文本读，不论传什么编码，非法字节序列都变成 `EF BF BD`
 *   （727646 字节的 wa-sqlite.wasm 读回 814795 字节）；base64 只含 ASCII，读回原样；
 * - iOS 真机的 `.wasm` 原文件读回原样，代码包里却没有 `.base64.txt` 文本副本（10022）。
 *
 * 所以应用要在 wasm 旁边放一份 base64 文本副本，运行时按锁定版本的指纹判断读到的字节是不是原样：
 * 先读原文件，不符再读副本，都不符就抛错。按内容核对、不按环境分支，属保持语义的绕行。
 */
import type { MiniProgramWasmRuntime } from '../mini-program.interface.js';
import type { AlipayStandardWasmApi, MiniProgramAlipayApi } from './alipay-api.js';
import { createAlipayCodePackageReader, type AlipayCodePackageReader } from './alipay-file-system.js';

/** 一个 wasm 的指纹：只防平台改写、不防篡改，所以不用密码学散列。 */
export interface AlipayWasmFingerprint {
  /** 字节数。 */
  readonly bytes: number;
  /** FNV-1a 32 位散列，无符号整数。 */
  readonly fnv1a: number;
}

/**
 * 锁定版本 `@subframe7536/sqlite-wasm@1.3.1` 的 `dist/wa-sqlite.wasm` 的指纹。
 *
 * adapter 内置的 glue 与这份 wasm 同源，跨构建混用会 `LinkError`，所以代码包里只可能放这一份；
 * 升级依赖时单测会核对常量。
 */
export const ALIPAY_WASM_FINGERPRINT: AlipayWasmFingerprint = Object.freeze({ bytes: 727_646, fnv1a: 2_641_369_642 });

/** 代码包里 wasm 的 base64 文本副本的后缀：`wa-sqlite/wa-sqlite.wasm` 的副本是 `wa-sqlite/wa-sqlite.wasm.base64.txt`。 */
export const ALIPAY_WASM_TEXT_COPY_SUFFIX = '.base64.txt';

const FNV_OFFSET_BASIS = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;

/**
 * 算指纹。
 *
 * @param bytes - wasm 字节
 */
export function fingerprintWasm(bytes: Uint8Array): AlipayWasmFingerprint {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, FNV_PRIME);
  return { bytes: bytes.byteLength, fnv1a: hash >>> 0 };
}

function matchesFingerprint(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength === ALIPAY_WASM_FINGERPRINT.bytes && fingerprintWasm(bytes).fnv1a === ALIPAY_WASM_FINGERPRINT.fnv1a
  );
}

function sizes(actual: number): string {
  return `${String(actual)} / ${String(ALIPAY_WASM_FINGERPRINT.bytes)} 字节`;
}

/** {@link readAlipayCodePackageWasm} 的结果。 */
export interface AlipayCodePackageWasm {
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** 字节来自 `.wasm` 原文件还是它的 base64 文本副本。 */
  readonly source: 'binary' | 'textCopy';
}

type Base64Decoder = Pick<MiniProgramAlipayApi, 'base64ToArrayBuffer'>;

function readTextCopy(
  reader: AlipayCodePackageReader,
  my: Base64Decoder,
  path: string,
  binaryBytes: number
): Uint8Array<ArrayBuffer> {
  try {
    return new Uint8Array(my.base64ToArrayBuffer(reader.readTextSync(`${path}${ALIPAY_WASM_TEXT_COPY_SUFFIX}`)));
  } catch (cause) {
    throw new Error(`${path} 的二进制读与锁定版本的指纹不符（${sizes(binaryBytes)}），base64 文本副本也读不出`, {
      cause
    });
  }
}

/**
 * 按锁定版本的指纹从代码包读 wasm：先读 `.wasm` 原文件，一致就用；不一致再读 base64 文本副本，副本也得一致。
 * 两者都不符就抛错，改写过的字节不交给 `WebAssembly`。原文件读不出时 FS 错误原样抛出。
 *
 * @param my - 支付宝全局 `my`
 * @param path - 相对代码包根的路径
 */
export function readAlipayCodePackageWasm(
  my: Pick<MiniProgramAlipayApi, 'base64ToArrayBuffer' | 'getFileSystemManager'>,
  path: string
): AlipayCodePackageWasm {
  const reader = createAlipayCodePackageReader(my.getFileSystemManager());
  const binary = new Uint8Array(reader.readBinarySync(path));
  if (matchesFingerprint(binary)) return { bytes: binary, source: 'binary' };
  const copy = readTextCopy(reader, my, path, binary.byteLength);
  if (matchesFingerprint(copy)) return { bytes: copy, source: 'textCopy' };
  throw new Error(`${path} 的 base64 文本副本解码后与锁定版本的指纹不符（${sizes(copy.byteLength)}）`);
}

/**
 * 支付宝逻辑层的 wasm 运行时：按 {@link readAlipayCodePackageWasm} 取字节，交给标准 `WebAssembly.instantiate`。
 *
 * 支付宝文档只写了 Worker 里的 `MYWebAssembly`，逻辑层的标准 `WebAssembly` 是实测到的
 * （可行性矩阵 `undocumented` 的 `logic-layer-webassembly`）。建运行时不读文件，读文件与选源的错误都变成 reject。
 *
 * @param my - 支付宝全局 `my`
 * @param webAssembly - 逻辑层的标准 `WebAssembly`
 */
export function createAlipayWasmRuntime(
  my: Pick<MiniProgramAlipayApi, 'base64ToArrayBuffer' | 'getFileSystemManager'>,
  webAssembly: AlipayStandardWasmApi
): MiniProgramWasmRuntime {
  return {
    instantiate: async (path, imports) => webAssembly.instantiate(readAlipayCodePackageWasm(my, path).bytes, imports)
  };
}
