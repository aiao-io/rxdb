/**
 * @fileoverview 实验专用的支付宝 host 与 wasm 运行时。**不是 adapter 的正式实现。**
 *
 * 支付宝已判 unsupported，不在 `MINI_PROGRAM_PLATFORM_IDS` 里，实验只能借用 `wechat` 平台 id 才能把 host
 * 交给 adapter 的公开 API；平台 id 在 adapter 里只做登记校验，不改变任何行为。走的是 adapter 真实的引导、
 * 文件 VFS 与 SQLite 路径，差别只在 FS 包装层（见 `alipay-fs.ts`）和随机源（经 Worker 桥接）。
 */
import type { MiniProgramWasmRuntime } from '@aiao/rxdb-adapter-miniprogram';
import type { MiniProgramFileLayout, MiniProgramHost, MiniProgramRuntimeGlobal } from '@aiao/rxdb-adapter-miniprogram/runtime';
import type { AlipayApi, StandardWasmApi } from './alipay-api.js';
import type { AlipayProbeFileSystem } from './alipay-fs.js';

/**
 * 分块布局：支付宝没有局部写，每次 flush 都整文件重写；单文件 10M 上限也只有分块才碰不到。
 * 与抖音同取 64 KiB。
 */
const ALIPAY_FILE_LAYOUT: MiniProgramFileLayout = Object.freeze({ kind: 'chunked', chunkBytes: 64 * 1024 });

/**
 * 组装实验 host。
 *
 * 不设 `defaultWasmPath`：adapter 默认的相对路径 `wa-sqlite/wa-sqlite.wasm` 由 {@link createAlipayWasmRuntime}
 * 按代码包相对路径读（模拟器实测相对路径可读）。
 *
 * @param my - 支付宝全局 `my`，只读 `env.USER_DATA_PATH`
 * @param fileSystem - 包装后的同步 FS
 * @param requestRandomValues - 随机源；逻辑层没有，实验经 Worker 桥接，失败原样 reject
 * @param runtimeGlobal - 构建 banner 找到的真实全局对象；`globalThis` 可用时不传
 */
export function createAlipayProbeHost(
  my: Pick<AlipayApi, 'env'>,
  fileSystem: AlipayProbeFileSystem,
  requestRandomValues: (length: number) => Promise<Uint8Array>,
  runtimeGlobal?: MiniProgramRuntimeGlobal
): MiniProgramHost {
  const userDataPath = my.env?.USER_DATA_PATH;
  return {
    platform: 'wechat',
    displayName: '支付宝小程序（实验）',
    shortName: '支付宝',
    wasmRuntimeName: 'WebAssembly',
    capabilityNames: { fileSystem: 'my.getFileSystemManager', userDataPath: 'my.env.USER_DATA_PATH' },
    // 与 adapter 的 usableUserDataPath 同义；它不从 runtime 导出
    userDataPath: typeof userDataPath === 'string' && userDataPath !== '' ? userDataPath : undefined,
    ...(runtimeGlobal === undefined ? {} : { runtimeGlobal }),
    fileLayout: ALIPAY_FILE_LAYOUT,
    getFileSystemManager: () => fileSystem,
    requestRandomValues
  };
}

/**
 * 逻辑层的 wasm 运行时：从代码包读出字节，交给标准 `WebAssembly.instantiate`。
 *
 * 支付宝文档只写了 Worker 里的 `MYWebAssembly`，逻辑层的标准 `WebAssembly` 是 v2 探针在模拟器与 iOS 上实测到的。
 */
export function createAlipayWasmRuntime(fileSystem: AlipayProbeFileSystem, wasm: StandardWasmApi): MiniProgramWasmRuntime {
  return {
    instantiate: async (path, imports) => wasm.instantiate(new Uint8Array(fileSystem.readBinarySync(path)), imports)
  };
}
