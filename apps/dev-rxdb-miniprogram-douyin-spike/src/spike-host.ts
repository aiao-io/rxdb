/**
 * @fileoverview 实验专用的抖音 host。
 *
 * `MINI_PROGRAM_PLATFORM_IDS` 目前只有 `wechat`，而「新平台 id 与 host 同步登记」是 Phase B 的事；
 * 实验不改 adapter，所以借用 `wechat` id 过平台校验，名称与报错全部改成抖音。
 * 随机源的写法逐行对照 adapter 的微信 host，保证实验测到的就是 Phase B 要照搬的形态。
 * 存储布局、默认 wasm 路径与真实全局对象按 Phase B 正式 host 的取值声明，实验测到的就是 adapter 现状。
 */
import type {
  MiniProgramFileLayout,
  MiniProgramHost,
  MiniProgramRandomValuesResult,
  MiniProgramRuntimeGlobal
} from '@aiao/rxdb-adapter-miniprogram/runtime';
import { adapterErrorText } from './describe-error.js';
import type { DouyinApi } from './douyin-api.js';

/**
 * 抖音的存储布局：覆盖写已有文件时旧文件在写成功前仍计入配额（模拟器与 iOS 实测），
 * 整文件落盘让库上限只剩配额一半、撞配额后回滚也没空间，所以分块。
 */
export const DOUYIN_FILE_LAYOUT: MiniProgramFileLayout = { kind: 'chunked', chunkBytes: 64 * 1024 };

/** 抖音把相对路径按当前页面目录解析，只有代码包根的绝对路径能在任意页面加载（模拟器与 iOS 实测）。 */
export const DOUYIN_DEFAULT_WASM_PATH = '/wa-sqlite/wa-sqlite.wasm';

function douyinRandomPool(result: MiniProgramRandomValuesResult, length: number): Uint8Array {
  const pool = new Uint8Array(result.randomValues);
  if (pool.byteLength !== length) {
    throw new Error(`tt.getRandomValues 返回 ${pool.byteLength} bytes，期望 ${length} bytes`);
  }
  return pool;
}

function requestDouyinRandomValues(tt: DouyinApi, length: number): Promise<Uint8Array> {
  const getRandomValues = tt.getRandomValues;
  if (typeof getRandomValues !== 'function') {
    return Promise.reject(new Error('抖音运行时缺少 tt.getRandomValues'));
  }
  return new Promise((resolve, reject) => {
    const fail = (error: unknown): void => {
      reject(new Error(`tt.getRandomValues 失败: ${adapterErrorText(error)}`, { cause: error }));
    };
    // 回调在平台分发器里执行，里面抛出的异常会被吞掉；不接住的话 Promise 永远不 settle
    const success = (result: MiniProgramRandomValuesResult): void => {
      try {
        resolve(douyinRandomPool(result, length));
      } catch (error) {
        fail(error);
      }
    };
    try {
      getRandomValues.call(tt, { length, success, fail });
    } catch (error) {
      fail({ errMsg: adapterErrorText(error) });
    }
  });
}

/**
 * 把全局 `tt` 适配成 adapter 的 {@link MiniProgramHost}（借用 `wechat` id）。
 *
 * `runtimeGlobal` 是构建 banner 找到的真实全局对象；`globalThis` 本来就是对象时传 `undefined`，adapter 用 `globalThis`。
 */
export function createDouyinSpikeHost(tt: DouyinApi, runtimeGlobal?: MiniProgramRuntimeGlobal): MiniProgramHost {
  return {
    platform: 'wechat',
    displayName: '抖音小程序（实验）',
    shortName: '抖音',
    wasmRuntimeName: 'TTWebAssembly',
    capabilityNames: { fileSystem: 'tt.getFileSystemManager', userDataPath: 'tt.env.USER_DATA_PATH' },
    get userDataPath() {
      const path = tt.env?.USER_DATA_PATH;
      return typeof path === 'string' && path !== '' ? path : undefined;
    },
    ...(runtimeGlobal === undefined ? {} : { runtimeGlobal }),
    fileLayout: DOUYIN_FILE_LAYOUT,
    defaultWasmPath: DOUYIN_DEFAULT_WASM_PATH,
    getFileSystemManager: () => tt.getFileSystemManager?.(),
    requestRandomValues: length => requestDouyinRandomValues(tt, length)
  };
}
