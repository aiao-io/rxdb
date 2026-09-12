import { test as base } from '@playwright/test';
import automator from 'miniprogram-automator';
import { DemoPage, type MiniProgram } from './demo-page';
import { resolveDevtoolsEnvironment } from './devtools-environment';
import { clearDatabaseDirectory } from './runtime-probes';

const DEMO_PAGE_PATH = '/pages/index/index';

/** 演示应用的 SQLite 落盘目录，与 `wechat-file-vfs.ts` 的默认 root 一致。 */
const DATABASE_DIRECTORY = 'rxdb-wa-sqlite';

/** 拉起（或接上）一个开发者工具实例。 */
export async function openMiniProgram(): Promise<MiniProgram> {
  const environment = await resolveDevtoolsEnvironment();
  if (environment.wsEndpoint) {
    return automator.connect({ wsEndpoint: environment.wsEndpoint });
  }
  return automator.launch({
    cliPath: environment.cliPath,
    projectPath: environment.projectPath,
    timeout: 120_000
  });
}

/**
 * 删掉落盘的数据库目录。
 *
 * 「跨启动持久化」这条检查在探针已存在时恒为通过，不先清一次就永远分不清
 * 「真的读回来了」和「这条检查根本不会红」。清库让它必须走完
 * 写入 → 待重启 → 重启 → 通过 的完整状态迁移。
 *
 * 调用时当前页面还握着一个打开的数据库，这看起来危险，实际不会静默出错：
 * `wechat-file-vfs.ts` 的缓冲文件是**按路径**读写的（打开时 `readFileSync`，
 * flush 时 `writeFileSync`），没有长命 fd，所以删目录不会让活着的连接读到脏数据；
 * 而同文件里模块级的 `ACTIVE_DATABASES` 守卫保证了下一个页面要么等到上一个连接
 * 彻底 `close()`（此时它的 flush 全部发生在清库之后的 mkdir **之前**，不可能把旧库刷回来），
 * 要么直接抛「不支持同一数据库的并发连接」——那会被 `waitUntilReady()` 抬成一条明确的红。
 * 两条路都不会产生「清了库却读回旧探针」的假绿。
 */
export async function resetDatabase(miniProgram: MiniProgram): Promise<void> {
  await miniProgram.evaluate(clearDatabaseDirectory, DATABASE_DIRECTORY);
}

/**
 * 重新进入演示页，触发一次完整的 `openMiniProgramRxdbDemo`。
 *
 * `reLaunch` 会先卸载旧页面（`useUnload` 里 `void demo.dispose()`，异步且没人 await），
 * 再加载新页面。新页面要先实例化 WASM 才轮到建 VFS，正常情况下旧连接早关完了；
 * 万一没关完，`ACTIVE_DATABASES` 会让新页面抛「不支持同一数据库的并发连接」，
 * 由 `waitUntilReady()` 原样抬出来。看到这条报错不必怀疑适配器——那是这里的时序，不是缺陷。
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
      const miniProgram = await openMiniProgram();
      await use(miniProgram);
      await miniProgram.close();
    },
    { scope: 'worker' }
  ],
  // 每条用例都从重新进入的页面开始：上一条留下的 Todo 不该影响下一条的断言。
  demoPage: async ({ miniProgram }, use) => {
    await use(await relaunchDemoPage(miniProgram));
  }
});

export { expect } from '@playwright/test';
