import { errorMessage } from './error-message.js';
import type {
  MiniProgramHost,
  MiniProgramHostSelection,
  MiniProgramPlatformId,
  MiniProgramRandomValuesOptions,
  MiniProgramRandomValuesResult,
  MiniProgramWechatApi
} from './mini-program.interface.js';
import { MINI_PROGRAM_PLATFORM_IDS } from './mini-program.interface.js';

export { MINI_PROGRAM_PLATFORM_IDS } from './mini-program.interface.js';

/** 平台可行性矩阵在仓库里的位置；未知平台的报错指向这里。 */
const PLATFORM_FEASIBILITY_PATH = 'requirements/stories/adapter/miniprogram-platform-feasibility.md';

/** 传入的平台 id 不在 {@link MINI_PROGRAM_PLATFORM_IDS} 中。 */
export class MiniProgramUnknownPlatformError extends Error {
  /** 调用方传入的平台 id。 */
  readonly platform: string;
  /** 当前已登记的平台 id。 */
  readonly knownPlatforms: readonly MiniProgramPlatformId[] = MINI_PROGRAM_PLATFORM_IDS;

  constructor(platform: unknown) {
    super(
      `未知小程序平台: ${String(platform)}；已知平台: ${MINI_PROGRAM_PLATFORM_IDS.join(', ')}。` +
        `平台可行性结论见 ${PLATFORM_FEASIBILITY_PATH}`
    );
    this.name = 'MiniProgramUnknownPlatformError';
    this.platform = String(platform);
  }
}

/** 判断值是否为已登记的平台 id。 */
export function isMiniProgramPlatformId(value: unknown): value is MiniProgramPlatformId {
  return (MINI_PROGRAM_PLATFORM_IDS as readonly unknown[]).includes(value);
}

/** 未登记的平台 id 直接抛 {@link MiniProgramUnknownPlatformError}。 */
export function assertMiniProgramHostPlatform(host: MiniProgramHost): void {
  if (!isMiniProgramPlatformId(host.platform)) throw new MiniProgramUnknownPlatformError(host.platform);
}

/** 平台随机源在报错里的名字：API 全名（如 `wx.getRandomValues`）与缺失时的整句。 */
export interface PlatformRandomSourceNames {
  readonly api: string;
  readonly missing: string;
}

/** `wx` / `tt` 共有的随机源入口。 */
export interface PlatformRandomSource {
  getRandomValues?(options: MiniProgramRandomValuesOptions): unknown;
}

function platformRandomPool(result: MiniProgramRandomValuesResult, length: number, api: string): Uint8Array {
  const pool = new Uint8Array(result.randomValues);
  if (pool.byteLength !== length) {
    throw new Error(`${api} 返回 ${pool.byteLength} bytes，期望 ${length} bytes`);
  }
  return pool;
}

/**
 * 经平台的回调式 `getRandomValues` 申请恰好 `length` 字节；微信与抖音的签名与分发方式实测一致。
 *
 * 包内共用，不从包入口导出。
 */
export function requestPlatformRandomValues(
  platform: PlatformRandomSource,
  length: number,
  names: PlatformRandomSourceNames
): Promise<Uint8Array> {
  const getRandomValues = platform.getRandomValues;
  if (typeof getRandomValues !== 'function') {
    return Promise.reject(new Error(names.missing));
  }
  return new Promise((resolve, reject) => {
    const fail = (error: unknown): void => {
      reject(new Error(`${names.api} 失败: ${errorMessage(error)}`, { cause: error }));
    };
    // 平台在异步分发器里调回调，回调体抛出的异常会被吞掉；不接住的话 Promise 永远不 settle
    const success = (result: MiniProgramRandomValuesResult): void => {
      try {
        resolve(platformRandomPool(result, length, names.api));
      } catch (error) {
        fail(error);
      }
    };
    try {
      getRandomValues.call(platform, { length, success, fail });
    } catch (error) {
      fail({ errMsg: errorMessage(error) });
    }
  });
}

const WECHAT_RANDOM_SOURCE: PlatformRandomSourceNames = {
  api: 'wx.getRandomValues',
  missing: '微信运行时缺少 wx.getRandomValues'
};

/** 非空串才算平台给了用户数据目录；包内共用，不从包入口导出。 */
export function usableUserDataPath(path: unknown): string | undefined {
  return typeof path === 'string' && path !== '' ? path : undefined;
}

/**
 * 把微信全局 `wx` 适配成 {@link MiniProgramHost}。
 *
 * 能力名与报错文案和 US-209 的微信路径逐字一致。`wx` 字段缺失时对应 getter 返回
 * `undefined`，交给运行时预检列出缺失项，而不是在这里抛 `TypeError`。
 */
export function createWechatMiniProgramHost(wechat: MiniProgramWechatApi): MiniProgramHost {
  return {
    platform: 'wechat',
    displayName: '微信小程序',
    shortName: '微信',
    wasmRuntimeName: 'WXWebAssembly',
    capabilityNames: { fileSystem: 'wx.getFileSystemManager', userDataPath: 'wx.env.USER_DATA_PATH' },
    get userDataPath() {
      return usableUserDataPath(wechat?.env?.USER_DATA_PATH);
    },
    getFileSystemManager: () => wechat?.getFileSystemManager?.(),
    requestRandomValues: length => requestPlatformRandomValues(wechat, length, WECHAT_RANDOM_SOURCE)
  };
}

/**
 * 从 `{ wechat }` 或 `{ host }` 解析出唯一的宿主，并校验平台 id。
 *
 * 两者都给或都不给都直接拒绝：挑一个用等于把配置错误藏起来。
 */
export function resolveMiniProgramHost(options: MiniProgramHostSelection): MiniProgramHost {
  if (options.host && options.wechat) throw new Error('wechat 与 host 只能二选一');
  if (options.wechat) return createWechatMiniProgramHost(options.wechat);
  if (!options.host) throw new Error('必须提供 wechat 或 host 其中之一');
  assertMiniProgramHostPlatform(options.host);
  return options.host;
}
