import type { WaSqliteMiniProgramOptions } from './mini-program.interface.js';
import type { MiniProgramRuntimeSource } from './runtime-polyfills.js';

const RUNTIME_SOURCE_MARKER = '__aiaoMiniProgramRuntimeSource';

function runtimeSource(value: unknown): MiniProgramRuntimeSource | undefined {
  if (typeof value !== 'function') return undefined;
  const source = (value as unknown as Record<string, unknown>)[RUNTIME_SOURCE_MARKER];
  return source === 'polyfill' || source === 'wechat' ? source : undefined;
}

function getRuntimeSources(): {
  random: MiniProgramRuntimeSource;
  structuredClone: MiniProgramRuntimeSource;
  textEncoder: MiniProgramRuntimeSource;
  textDecoder: MiniProgramRuntimeSource;
  performanceNow: MiniProgramRuntimeSource;
} {
  const random = globalThis.crypto?.getRandomValues;
  const clone = globalThis.structuredClone;
  const textEncoder = globalThis.TextEncoder;
  const textDecoder = globalThis.TextDecoder;
  const performanceNow = globalThis.performance?.now;
  return {
    random: typeof random !== 'function' ? 'missing' : (runtimeSource(random) ?? 'native'),
    structuredClone: typeof clone !== 'function' ? 'missing' : (runtimeSource(clone) ?? 'native'),
    textEncoder: typeof textEncoder !== 'function' ? 'missing' : (runtimeSource(textEncoder) ?? 'native'),
    textDecoder: typeof textDecoder !== 'function' ? 'missing' : (runtimeSource(textDecoder) ?? 'native'),
    performanceNow: typeof performanceNow !== 'function' ? 'missing' : (runtimeSource(performanceNow) ?? 'native')
  };
}

/** 小程序运行 RxDB 所需的一项能力。 */
export interface MiniProgramRuntimeCapability {
  readonly name: string;
  readonly available: boolean;
  readonly source?: MiniProgramRuntimeSource;
}

/** 检查微信小程序逻辑层运行完整 RxDB/wa-sqlite 所需的能力。 */
export function checkMiniProgramRuntimeCapabilities(
  options: Pick<WaSqliteMiniProgramOptions, 'moduleFactory' | 'wasmRuntime' | 'wechat'>
): readonly MiniProgramRuntimeCapability[] {
  const fileSystem = options.wechat?.getFileSystemManager?.();
  const sources = getRuntimeSources();
  return [
    { name: 'moduleFactory', available: typeof options.moduleFactory === 'function' },
    { name: 'WXWebAssembly.instantiate', available: typeof options.wasmRuntime?.instantiate === 'function' },
    { name: 'wx.getFileSystemManager', available: !!fileSystem },
    { name: 'wx.env.USER_DATA_PATH', available: typeof options.wechat?.env?.USER_DATA_PATH === 'string' },
    { name: 'BigInt', available: typeof globalThis.BigInt === 'function' },
    { name: 'crypto.getRandomValues', available: sources.random !== 'missing', source: sources.random },
    {
      name: 'structuredClone',
      available: sources.structuredClone !== 'missing',
      source: sources.structuredClone
    },
    { name: 'TextEncoder', available: sources.textEncoder !== 'missing', source: sources.textEncoder },
    { name: 'TextDecoder', available: sources.textDecoder !== 'missing', source: sources.textDecoder },
    { name: 'performance.now', available: sources.performanceNow !== 'missing', source: sources.performanceNow },
    { name: 'queueMicrotask', available: typeof globalThis.queueMicrotask === 'function' }
  ];
}

/** 缺少硬依赖时在加载 WASM 前给出完整能力清单。 */
export function assertMiniProgramRuntimeCapabilities(
  options: Pick<WaSqliteMiniProgramOptions, 'moduleFactory' | 'wasmRuntime' | 'wechat'>
): void {
  const missing = checkMiniProgramRuntimeCapabilities(options).filter(capability => !capability.available);
  if (missing.length === 0) return;
  throw new Error(`微信小程序运行时缺少 RxDB 必需能力: ${missing.map(item => item.name).join(', ')}`);
}
