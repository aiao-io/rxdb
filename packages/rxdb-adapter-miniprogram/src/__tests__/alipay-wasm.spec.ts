/**
 * 支付宝代码包 wasm：按锁定版本的指纹选字节源（原文件或 base64 文本副本），交给逻辑层标准 `WebAssembly`。
 */
import { describe, expect, it, vi } from 'vitest';
import { AlipayFsError } from '../hosts/alipay-file-system.js';
import {
  ALIPAY_WASM_FINGERPRINT,
  ALIPAY_WASM_TEXT_COPY_SUFFIX,
  createAlipayWasmRuntime,
  fingerprintWasm,
  readAlipayCodePackageWasm
} from '../hosts/alipay-wasm.js';
import type { AlipayStandardWasmApi } from '../hosts/alipay-api.js';
import { createFakeAlipay } from './fake-alipay.js';
import { wasmBytes } from './subframe-wasm-factory.js';

const WASM_PATH = 'wa-sqlite/wa-sqlite.wasm';

function corrupted(): Uint8Array {
  const bytes = Uint8Array.from(wasmBytes);
  bytes[100] ^= 0xff;
  return bytes;
}

function thrown(task: () => unknown): unknown {
  try {
    task();
  } catch (error) {
    return error;
  }
  throw new Error('应当抛错');
}

describe('ALIPAY_WASM_FINGERPRINT', () => {
  it('与依赖里锁定版本的 wa-sqlite.wasm 一致（glue 与 wasm 跨构建混用会 LinkError）', () => {
    expect(fingerprintWasm(wasmBytes)).toEqual(ALIPAY_WASM_FINGERPRINT);
  });

  it('FNV-1a 32 位：空输入是偏移基，结果是无符号整数', () => {
    expect(fingerprintWasm(new Uint8Array(0))).toEqual({ bytes: 0, fnv1a: 0x811c9dc5 });
    expect(fingerprintWasm(Uint8Array.from([0x61]))).toEqual({ bytes: 1, fnv1a: 0xe40c292c });
  });
});

describe('readAlipayCodePackageWasm', () => {
  it('iOS 形态：.wasm 原文件与指纹一致，直接用原文件', () => {
    const { my } = createFakeAlipay({ mode: 'ios' });
    const wasm = readAlipayCodePackageWasm(my, WASM_PATH);

    expect(wasm.source).toBe('binary');
    expect(Buffer.from(wasm.bytes).equals(Buffer.from(wasmBytes))).toBe(true);
  });

  it('模拟器形态：二进制读被改写、与指纹不符，改用 base64 文本副本', () => {
    const { my } = createFakeAlipay({ mode: 'simulator' });
    const wasm = readAlipayCodePackageWasm(my, WASM_PATH);

    expect(ALIPAY_WASM_TEXT_COPY_SUFFIX).toBe('.base64.txt');
    expect(wasm.source).toBe('textCopy');
    expect(Buffer.from(wasm.bytes).equals(Buffer.from(wasmBytes))).toBe(true);
  });

  it('原文件与指纹不符、又没有文本副本：抛错，带上两边字节数，FS 错误挂在 cause 上', () => {
    const { my } = createFakeAlipay({ mode: 'ios', codePackage: new Map([[WASM_PATH, wasmBytes.slice(1)]]) });
    const error = thrown(() => readAlipayCodePackageWasm(my, WASM_PATH));

    expect(error).toMatchObject({
      message: `${WASM_PATH} 的二进制读与锁定版本的指纹不符（727645 / 727646 字节），base64 文本副本也读不出`,
      cause: expect.any(AlipayFsError) as unknown
    });
    expect((error as Error).cause).toMatchObject({ platformCode: 10022 });
  });

  it('文本副本解码后也与指纹不符：抛错，不把改写过的字节交出去', () => {
    const { my } = createFakeAlipay({ mode: 'simulator', codePackage: new Map([[WASM_PATH, corrupted()]]) });

    expect(() => readAlipayCodePackageWasm(my, WASM_PATH)).toThrow(
      `${WASM_PATH} 的 base64 文本副本解码后与锁定版本的指纹不符（727646 / 727646 字节）`
    );
  });

  it('原文件不存在：把 FS 错误原样抛出', () => {
    const { my } = createFakeAlipay({ mode: 'ios' });

    expect(thrown(() => readAlipayCodePackageWasm(my, 'missing.wasm'))).toMatchObject({
      name: 'AlipayFsError',
      method: 'readFileSync',
      path: 'missing.wasm',
      platformCode: 10022
    });
  });
});

describe('createAlipayWasmRuntime', () => {
  function webAssemblyStub(): AlipayStandardWasmApi & { instantiate: ReturnType<typeof vi.fn> } {
    return { instantiate: vi.fn(async () => ({ instance: { exports: {} } })) };
  }

  it('把选中的字节与 imports 交给标准 WebAssembly.instantiate，结果原样返回', async () => {
    const { my } = createFakeAlipay({ mode: 'simulator' });
    const webAssembly = webAssemblyStub();
    const imports = { env: {} };

    await expect(createAlipayWasmRuntime(my, webAssembly).instantiate(WASM_PATH, imports)).resolves.toEqual({
      instance: { exports: {} }
    });
    const [bytes, passedImports] = webAssembly.instantiate.mock.calls[0] as [Uint8Array, unknown];
    expect(Buffer.from(bytes).equals(Buffer.from(wasmBytes))).toBe(true);
    expect(passedImports).toBe(imports);
  });

  it('选源失败时 instantiate reject，不调 WebAssembly', async () => {
    const { my } = createFakeAlipay({ mode: 'simulator', codePackage: new Map([[WASM_PATH, corrupted()]]) });
    const webAssembly = webAssemblyStub();

    await expect(createAlipayWasmRuntime(my, webAssembly).instantiate(WASM_PATH, {})).rejects.toThrow(
      '文本副本解码后与锁定版本的指纹不符'
    );
    expect(webAssembly.instantiate).not.toHaveBeenCalled();
  });

  it('getFileSystemManager 抛错时 instantiate reject（建运行时不读文件）', async () => {
    const { my } = createFakeAlipay();
    const failing = {
      ...my,
      getFileSystemManager: () => {
        throw new Error('fs down');
      }
    };
    const wasmRuntime = createAlipayWasmRuntime(failing, webAssemblyStub());

    await expect(wasmRuntime.instantiate(WASM_PATH, {})).rejects.toThrow('fs down');
  });
});
