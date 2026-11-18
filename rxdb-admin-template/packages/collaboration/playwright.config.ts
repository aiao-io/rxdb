import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  // 用例经 `@aiao/rxdb-plugin-working-tree/exchange` 形成平台交换记录（ADMIN-US-221）。这份 tsconfig 不带 tsconfig.base.json 的 paths：
  // 工作区包按包的 exports 解析到各自的 dist（与 Node 服务、Edge 产物一致），不把平台源码交给 Playwright 逐文件转译。
  tsconfig: './e2e/tsconfig.json',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    headless: true,
    actionTimeout: 10000,
    navigationTimeout: 20000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  reporter: [['list']],
  webServer: {
    command: 'node scripts/browser-server.mjs',
    // 测试服务只打印就绪行（含命令入口的运行模式与地址，见 ADMIN_E2E_COMMANDS）与错误，进测试日志便于核对跑的是哪个入口
    stdout: 'pipe',
    url: 'http://127.0.0.1:8306',
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15000 },
    timeout: 90000
  },
  projects: ['react', 'angular', 'vue'].map((name, index) => ({
    name,
    use: { baseURL: `http://127.0.0.1:${8306 + index}` }
  }))
});
