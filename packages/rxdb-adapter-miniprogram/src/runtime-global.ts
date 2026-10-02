import type { MiniProgramHost, MiniProgramRuntimeGlobal } from './mini-program.interface.js';

/** 不经 host 调用公开函数时的报错前缀。 */
const AMBIENT_DISPLAY_NAME = '小程序运行时';

/**
 * 是否带着当前 realm 的内置对象。
 *
 * @remarks
 * 判据是 `value.Object.prototype` 是否在对象字面量的原型链上：字面量的原型不受包装函数遮蔽。
 * 抖音的 `global` 空壳、别的 realm 的全局对象都过不了；它不证明 `value` 就是全局对象本身，
 * 只排除「补丁装上去、自由变量却看不见」的那一类。
 */
function isRealmGlobal(value: unknown): value is MiniProgramRuntimeGlobal {
  if (typeof value !== 'object' || value === null) return false;
  const realmObject: unknown = (value as { Object?: unknown }).Object;
  // `{} instanceof X` 即「X.prototype 在字面量原型链上」，整个判断不读任何自由变量
  return typeof realmObject === 'function' && {} instanceof realmObject;
}

/** 环境里的 `globalThis`；抖音页面模块里这个绑定被遮蔽成 `undefined`。 */
function ambientGlobal(): unknown {
  return typeof globalThis === 'undefined' ? undefined : globalThis;
}

function describeAmbient(ambient: unknown): string {
  if (typeof ambient === 'object' && ambient !== null) return 'globalThis 不是当前运行时的全局对象';
  return `globalThis 为 ${ambient === null ? 'null' : typeof ambient}`;
}

/**
 * 在注入值与环境 `globalThis` 之间选出真实全局对象。
 *
 * @remarks
 * 注入了就只认注入值，不合格直接抛 `TypeError`，不回退到环境；没注入时环境不合格同样抛错。
 *
 * @param displayName - 报错前缀
 * @param injected - `host.runtimeGlobal`
 * @param ambient - 环境里的 `globalThis`
 * @returns 真实全局对象
 * @internal
 */
export function selectMiniProgramRuntimeGlobal(
  displayName: string,
  injected: MiniProgramRuntimeGlobal | undefined,
  ambient: unknown
): MiniProgramRuntimeGlobal {
  if (injected !== undefined) {
    if (isRealmGlobal(injected)) return injected;
    throw new TypeError(`${displayName}的 host.runtimeGlobal 不是当前运行时的全局对象`);
  }
  if (isRealmGlobal(ambient)) return ambient;
  throw new Error(`${displayName}拿不到真实全局对象（${describeAmbient(ambient)}），请经 host.runtimeGlobal 注入`);
}

/**
 * 解析宿主的真实全局对象：`host.runtimeGlobal` 优先，否则用环境里的 `globalThis`。
 *
 * @param host - 小程序宿主
 * @returns 运行时补丁写入、能力预检读取的全局对象
 * @throws 两者都不是当前 realm 的全局对象时抛错，不降级
 */
export function resolveMiniProgramRuntimeGlobal(host: MiniProgramHost): MiniProgramRuntimeGlobal {
  return selectMiniProgramRuntimeGlobal(host.displayName, host.runtimeGlobal, ambientGlobal());
}

/**
 * 不经 host 的公开函数用的解析：显式传入优先，否则用环境里的 `globalThis`。
 *
 * @internal
 */
export function resolveAmbientRuntimeGlobal(injected?: MiniProgramRuntimeGlobal): MiniProgramRuntimeGlobal {
  return selectMiniProgramRuntimeGlobal(AMBIENT_DISPLAY_NAME, injected, ambientGlobal());
}
