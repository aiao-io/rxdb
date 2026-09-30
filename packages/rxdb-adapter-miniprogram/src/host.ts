import { errorMessage } from './error-message.js';
import type {
  MiniProgramHost,
  MiniProgramHostSelection,
  MiniProgramPlatformId,
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

function wechatRandomPool(result: MiniProgramRandomValuesResult, length: number): Uint8Array {
  const pool = new Uint8Array(result.randomValues);
  if (pool.byteLength !== length) {
    throw new Error(`wx.getRandomValues 返回 ${pool.byteLength} bytes，期望 ${length} bytes`);
  }
  return pool;
}

function requestWechatRandomValues(wechat: MiniProgramWechatApi, length: number): Promise<Uint8Array> {
  const getRandomValues = wechat.getRandomValues;
  if (typeof getRandomValues !== 'function') {
    return Promise.reject(new Error('微信运行时缺少 wx.getRandomValues'));
  }
  return new Promise((resolve, reject) => {
    const fail = (error: unknown): void => {
      reject(new Error(`wx.getRandomValues 失败: ${errorMessage(error)}`, { cause: error }));
    };
    // wx 在异步分发器里调回调，回调体抛出的异常会被吞掉；不接住的话 Promise 永远不 settle
    const success = (result: MiniProgramRandomValuesResult): void => {
      try {
        resolve(wechatRandomPool(result, length));
      } catch (error) {
        fail(error);
      }
    };
    try {
      getRandomValues.call(wechat, { length, success, fail });
    } catch (error) {
      fail({ errMsg: errorMessage(error) });
    }
  });
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
      const path = wechat?.env?.USER_DATA_PATH;
      return typeof path === 'string' && path !== '' ? path : undefined;
    },
    getFileSystemManager: () => wechat?.getFileSystemManager?.(),
    requestRandomValues: length => requestWechatRandomValues(wechat, length)
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
