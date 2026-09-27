import { isMiniProgramPlatformId } from './host.js';
import type { MiniProgramPlatformId } from './mini-program.interface.js';

/**
 * 运行时能力来源的标记属性与读取逻辑。
 *
 * 单独成模块：引导（`runtime-polyfills.ts`）写标记、预检（`runtime-capabilities.ts`）读标记，
 * 两边共用同一个属性名；预检又不该为此把 `@ungap/structured-clone` 拉进自己的依赖图。
 */
const RUNTIME_SOURCE_MARKER = '__aiaoMiniProgramRuntimeSource';

/** 能力的实际来源；由宿主随机源提供时为该宿主的平台 id。 */
export type MiniProgramRuntimeSource = 'missing' | 'native' | 'polyfill' | MiniProgramPlatformId;

/** 小程序运行时能力来源。 */
export interface MiniProgramRuntimeSources {
  readonly random: MiniProgramRuntimeSource;
  readonly structuredClone: MiniProgramRuntimeSource;
  readonly textEncoder: MiniProgramRuntimeSource;
  readonly textDecoder: MiniProgramRuntimeSource;
  readonly performanceNow: MiniProgramRuntimeSource;
}

/** 给补丁函数打上来源标记，之后由 {@link getMiniProgramRuntimeSources} 识别。 */
export function markRuntimeSource(target: object, source: MiniProgramRuntimeSource): void {
  Object.defineProperty(target, RUNTIME_SOURCE_MARKER, {
    configurable: false,
    value: source
  });
}

function readRuntimeSource(value: unknown): MiniProgramRuntimeSource | undefined {
  if (typeof value !== 'function') return undefined;
  const source = (value as unknown as Record<string, unknown>)[RUNTIME_SOURCE_MARKER];
  return source === 'polyfill' || isMiniProgramPlatformId(source) ? source : undefined;
}

/** 返回当前同步能力的实际来源。 */
export function getMiniProgramRuntimeSources(): MiniProgramRuntimeSources {
  const currentRandom = globalThis.crypto?.getRandomValues;
  const randomSource = readRuntimeSource(currentRandom);
  const structuredCloneSource = readRuntimeSource(globalThis.structuredClone);
  const textEncoderSource = readRuntimeSource(globalThis.TextEncoder);
  const textDecoderSource = readRuntimeSource(globalThis.TextDecoder);
  const performanceNowSource = readRuntimeSource(globalThis.performance?.now);
  return {
    random: typeof currentRandom !== 'function' ? 'missing' : (randomSource ?? 'native'),
    structuredClone: typeof globalThis.structuredClone !== 'function' ? 'missing' : (structuredCloneSource ?? 'native'),
    textEncoder: typeof globalThis.TextEncoder !== 'function' ? 'missing' : (textEncoderSource ?? 'native'),
    textDecoder: typeof globalThis.TextDecoder !== 'function' ? 'missing' : (textDecoderSource ?? 'native'),
    performanceNow: typeof globalThis.performance?.now !== 'function' ? 'missing' : (performanceNowSource ?? 'native')
  };
}
