import { deserialize, serialize } from '@ungap/structured-clone';
import type { MiniProgramRandomValuesResult, MiniProgramWechatApi } from './mini-program.interface.js';
import { textDecoderPolyfill, textEncoderPolyfill } from './text-encoding-polyfills.js';

const structuredClonePolyfill = <T>(value: T): T => deserialize<T>(serialize(value));
const WEB_CRYPTO_MAX_REQUEST_BYTES = 65_536;
const RUNTIME_SOURCE_MARKER = '__aiaoMiniProgramRuntimeSource';

/** `wx.getRandomValues` 单次允许的最大字节数。 */
export const MAX_MINI_PROGRAM_RANDOM_POOL_SIZE = 1_048_576;

/** 小程序运行时引导选项。 */
export interface PrepareMiniProgramRuntimeOptions {
  /** 同步安全随机池字节数。 */
  readonly randomPoolSize?: number;
}

/** 能力的实际来源。 */
export type MiniProgramRuntimeSource = 'missing' | 'native' | 'polyfill' | 'wechat';

/** 小程序运行时能力来源。 */
export interface MiniProgramRuntimeSources {
  readonly random: MiniProgramRuntimeSource;
  readonly structuredClone: MiniProgramRuntimeSource;
  readonly textEncoder: MiniProgramRuntimeSource;
  readonly textDecoder: MiniProgramRuntimeSource;
  readonly performanceNow: MiniProgramRuntimeSource;
}

markRuntimeSource(structuredClonePolyfill, 'polyfill');
markRuntimeSource(textEncoderPolyfill, 'polyfill');
markRuntimeSource(textDecoderPolyfill, 'polyfill');

const performanceStart = Date.now();
let lastPerformanceNow = 0;
const performanceNowPolyfill = (): number => {
  lastPerformanceNow = Math.max(lastPerformanceNow, Date.now() - performanceStart);
  return lastPerformanceNow;
};

markRuntimeSource(performanceNowPolyfill, 'polyfill');

function markRuntimeSource(target: object, source: MiniProgramRuntimeSource): void {
  Object.defineProperty(target, RUNTIME_SOURCE_MARKER, {
    configurable: false,
    value: source
  });
}

function readRuntimeSource(value: unknown): MiniProgramRuntimeSource | undefined {
  if (typeof value !== 'function') return undefined;
  const source = (value as unknown as Record<string, unknown>)[RUNTIME_SOURCE_MARKER];
  return source === 'polyfill' || source === 'wechat' ? source : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'errMsg' in error) return String(error.errMsg);
  return String(error);
}

function validateRandomPoolSize(value: number | undefined): number {
  const size = value ?? MAX_MINI_PROGRAM_RANDOM_POOL_SIZE;
  if (Number.isSafeInteger(size) && size > 0 && size <= MAX_MINI_PROGRAM_RANDOM_POOL_SIZE) return size;
  throw new RangeError(`randomPoolSize 必须是 1-${MAX_MINI_PROGRAM_RANDOM_POOL_SIZE} 的安全整数`);
}

function requestWechatRandomPool(wechat: MiniProgramWechatApi, length: number): Promise<Uint8Array> {
  const getRandomValues = wechat.getRandomValues;
  if (typeof getRandomValues !== 'function') {
    return Promise.reject(new Error('微信运行时缺少 wx.getRandomValues'));
  }
  return new Promise((resolve, reject) => {
    const success = (result: MiniProgramRandomValuesResult): void => {
      const pool = new Uint8Array(result.randomValues);
      if (pool.byteLength !== length) {
        reject(new Error(`wx.getRandomValues 返回 ${pool.byteLength} bytes，期望 ${length} bytes`));
        return;
      }
      resolve(pool.slice());
    };
    const fail = (error: { readonly errMsg?: string }): void => {
      reject(new Error(`wx.getRandomValues 失败: ${errorMessage(error)}`, { cause: error }));
    };
    try {
      getRandomValues.call(wechat, { length, success, fail });
    } catch (error) {
      fail({ errMsg: errorMessage(error) });
    }
  });
}

function installSecureRandomPool(pool: Uint8Array): void {
  let offset = 0;
  const getRandomValues: Crypto['getRandomValues'] = <T extends ArrayBufferView | null>(target: T): T => {
    if (!target || !ArrayBuffer.isView(target)) throw new TypeError('getRandomValues 需要 ArrayBufferView');
    if (target.byteLength > WEB_CRYPTO_MAX_REQUEST_BYTES) {
      throw new RangeError(`getRandomValues 单次不能超过 ${WEB_CRYPTO_MAX_REQUEST_BYTES} bytes`);
    }
    if (offset + target.byteLength > pool.byteLength) {
      throw new Error('微信小程序安全随机池已耗尽，请重新引导运行时');
    }
    const output = new Uint8Array(target.buffer as ArrayBuffer, target.byteOffset, target.byteLength);
    output.set(pool.subarray(offset, offset + target.byteLength));
    offset += target.byteLength;
    return target;
  };

  const cryptoApi = globalThis.crypto ?? ({} as Crypto);
  Object.defineProperty(cryptoApi, 'getRandomValues', {
    configurable: true,
    value: getRandomValues,
    writable: true
  });
  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: cryptoApi,
      writable: true
    });
  }
  markRuntimeSource(getRandomValues, 'wechat');
}

/** 补齐微信小程序逻辑层缺失的同步运行时能力。 */
export function installMiniProgramRuntimePolyfills(): void {
  if (typeof globalThis.structuredClone !== 'function') {
    Object.defineProperty(globalThis, 'structuredClone', {
      configurable: true,
      value: structuredClonePolyfill,
      writable: true
    });
  }
  if (typeof globalThis.TextEncoder !== 'function') {
    Object.defineProperty(globalThis, 'TextEncoder', {
      configurable: true,
      value: textEncoderPolyfill,
      writable: true
    });
  }
  if (typeof globalThis.TextDecoder !== 'function') {
    Object.defineProperty(globalThis, 'TextDecoder', {
      configurable: true,
      value: textDecoderPolyfill,
      writable: true
    });
  }
  const performanceApi = globalThis.performance;
  if (typeof performanceApi?.now !== 'function') {
    const target = performanceApi ?? ({} as Performance);
    Object.defineProperty(target, 'now', {
      configurable: true,
      value: performanceNowPolyfill,
      writable: true
    });
    if (!performanceApi) {
      Object.defineProperty(globalThis, 'performance', {
        configurable: true,
        value: target,
        writable: true
      });
    }
  }
}

/** 在加载 RxDB 主包前引导微信小程序运行时。 */
export async function prepareMiniProgramRuntime(
  wechat: MiniProgramWechatApi,
  options: PrepareMiniProgramRuntimeOptions = {}
): Promise<MiniProgramRuntimeSources> {
  installMiniProgramRuntimePolyfills();
  if (getMiniProgramRuntimeSources().random === 'native') return getMiniProgramRuntimeSources();
  const pool = await requestWechatRandomPool(wechat, validateRandomPoolSize(options.randomPoolSize));
  installSecureRandomPool(pool);
  return getMiniProgramRuntimeSources();
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

/** 使用已引导的同步安全随机源填充视图。 */
export function fillMiniProgramRandomValues<T extends ArrayBufferView<ArrayBuffer>>(target: T): T {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('微信小程序安全随机源尚未引导');
  }
  cryptoApi.getRandomValues(target);
  return target;
}
