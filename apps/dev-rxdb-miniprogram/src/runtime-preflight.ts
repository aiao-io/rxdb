import type { MiniProgramRuntimeCapability } from '@aiao/rxdb-adapter-miniprogram';
// 懒加载的是重的主入口（rxdb-demo.ts）；预检要在引导前同步跑，只用轻量的 /runtime 入口，nx 规则按包判定分不出入口
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  assertMiniProgramPlatformId,
  createDouyinMiniProgramHost,
  createWechatMiniProgramHost,
  resolveMiniProgramRuntimeGlobal,
  type MiniProgramHost,
  type MiniProgramRuntimeGlobal
} from '@aiao/rxdb-adapter-miniprogram/runtime';

/** demo 预检项：adapter 的能力项，外加「缺失但运行时可补齐」标记。 */
export interface RuntimeCapability extends MiniProgramRuntimeCapability {
  readonly polyfillable?: boolean;
}

/** demo 所在小程序平台：adapter 宿主与平台 WASM 运行时。平台 API 全部经宿主读取。 */
export interface MiniProgramDemoRuntime {
  readonly host: MiniProgramHost;
  readonly wasmRuntime: MiniProgramPlatformWasmRuntime | undefined;
}

/** 微信：平台全局只在这里出现，其余代码按宿主取能力名与文案。 */
export function wechatDemoRuntime(): MiniProgramDemoRuntime {
  if (typeof wx === 'undefined') throw new Error('没有全局 wx：当前不是微信小程序运行时');
  return {
    host: createWechatMiniProgramHost(wx),
    wasmRuntime: typeof WXWebAssembly === 'undefined' ? undefined : WXWebAssembly
  };
}

/**
 * 抖音：不传 `runtimeGlobal`。抖音产物里所有自由的 `globalThis`（adapter、RxDB 核心、第三方库）构建期已改指入口登记的
 * 真实全局对象（`config/rxdb-packages-vite-plugin.ts` 的 `douyinRealmVitePlugin`），adapter 读到的就是它。
 */
export function douyinDemoRuntime(): MiniProgramDemoRuntime {
  if (typeof tt === 'undefined') throw new Error('没有全局 tt：当前不是抖音小程序运行时');
  return {
    host: createDouyinMiniProgramHost(tt),
    wasmRuntime: typeof TTWebAssembly === 'undefined' ? undefined : TTWebAssembly
  };
}

/**
 * 按构建平台选宿主；`TARO_ENV` 构建期替换成常量，另一个平台的分支连同它的全局一起摇掉。
 *
 * 其余平台交给 adapter 判定：支付宝（Taro 平台名与 adapter 平台 id 同为 `alipay`）抛
 * `MiniProgramUnsupportedPlatformError`，带出可行性矩阵的阻断项与判定章节，页面按初始化失败显示。
 */
export function currentDemoRuntime(): MiniProgramDemoRuntime {
  if (process.env.TARO_ENV === 'tt') return douyinDemoRuntime();
  if (process.env.TARO_ENV === 'weapp') return wechatDemoRuntime();
  const platform: string = process.env.TARO_ENV;
  assertMiniProgramPlatformId(platform);
  // 走到这里说明可行性矩阵改判、adapter 登记了这个平台，demo 要补上它的宿主分支
  throw new Error(`adapter 已登记平台 ${platform}，demo 还没接入它的宿主`);
}

function hasFileSystemManager(host: MiniProgramHost): boolean {
  try {
    return !!host.getFileSystemManager();
  } catch {
    return false;
  }
}

function secureRandomCapability(host: MiniProgramHost, runtimeGlobal: MiniProgramRuntimeGlobal): RuntimeCapability {
  if (typeof runtimeGlobal.crypto?.getRandomValues === 'function') {
    return { name: 'crypto.getRandomValues', available: true, source: 'native' };
  }
  if (typeof host.requestRandomValues === 'function') {
    return { name: 'crypto.getRandomValues', available: true, source: host.platform };
  }
  return { name: 'crypto.getRandomValues', available: false, source: 'missing' };
}

/**
 * 引导前的轻量预检：只看平台能力是否存在，可补齐的项标 `polyfillable`。
 * 拿不到真实全局对象时抛错，由调用方按初始化失败处理。
 */
export function inspectMiniProgramRuntime({ host, wasmRuntime }: MiniProgramDemoRuntime): readonly RuntimeCapability[] {
  const runtimeGlobal = resolveMiniProgramRuntimeGlobal(host);
  return [
    { name: `${host.wasmRuntimeName}.instantiate`, available: typeof wasmRuntime?.instantiate === 'function' },
    { name: host.capabilityNames.fileSystem, available: hasFileSystemManager(host) },
    { name: host.capabilityNames.userDataPath, available: host.userDataPath !== undefined },
    { name: 'BigInt', available: typeof runtimeGlobal.BigInt === 'function' },
    secureRandomCapability(host, runtimeGlobal),
    {
      name: 'TextEncoder',
      available: typeof runtimeGlobal.TextEncoder === 'function',
      polyfillable: true
    },
    {
      name: 'TextDecoder',
      available: typeof runtimeGlobal.TextDecoder === 'function',
      polyfillable: true
    },
    {
      name: 'performance.now',
      available: typeof runtimeGlobal.performance?.now === 'function',
      polyfillable: true
    },
    { name: 'queueMicrotask', available: typeof runtimeGlobal.queueMicrotask === 'function' }
  ];
}

/** 预检通过后交给 {@link openMiniProgramRxdbDemo} 的引用；缺硬依赖时列全缺失项。 */
export interface MiniProgramRuntimeReferences {
  readonly host: MiniProgramHost;
  readonly wasmRuntime: MiniProgramPlatformWasmRuntime;
}

export function getMiniProgramRuntimeReferences(runtime: MiniProgramDemoRuntime): MiniProgramRuntimeReferences {
  const missing = inspectMiniProgramRuntime(runtime).filter(
    capability => !capability.available && !capability.polyfillable
  );
  if (missing.length > 0) {
    throw new Error(
      `${runtime.host.displayName}运行时缺少 RxDB 必需能力: ${missing.map(capability => capability.name).join(', ')}`
    );
  }
  if (!runtime.wasmRuntime) throw new Error(`${runtime.host.displayName}运行时初始化失败`);
  return { host: runtime.host, wasmRuntime: runtime.wasmRuntime };
}
