import { Page, _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchEnv, resolveExecutable } from './packaged-app';

/**
 * US-207 AC#1 / AC#8：数据在应用重启后仍然存在。
 *
 * @remarks
 * 只有真实打包产物能验到这件事。单测里 host 跑在同一个 Node 进程中，`--serve` 下库文件落在
 * 开发目录 —— 两者都验不到「进程整个退出、重新拉起，数据还在」这条结论；而 US-207 的全部
 * 意义正是把存储从渲染进程的 OPFS 挪到主进程持有的真实文件里。
 *
 * 断言形态刻意选了「累计启动次数」而不是「写一条读一条」：后者在单次启动内就能通过，
 * 哪怕数据只活在内存里也一样绿。数字必须**跨进程**从 1 变成 2，内存实现无从伪装。
 *
 * 静态门禁（testid 是否还在、renderer 有没有误导入 `/host`）在
 * `apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts`，那套不依赖打包，先于本套件失败。
 */

/**
 * 库文件在 userData 下的相对位置。
 *
 * @remarks
 * 由四段拼成，少一段就指到一个不存在的路径上：
 * - `rxdb-data/` —— `desktop-sqlite-bridge.ts` 的 `DESKTOP_DATABASE_DIRECTORY`，
 *   **不叫 `databases`**：那个名字归 Chromium，里面的文件每次启动都会被它清掉（详见该常量的注释）
 * - `desktop_demo` —— demo 传给 `RxDB` 的 `dbName`（`src/app/db-names.ts` 的 `DESKTOP_DEMO_DB_NAME`）
 * - `@0_1` —— `RxDB` 给物理库名加的 `RXDB_DB_NAME_SUFFIX`，**已永久冻结**（`packages/rxdb/src/version.ts`）
 * - `.sqlite3` —— 桌面适配器的 `DEFAULT_DATABASE_SUFFIX`
 *
 * 写死而不 import：本文件跑在打包产物之外的纯 Node 进程里，import 这几个常量要把
 * `@aiao/rxdb` 拖进 e2e 的依赖里。写死也不会悄悄放行 —— 值一旦对不上，这条用例直接红。
 */
const DATABASE_FILE = join('rxdb-data', 'desktop_demo@0_1.sqlite3');

/**
 * preload 暴露传输层用的全局键，与 `preload.ts` 的 `DESKTOP_HOST_BRIDGE_KEY` 一致。
 *
 * 这里是第三份字面量（适配器包、preload、本文件）。理由同 ELEC-15：
 * 三者分属三个不打包在一起的运行环境，共享常量反而会把 preload 弄坏。
 */
const BRIDGE_KEY = '__aiaoRxdbDesktopHost__';

/**
 * 桌面适配器的注册名，与适配器包的 `ELECTRON_ADAPTER_NAME` 一致。
 *
 * @remarks
 * 同样写死（理由见 {@link BRIDGE_KEY}）。US-207 E9 把它显示在首页上，本套件据此确认
 * 打包窗口里选中的确实是桌面后端，而不是探测失败后静默退回的 wa-sqlite。
 */
const DESKTOP_ADAPTER_NAME = 'sqlite-electron';

/**
 * 拉起打包产物、跑一段断言、再正常关闭。
 *
 * @param userDataDir - `--user-data-dir`；两次启动传同一个目录才谈得上「重启后还在」
 * @param use - 拿到首窗口后要做的事，返回值原样透出
 * @returns `use` 的返回值
 */
async function withPackagedApp<T>(userDataDir: string, use: (page: Page) => Promise<T>): Promise<T> {
  const app = await electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`],
    env: launchEnv()
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    return await use(page);
  } finally {
    // AC#7：走正常关闭路径，让 'will-quit' 有机会 closeAll() 并 checkpoint WAL。
    // 直接 kill 也能读到数字，但下一次启动就成了在验 SQLite 的崩溃恢复，而不是验我们的收尾。
    await app.close();
  }
}

/**
 * 等本地数据库卡片走到终态并读回累计启动次数。
 *
 * @param page - 已完成 domcontentloaded 的首窗口
 * @returns 卡片上显示的次数文本
 * @throws 连接失败、或选中的后端不是桌面适配器时抛出
 *
 * @remarks
 * US-207 E8/E9：首页此前是两张卡（wa-sqlite 一张、桌面一张），testid 也因此带 `desktop-` 前缀。
 * 合并成一张之后统一叫 `rxdb-*`，后端身份则由 `rxdb-backend` 单独读出。
 *
 * 后端名要**先于**计数断言：合并后走哪条路径由运行时探测决定（E11），探测一旦坏掉就会
 * 静默落到 wa-sqlite —— 计数照样从 1 涨到 2，只是涨在 OPFS 里。下面那条「库文件在不在」
 * 最终能拦住它，但报出来的是「文件不见了」，离真正的原因隔着整条选路逻辑。
 */
async function readLaunchCount(page: Page): Promise<string> {
  const status = page.getByTestId('rxdb-status');
  // 先等它离开「连接中」，而不是直接等 rxdb-launch-count：
  // 后者在失败态下压根不渲染，超时只会报一句「找不到元素」，把真正的原因盖掉。
  await expect(status).not.toHaveText(/连接中/, { timeout: 60000 });

  const failure = page.getByTestId('rxdb-error');
  if (await failure.count()) throw new Error(`本地适配器连接失败：${await failure.textContent()}`);

  await expect(status).toHaveText(/已连接/);
  await expect(page.getByTestId('rxdb-backend')).toHaveText(DESKTOP_ADAPTER_NAME);
  return (await page.getByTestId('rxdb-launch-count').textContent()) ?? '';
}

test.describe('打包产物的桌面 SQLite 持久化', () => {
  test('重启后计数递增，库文件落在应用数据目录内', async () => {
    // 目录在用例内部创建而不是 beforeAll：重试会重启 worker，
    // 放在外面则「这次跑的是第几次启动」取决于重试次数，断言随之失去意义。
    const userDataDir = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-persist-'));

    try {
      const first = await withPackagedApp(userDataDir, async page => ({
        count: await readLaunchCount(page),
        // AC#3 顺路验在这里：拉起打包产物是本套件最贵的一步，为两个断言启动两次不划算。
        // 暴露面必须恰好是这两个方法 —— 多出任何一个带路径或文件能力的成员，
        // 就等于把「渲染进程不该知道库在哪」这条约束又打开了。
        // 双重断言不是偷懒：`typeof globalThis` 自带 `NaN: number` 这类非对象成员，
        // 与 `Record<string, object>` 不构成重叠，tsc 会直接拒掉单次断言（TS2352）。
        bridgeKeys: await page.evaluate(
          key => Object.keys((globalThis as unknown as Record<string, object>)[key] ?? {}).sort(),
          BRIDGE_KEY
        )
      }));
      expect(first.bridgeKeys).toEqual(['request', 'subscribe']);
      expect(first.count).toBe('1');

      // 数字对了但文件不在，说明写去了别处（或者压根没落盘）—— 那 AC#3 的「应用作用域存储」就没兑现。
      expect(existsSync(join(userDataDir, DATABASE_FILE)), `库文件不在 ${userDataDir} 下`).toBe(true);

      const second = await withPackagedApp(userDataDir, readLaunchCount);
      expect(second).toBe('2');
    } finally {
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });
});
