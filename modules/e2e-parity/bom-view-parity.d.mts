import type {
  Expect,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType
} from '@playwright/test';

/** 在三个框架中注册同一组 BOM 浏览、编辑、完整性与可访问性验收。 */
export declare function registerBomViewParity<
  TestArgs extends PlaywrightTestArgs & PlaywrightTestOptions,
  WorkerArgs extends PlaywrightWorkerArgs & PlaywrightWorkerOptions
>(test: TestType<TestArgs, WorkerArgs>, expect: Expect): void;
