/**
 * @fileoverview 支付宝逻辑层的运行时修补：找真实全局对象、取回原生 `BigInt`、补 `queueMicrotask`。
 *
 * US-211 支付宝探针 v6 实测：
 *
 * - 开发者工具模拟器的逻辑层没有 `globalThis`，也没有全局 `BigInt` 与 `queueMicrotask`；
 *   只有在 `Object.prototype` 上挂 getter、再按自由变量读，才能拿到真实全局对象。
 *   wasm 的 i64 返回值仍是原生 bigint，经它的构造器能取回 `BigInt`。
 * - iOS 真机有 `globalThis` 与 `BigInt`，只缺 `queueMicrotask`。
 *
 * 取全局对象与取回 `BigInt` 依赖未文档化的行为（矩阵 `undocumented` 的 `object-prototype-global`、
 * `logic-layer-bigint`），做不到就报错；用目标自己的 `Promise` 排微任务与原生语义一致，属保持语义的绕行。
 */
import { errorMessage } from '../error-message.js';
import type { MiniProgramRuntimeGlobal } from '../mini-program.interface.js';
import { isRealmGlobal } from '../runtime-global.js';
import type { AlipayStandardWasmApi } from './alipay-api.js';
import { AlipayUndocumentedCapabilityError } from './alipay-capability.js';

/** 临时挂在 `Object.prototype` 上的 getter 名，读完即删。 */
const RUNTIME_GLOBAL_GETTER = '__aiaoAlipayRuntimeGlobal';

declare const __aiaoAlipayRuntimeGlobal: unknown;

/**
 * 一个只导出 `f: () => i64` 的模块，`f` 返回 7。
 *
 * `(module (func (export "f") (result i64) i64.const 7))`
 */
const I64_MODULE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 126, 3, 2, 1, 0, 7, 5, 1, 1, 102, 0, 0, 10, 6, 1, 4, 0, 66, 7, 11
]);

/** 按自由变量读 getter：全局对象的原型链上有 `Object.prototype`，自由变量查找会走到 getter，`this` 就是全局对象。 */
function readFreeVariable(): unknown {
  return __aiaoAlipayRuntimeGlobal;
}

function objectPrototypeGlobal(read: () => unknown): unknown {
  Object.defineProperty(Object.prototype, RUNTIME_GLOBAL_GETTER, {
    configurable: true,
    get(this: unknown) {
      return this;
    }
  });
  try {
    return read();
  } catch (cause) {
    throw new AlipayUndocumentedCapabilityError(
      'object-prototype-global',
      `经 Object.prototype getter 读全局对象失败：${errorMessage(cause)}`,
      cause
    );
  } finally {
    Reflect.deleteProperty(Object.prototype, RUNTIME_GLOBAL_GETTER);
  }
}

/**
 * 环境里没有 `globalThis` 时经 `Object.prototype` getter 找出真实全局对象。
 *
 * @param ambient - 环境里的 `globalThis`，没有就是 `undefined`
 * @param read - 按自由变量读 getter 的函数，测试替换用
 * @returns 环境有 `globalThis` 时 `undefined`（交给通用解析核对），否则是找到的全局对象
 * @throws {@link AlipayUndocumentedCapabilityError} 读不到、或读到的不是当前 realm 的全局对象
 * @internal
 */
export function discoverAlipayRuntimeGlobal(
  ambient: unknown,
  read: () => unknown = readFreeVariable
): MiniProgramRuntimeGlobal | undefined {
  if (typeof ambient === 'object' && ambient !== null) return undefined;
  const found = objectPrototypeGlobal(read);
  if (isRealmGlobal(found)) return found;
  throw new AlipayUndocumentedCapabilityError(
    'object-prototype-global',
    `经 Object.prototype getter 读到的不是当前运行时的全局对象（${typeof found}）`
  );
}

async function instantiateI64(webAssembly: AlipayStandardWasmApi): Promise<unknown> {
  try {
    const { instance } = await webAssembly.instantiate(I64_MODULE, {});
    return (instance.exports as { f: () => unknown }).f();
  } catch (cause) {
    throw new AlipayUndocumentedCapabilityError(
      'logic-layer-bigint',
      `实例化 i64 模块失败：${errorMessage(cause)}`,
      cause
    );
  }
}

/** 经 wasm i64 返回值取回目标 realm 的原生 `BigInt`。 */
async function recoverBigInt(
  runtimeGlobal: MiniProgramRuntimeGlobal,
  webAssembly: AlipayStandardWasmApi
): Promise<BigIntConstructor> {
  const value = await instantiateI64(webAssembly);
  if (typeof value !== 'bigint') {
    throw new AlipayUndocumentedCapabilityError(
      'logic-layer-bigint',
      `wasm 的 i64 返回值是 ${typeof value}，不是 bigint`
    );
  }
  // 用目标 realm 的 Object 装箱，拿到的是那个 realm 的 BigInt
  return (runtimeGlobal.Object(value) as { constructor: BigIntConstructor }).constructor;
}

function microtaskQueue(runtimeGlobal: MiniProgramRuntimeGlobal): typeof queueMicrotask {
  const resolved = runtimeGlobal.Promise.resolve();
  return callback => {
    void resolved.then(callback);
  };
}

function install(runtimeGlobal: MiniProgramRuntimeGlobal, name: 'BigInt' | 'queueMicrotask', value: unknown): void {
  Object.defineProperty(runtimeGlobal, name, { configurable: true, value, writable: true });
}

type RepairableGlobals = Partial<Pick<MiniProgramRuntimeGlobal, 'BigInt' | 'queueMicrotask'>>;

/**
 * 检查逻辑层的标准 `WebAssembly`，并给真实全局对象补上缺的 `BigInt` 与 `queueMicrotask`。
 *
 * 先全部算好再安装：任一步失败时什么都不装。已有的全局不动，也不实例化 wasm。
 *
 * @param runtimeGlobal - 已解析的真实全局对象
 * @param webAssembly - 逻辑层的标准 `WebAssembly`
 * @throws {@link AlipayUndocumentedCapabilityError} 缺 `WebAssembly.instantiate`，或取不回 `BigInt`
 * @internal
 */
export async function prepareAlipayRuntimeGlobal(
  runtimeGlobal: MiniProgramRuntimeGlobal,
  webAssembly: AlipayStandardWasmApi | undefined
): Promise<void> {
  if (typeof webAssembly?.instantiate !== 'function') {
    throw new AlipayUndocumentedCapabilityError('logic-layer-webassembly', '逻辑层没有标准 WebAssembly.instantiate');
  }
  const present = runtimeGlobal as RepairableGlobals;
  const bigInt = typeof present.BigInt === 'function' ? undefined : await recoverBigInt(runtimeGlobal, webAssembly);
  if (bigInt !== undefined) install(runtimeGlobal, 'BigInt', bigInt);
  if (typeof present.queueMicrotask !== 'function') {
    install(runtimeGlobal, 'queueMicrotask', microtaskQueue(runtimeGlobal));
  }
}
