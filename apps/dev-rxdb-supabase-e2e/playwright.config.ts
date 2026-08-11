import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);
const isRemoteE2E = process.env['REMOTE_E2E'] === 'true';
const port = isRemoteE2E ? 8314 : 8313;

// CI 环境可把 BASE_URL 指向已部署的应用。
const deployedURL = process.env['BASE_URL'];
const baseURL = deployedURL || `http://localhost:${port}`;

/**
 * 从 .env 文件读取环境变量。
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * 见 https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  /*
   * P1-4：并行档位收敛到与 dev-rxdb-react-e2e 一致。
   * 原来是三个 e2e 项目里最激进的（`fullyParallel: true` + CI 4 workers），
   * 而本套件的用例本身很重：单个用例「add 100」→ `entityManager.saveMany` →
   * OPFS worker / IDB SharedWorker 一整条存储链。配置文件自己那段注释就在复盘 flaky 史。
   * CI 上串行 + 2 workers，本地保留 8。
   */
  fullyParallel: !isCI,
  workers: isCI ? 2 : 8,
  /* 本地不重试 */
  retries: isCI ? 2 : 0,
  /*
   * P1-1：**必须显式设置**。`nxE2EPreset` 不设 `timeout`，Playwright 默认 30000ms，
   * 而第三个用例内部单步就有 `toBeEnabled({ timeout: 30_000 })` +
   * `expect.poll({ timeout: 15_000 })`——**单步预算已经吃满整条用例的总预算**。
   * 一旦 add 100 稍慢，超时会以「测试超时」而不是「那一步等不到」的形式报出来，
   * 排查时看到的错误与真实原因无关。数值与 dev-rxdb-react-e2e 对齐。
   */
  timeout: isCI ? 120000 : 90000,
  expect: {
    timeout: isCI ? 10000 : 5000
  },
  /* 以下项目共用的设置，见 https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* 重试失败的用例时收集 trace，见 https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    actionTimeout: isCI ? 20000 : 10000,
    navigationTimeout:
      isRemoteE2E ? 60_000
      : isCI ? 30_000
      : 15_000
  },
  /*
   * P2-6：**不要整体覆盖 preset 的 reporter**。
   * `...nxE2EPreset(...)` 已经给出带 `outputFolder: 'test-output/playwright/report'` 的
   * html reporter，并在 CI 追加 blob reporter（分片合并报告要靠它）。
   * 原来这一行把两者一起替换掉：html 落到仓库根下的 `playwright-report/`（在 `test-output/` 之外，
   * 于是同时存在两份产物），CI 的 blob 报告直接消失。
   * 这里改为**沿用 preset 的 reporter**，不再声明。
   */
  /*
   * 本地 target 服务构建产物，而不是 dev server —— 与 dev-rxdb-angular-e2e（serve-e2e）、
   * dev-rxdb-react-e2e / dev-rxdb-vue-e2e（preview）一致。
   *
   * 曾经跑的是 `serve-local`（Angular dev server）。它靠把 VITE_SUPABASE_* 设成空串
   * 来表达「本地模式」，但空串是唯一撑不过 Nx/dotenv 往返的取值（dotenv-expand 用真值
   * 判断是否保留 processEnv），于是工作区 `.env` 的值胜出，应用真的连上了 Supabase 并跑
   * 双向同步。本套件断的是绝对数量，远端一有数据就挂 —— Nx 把该任务标为 flaky 即源于此。
   * 构建产物在构建期就把 `import.meta.env` 定死（见 dev-rxdb-supabase 的 build.production
   * define），环境变量再也泄不进来；顺带这份产物才是 CI 真正构建的那份。
   *
   * 端口从 8312 改成 8313：@nx/web 的 file-server 在端口被占时会 detectPort 静默换端口，
   * 而 8312 是旧 serve-local 的端口，残留进程会被 reuseExistingServer 复用成「假绿」。
   */
  /*
   * P2-7：两处收紧。
   *
   * 1. 用 `serve-e2e` 而不是 `serve-static`：**webServer 里绝不能带 buildTarget**。
   *    `serve-static` 的 `buildTarget` 会在 playwright 进程内再起一个 `NX_DAEMON=false` 的
   *    nx 进程，把 utils → rxdb → rxdb-client-generator → rxdb-test 整条链重建一遍。
   *    而 `e2e` target 自己已经 `dependsOn: ["dev-rxdb-supabase:build"]`，产物在 playwright
   *    启动前就已存在 —— 这次重建纯属多余，且因为关掉了 daemon 而**无法与任何人协调**：
   *    它会和外层 nx、以及并行跑的 dev-rxdb-angular-e2e 的同名嵌套进程同时写
   *    各个包的 dist。vite 的 `emptyOutDir` 正在 rmSync 时另一进程往里写，
   *    就是 `ENOTEMPTY: packages/rxdb/dist/entity`。
   *    Nx 把 `rxdb-test:build` / `rxdb:build` 标成 flaky（同 hash 既有 success 又有 failure）
   *    根因就在这里。`serve-e2e` 不带 buildTarget，只 serve 产物，不碰 dist。
   *    产物缺失不会静默：`spa: true` 会 `copyFileSync(index.html → 404.html)`，直接 ENOENT 报出路径。
   * 2. `reuseExistingServer: false`：file-server 在端口被占时会 `detectPort` **静默换端口**，
   *    而复用又会让上一次残留的进程（serve 的是旧产物）被当成本次的服务器。
   *    两者叠加就是"测试跑在一个说不清是哪份产物的服务上"。关掉复用后，
   *    端口被占会以 Playwright 等不到 `url` 的形式显式失败。
   */
  webServer:
    deployedURL ? undefined : (
      {
        command:
          isRemoteE2E ?
            `NX_DAEMON=false pnpm exec nx run dev-rxdb-supabase:serve-remote --port ${port}`
          : `NX_DAEMON=false pnpm exec nx run dev-rxdb-supabase:serve-e2e --port ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        cwd: workspaceRoot,
        timeout: isCI ? 180000 : 120000
      }
    ),
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

    // 取消注释以启用移动端浏览器
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // 取消注释以启用品牌浏览器
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
