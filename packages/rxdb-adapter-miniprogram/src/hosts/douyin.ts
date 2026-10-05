/**
 * @fileoverview 抖音 host：能力名、存储布局与 wasm 路径都取 US-211 实验 v9（开发者工具模拟器 + iOS 真机）的实测结论。
 */
import { requestPlatformRandomValues, usableUserDataPath, type PlatformRandomSourceNames } from '../host.js';
import type {
  MiniProgramDouyinApi,
  MiniProgramFileLayout,
  MiniProgramHost,
  MiniProgramRuntimeGlobal
} from '../mini-program.interface.js';

const DOUYIN_RANDOM_SOURCE: PlatformRandomSourceNames = {
  api: 'tt.getRandomValues',
  missing: '抖音运行时缺少 tt.getRandomValues'
};

/**
 * 抖音的存储布局：覆盖写已有文件时旧文件在写成功前仍计入配额（US-211 实验，开发者工具模拟器与 iOS 实测），
 * 整文件落盘让库上限只剩配额一半、撞配额后回滚也没空间，所以分块。
 */
const DOUYIN_FILE_LAYOUT: MiniProgramFileLayout = Object.freeze({ kind: 'chunked', chunkBytes: 64 * 1024 });

/** 抖音把相对路径按当前页面目录解析，只有代码包根的绝对路径能在任意页面加载（模拟器与 iOS 实测）。 */
const DOUYIN_DEFAULT_WASM_PATH = '/wa-sqlite/wa-sqlite.wasm';

/** {@link createDouyinMiniProgramHost} 的可选参数。 */
export interface DouyinMiniProgramHostOptions {
  /**
   * 真实全局对象，见 {@link MiniProgramHost.runtimeGlobal}。
   *
   * 抖音页面模块里 `globalThis` 是 `undefined`，要在非严格代码里用 `(function () { return this; })()` 取到后传进来；
   * 环境的 `globalThis` 本来就可用时不传。
   */
  readonly runtimeGlobal?: MiniProgramRuntimeGlobal;
}

/**
 * 把抖音全局 `tt` 适配成 {@link MiniProgramHost}。
 *
 * 分块存储布局（64 KiB）与代码包根的绝对 wasm 路径固定声明，取值依据见 US-211 实验 v9 报告；
 * 用户目录走 `tt.getEnvInfoSync()` 而不是已弃用的 `tt.env`；`tt` 字段缺失时对应 getter 返回 `undefined`，
 * 交给运行时预检列出缺失项，`getEnvInfoSync` 的平台原生异常不吞。
 *
 * @param tt - 抖音全局 `tt`
 * @param options - 可选的真实全局对象
 */
export function createDouyinMiniProgramHost(
  tt: MiniProgramDouyinApi,
  options: DouyinMiniProgramHostOptions = {}
): MiniProgramHost {
  return {
    platform: 'douyin',
    displayName: '抖音小程序',
    shortName: '抖音',
    wasmRuntimeName: 'TTWebAssembly',
    capabilityNames: {
      fileSystem: 'tt.getFileSystemManager',
      userDataPath: 'tt.getEnvInfoSync().common.USER_DATA_PATH'
    },
    get userDataPath() {
      return usableUserDataPath(tt?.getEnvInfoSync?.()?.common?.USER_DATA_PATH);
    },
    ...(options.runtimeGlobal === undefined ? {} : { runtimeGlobal: options.runtimeGlobal }),
    fileLayout: DOUYIN_FILE_LAYOUT,
    defaultWasmPath: DOUYIN_DEFAULT_WASM_PATH,
    getFileSystemManager: () => tt?.getFileSystemManager?.(),
    requestRandomValues: length => requestPlatformRandomValues(tt, length, DOUYIN_RANDOM_SOURCE)
  };
}
