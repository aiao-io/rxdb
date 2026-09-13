import { deserialize, serialize } from '@ungap/structured-clone';
import type { MiniProgramRandomValuesResult, MiniProgramWechatApi } from './mini-program.interface.js';
import { textDecoderPolyfill, textEncoderPolyfill } from './text-encoding-polyfills.js';

const structuredClonePolyfill = <T>(value: T): T => deserialize<T>(serialize(value));
const WEB_CRYPTO_MAX_REQUEST_BYTES = 65_536;
const RUNTIME_SOURCE_MARKER = '__aiaoMiniProgramRuntimeSource';

/** `wx.getRandomValues` 单次允许的最大字节数。 */
export const MAX_MINI_PROGRAM_RANDOM_POOL_SIZE = 1_048_576;

/**
 * 默认随机池字节数。
 *
 * 池会在见底前后台补给，所以首池只需覆盖「补给往返期间的消耗」，不必在启动时
 * 就把上限拉满——那会让引导多等一次 1MB 的桥接传输，并常驻 1MB 内存。
 */
export const DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE = 65_536;

/** 剩余量跌到池大小的这个比例时预约补给。 */
const RANDOM_POOL_REFILL_WATERMARK = 0.25;

const RANDOM_POOL_EXHAUSTED_MESSAGE = '微信小程序安全随机池已耗尽，请重新引导运行时';

/** 小程序运行时引导选项。 */
export interface PrepareMiniProgramRuntimeOptions {
  /** 单个同步安全随机池的字节数；后台补给也按这个大小申请。 */
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
  const size = value ?? DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE;
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
      resolve(pool);
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

function installSecureRandomPool(wechat: MiniProgramWechatApi, initialPool: Uint8Array, poolSize: number): void {
  let pool = initialPool;
  let offset = 0;
  let spare: Uint8Array | undefined;
  let refilling = false;
  let refillError: unknown;

  /** 见底前异步补一池备用；同一时刻只允许一次在途申请。 */
  const scheduleRefill = (): void => {
    if (refilling || spare) return;
    if (pool.byteLength - offset > poolSize * RANDOM_POOL_REFILL_WATERMARK) return;
    refilling = true;
    requestWechatRandomPool(wechat, poolSize).then(
      next => {
        spare = next;
        refilling = false;
        refillError = undefined;
      },
      error => {
        refilling = false;
        // 补给失败不等于降级：同步路径继续用剩余字节，真耗尽时把这个原因作为 cause 抛出去
        refillError = error;
      }
    );
  };

  /** 当前池不够本次请求时换上备池；没有备池就抛错，绝不回退到非密码学随机。 */
  const rotate = (byteLength: number): void => {
    if (offset + byteLength <= pool.byteLength) return;
    if (!spare || byteLength > spare.byteLength) {
      throw new Error(RANDOM_POOL_EXHAUSTED_MESSAGE, { cause: refillError });
    }
    pool.fill(0, offset);
    pool = spare;
    spare = undefined;
    offset = 0;
  };

  const getRandomValues: Crypto['getRandomValues'] = <T extends ArrayBufferView | null>(target: T): T => {
    if (!target || !ArrayBuffer.isView(target)) throw new TypeError('getRandomValues 需要 ArrayBufferView');
    if (target.byteLength > WEB_CRYPTO_MAX_REQUEST_BYTES) {
      throw new RangeError(`getRandomValues 单次不能超过 ${WEB_CRYPTO_MAX_REQUEST_BYTES} bytes`);
    }
    rotate(target.byteLength);
    const output = new Uint8Array(target.buffer as ArrayBuffer, target.byteOffset, target.byteLength);
    const end = offset + target.byteLength;
    output.set(pool.subarray(offset, end));
    // 发出去的字节立刻擦掉，池里只留还没用过的部分
    pool.fill(0, offset, end);
    offset = end;
    scheduleRefill();
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
  const poolSize = validateRandomPoolSize(options.randomPoolSize);
  installSecureRandomPool(wechat, await requestWechatRandomPool(wechat, poolSize), poolSize);
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
