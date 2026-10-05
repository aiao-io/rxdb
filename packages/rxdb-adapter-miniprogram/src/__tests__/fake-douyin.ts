/**
 * @fileoverview 抖音全局 `tt` 的测试替身：文件系统用按实测语义建模的 {@link QuotaFileSystem}，
 * 随机源在下一个宏任务里分发回调（平台的异步分发器），长度上限取实测 1048576。
 */
import { randomBytes } from 'node:crypto';
import type { MiniProgramDouyinApi } from '../mini-program.interface.js';
import { QuotaFileSystem } from './quota-file-system.js';

/** 与真机一致的用户目录。 */
export const FAKE_TT_USER_DATA_PATH = 'ttfile://user';

/** 实测 `tt.getRandomValues` 单次上限。 */
const RANDOM_MAX_LENGTH = 1_048_576;

/** 替身的可调参数。 */
export interface FakeDouyinOptions {
  /** 用户目录配额，缺省为实测 10 MiB。 */
  readonly quotaBytes?: number;
  /** 不提供 `tt.getRandomValues`。 */
  readonly withoutRandomValues?: boolean;
}

/** 替身本体与它背后的文件系统。 */
export interface FakeDouyin {
  readonly tt: MiniProgramDouyinApi;
  readonly fileSystem: QuotaFileSystem;
}

function fakeGetRandomValues(options: Parameters<NonNullable<MiniProgramDouyinApi['getRandomValues']>>[0]): void {
  const { length, success, fail } = options;
  setTimeout(() => {
    if (length < 1 || length > RANDOM_MAX_LENGTH) {
      fail?.({
        errMsg: `getRandomValues:fail The value of 'length' is out of range. It must be > 0 && <= ${RANDOM_MAX_LENGTH}.`
      });
      return;
    }
    success?.({ randomValues: Uint8Array.from(randomBytes(length)).buffer });
  }, 0);
}

/** 造一个抖音替身。 */
export function createFakeDouyin(options: FakeDouyinOptions = {}): FakeDouyin {
  const fileSystem = new QuotaFileSystem(options.quotaBytes);
  const tt: MiniProgramDouyinApi = {
    getEnvInfoSync: () => ({ common: { USER_DATA_PATH: FAKE_TT_USER_DATA_PATH } }),
    getFileSystemManager: () => fileSystem,
    ...(options.withoutRandomValues ? {} : { getRandomValues: fakeGetRandomValues })
  };
  return { tt, fileSystem };
}
