/**
 * @fileoverview 支付宝 host：能力名、存储布局、文件系统包装与运行时修补都取 US-211 支付宝探针 v2–v6
 * （开发者工具模拟器 + iOS 真机）的实测结论。
 *
 * 可行性矩阵仍判 `unsupported`：转 `supported` 之前不登记平台 id、不从包入口导出，
 * 返回类型因此是 {@link AlipayMiniProgramHost} 而不是 `MiniProgramHost`。
 */
import { usableUserDataPath } from '../host.js';
import type { MiniProgramFileLayout, MiniProgramHost, MiniProgramRuntimeGlobal } from '../mini-program.interface.js';
import { ambientGlobal } from '../runtime-global.js';
import type { AlipayRandomWorker, AlipayStandardWasmApi, MiniProgramAlipayApi } from './alipay-api.js';
import { createAlipayFileSystem } from './alipay-file-system.js';
import { createAlipayRandomSource } from './alipay-random.js';
import { discoverAlipayRuntimeGlobal, prepareAlipayRuntimeGlobal } from './alipay-runtime.js';

/**
 * 支付宝的存储布局：只能整文件读写（没有 `openSync` / `writeSync`），单文件上限 10 MiB，
 * 整文件落盘让库大小受单文件上限卡死、每次落盘重写整个库，所以分块。
 */
const ALIPAY_FILE_LAYOUT: MiniProgramFileLayout = Object.freeze({ kind: 'chunked', chunkBytes: 64 * 1024 });

/** 平台 id 登记之前的支付宝宿主：除平台 id 外与 {@link MiniProgramHost} 同形。 */
export type AlipayMiniProgramHost = Omit<MiniProgramHost, 'platform'> & { readonly platform: 'alipay' };

/** {@link createAlipayMiniProgramHost} 的参数。 */
export interface AlipayMiniProgramHostOptions {
  /**
   * 跑着包内 `alipay-random-worker.js` 的 Worker：逻辑层没有任何安全随机源，只有 Worker 里有 `crypto.getRandomValues`。
   *
   * 由 `my.createWorker('workers/index.js', { useExperimentalWorker: true })` 建出，
   * 要在 `app.json` 的 `workers` 声明目录、在 `mini.project.json` 的 `transpile.script.ignore` 里跳过转译。
   */
  readonly randomWorker: AlipayRandomWorker;
  /**
   * 逻辑层的标准 `WebAssembly`；拿不到就传 `undefined`，引导运行时时以 `logic-layer-webassembly` 缺失报错。
   *
   * 显式传入而不是由宿主读自由变量：逻辑层没有这个全局时读它会直接抛 `ReferenceError`。
   */
  readonly webAssembly: AlipayStandardWasmApi | undefined;
  /**
   * 真实全局对象，见 {@link MiniProgramHost.runtimeGlobal}；缺省时环境有 `globalThis` 就用它（iOS 真机），
   * 没有（开发者工具模拟器）就经 `Object.prototype` getter 找出来。
   */
  readonly runtimeGlobal?: MiniProgramRuntimeGlobal;
}

function runtimeGlobalSource(injected: MiniProgramRuntimeGlobal | undefined): () => MiniProgramRuntimeGlobal | undefined {
  if (injected !== undefined) return () => injected;
  let discovered: MiniProgramRuntimeGlobal | undefined;
  return () => {
    discovered ??= discoverAlipayRuntimeGlobal(ambientGlobal());
    return discovered;
  };
}

/**
 * 把支付宝全局 `my` 适配成宿主。
 *
 * - 文件系统：把「失败返回错误对象」转成抛异常，读写走 base64，用户文件带 1 字节帧头（模拟器拒绝空写入），
 *   所以落盘格式与别的平台不同；平台本来就互不共享数据目录。
 * - 随机数：经 `randomWorker` 取，每次引导都要申请（逻辑层没有原生随机源）。
 * - 运行时：`prepareRuntime` 检查逻辑层 `WebAssembly`、补上 `BigInt` 与 `queueMicrotask`；
 *   读 `runtimeGlobal` 时按需找真实全局对象。依赖的无文档能力缺失时报错，不降级。
 *
 * `my` 字段缺失时对应 getter 返回 `undefined`，交给运行时预检列出缺失项。
 *
 * @param my - 支付宝全局 `my`
 * @param options - 随机数 Worker、逻辑层 `WebAssembly` 与可选的真实全局对象
 */
export function createAlipayMiniProgramHost(
  my: MiniProgramAlipayApi,
  options: AlipayMiniProgramHostOptions
): AlipayMiniProgramHost {
  const readRuntimeGlobal = runtimeGlobalSource(options.runtimeGlobal);
  return {
    platform: 'alipay',
    displayName: '支付宝小程序',
    shortName: '支付宝',
    wasmRuntimeName: 'WebAssembly',
    capabilityNames: {
      fileSystem: 'my.getFileSystemManager',
      userDataPath: 'my.env.USER_DATA_PATH'
    },
    get userDataPath() {
      return usableUserDataPath(my?.env?.USER_DATA_PATH);
    },
    get runtimeGlobal() {
      return readRuntimeGlobal();
    },
    fileLayout: ALIPAY_FILE_LAYOUT,
    getFileSystemManager: () =>
      typeof my?.getFileSystemManager === 'function' ? createAlipayFileSystem(my.getFileSystemManager(), my) : undefined,
    requestRandomValues: createAlipayRandomSource(options.randomWorker),
    prepareRuntime: runtimeGlobal => prepareAlipayRuntimeGlobal(runtimeGlobal, options.webAssembly)
  };
}
