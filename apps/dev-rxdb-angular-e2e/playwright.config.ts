import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:8200';
const isCI = Boolean(process.env['CI']);

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 2,
  /*
   * P0-1 已收口（2026-08-07）：本地不再重试，失败就是失败。
   *
   * 曾经这里是无条件的 `retries: 2`，覆盖掉 preset 的 `process.env.CI ? 2 : 0`，
   * 后果是本地一条用例失败两次、第三次侥幸通过就报绿，flaky 被系统性掩盖。
   * 2026-08-05 把它改成 0 实测：全量跑稳定 1~3 条红，且**每次红的用例都不一样**
   * （`tree-menu-lazy` / `todo` / `menu-drag-sort` 之间轮转）。
   *
   * 这些红最终都不是"测试不稳"，**每一条都是产品缺陷**：
   *  - `tree-menu-lazy`：`generateBatchMenus` 跨批次生成的标题会撞唯一索引（三端已对称修复）；
   *  - `todo`：FTS5 安装期间落进来的用户删除被 `_ad` trigger 打成
   *    `database disk image is malformed` 而静默失败（见 code-reviews/incomplete/SRCH-024.md）；
   *  - `menu-drag-sort`：随上面两条一并消失，无独立根因。
   *
   * 归零的依据是实测而非乐观：修完后用 `--retries=0 --repeat-each=6` 连跑两轮，
   * 两轮均 **648 passed / 0 failed / 0 flaky**（合计 1296 次执行）。
   * 修复前同口径的期望红数是 6~18 条。
   *
   * 若这里日后又出现"偶发红"，**不要把这个值改回 2**——那是把诊断信号关掉。
   * 正确动作是用 `--retries=0 --repeat-each=N` 把它钉成确定性复现，再查产品代码。
   */
  retries: isCI ? 2 : 0,
  timeout: 90000,
  expect: {
    timeout: isCI ? 10000 : 5000
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    actionTimeout: isCI ? 15000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000
  },
  /*
   * P0-4：**不要覆盖 preset 的 reporter**。
   * `...nxE2EPreset(...)` 已给出带 `outputFolder: 'test-output/playwright/report'` 的
   * html reporter，并在 CI 追加 blob reporter（分片合并报告靠它）。
   * 原来这一行把两者一起替换：html 落到 `playwright-report/`（于是磁盘上两份报告并存），
   * CI 的 blob 直接消失。改为沿用 preset。
   */
  /*
   * Run your local dev server before starting the tests.
   *
   * 直接 `node scripts/e2e-static-server.mjs`，不要再走 `nx run …:serve-e2e`。
   * `@nx/web:file-server` 会 fork 出 http-server 孙子进程；Playwright teardown 只杀得掉
   * nx/pnpm 包装层，http-server 被 reparent 到 init 后继续占 8200，下次 e2e 就报
   * "http://localhost:8200 is already used"。Vue / React 已经改成直接 exec vite preview，
   * Angular 没有 vite preview，所以用仓库自己的 SPA 静态服务，让监听进程成为 Playwright
   * 的直接子进程，teardown 能回收。
   *
   * **webServer 里绝不能带 buildTarget**。`serve-static` 的 `buildTarget` 会在 playwright
   * 进程内再起一个 `NX_DAEMON=false` 的 nx 进程，把 utils → rxdb → rxdb-client-generator
   * → rxdb-test 整条链重建一遍。而 `e2e` target 自己已经
   * `dependsOn: ["dev-rxdb-angular:build"]`，产物在 playwright 启动前就已存在 ——
   * 这次重建纯属多余，且因为关掉了 daemon 而**无法与任何人协调**：它会和外层 nx、
   * 以及并行跑的 dev-rxdb-supabase-e2e 的同名嵌套进程同时写各个包的 dist。
   * vite 的 `emptyOutDir` 正在 rmSync 时另一进程往里写，就是
   * `ENOTEMPTY: packages/rxdb/dist/entity`。Nx 把 `rxdb-test:build` / `rxdb:build`
   * 标成 flaky（同 hash 既有 success 又有 failure）根因就在这里。
   *
   * `reuseExistingServer` 恒为 false，与 `dev-rxdb-react-e2e` / `dev-rxdb-vue-e2e` 对齐。
   * 曾经是 `!isCI`，而 `serve-e2e` 是 continuous target，它的 file-server 常在本次运行结束后
   * 存活下来（被 reparent 到 init）。下次跑 e2e 时 8200 还占着，Playwright 于是**直接复用那个旧进程**，
   * 而它 serve 的是上一次的 `staticFilePath` —— 目录若已被 `rm -rf dist` 清掉，
   * 每个请求都落到一个空壳页面上。表现是**整套 109 条全红**、无一例外都是
   * "element(s) not found"，而 `page.goto()` 不报错（服务器有响应，只是没有应用）。
   *
   * 这不是理论风险：2026-08-13 的全量门禁就是这样红的，且随后单跑同一套件 109 条全绿，
   * Nx 因此把它标成 flaky —— 一条把真实失效模式盖成「偶发」的假信号。
   * 复现只需在 8200 上挂一个返回空 HTML 的服务器再跑本套件，症状逐字一致。
   *
   * 改成 false 后端口被占会**当场显式报错**（"8200 is already used"），
   * 而不是静默跑在一个不知道是什么的服务器上：一个显式失败，好过一次说明不了任何事的绿。
   * 端口必须保持 8200：应用用 `window.location.port === '8200'` 强制 IDB + e2e DB 隔离。
   */
  webServer: {
    command: 'node scripts/e2e-static-server.mjs --root dist/apps/dev-rxdb-angular/browser --port 8200',
    url: 'http://localhost:8200',
    reuseExistingServer: false,
    cwd: workspaceRoot,
    timeout: isCI ? 180000 : 120000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true }
    }

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] }
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] }
    // }

    // Uncomment for mobile browsers support
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ]
});
