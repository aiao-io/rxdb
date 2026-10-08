/**
 * Taro 小程序逻辑层的运行时入口（实验性）：按构建平台取 adapter 宿主与平台 WASM 运行时。
 *
 * 跑在小程序逻辑层，不引任何 Node 模块。
 *
 * @packageDocumentation
 */
import {
  createDouyinMiniProgramHost,
  createWechatMiniProgramHost,
  type MiniProgramDouyinApi,
  type MiniProgramHost,
  type MiniProgramWasmRuntime,
  type MiniProgramWechatApi
} from '@aiao/rxdb-adapter-miniprogram/runtime';

// 平台全局只在本文件出现，一律先 typeof 判：另一平台上读到自由变量会 ReferenceError
declare const process: { readonly env: { readonly TARO_ENV?: string } };
declare const wx: MiniProgramWechatApi;
declare const WXWebAssembly: MiniProgramWasmRuntime;
declare const tt: MiniProgramDouyinApi;
declare const TTWebAssembly: MiniProgramWasmRuntime;

/**
 * 当前小程序平台的 adapter 宿主与平台 WASM 运行时。
 *
 * @experimental
 */
export interface TaroMiniProgramRuntime {
  /** adapter 宿主。 */
  readonly host: MiniProgramHost;
  /** 平台 WASM 运行时；缺失时为 `undefined`，交给 adapter 的运行时预检报缺失项。 */
  readonly wasmRuntime: MiniProgramWasmRuntime | undefined;
}

function wechatRuntime(): TaroMiniProgramRuntime {
  if (typeof wx === 'undefined') throw new Error('没有全局 wx：当前不是微信小程序运行时');
  return {
    host: createWechatMiniProgramHost(wx),
    wasmRuntime: typeof WXWebAssembly === 'undefined' ? undefined : WXWebAssembly
  };
}

/** 不传 `runtimeGlobal`：`@aiao/rxdb-taro` 的 Taro 插件已把抖音产物里自由的 `globalThis` 改指入口登记的真实全局对象。 */
function douyinRuntime(): TaroMiniProgramRuntime {
  if (typeof tt === 'undefined') throw new Error('没有全局 tt：当前不是抖音小程序运行时');
  return {
    host: createDouyinMiniProgramHost(tt),
    wasmRuntime: typeof TTWebAssembly === 'undefined' ? undefined : TTWebAssembly
  };
}

/**
 * 按构建平台返回 adapter 宿主与平台 WASM 运行时，支持 `weapp` / `tt`。
 *
 * 平台判断写成 `process.env.TARO_ENV` 与字面量比较：Taro 构建期把它替换成常量，另一平台的分支连同它读的全局一起被摇掉。
 * 平台全局缺失时直接报错，不回退到另一平台；支付宝要 Worker 随机源与运行时修补，按 adapter README「支付宝」自行组装。
 *
 * @example
 * ```ts
 * const { host, wasmRuntime } = taroMiniProgramRuntime();
 * await prepareMiniProgramHostRuntime(host);
 * ```
 *
 * @returns 宿主与平台 WASM 运行时
 * @throws 构建平台不是 `weapp` / `tt`，或当前运行时没有该平台的全局
 * @experimental
 */
export function taroMiniProgramRuntime(): TaroMiniProgramRuntime {
  if (process.env.TARO_ENV === 'weapp') return wechatRuntime();
  if (process.env.TARO_ENV === 'tt') return douyinRuntime();
  const alipay =
    process.env.TARO_ENV === 'alipay' ?
      '支付宝需要 Worker 随机源与运行时修补，按 adapter README「支付宝」自行组装。'
    : '';
  throw new Error(`@aiao/rxdb-taro/runtime 只支持 weapp、tt，当前构建平台 ${process.env.TARO_ENV}。${alipay}`);
}
