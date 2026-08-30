import { ElectronApplication, _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchEnv, resolveExecutable } from './packaged-app';

/**
 * US-904 阶段 D AC#45：开发态加载扩展的开发/生产隔离。
 *
 * @remarks
 * 判据是主进程 `session.defaultSession.extensions` 的真实清单：
 * - dev 模式（显式 env）恰好加载一个工作区扩展；
 * - production 模式（无 env）一个都不加载。
 *
 * 这不是单元测试能替代的——`devtools-extension.ts` 的闸门函数已有单测，但「main.ts 真的在
 * `whenReady` 里调了它、esbuild 产物真的存在、`electron-builder.dir.json` 真的没把 devtools
 * 排除掉」这三件事只有真实产物能验。
 *
 * ⚠️ 待联网验证：本套件依赖 `electron-package-dir` 的产物（electron-builder 需下载依赖），
 * 无网环境跑不到。跑之前先执行：
 *   pnpm nx build rxdb-devtools-extension
 *   pnpm nx run dev-rxdb-electron:electron-package-dir
 */

/** 扩展构建产物目录，与 `apps/rxdb-devtools-extension/vite.config.ts` 的 `outDir` 一致。 */
const EXTENSION_DIST = join(__dirname, '../../rxdb-devtools-extension/dist');

/** dev 模式必须显式给全的四个变量，与 `devtools-extension.ts` 一一对应。 */
const DEV_ENV = {
  DEV_RXDB_DEVTOOLS: '1',
  DEV_RXDB_DEVTOOLS_EXTENSION: EXTENSION_DIST,
  DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
  DEV_RXDB_DEVTOOLS_MUTATION: 'allow'
} as const;

/** 每次启动用独立的 userData 目录，避免复用旧库让断言不可解释。 */
const freshUserData = (): string => mkdtempSync(join(tmpdir(), 'devtools-loading-'));

/** 主进程里读已加载扩展的清单。 */
const loadedExtensions = (app: ElectronApplication): Promise<{ id: string; name: string }[]> =>
  app.evaluate(({ session }) =>
    session.defaultSession.extensions.getAllExtensions().map(extension => ({ id: extension.id, name: extension.name }))
  );

test.describe('devtools 扩展开发态加载（US-904 阶段 D AC#45）', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeAll(() => {
    expect(
      existsSync(EXTENSION_DIST),
      `缺扩展构建产物：${EXTENSION_DIST}。先 pnpm nx build rxdb-devtools-extension`
    ).toBe(true);
    expect(existsSync(resolveExecutable()), '缺打包产物。先 pnpm nx run dev-rxdb-electron:electron-package-dir').toBe(
      true
    );
  });

  test('dev 模式显式开启时加载唯一工作区扩展', async () => {
    const userData = freshUserData();
    const app = await electron.launch({
      executablePath: resolveExecutable(),
      args: [`--user-data-dir=${userData}`],
      env: { ...launchEnv(), ...DEV_ENV }
    });

    try {
      // firstWindow 保证 whenReady 里的加载已经跑完（加载排在 createWindow 之前）。
      await app.firstWindow();
      const extensions = await loadedExtensions(app);

      expect(extensions).toHaveLength(1);
      expect(extensions[0]?.id).toMatch(/^[a-p]{32}$/);
    } finally {
      await app.close();
      rmSync(userData, { force: true, recursive: true });
    }
  });

  test('production 模式（无显式 env）一个扩展都不加载', async () => {
    const userData = freshUserData();
    const app = await electron.launch({
      executablePath: resolveExecutable(),
      args: [`--user-data-dir=${userData}`],
      env: launchEnv()
    });

    try {
      await app.firstWindow();
      const extensions = await loadedExtensions(app);

      expect(extensions).toEqual([]);
    } finally {
      await app.close();
      rmSync(userData, { force: true, recursive: true });
    }
  });
});
