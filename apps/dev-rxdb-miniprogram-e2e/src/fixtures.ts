import { test as base } from '@playwright/test';
import automator from 'miniprogram-automator';
import { DemoPage, type MiniProgram } from './demo-page';
import { resolveDevtoolsEnvironment } from './devtools-environment';

const DEMO_PAGE_PATH = '/pages/index/index';

/** 一个开发者工具实例，以及它是被本次运行拉起来的还是接上去的。 */
export interface OpenedMiniProgram {
  readonly miniProgram: MiniProgram;
  /** 由本次运行 `launch()` 出来的实例才归本次运行关闭。 */
  readonly owned: boolean;
}

/** 拉起（或接上）一个开发者工具实例。 */
export async function openMiniProgram(): Promise<OpenedMiniProgram> {
  const environment = await resolveDevtoolsEnvironment();
  if (environment.wsEndpoint) {
    return { miniProgram: await automator.connect({ wsEndpoint: environment.wsEndpoint }), owned: false };
  }
  const miniProgram = await automator.launch({
    cliPath: environment.cliPath,
    projectPath: environment.projectPath,
    timeout: 120_000
  });
  return { miniProgram, owned: true };
}

/**
 * 重新进入演示页，触发一次完整的 `openMiniProgramRxdbDemo`。
 *
 * `reLaunch` 卸载旧页面时 `useUnload` 只能 fire-and-forget 地 `void demo.dispose()`，
 * 旧连接不一定在新页面建 VFS 之前关完——这条竞态确实红过一次
 * （「微信文件 VFS 不支持同一数据库的并发连接」）。现在由 `rxdb-demo.ts` 的
 * `releaseActiveDemo()` 在应用侧串起来：每次引导先等上一个实例彻底放开数据库。
 * 所以这里不需要重试或补等待；再看到那条报错就是真的回归了。
 */
export async function relaunchDemoPage(miniProgram: MiniProgram): Promise<DemoPage> {
  const page = await miniProgram.reLaunch(DEMO_PAGE_PATH);
  if (!page) throw new Error(`reLaunch 没有返回页面: ${DEMO_PAGE_PATH}`);
  const demoPage = new DemoPage(page, miniProgram);
  await demoPage.waitUntilReady();
  return demoPage;
}

interface WorkerFixtures {
  /**
   * 整个 worker 共享一个开发者工具实例。
   *
   * 冷启动要拉起 GUI、编译 Taro 产物、初始化 wa-sqlite WASM，每条用例来一次跑不完；
   * `playwright.config.ts` 里 `workers: 1` 保证不会有第二个实例去抢同一份 USER_DATA_PATH。
   */
  readonly miniProgram: MiniProgram;
}

interface TestFixtures {
  /** 已就绪（phase = 数据库已连接）的演示页。 */
  readonly demoPage: DemoPage;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  miniProgram: [
    // Playwright 解析第一个形参的解构模式来推断 fixture 依赖，这里没有依赖也必须写成 `{}`，换成具名参数会被它拒绝。
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const opened = await openMiniProgram();
      await use(opened.miniProgram);
      // `close()` 关的是开发者工具里的整个小程序实例，不是这条 WebSocket。
      // 接上去的实例是开发者自己开着的 GUI，关掉它等于替人家把窗口收了；
      // 下一次运行 `connect()` 还会撞上一个正在关闭的实例，红成「Connection closed」。
      if (opened.owned) await opened.miniProgram.close();
    },
    { scope: 'worker' }
  ],
  // 每条用例都从重新进入的页面开始：上一条留下的 Todo 不该影响下一条的断言。
  demoPage: async ({ miniProgram }, use) => {
    await use(await relaunchDemoPage(miniProgram));
  }
});

export { expect } from '@playwright/test';
