import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: './src',
  outputDir: './test-output/playwright/output',
  testMatch: ['workbench.spec.ts'],
  timeout: 60000,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env['AIAO_PLAYWRIGHT_CHANNEL'] || 'chrome',
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    // e2e target 已经 dependsOn aiao-vscode:build，产物在 playwright 启动前就存在；
    // 这里只起静态服务，绝不能带 buildTarget 再嵌套一个 nx 进程。
    // --coop-coep：工作台的 OPFS Git、JSPI WASM 与 credentialless 预览需要跨源隔离。
    command: 'node scripts/e2e-static-server.mjs --root apps/aiao-vscode/dist/browser --port 4321 --coop-coep',
    url: 'http://127.0.0.1:4321',
    cwd: workspaceRoot,
    reuseExistingServer: false,
    timeout: 180000
  }
});
