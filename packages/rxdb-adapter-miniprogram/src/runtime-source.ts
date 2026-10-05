import { isMiniProgramPlatformId } from './host.js';
import type { MiniProgramPlatformId, MiniProgramRuntimeGlobal } from './mini-program.interface.js';
import { resolveAmbientRuntimeGlobal } from './runtime-global.js';

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

/**
 * 返回当前同步能力的实际来源。
 *
 * @param runtimeGlobal - 要检查的全局对象；缺省用环境里的 `globalThis`，见 `MiniProgramHost.runtimeGlobal`
 * @returns 各项能力是原生、补丁、宿主随机源还是缺失
 */
export function getMiniProgramRuntimeSources(runtimeGlobal?: MiniProgramRuntimeGlobal): MiniProgramRuntimeSources {
  return readMiniProgramRuntimeSources(resolveAmbientRuntimeGlobal(runtimeGlobal));
}

/** 按已解析的全局对象读来源；引导与预检已经解析过，不重复校验。 */
export function readMiniProgramRuntimeSources(target: MiniProgramRuntimeGlobal): MiniProgramRuntimeSources {
  const currentRandom = target.crypto?.getRandomValues;
  const randomSource = readRuntimeSource(currentRandom);
  const structuredCloneSource = readRuntimeSource(target.structuredClone);
  const textEncoderSource = readRuntimeSource(target.TextEncoder);
  const textDecoderSource = readRuntimeSource(target.TextDecoder);
  const performanceNowSource = readRuntimeSource(target.performance?.now);
  return {
    random: typeof currentRandom !== 'function' ? 'missing' : (randomSource ?? 'native'),
    structuredClone: typeof target.structuredClone !== 'function' ? 'missing' : (structuredCloneSource ?? 'native'),
    textEncoder: typeof target.TextEncoder !== 'function' ? 'missing' : (textEncoderSource ?? 'native'),
    textDecoder: typeof target.TextDecoder !== 'function' ? 'missing' : (textDecoderSource ?? 'native'),
    performanceNow: typeof target.performance?.now !== 'function' ? 'missing' : (performanceNowSource ?? 'native')
  };
}
