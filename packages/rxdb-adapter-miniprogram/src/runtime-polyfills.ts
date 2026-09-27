import { deserialize, serialize } from '@ungap/structured-clone';
import { assertMiniProgramHostPlatform, createWechatMiniProgramHost } from './host.js';
import type { MiniProgramHost, MiniProgramWechatApi } from './mini-program.interface.js';
import type { MiniProgramRuntimeSources } from './runtime-source.js';
import { getMiniProgramRuntimeSources, markRuntimeSource } from './runtime-source.js';
import { textDecoderPolyfill, textEncoderPolyfill } from './text-encoding-polyfills.js';

export { getMiniProgramRuntimeSources } from './runtime-source.js';
export type { MiniProgramRuntimeSource, MiniProgramRuntimeSources } from './runtime-source.js';

const structuredClonePolyfill = <T>(value: T): T => deserialize<T>(serialize(value));
const WEB_CRYPTO_MAX_REQUEST_BYTES = 65_536;

/** 单次向平台申请随机数的最大字节数（取自 `wx.getRandomValues` 的上限）。 */
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

/** 一轮池内补给连续失败的上限；到限后本轮不再打扰宿主，耗尽时把最后的原因作为 cause 抛出。 */
const RANDOM_POOL_REFILL_ATTEMPTS = 3;

/** 小程序运行时引导选项。 */
export interface PrepareMiniProgramRuntimeOptions {
  /** 单个同步安全随机池的字节数；后台补给也按这个大小申请。 */
  readonly randomPoolSize?: number;
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

function validateRandomPoolSize(value: number | undefined): number {
  const size = value ?? DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE;
  if (Number.isSafeInteger(size) && size > 0 && size <= MAX_MINI_PROGRAM_RANDOM_POOL_SIZE) return size;
  throw new RangeError(`randomPoolSize 必须是 1-${MAX_MINI_PROGRAM_RANDOM_POOL_SIZE} 的安全整数`);
}

/**
 * 校验宿主交来的随机池并直接接管：类型必须是视图、字节数必须恰好等于申请量，
 * 且不能是仍在使用的池（`current`）的同一块内存。
 *
 * 契约要求宿主每次返回新分配、交出后不再读写的缓冲区，所以这里不复制：池就是这块内存，
 * 发出的字节在它上面就地擦零。宿主复用在用缓冲区会让同一批字节发两次，按违约拒绝。
 */
function acceptHostPool(host: MiniProgramHost, value: unknown, length: number, current?: Uint8Array): Uint8Array {
  // 用 isView 而不是 instanceof：宿主的视图可能来自别的 realm
  if (!ArrayBuffer.isView(value)) throw new TypeError(`${host.displayName}随机源必须返回 Uint8Array`);
  if (value.byteLength !== length) {
    throw new Error(`${host.displayName}随机源返回 ${value.byteLength} bytes，期望 ${length} bytes`);
  }
  if (current && value.buffer === current.buffer) {
    throw new Error(`${host.displayName}随机源复用了仍在使用的缓冲区，每次必须返回新分配的缓冲区`);
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function installSecureRandomPool(host: MiniProgramHost, initialPool: Uint8Array, poolSize: number): void {
  let pool = initialPool;
  let offset = 0;
  let spare: Uint8Array | undefined;
  let refilling = false;
  let refillError: unknown;
  let failedRefills = 0;

  const refillFailed = (error: unknown): void => {
    refilling = false;
    // 补给失败不等于降级：同步路径继续用剩余字节，真耗尽时把这个原因作为 cause 抛出去
    refillError = error;
    failedRefills += 1;
  };

  const refillArrived = (next: Uint8Array): void => {
    try {
      spare = acceptHostPool(host, next, poolSize, pool);
    } catch (error) {
      refillFailed(error);
      return;
    }
    refilling = false;
    refillError = undefined;
    failedRefills = 0;
  };

  /** 见底前异步补一池备用；同一时刻只允许一次在途申请，连续失败到上限后本轮不再申请。 */
  const scheduleRefill = (): void => {
    if (refilling || spare || failedRefills >= RANDOM_POOL_REFILL_ATTEMPTS) return;
    if (pool.byteLength - offset > poolSize * RANDOM_POOL_REFILL_WATERMARK) return;
    refilling = true;
    let request: Promise<Uint8Array>;
    try {
      request = host.requestRandomValues(poolSize);
    } catch (error) {
      // 宿主同步抛错走同一条失败路径，否则 refilling 永远复位不了
      refillFailed(error);
      return;
    }
    // 校验放在同一个 then 里：多包一层 Promise 会推迟补给落地的时机
    request.then(refillArrived, refillFailed);
  };

  /** 当前池不够本次请求时换上备池（旧池余量先擦零）；没有备池就抛错，绝不回退到非密码学随机。 */
  const rotate = (byteLength: number): void => {
    if (offset + byteLength <= pool.byteLength) return;
    if (!spare) {
      throw new Error(`${host.displayName}安全随机池已耗尽，请重新引导运行时`, { cause: refillError });
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
    // 池和备池都是 poolSize 字节，更大的请求换多少次池都装不下，重新引导也没用
    if (target.byteLength > poolSize) {
      throw new RangeError(
        `getRandomValues 单次 ${target.byteLength} bytes 超过 randomPoolSize ${poolSize}，请调大 randomPoolSize`
      );
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
  markRuntimeSource(getRandomValues, host.platform);
}

/** 补齐小程序逻辑层缺失的同步运行时能力。 */
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

/** 在加载 RxDB 主包前引导微信小程序运行时；等价于 `prepareMiniProgramHostRuntime(createWechatMiniProgramHost(wx))`。 */
export function prepareMiniProgramRuntime(
  wechat: MiniProgramWechatApi,
  options: PrepareMiniProgramRuntimeOptions = {}
): Promise<MiniProgramRuntimeSources> {
  return prepareMiniProgramHostRuntime(createWechatMiniProgramHost(wechat), options);
}

/**
 * 在加载 RxDB 主包前按宿主引导小程序运行时。
 *
 * 缺原生 `crypto.getRandomValues` 时用宿主随机源装一个同步安全随机池；
 * 宿主拿不出随机数就 reject，绝不降级到 `Math.random`。未知平台 id 在申请随机数前失败。
 */
export async function prepareMiniProgramHostRuntime(
  host: MiniProgramHost,
  options: PrepareMiniProgramRuntimeOptions = {}
): Promise<MiniProgramRuntimeSources> {
  assertMiniProgramHostPlatform(host);
  installMiniProgramRuntimePolyfills();
  if (getMiniProgramRuntimeSources().random === 'native') return getMiniProgramRuntimeSources();
  if (typeof host.requestRandomValues !== 'function') {
    throw new TypeError(`${host.displayName}宿主缺少 requestRandomValues`);
  }
  const poolSize = validateRandomPoolSize(options.randomPoolSize);
  const initialPool = acceptHostPool(host, await host.requestRandomValues(poolSize), poolSize);
  installSecureRandomPool(host, initialPool, poolSize);
  return getMiniProgramRuntimeSources();
}

/** 使用已引导的同步安全随机源填充视图。 */
export function fillMiniProgramRandomValues<T extends ArrayBufferView<ArrayBuffer>>(target: T): T {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('小程序安全随机源尚未引导');
  }
  cryptoApi.getRandomValues(target);
  return target;
}
