import type { MiniProgramRuntimeCapability } from '@aiao/rxdb-adapter-miniprogram';
// 懒加载的是重的主入口（rxdb-demo.ts）；预检要在引导前同步跑，只用轻量的 /runtime 入口，nx 规则按包判定分不出入口
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  createAlipayMiniProgramHost,
  createAlipayWasmRuntime,
  createDouyinMiniProgramHost,
  createWechatMiniProgramHost,
  resolveMiniProgramRuntimeGlobal,
  type AlipayRandomWorker,
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
  /**
   * 宿主 `prepareRuntime` 负责补上的全局（预检时缺失不算失败）。补不上时 `prepareRuntime` 自己抛错，
   * 所以这里只登记宿主承诺补的项，不按有没有 `prepareRuntime` 去猜。
   */
  readonly repairedGlobals: readonly string[];
}

/** 微信：平台全局只在这里出现，其余代码按宿主取能力名与文案。 */
export function wechatDemoRuntime(): MiniProgramDemoRuntime {
  if (typeof wx === 'undefined') throw new Error('没有全局 wx：当前不是微信小程序运行时');
  return {
    host: createWechatMiniProgramHost(wx),
    wasmRuntime: typeof WXWebAssembly === 'undefined' ? undefined : WXWebAssembly,
    repairedGlobals: []
  };
}

/**
 * 抖音：不传 `runtimeGlobal`。抖音产物里所有自由的 `globalThis`（adapter、RxDB 核心、第三方库）构建期已改指入口登记的
 * 真实全局对象（`config/realm-vite-plugin.ts`），adapter 读到的就是它。
 */
export function douyinDemoRuntime(): MiniProgramDemoRuntime {
  if (typeof tt === 'undefined') throw new Error('没有全局 tt：当前不是抖音小程序运行时');
  return {
    host: createDouyinMiniProgramHost(tt),
    wasmRuntime: typeof TTWebAssembly === 'undefined' ? undefined : TTWebAssembly,
    repairedGlobals: []
  };
}

/** 随机数 Worker 脚本在代码包里的路径；与 `config/assets-vite-plugin.ts` 的 `ALIPAY_WORKER_PATH`、`app.config.ts` 的 `workers` 一致。 */
const ALIPAY_WORKER_PATH = 'workers/index.js';

/** 同一时刻只能有一个 Worker，页面重进时复用它，不重复 `createWorker`。 */
let alipayRandomWorker: AlipayRandomWorker | undefined;

/**
 * 支付宝：不传 `runtimeGlobal`，理由同抖音（`config/realm-vite-plugin.ts` 在模拟器里经 `Object.prototype` getter 登记真实全局对象）。
 *
 * - wasm：逻辑层的标准 `WebAssembly`（无文档能力，缺失时宿主 `prepareRuntime` 报错）；代码包里有 wasm 原文件与 base64 副本，
 *   adapter 按指纹选。
 * - 随机数：逻辑层没有安全随机源，经包里的 Worker 取。
 * - 模拟器逻辑层没有 `BigInt` 与 `queueMicrotask`，由宿主 `prepareRuntime` 补；RxDB 栈留在懒加载 chunk 里等它补完
 *   （`config/lazy-chunk-vite-plugin.ts`）。
 */
export function alipayDemoRuntime(): MiniProgramDemoRuntime {
  if (typeof my === 'undefined') throw new Error('没有全局 my：当前不是支付宝小程序运行时');
  alipayRandomWorker ??= my.createWorker(ALIPAY_WORKER_PATH, { useExperimentalWorker: true });
  const webAssembly = typeof WebAssembly === 'undefined' ? undefined : WebAssembly;
  return {
    host: createAlipayMiniProgramHost(my, { randomWorker: alipayRandomWorker, webAssembly }),
    wasmRuntime: webAssembly && createAlipayWasmRuntime(my, webAssembly),
    repairedGlobals: ['BigInt', 'queueMicrotask']
  };
}

/** 按构建平台选宿主；`TARO_ENV` 构建期替换成常量，其余平台的分支连同它们的全局一起摇掉。 */
export function currentDemoRuntime(): MiniProgramDemoRuntime {
  if (process.env.TARO_ENV === 'tt') return douyinDemoRuntime();
  if (process.env.TARO_ENV === 'weapp') return wechatDemoRuntime();
  if (process.env.TARO_ENV === 'alipay') return alipayDemoRuntime();
  throw new Error(`demo 只接了微信、抖音与支付宝，当前构建平台 ${process.env.TARO_ENV}`);
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
 * 引导前的轻量预检：只看平台能力是否存在，可补齐的项标 `polyfillable`（adapter 的 polyfill，或宿主 `repairedGlobals`）。
 * 拿不到真实全局对象时抛错，由调用方按初始化失败处理。
 */
export function inspectMiniProgramRuntime({
  host,
  wasmRuntime,
  repairedGlobals
}: MiniProgramDemoRuntime): readonly RuntimeCapability[] {
  const runtimeGlobal = resolveMiniProgramRuntimeGlobal(host);
  const repaired = (name: string) => (repairedGlobals.includes(name) ? { polyfillable: true } : {});
  return [
    { name: `${host.wasmRuntimeName}.instantiate`, available: typeof wasmRuntime?.instantiate === 'function' },
    { name: host.capabilityNames.fileSystem, available: hasFileSystemManager(host) },
    { name: host.capabilityNames.userDataPath, available: host.userDataPath !== undefined },
    { name: 'BigInt', available: typeof runtimeGlobal.BigInt === 'function', ...repaired('BigInt') },
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
    {
      name: 'queueMicrotask',
      available: typeof runtimeGlobal.queueMicrotask === 'function',
      ...repaired('queueMicrotask')
    }
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
