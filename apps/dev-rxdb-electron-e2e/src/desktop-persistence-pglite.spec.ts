import { Page, _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchEnv, resolveExecutable } from './packaged-app';

/**
 * US-208 AC#10：打包产物上 PGlite 数据目录跨应用重启持久化。
 *
 * @remarks
 * 与 `desktop-persistence.spec.ts`（SQLite）同构，差别只有后端身份与落盘位置。三条判据全部
 * 只能由真实打包产物满足：`--serve` 下数据根落在开发目录、单测里 host 与 renderer 同进程，
 * 都验不到「进程整个退出、重新拉起，PGlite 数据目录里的内容还在」。
 *
 * 后端选择经 `DEV_RXDB_PGLITE=1` 传入：main 读到后把 `?pglite=1` 追加到入口 URL，
 * renderer 的 `setup_rxdb.ts` 据此把桌面候选换成 PGlite 身份（adapter `pglite-electron`、
 * 库名 `desktop_demo_pg`）。SQLite 候选与 PGlite 候选共用同一条桌面宿主探针，因此这里
 * 还要断言 `rxdb-backend` 确实是 `pglite-electron`——否则「计数从 1 涨到 2」可能在 SQLite
 * 库上照样成立，只是数据落错了引擎。
 *
 * 三平台（macOS / Windows / Linux）的 CI 判定不在这里：本文件是那条 dispatch 要跑的 spec，
 * 本机只保证它能启动、能断言，跨平台仍由 `release-desktop.yml` 的真实三 OS run 关闭。
 */

/**
 * PGlite 数据目录在 userData 下的相对位置。
 *
 * @remarks
 * 由两段拼成，各有出处：
 * - `rxdb-pglite/` —— `desktop-pglite-bridge.ts` 的 `DESKTOP_PGLITE_DIRECTORY`，
 *   **不叫 `databases`**：Chromium 启动时清掉那里没登记过的文件，PGlite 数据目录整棵树都在
 *   「没登记」之列（详见该常量注释）。
 * - `desktop_demo_pg` —— demo 的 `DESKTOP_PGLITE_DB_NAME`（也是数据目录名，
 *   `setup_rxdb_desktop_pglite.ts` 的 `DESKTOP_PGLITE_DATA_DIRECTORY`）。
 *
 * 写死而不 import：本文件跑在打包产物之外的纯 Node 进程里，import 这几个常量要把
 * Electron 主进程与 `@aiao/rxdb-adapter-electron` 一起拖进 e2e 依赖。写死也不会悄悄放行——
 * 值一旦对不上，下面「目录在不在」的断言直接红。
 */
const PGLITE_DATA_DIR = join('rxdb-pglite', 'desktop_demo_pg');

/**
 * PGlite 适配器的注册名，与 `@aiao/rxdb-adapter-electron/pglite` 的
 * `ELECTRON_PGLITE_ADAPTER_NAME` 一致（US-208「ADAPTER_NAME 为 pglite-electron」）。
 */
const PGLITE_ADAPTER_NAME = 'pglite-electron';

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
    // `DEV_RXDB_PGLITE=1` 让本次运行选 PGlite 桌面后端；其余照 `launchEnv()` 剥掉
    // `ELECTRON_RUN_AS_NODE` 并隐藏窗口。
    env: { ...launchEnv(), DEV_RXDB_PGLITE: '1' }
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    return await use(page);
  } finally {
    // 走正常关闭路径：让 'will-quit' 有机会 closeAll() 并等待 PGlite 持久化刷新，
    // 而不是直接 kill（那会把「重启后还在」验成崩溃恢复）。
    await app.close();
  }
}

/**
 * 等本地数据库卡片走到终态并读回累计启动次数。
 *
 * @param page - 已完成 domcontentloaded 的首窗口
 * @returns 卡片上显示的次数文本
 * @throws 连接失败、或选中的后端不是 PGlite 时抛出
 */
async function readLaunchCount(page: Page): Promise<string> {
  const status = page.getByTestId('rxdb-status');
  await expect(status).not.toHaveText(/连接中/, { timeout: 60000 });

  const failure = page.getByTestId('rxdb-error');
  if (await failure.count()) throw new Error(`本地适配器连接失败：${await failure.textContent()}`);

  await expect(status).toHaveText(/已连接/);
  // 后端名要先于计数断言：选择机制一旦失效，计数照样从 1 涨到 2，只是涨在 SQLite 库上。
  // 这条先拦住它，报出来的是「后端不是 PGlite」而不是「数据不见了」。
  await expect(page.getByTestId('rxdb-backend')).toHaveText(PGLITE_ADAPTER_NAME);
  return (await page.getByTestId('rxdb-launch-count').textContent()) ?? '';
}

/** PGlite 数据目录是否已物化——「存在」且「非空」才叫落进了真实目录。 */
function hasPgliteData(userDataDir: string): boolean {
  const root = join(userDataDir, PGLITE_DATA_DIR);
  if (!existsSync(root)) return false;
  return readdirSync(root, { withFileTypes: true, recursive: true }).length > 0;
}

test.describe('打包产物的 PGlite 数据目录持久化', () => {
  test('重启后计数递增，PGlite 数据落在真实应用数据目录', async () => {
    // 目录在用例内部创建而不是 beforeAll：重试会重启 worker，
    // 放在外面则「这次跑的是第几次启动」取决于重试次数，断言随之失去意义。
    const userDataDir = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-pglite-'));

    try {
      const first = await withPackagedApp(userDataDir, async page => ({
        count: await readLaunchCount(page)
      }));
      expect(first.count).toBe('1');

      // 数字对了但目录不在（或空），说明写去了别处（或者压根没落盘）——
      // 那 AC#10 的「PGlite data directory 持久化」就没兑现。
      expect(hasPgliteData(userDataDir), `PGlite 数据不在 ${join(userDataDir, PGLITE_DATA_DIR)} 下`).toBe(true);

      const second = await withPackagedApp(userDataDir, readLaunchCount);
      expect(second).toBe('2');
    } finally {
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });
});
