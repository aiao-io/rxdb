/**
 * @fileoverview 逻辑层 WASM：标准 `WebAssembly` 在不在、代码包里的 wa-sqlite.wasm 按锁定版本的指纹从哪儿取字节。
 *
 * 支付宝文档只写了 Worker 里的 `MYWebAssembly`；v2 探针在模拟器与 iOS 的逻辑层都实测到标准 `WebAssembly`，
 * 正式 host 的 wasm 运行时走的就是它，字节按锁定版本的指纹从 `.wasm` 原文件或 base64 文本副本里选
 * （见 adapter 的 `readAlipayCodePackageWasm`）。另外把二进制读单独与指纹对比：模拟器会把非法 UTF-8 序列
 * 改写成 `EF BF BD`，iOS 读回的字节与原文件一致（v3–v6 实测）。能否实例化由核心实验回答。
 */
import type { AlipayApi, StandardWasmApi } from '../alipay-api.js';
import {
  ALIPAY_WASM_FINGERPRINT,
  createAlipayCodePackageReader,
  fingerprintWasm,
  readAlipayCodePackageWasm
} from '../official-host.js';
import { probe, type Probe } from '../probe.js';
import { ADAPTER_DEFAULT_WASM_PATH } from '../vfs-classifiers.js';

/** wasm 字节的来源：`.wasm` 原文件或它的 base64 文本副本。 */
export type WasmByteSource = ReturnType<typeof readAlipayCodePackageWasm>['source'];

/** wa-sqlite.wasm 的二进制读与锁定版本指纹的对比。 */
export interface CodePackageBinaryReport {
  /** 二进制读出的字节数。 */
  readonly binaryBytes: number;
  /** 锁定版本的字节数，即 wasm 的真实大小。 */
  readonly expectedBytes: number;
  /** 二进制读与锁定版本的指纹（字节数 + FNV-1a）一致。 */
  readonly bytesMatch: boolean;
}

/** 逻辑层 WASM 实验的结果。 */
export interface WasmReport {
  readonly standardAvailable: boolean;
  /** 代码包的二进制读是否原样。 */
  readonly codePackageBinary: Probe<CodePackageBinaryReport>;
  /** 按锁定版本的指纹选到的字节来源；核心实验的 wasm 运行时用的是同一规则。 */
  readonly sources: Readonly<Record<string, Probe<WasmByteSource>>>;
}

type CodePackageApi = Pick<AlipayApi, 'getFileSystemManager' | 'base64ToArrayBuffer'>;

function compareCodePackageBinary(my: CodePackageApi): CodePackageBinaryReport {
  const binary = new Uint8Array(
    createAlipayCodePackageReader(my.getFileSystemManager()).readBinarySync(ADAPTER_DEFAULT_WASM_PATH)
  );
  const actual = fingerprintWasm(binary);
  return {
    binaryBytes: actual.bytes,
    expectedBytes: ALIPAY_WASM_FINGERPRINT.bytes,
    bytesMatch: actual.bytes === ALIPAY_WASM_FINGERPRINT.bytes && actual.fnv1a === ALIPAY_WASM_FINGERPRINT.fnv1a
  };
}

/**
 * 跑逻辑层 WASM 实验。
 *
 * @param my - 支付宝全局 `my`，只用代码包读取与 base64 解码
 * @param wasm - 逻辑层的标准 `WebAssembly`；`undefined` 表示没有
 */
export async function runWasmExperiment(my: CodePackageApi, wasm: StandardWasmApi | undefined): Promise<WasmReport> {
  const codePackageBinary = await probe(() => compareCodePackageBinary(my));
  const sources = {
    [ADAPTER_DEFAULT_WASM_PATH]: await probe(() => readAlipayCodePackageWasm(my, ADAPTER_DEFAULT_WASM_PATH).source)
  };
  return { standardAvailable: wasm !== undefined, codePackageBinary, sources };
}
