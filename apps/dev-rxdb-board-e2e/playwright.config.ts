import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig } from '@playwright/test';
import { APP_BASE_URL, APP_PORT } from './src/env';

const isCI = Boolean(process.env['CI']);
/** 显式开关：对开着的 `nx serve dev-rxdb-board`（同占 4312）跑本套件时设 `BOARD_E2E_REUSE_SERVER=1`。 */
const reuseServer = process.env['BOARD_E2E_REUSE_SERVER'] === '1';

/**
 * 看板 demo e2e（US-540）：串行——用例共享同一个浏览器上下文外的前端静态产物，
 * 且每个用例都在全新浏览器上下文里从启动页开始（种子 / 空库初态按 AC 各自指定）。
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  timeout: isCI ? 120000 : 90000,
  expect: {
    timeout: isCI ? 10000 : 5000
  },
  use: {
    baseURL: APP_BASE_URL,
    trace: { mode: 'retain-on-failure', screenshots: false },
    actionTimeout: isCI ? 20000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000
  },
  webServer: [
    {
      // 与 dev-rxdb-angular-e2e 同款静态服务器：工作区根起服，产物路径不受 e2e 项目 cwd 影响。
      // 默认不复用端口上已有的服务，与其余 e2e 配置一致：残留进程或开着的 dev server 占住 4312 时显式失败，
      // 而不是静默跑在非本次构建的产物上（假绿假红分不清）。确要对 dev server 跑时用上面的显式开关。
      command: `node scripts/e2e-static-server.mjs --root dist/apps/dev-rxdb-board/browser --port ${APP_PORT}`,
      cwd: workspaceRoot,
      url: APP_BASE_URL,
      reuseExistingServer: reuseServer,
      timeout: 180000
    }
  ]
});
