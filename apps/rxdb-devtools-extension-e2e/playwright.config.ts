import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

/**
 * 扩展 e2e：真实 unpacked 扩展 + 真实四段中继。
 *
 * @remarks
 * 没有 `projects` 里的 `devices[...]`：扩展只能在持久化上下文里加载，浏览器由
 * `src/extension.fixture.ts` 自己 launch，这里再声明一次 browser 只会造成两套配置。
 *
 * 端口 8210，与三端 demo 的 8200/8201/8202 错开，好让本套件与它们并行。
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 1,
  // 与 demo e2e 同一条纪律：本地不重试，失败就是失败。
  retries: isCI ? 2 : 0,
  timeout: 90000,
  expect: { timeout: isCI ? 10000 : 5000 },
  webServer: {
    command: 'node scripts/e2e-static-server.mjs --root dist/apps/rxdb-devtools-extension-e2e/web --port 8210',
    url: 'http://localhost:8210',
    reuseExistingServer: false,
    cwd: workspaceRoot,
    timeout: isCI ? 180000 : 120000
  }
});
